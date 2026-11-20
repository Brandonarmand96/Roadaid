import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'RoadAid API',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  async getReady() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        code: 'SERVICE_NOT_READY',
        message: 'RoadAid database is unavailable',
        details: { database: 'disconnected' },
      });
    }
  }
}
