import { NotificationsService } from '../src/notifications/notifications.service';

describe('NotificationsService inbox ownership', () => {
  const prisma = {
    notification: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const service = new NotificationsService(prisma as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it('lists only the authenticated user notifications newest first', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    await service.list('user-1');
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  it('cannot mark another user notification as read', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    await service.markRead('user-1', 'notification-2');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notification-2', userId: 'user-1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
