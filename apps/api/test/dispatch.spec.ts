import { ConflictException } from '@nestjs/common';
import { OfferStatus, ProviderAvailability, RequestStatus } from '@prisma/client';
import { DispatchService } from '../src/dispatch/dispatch.service';

describe('DispatchService offer responses', () => {
  const tx: any = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    dispatchOffer: { update: jest.fn() },
    providerProfile: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    serviceRequest: { update: jest.fn() },
    requestEvent: { create: jest.fn() },
  };
  const prisma: any = {
    $transaction: jest.fn((callback) => callback(tx)),
    $queryRaw: jest.fn(),
    dispatchOffer: { findMany: jest.fn() },
  };
  const realtime: any = { emitRequestUpdated: jest.fn(), emitOfferExpired: jest.fn() };
  const notifications: any = { send: jest.fn() };
  let service: DispatchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DispatchService(prisma, realtime, {} as any, notifications);
  });

  it('scopes pending offers to the authenticated provider', async () => {
    prisma.dispatchOffer.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ now: new Date('2026-11-20T12:00:00.000Z') }]);
    await service.pendingOffers('provider-1');
    expect(prisma.dispatchOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ providerId: 'provider-1', status: OfferStatus.PENDING }) }));
  });

  it('rejects an offer owned by another provider as unavailable', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.respond('provider-2', 'offer-1', true)).rejects.toThrow(ConflictException);
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
  });

  it('rejects a server-expired offer even before the expiry worker runs', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'offer-1', request_id: 'request-1', provider_id: 'provider-1', status: OfferStatus.PENDING, expires_at: new Date(Date.now() - 1000) }]);
    await expect(service.respond('provider-1', 'offer-1', true)).rejects.toThrow(ConflictException);
  });

  it('accepts atomically and makes the provider busy', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'offer-1', request_id: 'request-1', provider_id: 'provider-1', status: OfferStatus.PENDING, expires_at: new Date(Date.now() + 30_000) }])
      .mockResolvedValueOnce([{ status: RequestStatus.SEARCHING }]);
    tx.providerProfile.findUnique.mockResolvedValue({ currentRequestId: null });
    tx.serviceRequest.update.mockResolvedValue({ id: 'request-1', customerId: 'customer-1', status: RequestStatus.ASSIGNED });
    const result = await service.respond('provider-1', 'offer-1', true);
    expect(result.accepted).toBe(true);
    expect(tx.providerProfile.update).toHaveBeenCalledWith({ where: { userId: 'provider-1' }, data: { availability: ProviderAvailability.BUSY, currentRequestId: 'request-1' } });
    expect(notifications.send).toHaveBeenCalledWith('customer-1', expect.objectContaining({ title: 'Provider assigned' }));
  });

  it('declines atomically and releases the reserved provider', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'offer-1', request_id: 'request-1', provider_id: 'provider-1', status: OfferStatus.PENDING, expires_at: new Date(Date.now() + 30_000) }])
      .mockResolvedValueOnce([{ status: RequestStatus.SEARCHING }]);
    tx.providerProfile.findUnique.mockResolvedValue({ currentRequestId: null });
    tx.serviceRequest.update.mockResolvedValue({ id: 'request-1', offersMadeCount: 1 });
    const result = await service.respond('provider-1', 'offer-1', false, 'Too far');
    expect(result.accepted).toBe(false);
    expect(tx.providerProfile.updateMany).toHaveBeenCalledWith({ where: { userId: 'provider-1', availability: ProviderAvailability.RESERVED }, data: { availability: ProviderAvailability.ONLINE } });
  });

  it('expires a pending offer and releases its reservation', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'offer-1', request_id: 'request-1', provider_id: 'provider-1', status: OfferStatus.PENDING }]);
    tx.serviceRequest.update.mockResolvedValue({ offersMadeCount: 1 });
    await service.expireOffer('offer-1');
    expect(tx.dispatchOffer.update).toHaveBeenCalledWith({ where: { id: 'offer-1' }, data: { status: OfferStatus.EXPIRED, respondedAt: expect.any(Date) } });
    expect(tx.providerProfile.updateMany).toHaveBeenCalledWith({ where: { userId: 'provider-1', availability: ProviderAvailability.RESERVED }, data: { availability: ProviderAvailability.ONLINE } });
    expect(realtime.emitOfferExpired).toHaveBeenCalledWith('provider-1', 'offer-1');
  });

  it('returns a provider-cancelled active job to searching', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ status: RequestStatus.EN_ROUTE, provider_id: 'provider-1', offers_made_count: 2 }]);
    const result = await service.cancelAcceptedJob('provider-1', 'request-1', 'Vehicle issue');
    expect(result.status).toBe(RequestStatus.SEARCHING);
    expect(tx.providerProfile.updateMany).toHaveBeenCalledWith({ where: { userId: 'provider-1', currentRequestId: 'request-1' }, data: { currentRequestId: null, availability: ProviderAvailability.ONLINE } });
    expect(tx.requestEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'CANCELLED', actorType: 'PROVIDER' }) }));
  });

  it('increments the dispatch round when an admin re-dispatches', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ status: RequestStatus.ESCALATED, dispatch_round: 1 }]);
    const result = await service.redispatch('request-1', 'admin-1');
    expect(result).toMatchObject({ status: RequestStatus.SEARCHING, dispatchRound: 2 });
    expect(tx.requestEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'ADMIN_ACTION', payload: { action: 'REDISPATCH', round: 2 } }) }));
  });
});
