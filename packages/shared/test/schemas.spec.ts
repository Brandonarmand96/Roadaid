import {
  phoneSchema,
  verifyOtpSchema,
  createServiceRequestSchema,
  DEFAULT_PRICING,
  ServiceType,
} from '../src';

describe('Shared Schemas & Enums', () => {
  it('validates E.164 phone numbers correctly', () => {
    expect(() => phoneSchema.parse('+2348012345678')).not.toThrow();
    expect(() => phoneSchema.parse('08012345678')).toThrow();
    expect(() => phoneSchema.parse('invalid')).toThrow();
  });

  it('validates OTP verification payload', () => {
    expect(() =>
      verifyOtpSchema.parse({
        phone: '+2348012345678',
        code: '123456',
      }),
    ).not.toThrow();

    expect(() =>
      verifyOtpSchema.parse({
        phone: '+2348012345678',
        code: '123',
      }),
    ).toThrow();
  });

  it('validates fuel service request payload', () => {
    const validFuel = {
      serviceType: ServiceType.FUEL,
      pickup: {
        lat: 9.0765,
        lng: 7.3986,
        address: 'Wuse 2, Abuja',
      },
      details: {
        fuelType: 'PETROL',
        litres: 10,
      },
      quotePriceKobo: 1800000,
    };
    expect(() => createServiceRequestSchema.parse(validFuel)).not.toThrow();
  });

  it('ensures default pricing constants are defined in integer kobo', () => {
    expect(Number.isInteger(DEFAULT_PRICING[ServiceType.FUEL].baseKobo)).toBe(true);
    expect(Number.isInteger(DEFAULT_PRICING[ServiceType.TOWING].baseKobo)).toBe(true);
    expect(Number.isInteger(DEFAULT_PRICING[ServiceType.LOCKOUT].baseKobo)).toBe(true);
  });
});
