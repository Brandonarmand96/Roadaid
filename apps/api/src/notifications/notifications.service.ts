import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway) {}

  async send(userId: string, message: { title: string; body: string; data?: Prisma.InputJsonValue; channel?: string; priority?: 'default' | 'high' }) {
    const notification = await this.prisma.notification.create({ data: { userId, title: message.title, body: message.body, data: message.data } });
    this.realtime.emitNotification(userId, notification);
    const tokens = await this.prisma.deviceToken.findMany({ where: { userId }, select: { id: true, token: true } });
    const expoTokens = tokens.filter(({ token }) => /^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(token));
    if (!expoTokens.length || process.env.NODE_ENV === 'test') return notification;
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expoTokens.map(({ token }) => ({ to: token, title: message.title, body: message.body, data: message.data, priority: message.priority || 'default', channelId: message.channel }))),
      });
      if (!response.ok) this.logger.warn(`Expo push returned HTTP ${response.status}`);
      else {
        const result = await response.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
        const invalidIds = expoTokens.filter((_, index) => result.data?.[index]?.details?.error === 'DeviceNotRegistered').map(({ id }) => id);
        if (invalidIds.length) await this.prisma.deviceToken.deleteMany({ where: { id: { in: invalidIds } } });
      }
    } catch (error) {
      this.logger.warn(`Push delivery failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    return notification;
  }
}
