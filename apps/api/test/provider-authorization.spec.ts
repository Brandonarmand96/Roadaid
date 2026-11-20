import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@roadaid/shared';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ProvidersController } from '../src/providers/providers.controller';

describe('Provider route authorization and rate limits', () => {
  it('rejects a customer token from provider-role routes', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([Role.PROVIDER]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { id: 'customer-1', role: Role.CUSTOMER } }) }), getHandler: jest.fn(), getClass: jest.fn() } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow('Requires one of roles');
  });

  it('allows a provider token through shared customer-capability routes', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([Role.CUSTOMER, Role.PROVIDER]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { id: 'provider-1', role: Role.PROVIDER } }) }), getHandler: jest.fn(), getClass: jest.fn() } as unknown as ExecutionContext;
    expect(guard.canActivate(context)).toBe(true);
  });

  it('limits each provider to one location request per second', async () => {
    const service: any = { updateLocation: jest.fn().mockResolvedValue({ success: true }) };
    const controller = new ProvidersController(service);
    const point = { lat: 9.0765, lng: 7.3986, accuracy: 10, recordedAt: new Date().toISOString() };
    await controller.updateLocation('provider-1', point);
    await expect(controller.updateLocation('provider-1', point)).rejects.toBeInstanceOf(HttpException);
    expect(service.updateLocation).toHaveBeenCalledTimes(1);
  });
});
