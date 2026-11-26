import { z } from 'zod';
import { ServiceType, VehicleType, LockType, FuelType, ProviderAvailability } from './enums';

// Phone schema: E.164 format (+234...)
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone number must be valid E.164 format (e.g. +2348012345678)');

export const requestOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().length(6, 'OTP must be 6 digits'),
});

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email().optional(),
});

export const customerVehicleSchema = z.object({
  make: z.string().trim().min(1, 'Make is required'),
  model: z.string().trim().min(1, 'Model is required'),
  color: z.string().trim().min(1, 'Color is required'),
  plateNumber: z.string().trim().min(1, 'Plate number is required'),
  vehicleType: z.nativeEnum(VehicleType),
  isDefault: z.boolean().default(false),
});

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const fuelDetailsSchema = z.object({
  fuelType: z.nativeEnum(FuelType),
  litres: z.number().int().positive().max(50),
});

export const towingDetailsSchema = z.object({
  destination: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().min(1, 'Destination address is required'),
  }),
  vehicleCondition: z.string().trim().min(1, 'Vehicle condition description is required'),
});

export const lockoutDetailsSchema = z.object({
  lockType: z.nativeEnum(LockType),
  notes: z.string().trim().optional(),
});

export const quoteRequestSchema = z.object({
  serviceType: z.nativeEnum(ServiceType),
  pickup: coordinatesSchema,
  details: z.union([fuelDetailsSchema, towingDetailsSchema, lockoutDetailsSchema]),
}).superRefine((value, ctx) => {
  const valid = value.serviceType === ServiceType.FUEL
    ? fuelDetailsSchema.safeParse(value.details).success
    : value.serviceType === ServiceType.TOWING
      ? towingDetailsSchema.safeParse(value.details).success
      : lockoutDetailsSchema.safeParse(value.details).success;
  if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details'], message: `Details do not match ${value.serviceType}` });
});

export const createServiceRequestSchema = z.object({
  serviceType: z.nativeEnum(ServiceType),
  paymentMethod: z.enum(['ONLINE', 'CASH']).default('CASH'),
  beneficiary: z.object({ name: z.string().trim().min(2).max(120), phone: phoneSchema }).optional(),
  scheduledFor: z.string().datetime().optional(),
  pickup: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().min(1, 'Pickup address is required'),
    note: z.string().optional(),
  }),
  vehicleId: z.string().uuid().optional(),
  details: z.union([fuelDetailsSchema, towingDetailsSchema, lockoutDetailsSchema]),
  quotePriceKobo: z.number().int().nonnegative().optional(),
}).superRefine((value, ctx) => {
  const valid = value.serviceType === ServiceType.FUEL
    ? fuelDetailsSchema.safeParse(value.details).success
    : value.serviceType === ServiceType.TOWING
      ? towingDetailsSchema.safeParse(value.details).success
      : lockoutDetailsSchema.safeParse(value.details).success;
  if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details'], message: `Details do not match ${value.serviceType}` });
});

export const pricingRuleSchema = z.object({
  baseKobo: z.number().int().nonnegative(),
  perKmKobo: z.number().int().nonnegative(),
  perLitreKobo: z.number().int().nonnegative(),
  minKobo: z.number().int().nonnegative(),
  towingFreeKm: z.number().nonnegative(),
  active: z.boolean(),
});

export const dispatchSettingsSchema = z.object({
  offerTimeoutSeconds: z.number().int().min(10).max(300),
  searchRadiusKm: z.number().positive().max(100),
  maxOffers: z.number().int().min(1).max(20),
  candidateShortlistSize: z.number().int().min(1).max(20),
  staleLocationSeconds: z.number().int().min(30).max(900),
  maxSearchDurationSeconds: z.number().int().min(60).max(3600),
});

export const locationUpdateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().nonnegative().optional(),
  recordedAt: z.string().datetime(),
});

export const locationBatchSchema = z.object({
  points: z.array(locationUpdateSchema).min(1).max(200),
});

export const providerAvailabilitySchema = z.object({
  state: z.enum([
    ProviderAvailability.ONLINE,
    ProviderAvailability.OFFLINE,
    ProviderAvailability.UNAVAILABLE,
  ]),
});

export const cancelRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Cancellation reason is required'),
});

export const disputeRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Dispute reason is required'),
});

export const rateProviderSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().optional(),
});

export const initializePaymentSchema = z.object({
  requestId: z.string().uuid(),
});

export const payoutRequestSchema = z.object({
  amountKobo: z.number().int().positive('Amount must be positive'),
});

export const bankAccountSchema = z.object({
  bankName: z.string().trim().min(1, 'Bank name is required'),
  accountNumber: z.string().trim().length(10, 'Account number must be 10 digits'),
  accountName: z.string().trim().min(1, 'Account name is required'),
});

export const deviceTokenSchema = z.object({
  platform: z.enum(['ANDROID', 'IOS']),
  token: z.string().trim().min(1),
  app: z.enum(['CUSTOMER', 'PROVIDER']),
});

export type RequestOtpDto = z.infer<typeof requestOtpSchema>;
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;
export type AdminLoginDto = z.infer<typeof adminLoginSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type CustomerVehicleDto = z.infer<typeof customerVehicleSchema>;
export type FuelDetailsDto = z.infer<typeof fuelDetailsSchema>;
export type TowingDetailsDto = z.infer<typeof towingDetailsSchema>;
export type LockoutDetailsDto = z.infer<typeof lockoutDetailsSchema>;
export type QuoteRequestDto = z.infer<typeof quoteRequestSchema>;
export type CreateServiceRequestDto = z.infer<typeof createServiceRequestSchema>;
export type PricingRuleDto = z.infer<typeof pricingRuleSchema>;
export type DispatchSettingsDto = z.infer<typeof dispatchSettingsSchema>;
export type LocationUpdateDto = z.infer<typeof locationUpdateSchema>;
export type LocationBatchDto = z.infer<typeof locationBatchSchema>;
export type ProviderAvailabilityDto = z.infer<typeof providerAvailabilitySchema>;
export type CancelRequestDto = z.infer<typeof cancelRequestSchema>;
export type DisputeRequestDto = z.infer<typeof disputeRequestSchema>;
export type RateProviderDto = z.infer<typeof rateProviderSchema>;
export type InitializePaymentDto = z.infer<typeof initializePaymentSchema>;
export type PayoutRequestDto = z.infer<typeof payoutRequestSchema>;
export type BankAccountDto = z.infer<typeof bankAccountSchema>;
export type DeviceTokenDto = z.infer<typeof deviceTokenSchema>;
