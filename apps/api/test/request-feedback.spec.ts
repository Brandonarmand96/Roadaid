import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { RequestsService } from '../src/requests/requests.service';

describe('Request feedback authorization', () => {
  const tx: any = {
    $queryRaw: jest.fn(),
    providerProfile: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    serviceRequest: { update: jest.fn() },
    requestEvent: { create: jest.fn() },
  };
  const prisma: any = {
    $transaction: jest.fn((callback) => callback(tx)),
    serviceRequest: { findFirst: jest.fn() },
    providerProfile: { findUnique: jest.fn() },
  };
  const service = new RequestsService(prisma, {} as any, {} as any, {} as any);
  beforeEach(() => jest.clearAllMocks());

  it('hides another customer request when rating', async () => {
    tx.$queryRaw.mockResolvedValue([{ status: RequestStatus.COMPLETED, customer_id: 'customer-2', provider_id: 'provider-1', rating_customer_to_provider: null }]);
    await expect(service.rateOwned('customer-1', 'request-1', 5)).rejects.toThrow(NotFoundException);
  });

  it('blocks a provider from requesting assistance while online or handling a job', async () => {
    prisma.providerProfile.findUnique.mockResolvedValue({ availability: 'ONLINE', currentRequestId: null });
    await expect(service.create('provider-1', {} as any)).rejects.toMatchObject({ response: { code: 'PROVIDER_MUST_BE_OFFLINE' } });
  });

  it('updates a completed request and provider aggregate once', async () => {
    tx.$queryRaw.mockResolvedValue([{ status: RequestStatus.COMPLETED, customer_id: 'customer-1', provider_id: 'provider-1', rating_customer_to_provider: null }]);
    tx.providerProfile.findUniqueOrThrow.mockResolvedValue({ ratingAvg: new Prisma.Decimal('4.50'), ratingCount: 2 });
    tx.serviceRequest.update.mockResolvedValue({ id: 'request-1', ratingCustomerToProvider: 5 });
    await service.rateOwned('customer-1', 'request-1', 5, 'Fast response');
    expect(tx.providerProfile.update).toHaveBeenCalledWith({ where: { userId: 'provider-1' }, data: { ratingAvg: new Prisma.Decimal('4.67'), ratingCount: 3 } });
    expect(tx.requestEvent.create).toHaveBeenCalled();
  });

  it('rejects disputes before a request is terminal', async () => {
    prisma.serviceRequest.findFirst.mockResolvedValue({ status: RequestStatus.EN_ROUTE, disputeFlag: false });
    await expect(service.disputeOwned('customer-1', 'request-1', 'Provider issue')).rejects.toThrow(BadRequestException);
  });
});
