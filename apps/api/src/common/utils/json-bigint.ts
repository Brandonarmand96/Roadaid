/**
 * Prisma maps PostgreSQL BIGINT values to JavaScript bigint. RoadAid exposes
 * money as integer kobo in JSON, so convert only values that remain exact JS
 * integers and fail loudly instead of silently corrupting a large amount.
 */
export function jsonBigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value !== 'bigint') return value;

  const integer = Number(value);
  if (!Number.isSafeInteger(integer)) {
    throw new RangeError(`BIGINT value ${value.toString()} exceeds the safe JSON integer range`);
  }

  return integer;
}
