/**
 * `APP4-B05` — the step-up re-verification window.
 *
 * The window is 900 seconds of published policy, so every case below moves the
 * clock rather than waiting, and the boundary is asserted from both sides: a
 * window that is checked with the wrong comparison passes the "fresh" and
 * "ancient" cases and fails only at the edge.
 *
 * The `SUBMISSION` case is the one that matters most. A `SUBMISSION`
 * verification is recent, verified, and belongs to the same contact — it differs
 * from a `STEP_UP` in exactly one column, and an implementation that dropped the
 * purpose filter would let the OTP a customer answered when they first submitted
 * a request keep authorizing payments.
 */
import { GRANT_POLICY, createGrantContext, type GrantTestContext } from './secure-grant-context';
import { grantCount, seedCompletedChallenge } from './secure-grant-queries';
import { intents } from './verification-issue-queries';

const NOW = new Date('2026-08-14T09:00:00.000Z');
const WINDOW_SECONDS = 900;

describe('APP4-B05 step-up window', () => {
  let context: GrantTestContext;
  let contactPointId: string;
  let normalizedValue: string;

  beforeAll(async () => {
    context = await createGrantContext({
      label: 'app4_b05_stepup',
      grantPolicy: GRANT_POLICY,
    });
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    context.clock.set(NOW);
    await context.publishGrantPolicy(GRANT_POLICY);
    const target = await context.seedTarget();
    contactPointId = target.contactPointId;
    normalizedValue = target.normalizedValue;
  });

  const ask = (now: Date = NOW): Promise<boolean> =>
    context.stepUp.isSatisfied({ contactKind: 'EMAIL', normalizedValue, now });

  const completed = (purpose: 'STEP_UP' | 'SUBMISSION', secondsAgo: number): Promise<void> =>
    seedCompletedChallenge(context, {
      contactPointId,
      normalizedValue,
      purpose,
      verifiedAt: new Date(NOW.getTime() - secondsAgo * 1_000),
    });

  it('is not satisfied when nothing was ever verified', async () => {
    expect(await ask()).toBe(false);
  });

  it('is satisfied by a fresh STEP_UP', async () => {
    await completed('STEP_UP', 60);
    expect(await ask()).toBe(true);
  });

  it('is not satisfied once the window has passed', async () => {
    await completed('STEP_UP', WINDOW_SECONDS + 60);
    expect(await ask()).toBe(false);
  });

  it('holds at the edge of the window', async () => {
    // Just inside, then just outside, from the same seeded verification.
    await completed('STEP_UP', WINDOW_SECONDS - 1);
    expect(await ask()).toBe(true);
    expect(await ask(new Date(NOW.getTime() + 2 * 1_000))).toBe(false);
  });

  it('is not satisfied by a fresh SUBMISSION', async () => {
    // Recent, verified, same contact — and the wrong purpose. Identity is not
    // presence.
    await completed('SUBMISSION', 30);
    expect(await ask()).toBe(false);
  });

  it('is not satisfied by a STEP_UP for a different contact', async () => {
    await completed('STEP_UP', 30);
    expect(
      await context.stepUp.isSatisfied({
        contactKind: 'EMAIL',
        normalizedValue: 'someone.else@example.com',
        now: NOW,
      }),
    ).toBe(false);
  });

  it('fails closed when the secure_grant policy is missing or malformed', async () => {
    await completed('STEP_UP', 30);
    await context.publishGrantPolicy({ stepUpWindowSeconds: 'fifteen minutes' });

    // No boolean at all — a guessed window is the one failure mode that silently
    // widens the period in which a leaked link can authorize money.
    await expect(ask()).rejects.toMatchObject({ failure: 'SECURE_GRANT_POLICY_UNAVAILABLE' });
  });

  it('issues nothing and authorizes nothing', async () => {
    await completed('STEP_UP', 30);

    expect(await ask()).toBe(true);

    // No challenge was issued, no grant minted, no notification requested: the
    // answer is an input to a decision, never the decision.
    expect(await grantCount(context)).toBe(0);
    expect(await intents(context)).toEqual([]);
  });
});
