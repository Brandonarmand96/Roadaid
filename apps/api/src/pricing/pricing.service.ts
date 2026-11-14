import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FuelDetailsDto, QuoteRequestDto, ServiceType, TowingDetailsDto } from '@roadaid/shared';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(dto: QuoteRequestDto) {
    const rule = await this.prisma.pricingRule.findUnique({ where: { serviceType: dto.serviceType } });
    if (!rule || !rule.active) throw new NotFoundException({ code: 'PRICING_UNAVAILABLE', message: 'Pricing is unavailable for this service' });
    let distanceMeters = 0;
    let variableKobo = 0n;
    if (dto.serviceType === ServiceType.FUEL) {
      variableKobo = rule.perLitreKobo * BigInt((dto.details as FuelDetailsDto).litres);
    } else if (dto.serviceType === ServiceType.TOWING) {
      const destination = (dto.details as TowingDetailsDto).destination;
      distanceMeters = this.haversineMeters(dto.pickup.lat, dto.pickup.lng, destination.lat, destination.lng);
      const freeMeters = Math.round(rule.towingFreeKm * 1000);
      const chargeableMeters = Math.max(0, distanceMeters - freeMeters);
      variableKobo = (rule.perKmKobo * BigInt(chargeableMeters) + 999n) / 1000n;
    }
    const subtotal = rule.baseKobo + variableKobo;
    const priceKobo = subtotal > rule.minKobo ? subtotal : rule.minKobo;
    if (priceKobo > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestException('Calculated price exceeds the supported range');
    return {
      serviceType: dto.serviceType,
      priceKobo,
      distanceMeters,
      breakdown: {
        baseKobo: Number(rule.baseKobo),
        variableKobo: Number(variableKobo),
        minKobo: Number(rule.minKobo),
      },
    };
  }

  private haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
    const rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad;
    const dLng = (bLng - aLng) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
  }
}
