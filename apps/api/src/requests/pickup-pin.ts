import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';

function key() {
  return createHash('sha256').update(process.env.REQUEST_SECRET_KEY || process.env.JWT_ACCESS_SECRET || 'development-request-secret').digest();
}

export function protectPickupPin(pin: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    hash: createHash('sha256').update(`${pin}:${key().toString('hex')}`).digest('hex'),
    encrypted: Buffer.concat([iv, tag, encrypted]).toString('base64url'),
  };
}

export function revealPickupPin(value: string) {
  const input = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key(), input.subarray(0, 12));
  decipher.setAuthTag(input.subarray(12, 28));
  return Buffer.concat([decipher.update(input.subarray(28)), decipher.final()]).toString('utf8');
}

export function verifyPickupPin(pin: string, expected: string) {
  const actual = createHash('sha256').update(`${pin}:${key().toString('hex')}`).digest();
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}
