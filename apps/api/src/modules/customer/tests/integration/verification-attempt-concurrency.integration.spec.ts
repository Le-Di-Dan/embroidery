/**
 * `APP4-B04` — the three races this checkpoint owns, and nothing broader.
 *
 * Each one is genuine: two calls on separate pooled connections, no sleeping,
 * no patched service. The arbiter under test is the transaction-scoped advisory
 * lock plus the guarded `ISSUED` transitions, so what these prove is that the
 * *database* decides, not that a JavaScript sequence happened to interleave
 * favourably.
 *
 * The fourth case is different in kind and says so. A real CST-005 loss cannot
 * be produced by two attempts: CST-007 allows one open `SUBMISSION` challenge
 * per target and every attempt for a target queues behind the same lock. So the
 * loss is injected at the exact seam that can raise it — the `APP4-B02` call —
 * and everything downstream stays real: the rollback, the second pass, the
 * arbiter, and the single customer it resolves.
 */
import {
  createAttemptContext,
  WRONG_CODE,
  type AttemptTestContext,
} from './verification-attempt-context';
import { CHALLENGE_POLICY } from './verification-issue-context';
import {
  attemptsOf,
  auditEvents,
  challengeStateOf,
  contactPoints,
  customerCount,
} from './verification-attempt-queries';
import { VerifiedIdentityConflictError } from '../../domain/identity/verified-identity-outcome';
import {
  isVerificationAttemptFailure,
  type VerificationAttemptResult,
} from '../../domain/verification/verification-attempt-outcome';

const EMAIL = 'tranh.chap@example.com';

describe('APP4-B04 attempt concurrency (integration)', () => {
  let context: AttemptTestContext;

  beforeAll(async () => {
    context = await createAttemptContext('app4-b04-concurrency');
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    context.clock.set(new Date('2026-08-14T09:00:00.000Z'));
    context.minter.reset();
    await context.publishPolicy(CHALLENGE_POLICY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const submit = (challengeId: string, code: string): Promise<VerificationAttemptResult> =>
    context.inRequest(() => context.attempts.submit(challengeId as never, code));

  it('gives one success for two concurrent correct submissions', async () => {
    const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');

    const outcomes = (
      await Promise.all([
        submit(challenge.challengeId, challenge.code),
        submit(challenge.challengeId, challenge.code),
      ])
    ).map((result) => result.outcome);

    expect(outcomes.filter((outcome) => outcome === 'VERIFIED')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'NOT_ANSWERABLE')).toHaveLength(1);

    // One consumption, one identity, one audit row. The loser wrote nothing at
    // all: a terminal challenge takes no attempt.
    expect((await attemptsOf(context, challenge.challengeId)).map((r) => r.outcome)).toEqual([
      'MATCH',
    ]);
    expect(await challengeStateOf(context, challenge.challengeId)).toBe('VERIFIED');
    expect(await customerCount(context)).toBe(1);
    expect(await contactPoints(context)).toHaveLength(1);
    expect(
      (await auditEvents(context)).filter((r) => r.action === 'verification.challenge.verified'),
    ).toHaveLength(1);
  });

  it('never writes a sixth attempt when two wrong answers contend for the last slot', async () => {
    const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
    for (let attempt = 0; attempt < CHALLENGE_POLICY.maxAttempts - 1; attempt += 1) {
      await submit(challenge.challengeId, WRONG_CODE);
    }
    expect(await attemptsOf(context, challenge.challengeId)).toHaveLength(
      CHALLENGE_POLICY.maxAttempts - 1,
    );

    const outcomes = (
      await Promise.all([
        submit(challenge.challengeId, WRONG_CODE),
        submit(challenge.challengeId, WRONG_CODE),
      ])
    ).map((result) => result.outcome);

    // One took the last slot and locked out; the other found a terminal
    // challenge. Neither produced a durable attempt beyond the budget.
    expect(outcomes).toContain('LOCKED');
    expect(await attemptsOf(context, challenge.challengeId)).toHaveLength(
      CHALLENGE_POLICY.maxAttempts,
    );
    expect(await challengeStateOf(context, challenge.challengeId)).toBe('FAILED');
  });

  it('lets expiry win over a verification entering at the same instant', async () => {
    const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
    context.clock.set(challenge.expiresAt);

    // The issue path sweeps stale rows for this target under the same lock, so
    // the two transactions genuinely contend for one terminal transition.
    await Promise.all([
      submit(challenge.challengeId, challenge.code),
      context.inRequest(() =>
        context.issuance.issue({ contactKind: 'EMAIL', contact: EMAIL, purpose: 'SUBMISSION' }),
      ),
    ]);

    // Whichever went first, the challenge is EXPIRED and was never verified: an
    // attempt at or after `expires_at` cannot commit a VERIFIED state.
    expect(await challengeStateOf(context, challenge.challengeId)).toBe('EXPIRED');
    expect(await customerCount(context)).toBe(0);

    const attempts = await attemptsOf(context, challenge.challengeId);
    expect(attempts.length).toBeLessThanOrEqual(1);
    expect(attempts.every((row) => row.outcome === 'EXPIRED_AT_ENTRY')).toBe(true);
  });

  describe('a lost identity race', () => {
    it('recovers on one retry and commits a single canonical customer', async () => {
      const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
      const resolve = jest.spyOn(context.identities, 'resolve').mockImplementationOnce(() => {
        throw new VerifiedIdentityConflictError('CONCURRENT_VERIFICATION_LOSS');
      });

      const result = await submit(challenge.challengeId, challenge.code);

      expect(result.outcome).toBe('VERIFIED');
      expect(resolve).toHaveBeenCalledTimes(2);

      // The first pass rolled back entirely — one attempt row, not two — and the
      // second committed the whole thing.
      expect((await attemptsOf(context, challenge.challengeId)).map((r) => r.outcome)).toEqual([
        'MATCH',
      ]);
      expect(await challengeStateOf(context, challenge.challengeId)).toBe('VERIFIED');
      expect(await customerCount(context)).toBe(1);
      expect(await contactPoints(context)).toHaveLength(1);
      expect(
        (await auditEvents(context)).filter((r) => r.action === 'verification.challenge.verified'),
      ).toHaveLength(1);
    });

    it('stops after the second pass and leaves no VERIFIED-without-customer state', async () => {
      const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
      jest.spyOn(context.identities, 'resolve').mockImplementation(() => {
        throw new VerifiedIdentityConflictError('CONCURRENT_VERIFICATION_LOSS');
      });

      const failure: unknown = await submit(challenge.challengeId, challenge.code).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(isVerificationAttemptFailure(failure)).toBe(true);
      if (!isVerificationAttemptFailure(failure)) return;
      expect(failure.failure).toBe('VERIFICATION_CONFLICT_UNRESOLVED');
      // The message is the code: no contact, no constraint, no DETAIL.
      expect(failure.message).toBe('VERIFICATION_CONFLICT_UNRESOLVED');

      // Both passes rolled back, so nothing at all committed: the challenge is
      // still answerable and no half-made identity exists.
      expect(await challengeStateOf(context, challenge.challengeId)).toBe('ISSUED');
      expect(await attemptsOf(context, challenge.challengeId)).toHaveLength(0);
      expect(await customerCount(context)).toBe(0);
      expect(await auditEvents(context)).toHaveLength(0);
    });
  });
});
