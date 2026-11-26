import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().optional(),
  APP_TZ: z.string().default('Africa/Lagos'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_DEV_FIXED_CODE: z.string().optional(),
  SMS_PROVIDER: z.enum(['console', 'termii']).default('console'),
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default('RoadAid'),
  GOOGLE_MAPS_SERVER_KEY: z.string().optional(),
  PAYMENT_GATEWAY: z.enum(['paystack', 'flutterwave']).default('paystack'),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  STORAGE_DRIVER: z.enum(['local', 's3', 'supabase']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('eu-central-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('provider-documents'),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().default('admin@roadaid.co'),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8).default('AdminSecurePassword2026!'),
  PAYMENT_MODE: z.enum(['ONLINE_AFTER_ACCEPT', 'ONLINE_ON_COMPLETION']).default('ONLINE_AFTER_ACCEPT'),
  CUSTOMER_ONLINE_PAYMENTS_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;

  const required = (key: keyof typeof env, message: string) => {
    if (!env[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
  };

  required('CORS_ORIGINS', 'CORS_ORIGINS is required in production');
  if (env.OTP_DEV_FIXED_CODE) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['OTP_DEV_FIXED_CODE'], message: 'OTP_DEV_FIXED_CODE must be unset in production' });
  }
  if (env.SMS_PROVIDER !== 'termii') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SMS_PROVIDER'], message: 'SMS_PROVIDER must be termii in production' });
  }
  required('TERMII_API_KEY', 'TERMII_API_KEY is required in production');
  if (env.JWT_ACCESS_SECRET.includes('development_') || env.JWT_REFRESH_SECRET.includes('development_')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_ACCESS_SECRET'], message: 'Development JWT secrets are forbidden in production' });
  }
  if (env.ADMIN_BOOTSTRAP_PASSWORD === 'AdminSecurePassword2026!') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ADMIN_BOOTSTRAP_PASSWORD'], message: 'The default bootstrap password is forbidden in production' });
  }
  if (env.PAYMENT_GATEWAY === 'paystack') {
    required('PAYSTACK_SECRET_KEY', 'PAYSTACK_SECRET_KEY is required in production');
    required('PAYSTACK_WEBHOOK_SECRET', 'PAYSTACK_WEBHOOK_SECRET is required in production');
  }
  if (env.STORAGE_DRIVER === 's3') {
    required('S3_BUCKET', 'S3_BUCKET is required when STORAGE_DRIVER=s3');
    required('S3_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID is required when STORAGE_DRIVER=s3');
    required('S3_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY is required when STORAGE_DRIVER=s3');
  }
  if (env.STORAGE_DRIVER === 'supabase') {
    required('SUPABASE_URL', 'SUPABASE_URL is required when STORAGE_DRIVER=supabase');
    required('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY is required when STORAGE_DRIVER=supabase');
  }
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
