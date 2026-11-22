import { BadRequestException } from '@nestjs/common';
import { ServiceType } from '@roadaid/shared';
import { AdminService } from '../src/admin/admin.service';

describe('Admin operations controls', () => {
  const prisma = {
    commissionSettings: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    notification: { findMany: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const service = new AdminService(prisma as never, audit as never, {} as never, {} as never, {} as never, {} as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects fractional or excessive commission basis points', async () => {
    await expect(service.updateCommissionSettings(ServiceType.FUEL, 1500.5, 'admin-1', 'FINANCE')).rejects.toThrow(BadRequestException);
    await expect(service.updateCommissionSettings(ServiceType.FUEL, 5001, 'admin-1', 'FINANCE')).rejects.toThrow(BadRequestException);
    expect(prisma.commissionSettings.update).not.toHaveBeenCalled();
  });

  it('updates commission and writes an audit entry', async () => {
    prisma.commissionSettings.findUnique.mockResolvedValue({ id: 'commission-1', serviceType: ServiceType.FUEL, commissionBps: 1500 });
    prisma.commissionSettings.update.mockResolvedValue({ id: 'commission-1', serviceType: ServiceType.FUEL, commissionBps: 1750 });
    await service.updateCommissionSettings(ServiceType.FUEL, 1750, 'admin-1', 'FINANCE', '127.0.0.1');
    expect(prisma.commissionSettings.update).toHaveBeenCalledWith({ where: { serviceType: ServiceType.FUEL }, data: { commissionBps: 1750, updatedBy: 'admin-1' } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'COMMISSION_SETTINGS_UPDATED', entityId: 'commission-1' }));
  });

  it('loads notification history without secret device tokens', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    await service.getNotificationHistory();
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, include: { user: { select: { fullName: true, phone: true, role: true } } } }));
  });
});
