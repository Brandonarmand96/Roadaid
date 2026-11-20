import { RealtimeGateway } from '../src/realtime/realtime.gateway';

describe('RealtimeGateway request room authorization', () => {
  const prisma: any = { serviceRequest: { findFirst: jest.fn() } };
  const gateway = new RealtimeGateway(prisma);
  const client: any = { data: { user: { userId: 'customer-1', role: 'CUSTOMER' } }, join: jest.fn(), leave: jest.fn(), id: 'socket-1' };

  beforeEach(() => jest.clearAllMocks());

  it('allows a customer to join their own request room', async () => {
    prisma.serviceRequest.findFirst.mockResolvedValue({ id: 'request-1' });
    await expect(gateway.handleJoinRequest(client, { requestId: 'request-1' })).resolves.toEqual({ success: true, room: 'request:request-1' });
    expect(prisma.serviceRequest.findFirst).toHaveBeenCalledWith({ where: { id: 'request-1', OR: [{ customerId: 'customer-1' }, { providerId: 'customer-1' }] }, select: { id: true } });
    expect(client.join).toHaveBeenCalledWith('request:request-1');
  });

  it('denies a customer access to another customer request', async () => {
    prisma.serviceRequest.findFirst.mockResolvedValue(null);
    await expect(gateway.handleJoinRequest(client, { requestId: 'request-2' })).resolves.toEqual({ success: false, error: 'Forbidden request room' });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('allows a provider to join a request they created in Customer mode', async () => {
    const providerCustomer: any = { ...client, data: { user: { userId: 'provider-1', role: 'PROVIDER' } }, join: jest.fn() };
    prisma.serviceRequest.findFirst.mockResolvedValue({ id: 'request-3' });
    await expect(gateway.handleJoinRequest(providerCustomer, { requestId: 'request-3' })).resolves.toEqual({ success: true, room: 'request:request-3' });
    expect(prisma.serviceRequest.findFirst).toHaveBeenCalledWith({ where: { id: 'request-3', OR: [{ customerId: 'provider-1' }, { providerId: 'provider-1' }] }, select: { id: true } });
  });

  it('allows an authenticated admin without an ownership query', async () => {
    const admin: any = { ...client, data: { user: { userId: 'admin-1', role: 'ADMIN' } }, join: jest.fn() };
    await expect(gateway.handleJoinRequest(admin, { requestId: 'request-1' })).resolves.toEqual({ success: true, room: 'request:request-1' });
    expect(prisma.serviceRequest.findFirst).not.toHaveBeenCalled();
  });

  it('serializes exact safe bigint values before emitting request updates', () => {
    const emit = jest.fn();
    const chain = { to: jest.fn().mockReturnThis(), emit };
    (gateway as any).server = { to: jest.fn(() => chain) };
    gateway.emitRequestUpdated('request-1', { priceKobo: 1050000n });
    expect(emit).toHaveBeenCalledWith('request.updated', { priceKobo: 1050000 });
  });
});
