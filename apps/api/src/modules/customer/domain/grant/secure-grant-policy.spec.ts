/**
 * `secure_grant` policy validation (`APP4-B05`, `APP4-G01` PO-01).
 *
 * The rejections are the plausible misconfigurations: a value typed as a string
 * because JSONB accepts one, a zero that reads as "no limit", a step-up window
 * enlarged past the grant it is supposed to gate.
 */
import { grantExpiryOf, parseSecureGrantPolicy, stepUpNotBefore } from './secure-grant-policy';

/** The `APP4-G01` values, as published. */
const PUBLISHED = { standardTtlSeconds: 604_800, stepUpWindowSeconds: 900 };

describe('parseSecureGrantPolicy', () => {
  it('accepts the published value', () => {
    const result = parseSecureGrantPolicy(PUBLISHED);

    expect(result.ok).toBe(true);
    expect(result.ok && result.policy).toEqual(PUBLISHED);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'secure_grant'],
    ['a number', 7],
  ])('rejects %s', (_label, value) => {
    expect(parseSecureGrantPolicy(value).ok).toBe(false);
  });

  it.each([
    ['a missing field', { standardTtlSeconds: 604_800 }],
    ['a string field', { ...PUBLISHED, stepUpWindowSeconds: '900' }],
    ['a zero', { ...PUBLISHED, standardTtlSeconds: 0 }],
    ['a negative', { ...PUBLISHED, stepUpWindowSeconds: -1 }],
    ['a fraction', { ...PUBLISHED, stepUpWindowSeconds: 900.5 }],
  ])('rejects %s', (_label, value) => {
    expect(parseSecureGrantPolicy(value).ok).toBe(false);
  });

  it('rejects values past their sanity bounds', () => {
    expect(parseSecureGrantPolicy({ ...PUBLISHED, standardTtlSeconds: 400 * 86_400 }).ok).toBe(
      false,
    );
    expect(parseSecureGrantPolicy({ ...PUBLISHED, stepUpWindowSeconds: 2 * 86_400 }).ok).toBe(
      false,
    );
  });

  it('rejects a step-up window outliving the grant it gates', () => {
    const result = parseSecureGrantPolicy({
      standardTtlSeconds: 600,
      stepUpWindowSeconds: 900,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.problem).toMatchObject({ kind: 'SECURE_GRANT_POLICY_INVALID' });
  });

  it('reports the offending fields, so an operator can fix the published value', () => {
    const result = parseSecureGrantPolicy({ standardTtlSeconds: 'a week' });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.problem).toMatchObject({
      reasons: expect.arrayContaining([
        'standardTtlSeconds must be a positive integer',
        'stepUpWindowSeconds must be a positive integer',
      ]) as string[],
    });
  });
});

describe('derived instants', () => {
  const issuedAt = new Date('2026-08-14T09:00:00.000Z');

  it('expires a grant one TTL after issuance', () => {
    expect(grantExpiryOf(PUBLISHED, issuedAt).toISOString()).toBe('2026-08-21T09:00:00.000Z');
  });

  it('opens the step-up window one window before now', () => {
    expect(stepUpNotBefore(PUBLISHED, issuedAt).toISOString()).toBe('2026-08-14T08:45:00.000Z');
  });
});
