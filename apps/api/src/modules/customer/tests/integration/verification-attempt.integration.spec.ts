/**
 * `APP4-B04` — answering a challenge, against a real PostgreSQL instance.
 *
 * The claims are mostly about what commits *together* and what never commits at
 * all: a `MATCH` and a `VERIFIED` challenge and exactly one customer, or none of
 * the three; five durable attempts and never six; an answer after expiry that
 * fails with the correct code in hand.
 *
 * Every code comes from the scripted minter, so the suite knows the exact
 * plaintext that must appear in no persisted column anywhere.
 */
import {
  createAttemptContext,
  WRONG_CODE,
  type AttemptTestContext,
} from './verification-attempt-context';
import { CHALLENGE_POLICY } from './verification-issue-context';
import { codeAppearsAnywhere } from './verification-issue-queries';
import {
  attemptsOf,
  auditEvents,
  challengeStateOf,
  codeAppearsInIdentityTables,
  contactPoints,
  customerCount,
  grantCount,
  notificationIntentCount,
  outboxCount,
  verifiedAtOf,
} from './verification-attempt-queries';
import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type VerificationChallengeRepository,
} from '../../domain/repositories/verification-challenge.repository';

const EMAIL = 'nguoi.dung@example.com';
const PHONE = '0912345678';
const NORMALIZED_PHONE = '+84912345678';

describe('APP4-B04 verification attempt (integration)', () => {
  let context: AttemptTestContext;

  beforeAll(async () => {
    context = await createAttemptContext('app4-b04-attempt');
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

  const submit = (challengeId: string, code: string): Promise<{ outcome: string }> =>
    context.inRequest(() => context.attempts.submit(challengeId as never, code));

  describe('a correct SUBMISSION answer', () => {
    it('verifies once and establishes exactly one identity', async () => {
      const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
      const intentsBefore = await notificationIntentCount(context);
      const outboxBefore = await outboxCount(context);

      const result = await submit(challenge.challengeId, challenge.code);
      expect(result.outcome).toBe('VERIFIED');

      // One attempt, and it is the match.
      const attempts = await attemptsOf(context, challenge.challengeId);
      expect(attempts.map((row) => row.outcome)).toEqual(['MATCH']);

      expect(await challengeStateOf(context, challenge.challengeId)).toBe('VERIFIED');
      expect(await verifiedAtOf(context, challenge.challengeId)).not.toBeNull();

      // Exactly one canonical customer, one verified active contact, and it is
      // the primary — the whole of `ADR-DB2-001` r5's output.
      expect(await customerCount(context)).toBe(1);
      const contacts = await contactPoints(context);
      expect(contacts).toHaveLength(1);
      expect(contacts[0]?.normalized_value).toBe(EMAIL);
      expect(contacts[0]?.verified_at).not.toBeNull();
      expect(contacts[0]?.deactivated_at).toBeNull();
      expect(contacts[0]?.is_primary).toBe(true);
      expect(contacts[0]?.verified_source).toBe('VERIFICATION_SUBMISSION');

      // B04's own outcome audit, filed against the challenge, by the customer
      // whose identity this verification established.
      const verified = (await auditEvents(context)).filter(
        (row) => row.action === 'verification.challenge.verified',
      );
      expect(verified).toHaveLength(1);
      expect(verified[0]?.target_kind).toBe('CONTACT_VERIFICATION_CHALLENGE');
      expect(verified[0]?.target_id).toBe(challenge.challengeId);
      expect(verified[0]?.actor_kind).toBe('CUSTOMER');
      expect(verified[0]?.customer_id).toBe(contacts[0]?.customer_id);
      expect(verified[0]?.correlation_id).toBe(context.requestId);
      expect(verified[0]?.summary).toEqual({
        purpose: 'SUBMISSION',
        contactKind: 'EMAIL',
        outcome: 'MATCH',
      });

      // B04 delivers nothing and mints nothing: no new intent, no new outbox
      // event, no grant.
      expect(await notificationIntentCount(context)).toBe(intentsBefore);
      expect(await outboxCount(context)).toBe(outboxBefore);
      expect(await grantCount(context)).toBe(0);

      // §20 — the plaintext exists in no durable column.
      expect(await codeAppearsAnywhere(context, challenge.code)).toEqual([]);
      expect(await codeAppearsInIdentityTables(context, challenge.code)).toEqual([]);
    });

    it('normalizes a phone target through P01 and links the canonical value', async () => {
      const challenge = await context.open('PHONE', PHONE, 'SUBMISSION');

      expect((await submit(challenge.challengeId, challenge.code)).outcome).toBe('VERIFIED');

      const contacts = await contactPoints(context);
      expect(contacts).toHaveLength(1);
      // E.164, not the trunk-zero national form the caller typed.
      expect(contacts[0]?.normalized_value).toBe(NORMALIZED_PHONE);
      expect(contacts[0]?.display_value).toBe(NORMALIZED_PHONE);
    });

    it('rejects a replay of the same code and duplicates nothing', async () => {
      const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
      await submit(challenge.challengeId, challenge.code);
      const auditBefore = (await auditEvents(context)).length;

      const replay = await submit(challenge.challengeId, challenge.code);
      expect(replay.outcome).toBe('NOT_ANSWERABLE');

      // No second attempt row, no second customer, no second contact, no second
      // audit row. A consumed challenge is inert.
      expect((await attemptsOf(context, challenge.challengeId)).map((r) => r.outcome)).toEqual([
        'MATCH',
      ]);
      expect(await customerCount(context)).toBe(1);
      expect(await contactPoints(context)).toHaveLength(1);
      expect((await auditEvents(context)).length).toBe(auditBefore);
      expect(await challengeStateOf(context, challenge.challengeId)).toBe('VERIFIED');
    });

    it('resolves onto the existing identity when the contact already has one', async () => {
      const first = await context.open('EMAIL', EMAIL, 'SUBMISSION');
      await submit(first.challengeId, first.code);
      const owner = (await contactPoints(context))[0]?.customer_id;

      // A second SUBMISSION for the same address: the challenge is new, the
      // identity is not.
      context.clock.advanceSeconds(CHALLENGE_POLICY.ttlSeconds + 1);
      const second = await context.open('EMAIL', EMAIL, 'SUBMISSION');
      expect((await submit(second.challengeId, second.code)).outcome).toBe('VERIFIED');

      expect(await customerCount(context)).toBe(1);
      const contacts = await contactPoints(context);
      expect(contacts).toHaveLength(1);
      expect(contacts[0]?.customer_id).toBe(owner);
    });
  });

  describe('a wrong answer', () => {
    it('stays ISSUED below the cap and fails exactly at it', async () => {
      const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');

      for (let attempt = 1; attempt < CHALLENGE_POLICY.maxAttempts; attempt += 1) {
        expect((await submit(challenge.challengeId, WRONG_CODE)).outcome).toBe('MISMATCH');
        expect(await challengeStateOf(context, challenge.challengeId)).toBe('ISSUED');
      }

      // The fifth is the last (`ADR-APP4-001` §1.3 r3).
      expect((await submit(challenge.challengeId, WRONG_CODE)).outcome).toBe('LOCKED');
      expect(await challengeStateOf(context, challenge.challengeId)).toBe('FAILED');
      expect(await attemptsOf(context, challenge.challengeId)).toHaveLength(
        CHALLENGE_POLICY.maxAttempts,
      );

      const locked = (await auditEvents(context)).filter(
        (row) => row.action === 'verification.challenge.locked',
      );
      expect(locked).toHaveLength(1);
      expect(locked[0]?.actor_kind).toBe('SYSTEM');
      expect(locked[0]?.system_job_key).toBe('customer.verification');
      expect(locked[0]?.failure_code).toBe('ATTEMPT_LIMIT_REACHED');
      expect(locked[0]?.customer_id).toBeNull();
    });

    it('appends nothing after the challenge has failed, even for the right code', async () => {
      const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
      for (let attempt = 0; attempt < CHALLENGE_POLICY.maxAttempts; attempt += 1) {
        await submit(challenge.challengeId, WRONG_CODE);
      }
      const auditBefore = (await auditEvents(context)).length;

      // The sixth submission is refused whatever it contains — including the
      // code that would have worked.
      expect((await submit(challenge.challengeId, challenge.code)).outcome).toBe('NOT_ANSWERABLE');

      expect(await attemptsOf(context, challenge.challengeId)).toHaveLength(
        CHALLENGE_POLICY.maxAttempts,
      );
      expect(await challengeStateOf(context, challenge.challengeId)).toBe('FAILED');
      expect(await customerCount(context)).toBe(0);
      expect((await auditEvents(context)).length).toBe(auditBefore);
    });
  });

  describe('expiry at entry', () => {
    it('refuses the correct code and expires the challenge without a sweep', async () => {
      const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');

      // The instant of expiry itself: `expires_at <= now` is unanswerable, which
      // is the same boundary `expireStale` and `resolveOpen` use.
      context.clock.set(challenge.expiresAt);
      expect((await submit(challenge.challengeId, challenge.code)).outcome).toBe('NOT_ANSWERABLE');

      expect((await attemptsOf(context, challenge.challengeId)).map((r) => r.outcome)).toEqual([
        'EXPIRED_AT_ENTRY',
      ]);
      expect(await challengeStateOf(context, challenge.challengeId)).toBe('EXPIRED');
      expect(await verifiedAtOf(context, challenge.challengeId)).toBeNull();
      expect(await customerCount(context)).toBe(0);

      const expired = (await auditEvents(context)).filter(
        (row) => row.action === 'verification.challenge.expired',
      );
      expect(expired).toHaveLength(1);
      expect(expired[0]?.actor_kind).toBe('SYSTEM');
      expect(expired[0]?.failure_code).toBe('EXPIRED_AT_ENTRY');
    });

    it('appends no second expiry attempt on a repeated call', async () => {
      const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
      context.clock.set(challenge.expiresAt);
      await submit(challenge.challengeId, challenge.code);
      const auditBefore = (await auditEvents(context)).length;

      expect((await submit(challenge.challengeId, challenge.code)).outcome).toBe('NOT_ANSWERABLE');

      expect(await attemptsOf(context, challenge.challengeId)).toHaveLength(1);
      expect((await auditEvents(context)).length).toBe(auditBefore);
    });
  });

  describe('STEP_UP is evidence and nothing else', () => {
    it('completes, is readable through hasRecentCompleted, and creates no identity', async () => {
      const challenge = await context.open('EMAIL', EMAIL, 'STEP_UP');

      expect((await submit(challenge.challengeId, challenge.code)).outcome).toBe('VERIFIED');

      expect((await attemptsOf(context, challenge.challengeId)).map((r) => r.outcome)).toEqual([
        'MATCH',
      ]);
      expect(await challengeStateOf(context, challenge.challengeId)).toBe('VERIFIED');

      // No customer, no contact point, no grant, no business action.
      expect(await customerCount(context)).toBe(0);
      expect(await contactPoints(context)).toHaveLength(0);
      expect(await grantCount(context)).toBe(0);

      // The evidence `APP4-B05`'s step-up window will read. The instant is the
      // start of the configured window, not a constant here.
      const challenges = context.get<VerificationChallengeRepository>(
        VERIFICATION_CHALLENGE_REPOSITORY,
      );
      const notBefore = new Date(
        context.clock.now().getTime() - CHALLENGE_POLICY.ttlSeconds * 1_000,
      );
      expect(await challenges.hasRecentCompleted('EMAIL', EMAIL, 'STEP_UP', notBefore)).toBe(true);

      // And a SUBMISSION cannot satisfy it: the purpose is part of the question.
      expect(await challenges.hasRecentCompleted('EMAIL', EMAIL, 'SUBMISSION', notBefore)).toBe(
        false,
      );

      const audited = (await auditEvents(context)).filter(
        (row) => row.action === 'verification.challenge.verified',
      );
      expect(audited).toHaveLength(1);
      // No identity was established, so no customer may be claimed as the actor.
      expect(audited[0]?.actor_kind).toBe('SYSTEM');
      expect(audited[0]?.customer_id).toBeNull();
      expect(audited[0]?.summary).toEqual({
        purpose: 'STEP_UP',
        contactKind: 'EMAIL',
        outcome: 'MATCH',
      });
    });

    it('does not let a verified SUBMISSION stand in for a step-up', async () => {
      const submission = await context.open('EMAIL', EMAIL, 'SUBMISSION');
      await submit(submission.challengeId, submission.code);

      const challenges = context.get<VerificationChallengeRepository>(
        VERIFICATION_CHALLENGE_REPOSITORY,
      );
      const notBefore = new Date(context.clock.now().getTime() - 3_600_000);
      expect(await challenges.hasRecentCompleted('EMAIL', EMAIL, 'STEP_UP', notBefore)).toBe(false);
      // The purpose came from the persisted challenge, never from the body.
      expect(await customerCount(context)).toBe(1);
    });
  });

  it('refuses an unknown challenge without writing anything', async () => {
    const unknown = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

    expect((await submit(unknown, WRONG_CODE)).outcome).toBe('NOT_ANSWERABLE');

    expect(await attemptsOf(context, unknown)).toHaveLength(0);
    expect(await customerCount(context)).toBe(0);
    expect(await auditEvents(context)).toHaveLength(0);
  });
});
