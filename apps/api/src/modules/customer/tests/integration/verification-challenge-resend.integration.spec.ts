/**
 * `APP4-B03` — business resend, cooldown and the issuance rate window.
 *
 * A resend is one of three things the APP4 vocabulary keeps apart. This suite
 * proves the one B03 owns: **new challenge, new code, new digest, new intent,
 * new outbox event, new envelope**. `APP4-W01`'s accepted evidence proves the
 * other one — a transport retry reuses the same row, envelope and secret — and
 * it is deliberately not re-run here.
 *
 * Every duration is asserted against a fake clock. A real 60-second cooldown or
 * a 900-second window would make the suite slower than the feature.
 */
import { openDeliveryEnvelope } from '@embroidery/notification-delivery';

import {
  CHALLENGE_POLICY,
  createVerificationContext,
  type VerificationTestContext,
} from './verification-issue-context';
import {
  challengeCount,
  challengesFor,
  codeAppearsAnywhere,
  deliveryEvents,
  intents,
  openChallengeCount,
} from './verification-issue-queries';
import { isVerificationIssueFailure } from '../../domain/verification/verification-issue-outcome';
import type { VerificationIssueError } from '../../domain/verification/verification-issue-outcome';
import type { ChallengeId } from '../../domain/repositories/verification-challenge.repository';

const EMAIL = 'resend.target@example.com';

describe('APP4-B03 verification resend and rate (integration)', () => {
  let context: VerificationTestContext;

  beforeAll(async () => {
    context = await createVerificationContext({
      label: 'app4-b03-resend',
      policy: CHALLENGE_POLICY,
    });
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  // Truncation removes the policy version too, so each test re-publishes it
  // through the same canonical path rather than sharing one from `beforeAll`.
  beforeEach(async () => {
    await context.reset();
    context.clock.set(new Date('2026-08-14T09:00:00.000Z'));
    context.minter.reset();
    await context.publishPolicy(CHALLENGE_POLICY);
  });

  async function failureOf(work: () => Promise<unknown>): Promise<VerificationIssueError> {
    try {
      await work();
    } catch (error: unknown) {
      if (isVerificationIssueFailure(error)) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the resend to be refused, but it succeeded.');
  }

  const issue = (contact = EMAIL, purpose: 'SUBMISSION' | 'STEP_UP' = 'SUBMISSION') =>
    context.inRequest(() => context.issuance.issue({ contactKind: 'EMAIL', contact, purpose }));

  const resend = (challengeId: string) =>
    context.inRequest(() => context.resending.resend(challengeId as ChallengeId));

  describe('cooldown', () => {
    it('refuses an immediate resend and writes nothing', async () => {
      const first = await issue();

      const failure = await failureOf(() => resend(first.challengeId));

      expect(failure.failure).toBe('RESEND_TOO_SOON');
      expect(context.minter.minted).toHaveLength(1);
      expect(await challengeCount(context)).toBe(1);
      expect(await intents(context)).toHaveLength(1);
      expect(await deliveryEvents(context)).toHaveLength(1);
      // The source is untouched — not cancelled, not expired.
      expect((await challengesFor(context, EMAIL))[0]?.status).toBe('ISSUED');
    });

    it('refuses one second before the cooldown elapses and allows it on the instant', async () => {
      const first = await issue();

      context.clock.advanceSeconds(CHALLENGE_POLICY.resendCooldownSeconds - 1);
      expect((await failureOf(() => resend(first.challengeId))).failure).toBe('RESEND_TOO_SOON');

      context.clock.advanceSeconds(1);
      await expect(resend(first.challengeId)).resolves.toMatchObject({ outcome: 'ISSUED' });
    });
  });

  describe('an eligible resend', () => {
    it('replaces the source with a new challenge, code, intent, event and envelope', async () => {
      const source = await issue();
      const sourceCode = context.minter.last;
      const [sourceRow] = await challengesFor(context, EMAIL);
      const [sourceIntent] = await intents(context);
      const [sourceEvent] = await deliveryEvents(context);

      context.clock.advanceSeconds(CHALLENGE_POLICY.resendCooldownSeconds);
      const replacement = await resend(source.challengeId);
      const replacementCode = context.minter.last;

      expect(replacement.challengeId).not.toBe(source.challengeId);
      expect(replacementCode).not.toBe(sourceCode);

      const rows = await challengesFor(context, EMAIL);
      expect(rows).toHaveLength(2);
      const previous = rows.find((row) => row.id === source.challengeId);
      const current = rows.find((row) => row.id === replacement.challengeId);
      // DB3 §1: "challenge mới CANCELLED challenge cũ". Not EXPIRED — the source
      // had not reached its `expires_at`, and saying it had would falsify it.
      expect(previous?.status).toBe('CANCELLED');
      expect(new Date(previous?.expires_at ?? 0).getTime()).toBeGreaterThan(
        context.clock.now().getTime(),
      );
      expect(current?.status).toBe('ISSUED');
      expect(current?.code_hash).not.toBe(sourceRow?.code_hash);
      expect(await openChallengeCount(context, EMAIL, 'SUBMISSION')).toBe(1);

      // A genuinely new notification, not a redelivery of the old envelope.
      const allIntents = await intents(context);
      const allEvents = await deliveryEvents(context);
      expect(allIntents).toHaveLength(2);
      expect(allEvents).toHaveLength(2);
      expect(allIntents[1]?.id).not.toBe(sourceIntent?.id);
      expect(allIntents[1]?.intent_key).not.toBe(sourceIntent?.intent_key);
      expect(allEvents[1]?.payload.ciphertext).not.toBe(sourceEvent?.payload.ciphertext);
      expect(allEvents[1]?.payload.iv).not.toBe(sourceEvent?.payload.iv);

      // The replacement envelope carries the *new* code. Read inside the test's
      // controlled sink and never reported.
      const event = allEvents[1];
      if (event === undefined) throw new Error('no replacement event');
      expect(openDeliveryEnvelope(context.envelopeKey, event.payload).secret).toBe(replacementCode);

      for (const code of [sourceCode, replacementCode]) {
        expect(await codeAppearsAnywhere(context, code)).toEqual([]);
      }
    });

    it('inherits the target and purpose from the source, not from the caller', async () => {
      // The resend contract has no body at all, so there is no field through
      // which a caller could redirect someone else's code to its own address.
      const stepUp = await issue(EMAIL, 'STEP_UP');
      context.clock.advanceSeconds(CHALLENGE_POLICY.resendCooldownSeconds);

      const replacement = await resend(stepUp.challengeId);

      const rows = await challengesFor(context, EMAIL);
      const current = rows.find((row) => row.id === replacement.challengeId);
      expect(current).toMatchObject({
        contact_kind: 'EMAIL',
        normalized_value: EMAIL,
        purpose: 'STEP_UP',
      });
    });
  });

  describe('a source that cannot be replaced', () => {
    it('refuses an unknown challenge with the same answer as a spent one', async () => {
      const unknown = await failureOf(() => resend('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071'));
      expect(unknown.failure).toBe('CHALLENGE_NOT_RESENDABLE');

      const source = await issue();
      context.clock.advanceSeconds(CHALLENGE_POLICY.ttlSeconds + 1);
      const expired = await failureOf(() => resend(source.challengeId));

      // Identical, so a challenge id cannot be confirmed by watching the answer.
      expect(expired.failure).toBe(unknown.failure);
      expect(context.minter.minted).toHaveLength(1);
    });
  });

  describe('the issuance rate window', () => {
    it('refuses the issuance past the budget and writes nothing', async () => {
      // Each cycle consumes one slot: issue, wait out the cooldown, resend.
      let current = await issue();
      for (let slot = 2; slot <= CHALLENGE_POLICY.maxIssuesPerTargetPerWindow; slot += 1) {
        context.clock.advanceSeconds(CHALLENGE_POLICY.resendCooldownSeconds);
        current = await resend(current.challengeId);
      }
      expect(context.minter.minted).toHaveLength(CHALLENGE_POLICY.maxIssuesPerTargetPerWindow);

      context.clock.advanceSeconds(CHALLENGE_POLICY.resendCooldownSeconds);
      const failure = await failureOf(() => resend(current.challengeId));

      expect(failure.failure).toBe('ISSUANCE_RATE_EXCEEDED');
      expect(context.minter.minted).toHaveLength(CHALLENGE_POLICY.maxIssuesPerTargetPerWindow);
      expect(await challengeCount(context)).toBe(CHALLENGE_POLICY.maxIssuesPerTargetPerWindow);
      expect(await deliveryEvents(context)).toHaveLength(
        CHALLENGE_POLICY.maxIssuesPerTargetPerWindow,
      );
      // The source survived the refusal: nothing was cancelled for a challenge
      // that was never created.
      expect(await openChallengeCount(context, EMAIL, 'SUBMISSION')).toBe(1);
    });

    it('recovers once the window has passed', async () => {
      let current = await issue();
      for (let slot = 2; slot <= CHALLENGE_POLICY.maxIssuesPerTargetPerWindow; slot += 1) {
        context.clock.advanceSeconds(CHALLENGE_POLICY.resendCooldownSeconds);
        current = await resend(current.challengeId);
      }
      context.clock.advanceSeconds(CHALLENGE_POLICY.resendCooldownSeconds);
      await failureOf(() => resend(current.challengeId));

      // Past the window, the earlier issuances no longer count.
      context.clock.advanceSeconds(CHALLENGE_POLICY.rateWindowSeconds);
      await expect(issue()).resolves.toMatchObject({ outcome: 'ISSUED' });
    });

    it('scopes the budget to one purpose', async () => {
      let current = await issue(EMAIL, 'SUBMISSION');
      for (let slot = 2; slot <= CHALLENGE_POLICY.maxIssuesPerTargetPerWindow; slot += 1) {
        context.clock.advanceSeconds(CHALLENGE_POLICY.resendCooldownSeconds);
        current = await resend(current.challengeId);
      }
      context.clock.advanceSeconds(CHALLENGE_POLICY.resendCooldownSeconds);
      await failureOf(() => resend(current.challengeId));

      // The same contact, the other purpose: an untouched budget.
      await expect(issue(EMAIL, 'STEP_UP')).resolves.toMatchObject({ outcome: 'ISSUED' });
    });

    it('does not let two concurrent callers share the last slot', async () => {
      let current = await issue();
      for (let slot = 2; slot < CHALLENGE_POLICY.maxIssuesPerTargetPerWindow; slot += 1) {
        context.clock.advanceSeconds(CHALLENGE_POLICY.resendCooldownSeconds);
        current = await resend(current.challengeId);
      }
      // One slot left, and the live challenge expired so both callers reach the
      // rate check rather than the already-open short circuit.
      context.clock.advanceSeconds(CHALLENGE_POLICY.ttlSeconds + 1);

      const settled = await Promise.allSettled([issue(), issue()]);

      const created = settled.filter(
        (result) => result.status === 'fulfilled' && result.value.outcome === 'ISSUED',
      );
      expect(created).toHaveLength(1);
      expect(await challengeCount(context)).toBe(CHALLENGE_POLICY.maxIssuesPerTargetPerWindow);
    });
  });

  describe('policy', () => {
    it('issues nothing when the published value is malformed', async () => {
      await context.publishPolicy({ ...CHALLENGE_POLICY, ttlSeconds: 'ten minutes' });

      const failure = await failureOf(() => issue());

      expect(failure.failure).toBe('VERIFICATION_POLICY_UNAVAILABLE');
      expect(await challengeCount(context)).toBe(0);
      expect(context.minter.minted).toHaveLength(0);

      // Restored for the suite's remaining tests, through the same versioned path.
      await context.publishPolicy(CHALLENGE_POLICY);
    });
  });
});
