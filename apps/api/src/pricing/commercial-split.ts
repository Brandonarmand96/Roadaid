import { ServiceType } from '@prisma/client';

type Breakdown = { variableKobo?: number | string; platformFeeKobo?: number | string; providerPayoutKobo?: number | string };

const toBigInt = (value: number | string | bigint | undefined) => BigInt(value ?? 0);

export function commercialSplit(serviceType: ServiceType, priceKobo: bigint, breakdown: Breakdown = {}) {
  if (breakdown.platformFeeKobo != null && breakdown.providerPayoutKobo != null) {
    return { platformFeeKobo: toBigInt(breakdown.platformFeeKobo), providerPayoutKobo: toBigInt(breakdown.providerPayoutKobo) };
  }
  const variableKobo = toBigInt(breakdown.variableKobo);
  const platformFeeKobo = serviceType === ServiceType.FUEL
    ? 250_000n
    : serviceType === ServiceType.LOCKOUT
      ? 200_000n
      : 750_000n + variableKobo / 5n;
  return { platformFeeKobo, providerPayoutKobo: priceKobo - platformFeeKobo };
}

export function lockedCommercialSplit(serviceType: ServiceType, priceKobo: bigint, priceBreakdown: unknown, legacyCommissionBps: number) {
  const breakdown = (priceBreakdown && typeof priceBreakdown === 'object' ? priceBreakdown : {}) as Breakdown;
  if (breakdown.platformFeeKobo != null && breakdown.providerPayoutKobo != null) return commercialSplit(serviceType, priceKobo, breakdown);
  const platformFeeKobo = priceKobo * BigInt(legacyCommissionBps) / 10_000n;
  return { platformFeeKobo, providerPayoutKobo: priceKobo - platformFeeKobo };
}
