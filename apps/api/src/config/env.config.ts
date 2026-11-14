import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
  APP_TZ: z.string().default('Africa/Lagos'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_DEV_FIXED_CODE: z.string().default('123456'),
  SMS_PROVIDER: z.enum(['console', 'termii']).default('console'),
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default('RoadAid'),
  GOOGLE_MAPS_SERVER_KEY: z.string().optional(),
  PAYMENT_GATEWAY: z.enum(['paystack', 'flutterwave']).default('paystack'),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('eu-central-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().default('admin@roadaid.co'),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8).default('AdminSecurePassword2026!'),
  PAYMENT_MODE: z.enum(['ONLINE_AFTER_ACCEPT', 'ONLINE_ON_COMPLETION']).default('ONLINE_AFTER_ACCEPT'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }
  return result.data;
}
