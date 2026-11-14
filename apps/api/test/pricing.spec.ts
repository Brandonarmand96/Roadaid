import { Test } from '@nestjs/testing';
import { PricingService } from '../src/pricing/pricing.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { FuelType, LockType, ServiceType } from '@roadaid/shared';

describe('PricingService', () => {
  let service: PricingService;
  const prisma = { pricingRule: { findUnique: jest.fn() } };
  beforeEach(async () => {
    jest.clearAllMocks();
    service = (await Test.createTestingModule({ providers: [PricingService, { provide: PrismaService, useValue: prisma }] }).compile()).get(PricingService);
  });

  it('quotes fuel using integer kobo per litre', async () => {
    prisma.pricingRule.findUnique.mockResolvedValue({ active: true, baseKobo: 300000n, perLitreKobo: 150000n, perKmKobo: 0n, minKobo: 300000n, towingFreeKm: 0 });
    const quote = await service.quote({ serviceType: ServiceType.FUEL, pickup: { lat: 9, lng: 7 }, details: { fuelType: FuelType.PETROL, litres: 5 } });
    expect(quote.priceKobo).toBe(1050000n);
  });

  it('quotes lockout at the configured fixed price', async () => {
    prisma.pricingRule.findUnique.mockResolvedValue({ active: true, baseKobo: 800000n, perLitreKobo: 0n, perKmKobo: 0n, minKobo: 800000n, towingFreeKm: 0 });
    const quote = await service.quote({ serviceType: ServiceType.LOCKOUT, pickup: { lat: 9, lng: 7 }, details: { lockType: LockType.KEYS_INSIDE } });
    expect(quote.priceKobo).toBe(800000n);
  });

  it('calculates towing variable price from integer metres', async () => {
    prisma.pricingRule.findUnique.mockResolvedValue({ active: true, baseKobo: 1500000n, perLitreKobo: 0n, perKmKobo: 50000n, minKobo: 1500000n, towingFreeKm: 0 });
    const quote = await service.quote({ serviceType: ServiceType.TOWING, pickup: { lat: 9, lng: 7 }, details: { destination: { lat: 9.01, lng: 7, address: 'Destination' }, vehicleCondition: 'Won’t start' } });
    expect(quote.distanceMeters).toBeGreaterThan(1100);
    expect(quote.priceKobo).toBeGreaterThan(1550000n);
  });
});
