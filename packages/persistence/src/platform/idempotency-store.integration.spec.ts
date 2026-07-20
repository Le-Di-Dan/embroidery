/**
 * TBL-074 idempotency persistence against a real PostgreSQL instance (DB7-CP3).
 *
 * The claim/replay *protocol* over a full domain command is exercised in CP6;
 * this suite proves the store those flows stand on.
 */
import { isPersistenceError } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';

import { createPlatformTestContext } from '../testing/platform-test-context';
import type { PlatformTestContext } from '../testing/platform-test-context';
import { IdempotencyStore } from './idempotency-store';

const HOUR_MS = 60 * 60 * 1000;

describe('idempotency store (integration)', () => {
  let context: PlatformTestContext;
  let idempotency: IdempotencyStore;

  beforeAll(async () => {
    context = await createPlatformTestContext('cp3-idempotency');
    idempotency = context.get(IdempotencyStore);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

  async function failureOf(work: () => Promise<unknown>): Promise<PersistenceError> {
    try {
      await work();
    } catch (error: unknown) {
      if (isPersistenceError(error)) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the operation to fail, but it succeeded.');
  }

  const key = (scopeKey: string, fingerprint = 'fp-1') => ({
    namespace: 'payment.callback',
    scopeKey,
    fingerprint,
  });

  const expiry = () => new Date(Date.now() + HOUR_MS);

  it('claims an unused key', async () => {
    const claim = await context.inTransaction(() => idempotency.claim(key('first'), expiry()));

    expect(claim.outcome).toBe('claimed');
  });

  it('reports in_progress while the first attempt is still running', async () => {
    await context.inTransaction(() => idempotency.claim(key('running'), expiry()));

    const second = await context.inTransaction(() => idempotency.claim(key('running'), expiry()));

    expect(second.outcome).toBe('in_progress');
  });

  it('replays the stored result once the operation completed', async () => {
    await context.inTransaction(async () => {
      await idempotency.claim(key('done'), expiry());
      await idempotency.complete(key('done'), { orderId: 'order-1' });
    });

    const replay = await context.inTransaction(() => idempotency.claim(key('done'), expiry()));

    expect(replay).toEqual({ outcome: 'replay', result: { orderId: 'order-1' } });
  });

  it('rejects the same key used for different work (GRD-030)', async () => {
    await context.inTransaction(() => idempotency.claim(key('reused', 'fp-a'), expiry()));

    const error = await failureOf(() =>
      context.inTransaction(() => idempotency.claim(key('reused', 'fp-b'), expiry())),
    );

    expect(error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(error.kind).toBe('INVARIANT_VIOLATION');
  });

  it('does not abort the enclosing transaction on a duplicate claim', async () => {
    await context.inTransaction(() => idempotency.claim(key('coexist'), expiry()));

    // The duplicate claim must not poison the transaction: a caught 23505 would
    // have left it unusable, which is why the insert uses onConflictDoNothing
    // rather than a try/catch.
    const result = await context.inTransaction(async () => {
      const claim = await idempotency.claim(key('coexist'), expiry());
      const record = await idempotency.find(key('coexist'));
      return { claim, record };
    });

    expect(result.claim.outcome).toBe('in_progress');
    expect(result.record?.status).toBe('IN_PROGRESS');
  });

  it('rolls the claim back with the work it guards', async () => {
    await expect(
      context.inTransaction(async () => {
        await idempotency.claim(key('rolled-back'), expiry());
        throw new Error('domain work failed');
      }),
    ).rejects.toThrow('domain work failed');

    // Nothing to replay: a claim must never survive work that did not happen.
    await expect(idempotency.find(key('rolled-back'))).resolves.toBeUndefined();
  });

  it('refuses to complete a claim it does not hold', async () => {
    const error = await failureOf(() =>
      context.inTransaction(() => idempotency.complete(key('never-claimed'), {})),
    );

    expect(error.code).toBe('IDEMPOTENCY_CLAIM_NOT_HELD');
  });

  it('refuses to complete twice, so a late retry cannot overwrite a published result', async () => {
    await context.inTransaction(async () => {
      await idempotency.claim(key('once'), expiry());
      await idempotency.complete(key('once'), { value: 'first' });
    });

    const error = await failureOf(() =>
      context.inTransaction(() => idempotency.complete(key('once'), { value: 'second' })),
    );

    expect(error.code).toBe('IDEMPOTENCY_CLAIM_NOT_HELD');
    await expect(idempotency.find(key('once'))).resolves.toMatchObject({
      result: { value: 'first' },
    });
  });

  it('releases a claim so a retry can take it', async () => {
    await context.inTransaction(() => idempotency.claim(key('retry'), expiry()));
    await idempotency.release(key('retry'));

    const second = await context.inTransaction(() => idempotency.claim(key('retry'), expiry()));

    expect(second.outcome).toBe('claimed');
  });

  it('refuses to claim outside a transaction', async () => {
    await expect(idempotency.claim(key('no-tx'), expiry())).rejects.toThrow(
      /must run inside a transaction/,
    );
  });
});
