import { jsonBigIntReplacer } from '../src/common/utils/json-bigint';

describe('jsonBigIntReplacer', () => {
  it('serializes Prisma bigint money values as integer kobo', () => {
    const result = JSON.stringify(
      { walletBalanceKobo: BigInt(300000), nested: { amountKobo: BigInt(-1250) } },
      jsonBigIntReplacer,
    );

    expect(result).toBe('{"walletBalanceKobo":300000,"nested":{"amountKobo":-1250}}');
  });

  it('leaves non-bigint values unchanged', () => {
    expect(JSON.stringify({ status: 'PAID', count: 2 }, jsonBigIntReplacer)).toBe(
      '{"status":"PAID","count":2}',
    );
  });

  it('rejects bigint values that cannot be represented exactly in JSON', () => {
    const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
    expect(() => JSON.stringify({ amountKobo: unsafe }, jsonBigIntReplacer)).toThrow(
      'exceeds the safe JSON integer range',
    );
  });
});
