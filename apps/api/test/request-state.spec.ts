import { BadRequestException } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { RequestStateService } from '../src/requests/request-state.service';

describe('RequestStateService', () => {
  const tx: any = {
    $queryRaw: jest.fn(),
    serviceRequest: { update: jest.fn() },
    requestEvent: { create: jest.fn() },
    providerProfile: { updateMany: jest.fn() },
    dispatchOffer: { findFirst: jest.fn(), update: jest.fn() },
    payment: { findFirst: jest.fn() },
    ledgerEntry: { findFirst: jest.fn(), create: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
  const realtime: any = { emitRequestUpdated: jest.fn() };
  let service: RequestStateService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RequestStateService(prisma, realtime);
  });

  it('enforces the provider job progression table', async () => {
    tx.$queryRaw.mockResolvedValue([{ status: RequestStatus.ASSIGNED }]);
    tx.serviceRequest.update.mockResolvedValue({ id: 'request-1', status: RequestStatus.EN_ROUTE, providerId: 'provider-1' });
    await expect(service.transition('request-1', RequestStatus.EN_ROUTE, { type: 'PROVIDER', id: 'provider-1' })).resolves.toMatchObject({ status: RequestStatus.EN_ROUTE });
    expect(tx.requestEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'STATUS_CHANGED' }) }));
    expect(realtime.emitRequestUpdated).toHaveBeenCalled();
  });

  it('rejects an invalid status jump', async () => {
    tx.$queryRaw.mockResolvedValue([{ status: RequestStatus.ASSIGNED }]);
    await expect(service.transition('request-1', RequestStatus.COMPLETED, { type: 'PROVIDER', id: 'provider-1' })).rejects.toThrow(BadRequestException);
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
  });

  it('releases the provider when a job completes', async () => {
    tx.$queryRaw.mockResolvedValue([{ status: RequestStatus.IN_PROGRESS }]);
    tx.serviceRequest.update.mockResolvedValue({ id: 'request-1', status: RequestStatus.COMPLETED, providerId: 'provider-1' });
    await service.transition('request-1', RequestStatus.COMPLETED, { type: 'PROVIDER', id: 'provider-1' });
    expect(tx.providerProfile.updateMany).toHaveBeenCalledWith({ where: { userId: 'provider-1', currentRequestId: 'request-1' }, data: { currentRequestId: null, availability: 'ONLINE' } });
  });

  it('blocks customer cancellation after arrival', async () => {
    tx.$queryRaw.mockResolvedValue([{ status: RequestStatus.ARRIVED, customer_id: 'customer-1', provider_id: 'provider-1' }]);
    await expect(service.cancel('request-1', { type: 'CUSTOMER', id: 'customer-1' }, 'Changed mind')).rejects.toThrow(BadRequestException);
  });

  it('blocks starting service until an after-accept payment is paid', async () => {
    tx.$queryRaw.mockResolvedValue([{ status: RequestStatus.ARRIVED }]);
    tx.serviceRequest.findUniqueOrThrow = jest.fn().mockResolvedValue({ paymentMode: 'ONLINE_AFTER_ACCEPT', paymentStatus: 'PENDING' });
    await expect(service.transition('request-1', RequestStatus.IN_PROGRESS, { type: 'PROVIDER', id: 'provider-1' })).rejects.toThrow(BadRequestException);
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
  });

  it('cancels a pending offer and releases its reserved provider atomically', async () => {
    tx.$queryRaw.mockResolvedValue([{ status: RequestStatus.SEARCHING, customer_id: 'customer-1', provider_id: null }]);
    tx.dispatchOffer.findFirst.mockResolvedValue({ id: 'offer-1', providerId: 'provider-1' });
    tx.serviceRequest.update.mockResolvedValue({ id: 'request-1', status: RequestStatus.CANCELLED, providerId: null });
    await service.cancel('request-1', { type: 'CUSTOMER', id: 'customer-1' }, 'No longer needed');
    expect(tx.dispatchOffer.update).toHaveBeenCalled();
    expect(tx.providerProfile.updateMany).toHaveBeenCalledWith({ where: { userId: 'provider-1', availability: 'RESERVED' }, data: { availability: 'ONLINE' } });
  });
});
