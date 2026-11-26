import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { LedgerEntryType, PaymentGateway, PaymentStatus, Prisma, RequestStatus, ServiceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_GATEWAY_SERVICE, PaymentGatewayService } from './payment-gateway.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { lockedCommercialSplit } from '../pricing/commercial-split';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, @Inject(PAYMENT_GATEWAY_SERVICE) private readonly gateway: PaymentGatewayService, @Optional() private readonly notifications?: NotificationsService) {}

  async initialize(customerId: string, requestId: string) {
    if (process.env.CUSTOMER_ONLINE_PAYMENTS_ENABLED !== 'true') throw new BadRequestException({ code: 'ONLINE_PAYMENTS_DISABLED', message: 'Customer online payments are currently disabled' });
    const request = await this.prisma.serviceRequest.findFirst({ where: { id: requestId, customerId }, include: { customer: true } });
    if (!request) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
    if (request.paymentMode === 'CASH') throw new BadRequestException({ code: 'CASH_PAYMENT_SELECTED', message: 'This request will be paid in cash to the provider' });
    const allowed = request.paymentMode === 'ONLINE_AFTER_ACCEPT'
      ? new Set<RequestStatus>([RequestStatus.ASSIGNED, RequestStatus.EN_ROUTE, RequestStatus.ARRIVED]).has(request.status)
      : request.status === RequestStatus.COMPLETED;
    if (!allowed) throw new BadRequestException({ code: 'PAYMENT_NOT_DUE', message: 'Payment is not due for this request' });
    if (request.paymentStatus === PaymentStatus.PAID) throw new BadRequestException({ code: 'REQUEST_ALREADY_PAID', message: 'Request has already been paid' });
    const reference = `RA-PAY-${randomUUID()}`;
    const payment = await this.prisma.payment.create({ data: { requestId, customerId, gateway: PaymentGateway.PAYSTACK, reference, amountKobo: request.priceKobo, status: PaymentStatus.PENDING, idempotencyKey: reference } });
    try {
      const initialized = await this.gateway.initialize({ reference, amountKobo: request.priceKobo, email: request.customer.email || `${request.customer.phone.replace('+', '')}@pay.roadaid.co`, requestId });
      return { reference, authorizationUrl: initialized.authorizationUrl, amountKobo: request.priceKobo };
    } catch (error) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
      throw error;
    }
  }

  async collectCash(providerId: string, requestId: string) {
    const payment = await this.prisma.$transaction(async (tx) => {
      const [request] = await tx.$queryRaw<Array<{ id: string; code: string; customer_id: string; provider_id: string | null; service_type: ServiceType; status: RequestStatus; payment_mode: string; payment_status: PaymentStatus; price_kobo: bigint; price_breakdown: unknown; commission_bps: number }>>`
        SELECT id, code, customer_id, provider_id, service_type, status, payment_mode, payment_status, price_kobo, price_breakdown, commission_bps FROM service_requests WHERE id=${requestId}::uuid FOR UPDATE`;
      if (!request || request.provider_id !== providerId) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Active job not found' });
      if (request.payment_mode !== 'CASH') throw new BadRequestException({ code: 'NOT_CASH_REQUEST', message: 'This customer selected in-app payment' });
      if (!new Set<RequestStatus>([RequestStatus.ARRIVED, RequestStatus.IN_PROGRESS]).has(request.status)) throw new BadRequestException({ code: 'CASH_NOT_DUE', message: 'Confirm cash only after arriving at the customer' });
      if (request.payment_status === PaymentStatus.PAID) return tx.payment.findFirst({ where: { requestId, status: PaymentStatus.PAID } });
      const reference = `RA-CASH-${randomUUID()}`;
      const commission = lockedCommercialSplit(request.service_type, request.price_kobo, request.price_breakdown, request.commission_bps).platformFeeKobo;
      const payment = await tx.payment.create({ data: { requestId, customerId: request.customer_id, gateway: PaymentGateway.MANUAL, reference, amountKobo: request.price_kobo, status: PaymentStatus.PAID, paidAt: new Date(), gatewayResponse: { method: 'CASH', collectedBy: providerId } } });
      await tx.serviceRequest.update({ where: { id: requestId }, data: { paymentStatus: PaymentStatus.PAID } });
      await tx.ledgerEntry.createMany({ data: [
        { type: LedgerEntryType.CUSTOMER_PAYMENT, requestId, paymentId: payment.id, amountKobo: request.price_kobo, description: `Cash collected by provider for ${request.code}` },
        { type: LedgerEntryType.PLATFORM_COMMISSION, requestId, paymentId: payment.id, providerId, amountKobo: -commission, description: `Cash commission owed for ${request.code}` },
      ] });
      await tx.providerProfile.update({ where: { userId: providerId }, data: { walletBalanceKobo: { decrement: commission } } });
      await tx.requestEvent.create({ data: { requestId, type: 'PAYMENT_UPDATE', actorType: 'PROVIDER', actorId: providerId, payload: { status: 'PAID', method: 'CASH', reference, commissionKobo: commission.toString() } } });
      return payment;
    });
    const [row] = await this.prisma.$queryRaw<Array<{ due: bigint }>>`SELECT GREATEST(0, -COALESCE(SUM(amount_kobo), 0))::bigint AS due FROM ledger_entries WHERE provider_id=${providerId}::uuid AND (type='PLATFORM_COMMISSION' OR (type='ADJUSTMENT' AND description LIKE 'Cash commission settlement%'))`;
    const dueKobo = row?.due ?? 0n;
    const limitKobo = WalletService.commissionLimitKobo();
    await this.notifications?.send(providerId, { title: dueKobo >= limitKobo ? 'Commission limit reached' : 'Cash commission recorded', body: dueKobo >= limitKobo ? 'Finish this job, then repay commission before you can receive another offer.' : 'Your cash commission balance has been updated. Repay it from Account & earnings.', data: { type: 'COMMISSION_REPAYMENT_DUE', dueKobo: dueKobo.toString(), limitKobo: limitKobo.toString() }, priority: 'high' });
    return payment;
  }

  async initializeCommissionSettlement(providerId: string, requestId: string) {
    const request = await this.prisma.serviceRequest.findFirst({ where: { id: requestId, providerId, paymentMode: 'CASH', paymentStatus: PaymentStatus.PAID }, include: { provider: true } });
    if (!request) throw new NotFoundException({ code: 'CASH_COMMISSION_NOT_FOUND', message: 'Cash commission record not found' });
    const debt = await this.prisma.ledgerEntry.findFirst({ where: { requestId, providerId, type: LedgerEntryType.PLATFORM_COMMISSION } });
    const settled = await this.prisma.ledgerEntry.findFirst({ where: { requestId, providerId, type: LedgerEntryType.ADJUSTMENT, description: { startsWith: 'Cash commission settlement' } } });
    if (!debt || settled) throw new BadRequestException({ code: 'COMMISSION_ALREADY_SETTLED', message: 'This cash commission has already been settled' });
    const amountKobo = -debt.amountKobo;
    const reference = `RA-COM-${randomUUID()}`;
    const payment = await this.prisma.payment.create({ data: { requestId, customerId: providerId, gateway: PaymentGateway.PAYSTACK, reference, amountKobo, status: PaymentStatus.PENDING, idempotencyKey: reference, gatewayResponse: { purpose: 'CASH_COMMISSION_SETTLEMENT', providerId } } });
    try {
      const initialized = await this.gateway.initialize({ reference, amountKobo, email: request.provider?.email || `${request.provider?.phone.replace('+', '')}@pay.roadaid.co`, requestId });
      return { reference, authorizationUrl: initialized.authorizationUrl, amountKobo, requestId };
    } catch (error) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
      throw error;
    }
  }

  async status(customerId: string, reference: string) {
    const payment = await this.prisma.payment.findFirst({ where: { reference, customerId } });
    if (!payment) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    return payment;
  }

  async handlePaystack(rawBody: Buffer, signature?: string) {
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
    if (!secret || !signature) throw new UnauthorizedException({ code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Invalid webhook signature' });
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    const actualBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) throw new UnauthorizedException({ code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Invalid webhook signature' });
    const payload = JSON.parse(rawBody.toString('utf8')) as { event?: string; data?: { id?: number | string; reference?: string } };
    const eventId = String(payload.data?.id || `${payload.event}:${payload.data?.reference}`);
    try { await this.prisma.webhookEvent.create({ data: { gateway: 'PAYSTACK', eventId, payload: payload as Prisma.InputJsonValue } }); }
    catch (error) { if ((error as { code?: string }).code === 'P2002') return { received: true, duplicate: true }; throw error; }
    try {
      if (payload.event === 'charge.success' && payload.data?.reference) await this.verifyAndMarkPaid(payload.data.reference);
    } catch (error) {
      await this.prisma.webhookEvent.deleteMany({ where: { gateway: 'PAYSTACK', eventId } });
      throw error;
    }
    return { received: true };
  }

  async verifyAndMarkPaid(reference: string) {
    const payment = await this.prisma.payment.findUnique({ where: { reference }, include: { request: true } });
    if (!payment) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    if (payment.status === PaymentStatus.PAID) return payment;
    const verified = await this.gateway.verify(reference);
    if (verified.status !== 'success') {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, gatewayResponse: verified.response as Prisma.InputJsonValue } });
      return;
    }
    if (verified.currency !== 'NGN' || verified.amountKobo !== payment.amountKobo) throw new BadRequestException({ code: 'PAYMENT_AMOUNT_MISMATCH', message: 'Verified payment does not match the request amount' });
    if (reference.startsWith('RA-COM-')) {
      return this.prisma.$transaction(async (tx) => {
        const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        if (current.status === PaymentStatus.PAID) return current;
        const paid = await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PAID, paidAt: new Date(), gatewayResponse: verified.response as Prisma.InputJsonValue } });
        const existing = await tx.ledgerEntry.findFirst({ where: { requestId: payment.requestId, providerId: payment.customerId, type: LedgerEntryType.ADJUSTMENT, description: { startsWith: 'Cash commission settlement' } } });
        if (!existing) {
          await tx.ledgerEntry.create({ data: { type: LedgerEntryType.ADJUSTMENT, requestId: payment.requestId, paymentId: payment.id, providerId: payment.customerId, amountKobo: payment.amountKobo, description: `Cash commission settlement ${reference}` } });
          await tx.providerProfile.update({ where: { userId: payment.customerId }, data: { walletBalanceKobo: { increment: payment.amountKobo } } });
        }
        await tx.requestEvent.create({ data: { requestId: payment.requestId, type: 'COMMISSION_SETTLED', actorType: 'PROVIDER', actorId: payment.customerId, payload: { reference, amountKobo: payment.amountKobo.toString() } } });
        return paid;
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (current.status === PaymentStatus.PAID) return current;
      const commission = payment.amountKobo * BigInt(payment.request.commissionBps) / 10_000n;
      const paid = await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PAID, paidAt: new Date(), gatewayResponse: verified.response as Prisma.InputJsonValue } });
      await tx.serviceRequest.update({ where: { id: payment.requestId }, data: { paymentStatus: PaymentStatus.PAID } });
      await tx.ledgerEntry.createMany({ data: [
        { type: LedgerEntryType.CUSTOMER_PAYMENT, requestId: payment.requestId, paymentId: payment.id, amountKobo: payment.amountKobo, description: `Customer payment ${reference}` },
        { type: LedgerEntryType.PLATFORM_COMMISSION, requestId: payment.requestId, paymentId: payment.id, amountKobo: commission, description: `Platform commission ${payment.request.commissionBps} bps` },
      ] });
      if (payment.request.status === RequestStatus.COMPLETED && payment.request.providerId) {
        const earning = payment.amountKobo - commission;
        const existing = await tx.ledgerEntry.findFirst({ where: { requestId: payment.requestId, providerId: payment.request.providerId, type: LedgerEntryType.PROVIDER_EARNING } });
        if (!existing) {
          await tx.ledgerEntry.create({ data: { type: LedgerEntryType.PROVIDER_EARNING, requestId: payment.requestId, paymentId: payment.id, providerId: payment.request.providerId, amountKobo: earning, description: `Provider earning for ${payment.request.code}` } });
          await tx.providerProfile.update({ where: { userId: payment.request.providerId }, data: { walletBalanceKobo: { increment: earning }, completedJobs: { increment: 1 } } });
        }
      }
      await tx.requestEvent.create({ data: { requestId: payment.requestId, type: 'PAYMENT_UPDATE', actorType: 'SYSTEM', payload: { status: 'PAID', reference } } });
      return paid;
    });
  }

  async assertOwned(customerId: string, requestId: string) {
    const count = await this.prisma.serviceRequest.count({ where: { id: requestId, customerId } });
    if (!count) throw new ForbiddenException();
  }

  async markPaidManually(requestId: string, adminId: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException({ code: 'MANUAL_PAYMENT_REASON_REQUIRED', message: 'A reason is required' });
    return this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<Array<{ id: string; customer_id: string; provider_id: string | null; status: RequestStatus; price_kobo: bigint; commission_bps: number; payment_status: PaymentStatus; code: string }>>`
        SELECT id, customer_id, provider_id, status, price_kobo, commission_bps, payment_status, code FROM service_requests WHERE id=${requestId}::uuid FOR UPDATE`;
      if (!locked) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
      if (locked.payment_status === PaymentStatus.PAID) throw new BadRequestException({ code: 'REQUEST_ALREADY_PAID', message: 'Request has already been paid' });
      const reference = `RA-MANUAL-${randomUUID()}`;
      const payment = await tx.payment.create({ data: { requestId, customerId: locked.customer_id, gateway: PaymentGateway.MANUAL, reference, amountKobo: locked.price_kobo, status: PaymentStatus.PAID, paidAt: new Date(), gatewayResponse: { reason } } });
      const commission = locked.price_kobo * BigInt(locked.commission_bps) / 10_000n;
      await tx.serviceRequest.update({ where: { id: requestId }, data: { paymentStatus: PaymentStatus.PAID } });
      await tx.ledgerEntry.createMany({ data: [
        { type: LedgerEntryType.CUSTOMER_PAYMENT, requestId, paymentId: payment.id, amountKobo: locked.price_kobo, description: `Manual customer payment ${reference}`, createdBy: adminId },
        { type: LedgerEntryType.PLATFORM_COMMISSION, requestId, paymentId: payment.id, amountKobo: commission, description: `Platform commission ${locked.commission_bps} bps`, createdBy: adminId },
      ] });
      if (locked.status === RequestStatus.COMPLETED && locked.provider_id) {
        const earning = locked.price_kobo - commission;
        await tx.ledgerEntry.create({ data: { type: LedgerEntryType.PROVIDER_EARNING, requestId, paymentId: payment.id, providerId: locked.provider_id, amountKobo: earning, description: `Provider earning for ${locked.code}` } });
        await tx.providerProfile.update({ where: { userId: locked.provider_id }, data: { walletBalanceKobo: { increment: earning }, completedJobs: { increment: 1 } } });
      }
      await tx.requestEvent.create({ data: { requestId, type: 'PAYMENT_UPDATE', actorType: 'ADMIN', actorId: adminId, payload: { status: 'PAID', gateway: 'MANUAL', reason } } });
      return payment;
    });
  }

  async refund(requestId: string, adminId: string, reason: string, refundReference?: string) {
    if (!reason?.trim()) throw new BadRequestException({ code: 'REFUND_REASON_REQUIRED', message: 'A refund reason is required' });
    return this.prisma.$transaction(async (tx) => {
      const [payment] = await tx.$queryRaw<Array<{ id: string; amount_kobo: bigint }>>`
        SELECT id, amount_kobo FROM payments WHERE request_id=${requestId}::uuid AND status='PAID' ORDER BY paid_at DESC LIMIT 1 FOR UPDATE`;
      if (!payment) throw new BadRequestException({ code: 'PAID_PAYMENT_NOT_FOUND', message: 'No paid transaction is available to refund' });
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.REFUNDED, gatewayResponse: { refundReference: refundReference || null, reason } } });
      await tx.serviceRequest.update({ where: { id: requestId }, data: { paymentStatus: PaymentStatus.REFUNDED } });
      await tx.ledgerEntry.create({ data: { type: LedgerEntryType.REFUND, requestId, paymentId: payment.id, amountKobo: -payment.amount_kobo, description: `Refund ${refundReference || 'manual'}: ${reason}`, createdBy: adminId } });
      await tx.requestEvent.create({ data: { requestId, type: 'PAYMENT_UPDATE', actorType: 'ADMIN', actorId: adminId, payload: { status: 'REFUNDED', reason, refundReference: refundReference || null } } });
      return { id: payment.id, amountKobo: payment.amount_kobo, status: PaymentStatus.REFUNDED };
    });
  }
}
