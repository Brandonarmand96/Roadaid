import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PrismaClient, Role, ServiceType, UserStatus } from '@prisma/client';
import { DispatchService } from '../src/dispatch/dispatch.service';

const prisma = new PrismaClient();
const providerIds = Array.from({ length: 20 }, () => randomUUID());
const requestIds = Array.from({ length: 50 }, () => randomUUID());
const customerId = randomUUID();
const run = Date.now().toString().slice(-8);

async function main() {
  try {
    await prisma.user.create({ data: { id: customerId, phone: `+23470${run}00`, role: Role.CUSTOMER, status: UserStatus.ACTIVE } });
    for (const [index, providerId] of providerIds.entries()) {
      await prisma.user.create({ data: { id: providerId, phone: `+23471${run}${String(index).padStart(2, '0')}`, role: Role.PROVIDER, status: UserStatus.ACTIVE } });
      await prisma.providerProfile.create({ data: { userId: providerId, onboardingStatus: 'APPROVED', availability: 'ONLINE', vehicleMake: 'Test', vehiclePlate: `T${index}` } });
      await prisma.providerService.create({ data: { providerId, serviceType: ServiceType.FUEL, status: 'APPROVED' } });
      await prisma.$executeRaw`INSERT INTO provider_locations (provider_id, location, accuracy_m, recorded_at, received_at, created_at, updated_at) VALUES (${providerId}::uuid, ST_SetSRID(ST_MakePoint(${7.3986 + index * 0.00001}, ${9.0765}),4326)::geography, 5, now(), now(), now(), now())`;
    }
    for (const [index, requestId] of requestIds.entries()) {
      await prisma.$executeRaw`
        INSERT INTO service_requests
          (id, code, customer_id, service_type, status, details, pickup_location, pickup_address,
           price_kobo, price_breakdown, commission_bps, search_started_at, created_at, updated_at)
        VALUES (${requestId}::uuid, ${`CONC-${run}-${index}`}, ${customerId}::uuid, 'FUEL', 'SEARCHING',
          '{"fuelType":"PETROL","litres":5}'::jsonb, ST_SetSRID(ST_MakePoint(7.3986,9.0765),4326)::geography,
          'Concurrency test', 1050000, '{"baseKobo":300000,"variableKobo":750000}'::jsonb, 1500, now(), now(), now())`;
    }
    const realtime = { emitAdminAlert() {}, emitRequestUpdated() {}, emitOfferNew() {}, emitOfferExpired() {} } as any;
    const notifications = { send: async () => undefined } as any;
    const service = new DispatchService(prisma as any, realtime, {} as any, notifications);
    await Promise.all(requestIds.map((id) => service.dispatchNext(id)));
    const retryable = await prisma.serviceRequest.findMany({ where: { id: { in: requestIds }, status: 'SEARCHING', currentOfferId: null }, select: { id: true } });
    await Promise.all(retryable.map((request) => service.dispatchNext(request.id)));
    const pending = await prisma.dispatchOffer.findMany({ where: { requestId: { in: requestIds }, status: 'PENDING' } });
    const codePrefix = `CONC-${run}-%`;
    const duplicateProviders = await prisma.$queryRaw<Array<{ provider_id: string; count: bigint }>>`
      SELECT o.provider_id, count(*) FROM dispatch_offers o JOIN service_requests r ON r.id=o.request_id
      WHERE r.code LIKE ${codePrefix} AND o.status='PENDING' GROUP BY o.provider_id HAVING count(*) > 1`;
    const duplicateRequests = await prisma.$queryRaw<Array<{ request_id: string; count: bigint }>>`
      SELECT o.request_id, count(*) FROM dispatch_offers o JOIN service_requests r ON r.id=o.request_id
      WHERE r.code LIKE ${codePrefix} AND o.status='PENDING' GROUP BY o.request_id HAVING count(*) > 1`;
    if (pending.length !== 20 || duplicateProviders.length || duplicateRequests.length || new Set(pending.map((offer) => offer.providerId)).size !== pending.length) {
      throw new Error(`Concurrency invariant failed: pending=${pending.length}, duplicateProviders=${duplicateProviders.length}, duplicateRequests=${duplicateRequests.length}`);
    }
    console.log(JSON.stringify({ requests: 50, providers: 20, pendingOffers: pending.length, uniquePendingProviders: 20, duplicateProviders: 0, duplicateRequests: 0 }));
  } finally {
    await prisma.dispatchOffer.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.requestEvent.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.serviceRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.providerLocation.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.providerService.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.providerProfile.deleteMany({ where: { userId: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...providerIds, customerId] } } });
    await prisma.$disconnect();
  }
}

void main();
