import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CancelledBy, LedgerEntryType, OfferStatus, PaymentStatus, Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const transitions: Record<RequestStatus, RequestStatus[]> = {
  REQUESTED: [RequestStatus.SEARCHING, RequestStatus.CANCELLED],
  SEARCHING: [RequestStatus.ASSIGNED, RequestStatus.ESCALATED, RequestStatus.CANCELLED],
  ASSIGNED: [RequestStatus.EN_ROUTE, RequestStatus.CANCELLED],
  EN_ROUTE: [RequestStatus.ARRIVED, RequestStatus.CANCELLED],
  ARRIVED: [RequestStatus.IN_PROGRESS, RequestStatus.CANCELLED],
  IN_PROGRESS: [RequestStatus.COMPLETED, RequestStatus.CANCELLED],
  COMPLETED: [], CANCELLED: [],
  ESCALATED: [RequestStatus.SEARCHING, RequestStatus.ASSIGNED, RequestStatus.CANCELLED],
};

@Injectable()
export class RequestStateService {
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway) {}

  async transition(requestId: string, to: RequestStatus, actor: { type: string; id?: string }, payload: Prisma.InputJsonValue = {}) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: RequestStatus }>>`SELECT status FROM service_requests WHERE id=${requestId}::uuid FOR UPDATE`;
      const current = rows[0];
      if (!current) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
      if (!transitions[current.status].includes(to)) throw new BadRequestException({ code: 'INVALID_REQUEST_TRANSITION', message: `Cannot transition from ${current.status} to ${to}` });
      if (to === RequestStatus.IN_PROGRESS) {
        const paymentGate = await tx.serviceRequest.findUniqueOrThrow({ where: { id: requestId }, select: { paymentMode: true, paymentStatus: true } });
        if (paymentGate.paymentMode === 'ONLINE_AFTER_ACCEPT' && paymentGate.paymentStatus !== PaymentStatus.PAID) throw new BadRequestException({ code: 'PAYMENT_REQUIRED', message: 'Payment is required before service can begin' });
      }
      const timestampData = to === RequestStatus.ARRIVED ? { arrivedAt: new Date() }
          : to === RequestStatus.IN_PROGRESS ? { startedAt: new Date() }
            : to === RequestStatus.COMPLETED ? { completedAt: new Date() }
              : to === RequestStatus.ESCALATED ? { escalatedAt: new Date() } : {};
      const request = await tx.serviceRequest.update({ where: { id: requestId }, data: { status: to, ...timestampData } });
      await tx.requestEvent.create({ data: { requestId, type: 'STATUS_CHANGED', actorType: actor.type, actorId: actor.id, payload: { ...payload as object, from: current.status, to } } });
      if ((new Set<RequestStatus>([RequestStatus.COMPLETED, RequestStatus.CANCELLED])).has(to) && request.providerId) {
        await tx.providerProfile.updateMany({ where: { userId: request.providerId, currentRequestId: requestId }, data: { currentRequestId: null, availability: 'ONLINE' } });
      }
      if (to === RequestStatus.COMPLETED && request.providerId && request.paymentStatus === PaymentStatus.PAID) {
        const payment = await tx.payment.findFirst({ where: { requestId, status: PaymentStatus.PAID }, orderBy: { paidAt: 'desc' } });
        const existing = await tx.ledgerEntry.findFirst({ where: { requestId, providerId: request.providerId, type: LedgerEntryType.PROVIDER_EARNING } });
        if (payment && !existing) {
          const commission = request.priceKobo * BigInt(request.commissionBps) / 10_000n;
          const earning = request.priceKobo - commission;
          await tx.ledgerEntry.create({ data: { type: LedgerEntryType.PROVIDER_EARNING, requestId, paymentId: payment.id, providerId: request.providerId, amountKobo: earning, description: `Provider earning for ${request.code}` } });
          await tx.providerProfile.update({ where: { userId: request.providerId }, data: { walletBalanceKobo: { increment: earning }, completedJobs: { increment: 1 } } });
        }
      }
      return request;
    });
    this.realtime.emitRequestUpdated(requestId, updated);
    return updated;
  }

  async cancel(requestId: string, actor: { type: 'CUSTOMER' | 'PROVIDER' | 'ADMIN'; id: string }, reason: string) {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: RequestStatus; customer_id: string; provider_id: string | null }>>`SELECT status, customer_id, provider_id FROM service_requests WHERE id=${requestId}::uuid FOR UPDATE`;
      const current = rows[0];
      if (!current) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
      if (actor.type === 'CUSTOMER' && current.customer_id !== actor.id) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
      if (actor.type === 'CUSTOMER' && (new Set<RequestStatus>([RequestStatus.ARRIVED, RequestStatus.IN_PROGRESS, RequestStatus.COMPLETED, RequestStatus.CANCELLED])).has(current.status)) throw new BadRequestException({ code: 'CUSTOMER_CANCELLATION_BLOCKED', message: 'Contact Operations to cancel after the provider has arrived' });
      if ((new Set<RequestStatus>([RequestStatus.COMPLETED, RequestStatus.CANCELLED])).has(current.status)) throw new BadRequestException({ code: 'REQUEST_TERMINAL', message: 'Request is already complete or cancelled' });
      const pending = await tx.dispatchOffer.findFirst({ where: { requestId, status: OfferStatus.PENDING } });
      if (pending) {
        await tx.dispatchOffer.update({ where: { id: pending.id }, data: { status: OfferStatus.CANCELLED, respondedAt: new Date() } });
        await tx.providerProfile.updateMany({ where: { userId: pending.providerId, availability: 'RESERVED' }, data: { availability: 'ONLINE' } });
      }
      const request = await tx.serviceRequest.update({ where: { id: requestId }, data: { status: RequestStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: actor.type as CancelledBy, cancelReason: reason, currentOfferId: null } });
      if (current.provider_id) await tx.providerProfile.updateMany({ where: { userId: current.provider_id, currentRequestId: requestId }, data: { currentRequestId: null, availability: 'ONLINE' } });
      await tx.requestEvent.create({ data: { requestId, type: 'CANCELLED', actorType: actor.type, actorId: actor.id, payload: { from: current.status, reason } } });
      return request;
    });
    this.realtime.emitRequestUpdated(requestId, cancelled);
    return cancelled;
  }
}
