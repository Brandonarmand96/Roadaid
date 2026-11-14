import { RealtimeGateway } from '../src/realtime/realtime.gateway';

describe('RealtimeGateway request room authorization', () => {
  const prisma: any = { serviceRequest: { findFirst: jest.fn() } };
  const gateway = new RealtimeGateway(prisma);
  const client: any = { data: { user: { userId: 'customer-1', role: 'CUSTOMER' } }, join: jest.fn(), leave: jest.fn(), id: 'socket-1' };

  beforeEach(() => jest.clearAllMocks());

  it('allows a customer to join their own request room', async () => {
    prisma.serviceRequest.findFirst.mockResolvedValue({ id: 'request-1' });
    await expect(gateway.handleJoinRequest(client, { requestId: 'request-1' })).resolves.toEqual({ success: true, room: 'request:request-1' });
    expect(prisma.serviceRequest.findFirst).toHaveBeenCalledWith({ where: { id: 'request-1', customerId: 'customer-1' }, select: { id: true } });
    expect(client.join).toHaveBeenCalledWith('request:request-1');
  });

  it('denies a customer access to another customer request', async () => {
    prisma.serviceRequest.findFirst.mockResolvedValue(null);
    await expect(gateway.handleJoinRequest(client, { requestId: 'request-2' })).resolves.toEqual({ success: false, error: 'Forbidden request room' });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('allows an authenticated admin without an ownership query', async () => {
    const admin: any = { ...client, data: { user: { userId: 'admin-1', role: 'ADMIN' } }, join: jest.fn() };
    await expect(gateway.handleJoinRequest(admin, { requestId: 'request-1' })).resolves.toEqual({ success: true, room: 'request:request-1' });
    expect(prisma.serviceRequest.findFirst).not.toHaveBeenCalled();
  });
});
