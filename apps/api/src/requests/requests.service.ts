import { randomUUID } from 'crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateServiceRequestDto, QuoteRequestDto } from '@roadaid/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService, private readonly pricing: PricingService) {}

  async create(customerId: string, dto: CreateServiceRequestDto) {
    const [quote, commission, vehicle] = await Promise.all([
      this.pricing.quote({ serviceType: dto.serviceType, pickup: { lat: dto.pickup.lat, lng: dto.pickup.lng }, details: dto.details } as QuoteRequestDto),
      this.prisma.commissionSettings.findUnique({ where: { serviceType: dto.serviceType } }),
      dto.vehicleId ? this.prisma.customerVehicle.findFirst({ where: { id: dto.vehicleId, customerId } }) : Promise.resolve(null),
    ]);
    if (dto.vehicleId && !vehicle) throw new ForbiddenException({ code: 'VEHICLE_NOT_OWNED', message: 'Vehicle does not belong to this customer' });
    if (!commission) throw new NotFoundException({ code: 'COMMISSION_UNAVAILABLE', message: 'Commission settings are unavailable' });
    const id = randomUUID();
    const code = `RA-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${id.slice(0, 6).toUpperCase()}`;
    const vehicleSnapshot = vehicle ? { make: vehicle.make, model: vehicle.model, color: vehicle.color, plateNumber: vehicle.plateNumber, vehicleType: vehicle.vehicleType } : null;
    const details = dto.details as Prisma.InputJsonValue;
    const breakdown = quote.breakdown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO service_requests
          (id, code, customer_id, service_type, status, vehicle_id, vehicle_snapshot, details,
           pickup_location, pickup_address, pickup_note, distance_km, price_kobo, price_breakdown,
           commission_bps, payment_mode, search_started_at, created_at, updated_at)
        VALUES
          (${id}::uuid, ${code}, ${customerId}::uuid, ${dto.serviceType}::"ServiceType", 'REQUESTED',
           ${dto.vehicleId || null}::uuid, ${vehicleSnapshot ? JSON.stringify(vehicleSnapshot) : null}::jsonb,
           ${JSON.stringify(details)}::jsonb, ST_SetSRID(ST_MakePoint(${dto.pickup.lng}, ${dto.pickup.lat}), 4326)::geography,
           ${dto.pickup.address}, ${dto.pickup.note || null}, ${quote.distanceMeters / 1000}, ${quote.priceKobo},
           ${JSON.stringify(breakdown)}::jsonb, ${commission.commissionBps}, ${process.env.PAYMENT_MODE || 'ONLINE_AFTER_ACCEPT'}, now(), now(), now())`;
      await tx.requestEvent.create({ data: { requestId: id, type: 'CREATED', actorType: 'CUSTOMER', actorId: customerId, payload: { serviceType: dto.serviceType, priceKobo: quote.priceKobo.toString() } } });
    });
    return this.getOwned(customerId, id);
  }

  listOwned(customerId: string) { return this.prisma.serviceRequest.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, include: { events: { orderBy: { createdAt: 'asc' } } } }); }
  async getOwned(customerId: string, id: string) {
    const request = await this.prisma.serviceRequest.findFirst({ where: { id, customerId }, include: { events: { orderBy: { createdAt: 'asc' } } } });
    if (!request) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
    return request;
  }
}
