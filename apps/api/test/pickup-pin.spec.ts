import { protectPickupPin, revealPickupPin, verifyPickupPin } from '../src/requests/pickup-pin';

describe('pickup PIN protection', () => {
  const previousSecret = process.env.REQUEST_SECRET_KEY;

  beforeAll(() => { process.env.REQUEST_SECRET_KEY = 'test-only-request-secret'; });
  afterAll(() => {
    if (previousSecret === undefined) delete process.env.REQUEST_SECRET_KEY;
    else process.env.REQUEST_SECRET_KEY = previousSecret;
  });

  it('encrypts reversibly for the customer and stores a separate verifier', () => {
    const protectedPin = protectPickupPin('4821');
    expect(protectedPin.encrypted).not.toContain('4821');
    expect(protectedPin.hash).not.toContain('4821');
    expect(revealPickupPin(protectedPin.encrypted)).toBe('4821');
    expect(verifyPickupPin('4821', protectedPin.hash)).toBe(true);
  });

  it('rejects an incorrect PIN without throwing', () => {
    const protectedPin = protectPickupPin('4821');
    expect(verifyPickupPin('4822', protectedPin.hash)).toBe(false);
  });

  it('detects tampering with encrypted customer data', () => {
    const protectedPin = protectPickupPin('4821');
    expect(() => revealPickupPin(`${protectedPin.encrypted.slice(0, -1)}x`)).toThrow();
  });
});
