import { BadRequestException } from '@nestjs/common';
import { SupportService } from '../src/support/support.service';

describe('SupportService ownership', () => {
  const prisma = {
    supportCase: { findMany: jest.fn(), create: jest.fn() },
    serviceRequest: { count: jest.fn() },
  };
  const service = new SupportService(prisma as never);
  beforeEach(() => jest.clearAllMocks());

  it('scopes case history to the authenticated user', async () => {
    prisma.supportCase.findMany.mockResolvedValue([]);
    await service.list('user-1');
    expect(prisma.supportCase.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }));
  });

  it('rejects attaching a request the user does not own', async () => {
    prisma.serviceRequest.count.mockResolvedValue(0);
    await expect(service.create('user-1', { subject: 'Payment problem', message: 'Payment was taken twice.', requestId: 'request-2' })).rejects.toThrow(BadRequestException);
    expect(prisma.supportCase.create).not.toHaveBeenCalled();
  });
});
