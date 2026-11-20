import { NotFoundException } from '@nestjs/common';
import { PublicRequestsController } from '../src/requests/public-requests.controller';

describe('PublicRequestsController', () => {
  const prisma = { serviceRequest: { findUnique: jest.fn() } };
  const controller = new PublicRequestsController(prisma as never);
  beforeEach(() => jest.clearAllMocks());

  it('rejects malformed share tokens without querying the database', async () => {
    await expect(controller.status('request-1')).rejects.toThrow(NotFoundException);
    expect(prisma.serviceRequest.findUnique).not.toHaveBeenCalled();
  });

  it('uses an explicit redacted projection for valid tokens', async () => {
    prisma.serviceRequest.findUnique.mockResolvedValue({ code: 'RA-1', status: 'EN_ROUTE' });
    await controller.status('a'.repeat(32));
    const query = prisma.serviceRequest.findUnique.mock.calls[0][0];
    expect(query.where).toEqual({ shareToken: 'a'.repeat(32) });
    expect(query.select).toBeDefined();
    expect(query.select.pickupPinEncrypted).toBeUndefined();
    expect(query.select.customer).toBeUndefined();
  });
});
