import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('public/requests')
export class PublicRequestsController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':token')
  async status(@Param('token') token: string) {
    if (!/^[a-f0-9]{32}$/i.test(token)) throw new NotFoundException({ code: 'SHARED_REQUEST_NOT_FOUND', message: 'Shared request not found' });
    const request = await this.prisma.serviceRequest.findUnique({
      where: { shareToken: token },
      select: {
        code: true,
        serviceType: true,
        status: true,
        pickupAddress: true,
        createdAt: true,
        acceptedAt: true,
        arrivedAt: true,
        startedAt: true,
        completedAt: true,
        provider: { select: { fullName: true, avatarUrl: true, providerProfile: { select: { ratingAvg: true, ratingCount: true, vehicleMake: true, vehicleModel: true, vehiclePlate: true } } } },
      },
    });
    if (!request) throw new NotFoundException({ code: 'SHARED_REQUEST_NOT_FOUND', message: 'Shared request not found' });
    return request;
  }
}
