import { PrismaClient, Role, AdminRole, ServiceType, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding RoadAid database...');

  // 1. Bootstrap Super Admin
  const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@roadaid.co';
  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'AdminSecurePassword2026!';
  const bootstrapPhone = '+2348000000000';
  const existingAdmin = await prisma.user.findFirst({
    where: {
      role: Role.ADMIN,
      OR: [{ email: adminEmail }, { phone: bootstrapPhone }],
    },
  });
  const admin = existingAdmin ?? await prisma.user.create({
    data: {
      email: adminEmail,
      phone: bootstrapPhone,
      fullName: 'RoadAid Super Admin',
      passwordHash: await argon2.hash(adminPassword),
      role: Role.ADMIN,
      adminRole: AdminRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`Bootstrap admin ready: ${admin.email} (id: ${admin.id})`);

  // 2. Pricing Rules
  // FUEL: Base ₦3,000 (300000 kobo), ₦1,500/litre (150000 kobo), min ₦3,000
  await prisma.pricingRule.upsert({
    where: { serviceType: ServiceType.FUEL },
    update: {},
    create: {
      serviceType: ServiceType.FUEL,
      baseKobo: BigInt(300000),
      perLitreKobo: BigInt(150000),
      perKmKobo: BigInt(0),
      minKobo: BigInt(300000),
      towingFreeKm: 0,
      active: true,
      updatedBy: admin.id,
    },
  });

  // TOWING: Base ₦15,000 (1500000 kobo), ₦500/km (50000 kobo), min ₦15,000
  await prisma.pricingRule.upsert({
    where: { serviceType: ServiceType.TOWING },
    update: {},
    create: {
      serviceType: ServiceType.TOWING,
      baseKobo: BigInt(1500000),
      perLitreKobo: BigInt(0),
      perKmKobo: BigInt(50000),
      minKobo: BigInt(1500000),
      towingFreeKm: 0,
      active: true,
      updatedBy: admin.id,
    },
  });

  // LOCKOUT: Base ₦8,000 (800000 kobo), min ₦8,000
  await prisma.pricingRule.upsert({
    where: { serviceType: ServiceType.LOCKOUT },
    update: {},
    create: {
      serviceType: ServiceType.LOCKOUT,
      baseKobo: BigInt(800000),
      perLitreKobo: BigInt(0),
      perKmKobo: BigInt(0),
      minKobo: BigInt(800000),
      towingFreeKm: 0,
      active: true,
      updatedBy: admin.id,
    },
  });
  console.log('Pricing rules seeded.');

  // 3. Dispatch Settings
  // FUEL: 30s timeout, 15km, max 5 offers, shortlist 5, stale 90s, max 600s
  await prisma.dispatchSettings.upsert({
    where: { serviceType: ServiceType.FUEL },
    update: {},
    create: {
      serviceType: ServiceType.FUEL,
      offerTimeoutSeconds: 30,
      searchRadiusKm: 15,
      maxOffers: 5,
      candidateShortlistSize: 5,
      staleLocationSeconds: 90,
      maxSearchDurationSeconds: 600,
      updatedBy: admin.id,
    },
  });

  // TOWING: 45s timeout, 15km, max 5 offers, shortlist 5, stale 90s, max 600s
  await prisma.dispatchSettings.upsert({
    where: { serviceType: ServiceType.TOWING },
    update: {},
    create: {
      serviceType: ServiceType.TOWING,
      offerTimeoutSeconds: 45,
      searchRadiusKm: 15,
      maxOffers: 5,
      candidateShortlistSize: 5,
      staleLocationSeconds: 90,
      maxSearchDurationSeconds: 600,
      updatedBy: admin.id,
    },
  });

  // LOCKOUT: 30s timeout, 15km, max 5 offers, shortlist 5, stale 90s, max 600s
  await prisma.dispatchSettings.upsert({
    where: { serviceType: ServiceType.LOCKOUT },
    update: {},
    create: {
      serviceType: ServiceType.LOCKOUT,
      offerTimeoutSeconds: 30,
      searchRadiusKm: 15,
      maxOffers: 5,
      candidateShortlistSize: 5,
      staleLocationSeconds: 90,
      maxSearchDurationSeconds: 600,
      updatedBy: admin.id,
    },
  });
  console.log('Dispatch settings seeded.');

  // 4. Commission Settings: 15% (1500 basis points)
  for (const service of [ServiceType.FUEL, ServiceType.TOWING, ServiceType.LOCKOUT]) {
    await prisma.commissionSettings.upsert({
      where: { serviceType: service },
      update: {},
      create: {
        serviceType: service,
        commissionBps: 1500,
        updatedBy: admin.id,
      },
    });
  }
  console.log('Commission settings seeded.');
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
