import { ConflictException } from '@nestjs/common';
import { OfferStatus, ProviderAvailability, RequestStatus } from '@prisma/client';
import { DispatchService } from '../src/dispatch/dispatch.service';

describe('DispatchService offer responses', () => {
  const tx: any = {
    $queryRaw: jest.fn(),
    dispatchOffer: { update: jest.fn() },
    providerProfile: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    serviceRequest: { update: jest.fn() },
    requestEvent: { create: jest.fn() },
  };
  const prisma: any = {
    $transaction: jest.fn((callback) => callback(tx)),
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
});
