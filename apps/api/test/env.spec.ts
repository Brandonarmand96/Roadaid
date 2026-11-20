import { validateEnv } from '../src/config/env.config';

describe('Environment Config Validation', () => {
  it('passes with valid environment variables', () => {
    const validConfig = {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgresql://roadaid:roadaid@localhost:5432/roadaid?schema=public',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_key_minimum_32_characters_long_for_security',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_key_minimum_32_characters_long_for_security',
    };

    expect(() => validateEnv(validConfig)).not.toThrow();
    const env = validateEnv(validConfig);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('test');
  });

  it('fails if JWT secret is shorter than 32 characters', () => {
    const invalidConfig = {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgresql://roadaid:roadaid@localhost:5432/roadaid?schema=public',
      JWT_ACCESS_SECRET: 'short_secret',
      JWT_REFRESH_SECRET: 'short_secret',
    };

    expect(() => validateEnv(invalidConfig)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects development shortcuts in production', () => {
    expect(() => validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://roadaid:roadaid@localhost:5432/roadaid?schema=public',
      JWT_ACCESS_SECRET: 'development_jwt_access_secret_key_minimum_32_characters_long_for_security',
      JWT_REFRESH_SECRET: 'development_jwt_refresh_secret_key_minimum_32_characters_long_for_security',
      OTP_DEV_FIXED_CODE: '123456',
      SMS_PROVIDER: 'console',
      ADMIN_BOOTSTRAP_PASSWORD: 'AdminSecurePassword2026!',
    })).toThrow(/CORS_ORIGINS|OTP_DEV_FIXED_CODE|SMS_PROVIDER|Development JWT secrets|default bootstrap password/);
  });

  it('accepts a fail-closed production configuration', () => {
    expect(() => validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://roadaid:strong-password@db.internal:5432/roadaid?schema=public',
      JWT_ACCESS_SECRET: 'production-access-secret-with-at-least-thirty-two-characters',
      JWT_REFRESH_SECRET: 'production-refresh-secret-with-at-least-thirty-two-characters',
      CORS_ORIGINS: 'https://admin.roadaid.co',
      SMS_PROVIDER: 'termii',
      TERMII_API_KEY: 'termii-test-value',
      PAYSTACK_SECRET_KEY: 'sk_live_test-value',
      PAYSTACK_WEBHOOK_SECRET: 'sk_live_test-value',
      ADMIN_BOOTSTRAP_PASSWORD: 'a-unique-production-bootstrap-password',
    })).not.toThrow();
  });
});
