import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PaymentStatus, RequestStatus } from '@prisma/client';
import { PaymentsService } from '../src/payments/payments.service';

describe('PaymentsService', () => {
  const request = { id: 'request-1', code: 'RA-1', commissionBps: 1500, status: RequestStatus.COMPLETED, providerId: 'provider-1' };
  const payment = { id: 'payment-1', requestId: request.id, amountKobo: 10001n, status: PaymentStatus.PENDING, request };
  const tx: any = {
    $queryRaw: jest.fn(),
    payment: { findUniqueOrThrow: jest.fn(), update: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    serviceRequest: { update: jest.fn() },
    ledgerEntry: { createMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    providerProfile: { update: jest.fn() },
    requestEvent: { create: jest.fn() },
  };
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ due: 1500n }]),
    payment: { findUnique: jest.fn(), update: jest.fn() },
    webhookEvent: { create: jest.fn(), deleteMany: jest.fn() },
    serviceRequest: { findFirst: jest.fn() },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  const gateway: any = { verify: jest.fn(), initialize: jest.fn() };
  let service: PaymentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentsService(prisma, gateway);
    prisma.payment.findUnique.mockResolvedValue(payment);
    tx.payment.findUniqueOrThrow.mockResolvedValue(payment);
    tx.payment.update.mockResolvedValue({ ...payment, status: PaymentStatus.PAID });
    tx.ledgerEntry.findFirst.mockResolvedValue(null);
  });

  it('rejects an invalid webhook signature', async () => {
    process.env.PAYSTACK_WEBHOOK_SECRET = 'test-secret';
    await expect(service.handlePaystack(Buffer.from('{}'), 'invalid')).rejects.toThrow(UnauthorizedException);
  });

  it('does not initialize payment for another customer request', async () => {
    prisma.serviceRequest.findFirst.mockResolvedValue(null);
    await expect(service.initialize('customer-2', 'request-1')).rejects.toThrow('Request not found');
    expect(gateway.initialize).not.toHaveBeenCalled();
  });

  it('does not expose another customer payment status', async () => {
    prisma.payment.findFirst = jest.fn().mockResolvedValue(null);
    await expect(service.status('customer-2', 'RA-PAY-1')).rejects.toThrow('Payment not found');
  });

  it('rejects a verified amount mismatch without marking paid', async () => {
    gateway.verify.mockResolvedValue({ status: 'success', amountKobo: 10000n, currency: 'NGN', response: {} });
    await expect(service.verifyAndMarkPaid('RA-PAY-1')).rejects.toThrow(BadRequestException);
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it('reconciles commission and provider earning to the exact kobo', async () => {
    gateway.verify.mockResolvedValue({ status: 'success', amountKobo: 10001n, currency: 'NGN', response: {} });
    await service.verifyAndMarkPaid('RA-PAY-1');
    const ledgerRows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
    expect(ledgerRows[1].amountKobo).toBe(1500n);
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amountKobo: 8501n, providerId: 'provider-1' }) });
    expect(1500n + 8501n).toBe(10001n);
  });

  it('records cash as provider-held money and an exact commission debt', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'request-1', code: 'RA-1', customer_id: 'customer-1', provider_id: 'provider-1', status: RequestStatus.ARRIVED, payment_mode: 'CASH', payment_status: PaymentStatus.NONE, price_kobo: 10001n, commission_bps: 1500 }]);
    tx.payment.create.mockResolvedValue({ id: 'cash-payment-1' });
    await service.collectCash('provider-1', 'request-1');
    const rows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
    expect(rows[0]).toEqual(expect.objectContaining({ type: 'CUSTOMER_PAYMENT', amountKobo: 10001n }));
    expect(rows[1]).toEqual(expect.objectContaining({ type: 'PLATFORM_COMMISSION', providerId: 'provider-1', amountKobo: -1500n }));
    expect(tx.providerProfile.update).toHaveBeenCalledWith(expect.objectContaining({ data: { walletBalanceKobo: { decrement: 1500n } } }));
  });

  it('rejects cash confirmation from a provider who does not own the job', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'request-1', provider_id: 'provider-2' }]);
    await expect(service.collectCash('provider-1', 'request-1')).rejects.toThrow('Active job not found');
    expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it('settles cash commission once with an equal provider credit', async () => {
    const settlement = { id: 'settlement-payment-1', requestId: 'request-1', customerId: 'provider-1', amountKobo: 1500n, status: PaymentStatus.PENDING, request };
    prisma.payment.findUnique.mockResolvedValue(settlement);
    tx.payment.findUniqueOrThrow.mockResolvedValue(settlement);
    tx.payment.update.mockResolvedValue({ ...settlement, status: PaymentStatus.PAID });
    gateway.verify.mockResolvedValue({ status: 'success', amountKobo: 1500n, currency: 'NGN', response: {} });
    await service.verifyAndMarkPaid('RA-COM-1');
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'ADJUSTMENT', providerId: 'provider-1', amountKobo: 1500n }) });
    expect(tx.providerProfile.update).toHaveBeenCalledWith(expect.objectContaining({ data: { walletBalanceKobo: { increment: 1500n } } }));

    jest.clearAllMocks();
    prisma.payment.findUnique.mockResolvedValue({ ...settlement, status: PaymentStatus.PAID });
    await service.verifyAndMarkPaid('RA-COM-1');
    expect(gateway.verify).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('creates an exact negative refund ledger entry once a paid row is locked', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'payment-1', amount_kobo: 10001n }]);
    await service.refund('request-1', 'admin-1', 'Customer approved refund', 'REF-1');
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'REFUND', amountKobo: -10001n, createdBy: 'admin-1' }) });
    expect(tx.payment.update).toHaveBeenCalledWith({ where: { id: 'payment-1' }, data: expect.objectContaining({ status: 'REFUNDED' }) });
  });

  it('short-circuits a replayed webhook without verifying or writing the ledger twice', async () => {
    process.env.PAYSTACK_WEBHOOK_SECRET = 'test-secret';
    const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: { id: 44, reference: 'RA-PAY-1' } }));
    const signature = createHmac('sha512', 'test-secret').update(raw).digest('hex');
    prisma.webhookEvent.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.handlePaystack(raw, signature)).resolves.toEqual({ received: true, duplicate: true });
    expect(gateway.verify).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
  });
});
