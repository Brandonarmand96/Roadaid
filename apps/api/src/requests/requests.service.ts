import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { CreateServiceRequestDto, QuoteRequestDto } from '@roadaid/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { RequestStateService } from './request-state.service';

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService, private readonly pricing: PricingService, private readonly dispatch: DispatchService, private readonly states: RequestStateService) {}

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
    await this.dispatch.start(id);
    return this.getOwned(customerId, id);
  }

  listOwned(customerId: string) { return this.prisma.serviceRequest.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, include: { provider: { select: { fullName: true, phone: true } }, events: { orderBy: { createdAt: 'asc' } } } }); }
  async getOwned(customerId: string, id: string) {
    const request = await this.prisma.serviceRequest.findFirst({ where: { id, customerId }, include: { provider: { select: { fullName: true, phone: true } }, events: { orderBy: { createdAt: 'asc' } } } });
    if (!request) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
    return request;
  }
  cancelOwned(customerId: string, id: string, reason: string) { return this.states.cancel(id, { type: 'CUSTOMER', id: customerId }, reason); }

  async rateOwned(customerId: string, id: string, rating: number, review?: string) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new BadRequestException({ code: 'INVALID_RATING', message: 'Rating must be an integer from 1 to 5' });
    if (review && review.length > 1000) throw new BadRequestException({ code: 'REVIEW_TOO_LONG', message: 'Review must not exceed 1000 characters' });
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ status: RequestStatus; customer_id: string; provider_id: string | null; rating_customer_to_provider: number | null }>>`
        SELECT status, customer_id, provider_id, rating_customer_to_provider FROM service_requests WHERE id=${id}::uuid FOR UPDATE`;
      if (!row || row.customer_id !== customerId) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
      if (row.status !== RequestStatus.COMPLETED || !row.provider_id) throw new BadRequestException({ code: 'RATING_NOT_ALLOWED', message: 'Only completed requests can be rated' });
      if (row.rating_customer_to_provider !== null) throw new BadRequestException({ code: 'REQUEST_ALREADY_RATED', message: 'This request has already been rated' });
      const provider = await tx.providerProfile.findUniqueOrThrow({ where: { userId: row.provider_id }, select: { ratingAvg: true, ratingCount: true } });
      const nextCount = provider.ratingCount + 1;
      const nextAverage = (provider.ratingAvg.toNumber() * provider.ratingCount + rating) / nextCount;
      const request = await tx.serviceRequest.update({ where: { id }, data: { ratingCustomerToProvider: rating, reviewText: review?.trim() || null } });
      await tx.providerProfile.update({ where: { userId: row.provider_id }, data: { ratingAvg: new Prisma.Decimal(nextAverage.toFixed(2)), ratingCount: nextCount } });
      await tx.requestEvent.create({ data: { requestId: id, type: 'RATED', actorType: 'CUSTOMER', actorId: customerId, payload: { rating } } });
      return request;
    });
  }

  async disputeOwned(customerId: string, id: string, reason: string) {
    const cleanReason = reason?.trim();
    if (!cleanReason || cleanReason.length > 2000) throw new BadRequestException({ code: 'INVALID_DISPUTE_REASON', message: 'A dispute reason of at most 2000 characters is required' });
    const request = await this.prisma.serviceRequest.findFirst({ where: { id, customerId } });
    if (!request) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
    if (!new Set<RequestStatus>([RequestStatus.COMPLETED, RequestStatus.CANCELLED]).has(request.status)) throw new BadRequestException({ code: 'DISPUTE_NOT_ALLOWED', message: 'A dispute can be opened after completion or cancellation' });
    if (request.disputeFlag) throw new BadRequestException({ code: 'DISPUTE_ALREADY_OPEN', message: 'A dispute is already open for this request' });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceRequest.update({ where: { id }, data: { disputeFlag: true, disputeReason: cleanReason, disputedAt: new Date() } });
      await tx.requestEvent.create({ data: { requestId: id, type: 'DISPUTE', actorType: 'CUSTOMER', actorId: customerId, payload: { reason: cleanReason } } });
      return updated;
    });
  }
}
