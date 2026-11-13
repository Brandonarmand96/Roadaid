import { ServiceType } from './enums';

export const APP_NAME = 'RoadAid';
export const APP_TAGLINE = 'BUILT FOR CERTAINTY';
export const APP_TIMEZONE = 'Africa/Lagos';

// Default Pricing in Kobo (NGN minor units: 100 kobo = ₦1)
export const DEFAULT_PRICING = {
  [ServiceType.FUEL]: {
    baseKobo: 300000, // ₦3,000
    perLitreKobo: 150000, // ₦1,500/litre
    perKmKobo: 0,
    minKobo: 300000, // ₦3,000
    towingFreeKm: 0,
  },
  [ServiceType.TOWING]: {
    baseKobo: 1500000, // ₦15,000
    perLitreKobo: 0,
    perKmKobo: 50000, // ₦500/km
    minKobo: 1500000, // ₦15,000
    towingFreeKm: 0,
  },
  [ServiceType.LOCKOUT]: {
    baseKobo: 800000, // ₦8,000
    perLitreKobo: 0,
    perKmKobo: 0,
    minKobo: 800000, // ₦8,000
    towingFreeKm: 0,
  },
} as const;

// Default Dispatch Settings
export const DEFAULT_DISPATCH_SETTINGS = {
  [ServiceType.FUEL]: {
    offerTimeoutSeconds: 30,
    searchRadiusKm: 15,
    maxOffers: 5,
    candidateShortlistSize: 5,
    staleLocationSeconds: 90,
    maxSearchDurationSeconds: 600,
  },
  [ServiceType.TOWING]: {
    offerTimeoutSeconds: 45,
    searchRadiusKm: 15,
    maxOffers: 5,
    candidateShortlistSize: 5,
    staleLocationSeconds: 90,
    maxSearchDurationSeconds: 600,
  },
  [ServiceType.LOCKOUT]: {
    offerTimeoutSeconds: 30,
    searchRadiusKm: 15,
    maxOffers: 5,
    candidateShortlistSize: 5,
    staleLocationSeconds: 90,
    maxSearchDurationSeconds: 600,
  },
} as const;

// Default Commission (Basis Points: 1500 bps = 15%)
export const DEFAULT_COMMISSION_BPS = 1500;

// Abuja Coordinates (Reference Center)
export const ABUJA_CENTER = {
  latitude: 9.0765,
  longitude: 7.3986,
} as const;
