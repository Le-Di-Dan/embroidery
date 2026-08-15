/**
 * `APP4-B03` — challenge issuance against a real PostgreSQL instance.
 *
 * The claims that matter are mostly about what does *not* happen: no second
 * challenge while one is live, no plaintext outside the ciphertext, no orphan
 * challenge when delivery cannot be recorded, and no answer that differs
 * because of who owns the destination.
 *
 * Every contact is synthetic and every code comes from a scripted minter, so a
 * suite knows the exact string that must appear in exactly one place.
 */
import { openDeliveryEnvelope } from '@embroidery/notification-delivery';
import { sql } from 'drizzle-orm';

import {
  CHALLENGE_POLICY,
  createVerificationContext,
  type VerificationTestContext,
} from './verification-issue-context';
import {
  auditEventCount,
  challengeCount,
  challengesFor,
  codeAppearsAnywhere,
  deliveryEvents,
  intents,
  openChallengeCount,
} from './verification-issue-queries';
import { maskContact } from '../../domain/contact/mask-contact';
import { isVerificationIssueFailure } from '../../domain/verification/verification-issue-outcome';
import type { VerificationIssueError } from '../../domain/verification/verification-issue-outcome';

const EMAIL = 'nguoi.dung@example.com';
const NORMALIZED_EMAIL = 'nguoi.dung@example.com';
const PHONE = '0912345678';

describe('APP4-B03 verification challenge issue (integration)', () => {
  let context: VerificationTestContext;

  beforeAll(async () => {
    context = await createVerificationContext({
      label: 'app4-b03-issue',
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
    throw new Error('Expected the issuance to be refused, but it succeeded.');
  }

  const issue = (contact: string, kind: 'EMAIL' | 'PHONE' = 'EMAIL', purpose = 'SUBMISSION') =>
    context.inRequest(() =>
      context.issuance.issue({
        contactKind: kind,
        contact,
        purpose: purpose as 'SUBMISSION' | 'STEP_UP',
      }),
    );

  describe('a new EMAIL target', () => {
    it('opens one challenge, stores only the hash, and hands the code to delivery', async () => {
      const now = context.clock.now();

      const result = await issue('Nguoi.Dung@Example.com');

      // The response carries timing derived from policy, and nothing else.
      expect(result.outcome).toBe('ISSUED');
      expect(result.expiresAt.getTime()).toBe(now.getTime() + CHALLENGE_POLICY.ttlSeconds * 1_000);
      expect(result.resendAvailableAt.getTime()).toBe(
        now.getTime() + CHALLENGE_POLICY.resendCooldownSeconds * 1_000,
      );

      const challenges = await challengesFor(context, NORMALIZED_EMAIL);
      expect(challenges).toHaveLength(1);
      expect(challenges[0]).toMatchObject({
        id: result.challengeId,
        contact_kind: 'EMAIL',
        // The P01 canonical form, not the as-entered casing.
        normalized_value: NORMALIZED_EMAIL,
        purpose: 'SUBMISSION',
        status: 'ISSUED',
        session_id: null,
      });
      // A digest, never the code.
      const code = context.minter.last;
      expect(challenges[0]?.code_hash).not.toBe(code);
      expect(challenges[0]?.code_hash.length).toBeGreaterThan(code.length);

      // One secret-free intent.
      const [intent] = await intents(context);
      expect(intent).toMatchObject({ template_key: 'verification.code', channel: 'EMAIL' });
      expect(intent?.recipient_masked).not.toBe(NORMALIZED_EMAIL);
      expect(intent?.params).toEqual({
        schemaVersion: 1,
        reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: result.challengeId },
      });

      // One PENDING delivery event whose payload is ciphertext.
      const [event] = await deliveryEvents(context);
      expect(event).toMatchObject({
        event_type: 'notification.delivery.requested',
        aggregate_kind: 'NOTIFICATION_INTENT',
        aggregate_id: intent?.id,
        status: 'PENDING',
      });
      expect(event?.payload.algorithm).toBe('AES-256-GCM');
      expect(JSON.stringify(event?.payload)).not.toContain(code);

      // The code exists in exactly one place, and it is the ciphertext.
      expect(await codeAppearsAnywhere(context, code)).toEqual([]);
      // B03 writes no audit row: verification outcome is B04's, identity link is
      // B02's, and issuance has no locked audit rule of its own.
      expect(await auditEventCount(context)).toBe(0);
    });

    it('seals the issued code, and only it, into the envelope', async () => {
      // The B03 half of the handoff: what W01 will open is exactly what was
      // minted here. W01's own accepted evidence proves the other half — that
      // the opened plaintext reaches the recording adapter unchanged.
      const result = await issue(EMAIL);
      const code = context.minter.last;

      const [event] = await deliveryEvents(context);
      if (event === undefined) throw new Error('no delivery event');
      const payload = openDeliveryEnvelope(context.envelopeKey, event.payload);

      expect(payload).toMatchObject({
        secretKind: 'VERIFICATION_CODE',
        channel: 'EMAIL',
        normalizedRecipient: NORMALIZED_EMAIL,
        secret: code,
      });
      expect(new Date(payload.expiresAt).getTime()).toBe(result.expiresAt.getTime());
    });
  });

  describe('a new PHONE target', () => {
    it('normalizes to E.164 and asks for SMS delivery', async () => {
      const result = await issue(PHONE, 'PHONE');

      const [intent] = await intents(context);
      expect(intent?.channel).toBe('SMS');

      const [event] = await deliveryEvents(context);
      if (event === undefined) throw new Error('no delivery event');
      const payload = openDeliveryEnvelope(context.envelopeKey, event.payload);
      expect(payload.channel).toBe('SMS');
      expect(payload.normalizedRecipient.startsWith('+84')).toBe(true);

      const challenges = await challengesFor(context, payload.normalizedRecipient);
      expect(challenges).toHaveLength(1);
      expect(challenges[0]).toMatchObject({ id: result.challengeId, contact_kind: 'PHONE' });
      expect(await codeAppearsAnywhere(context, context.minter.last)).toEqual([]);
    });

    it('refuses a contact the normalizer cannot accept', async () => {
      const failure = await failureOf(() => issue('not-an-email', 'EMAIL'));

      expect(failure.failure).toBe('CONTACT_NOT_ACCEPTABLE');
      expect(await challengeCount(context)).toBe(0);
    });
  });

  describe('a live challenge', () => {
    it('is returned unchanged instead of being rotated', async () => {
      const first = await issue(EMAIL);
      context.clock.advanceSeconds(5);

      const second = await issue(EMAIL);

      // The same challenge, the same expiry, the same resend instant — so the
      // issue endpoint cannot be used to bypass the resend cooldown.
      expect(second.outcome).toBe('ALREADY_OPEN');
      expect(second.challengeId).toBe(first.challengeId);
      expect(second.expiresAt).toEqual(first.expiresAt);
      expect(second.resendAvailableAt).toEqual(first.resendAvailableAt);

      // Nothing was minted, persisted or queued the second time.
      expect(context.minter.minted).toHaveLength(1);
      expect(await challengeCount(context)).toBe(1);
      expect(await intents(context)).toHaveLength(1);
      expect(await deliveryEvents(context)).toHaveLength(1);
    });

    it('keeps SUBMISSION and STEP_UP independent', async () => {
      const submission = await issue(EMAIL, 'EMAIL', 'SUBMISSION');
      const stepUp = await issue(EMAIL, 'EMAIL', 'STEP_UP');

      expect(stepUp.challengeId).not.toBe(submission.challengeId);
      expect(await openChallengeCount(context, NORMALIZED_EMAIL, 'SUBMISSION')).toBe(1);
      expect(await openChallengeCount(context, NORMALIZED_EMAIL, 'STEP_UP')).toBe(1);
      expect(await deliveryEvents(context)).toHaveLength(2);
    });
  });

  /**
   * `FU-APP4-S01-MASKED-DESTINATION-01`, resolved by Product Owner ruling.
   *
   * The approved `APP4-S01` code-entry screen names the destination the code
   * went to, so the response carries the canonical `APP4-P01` mask and the
   * browser never carries the algorithm. What these prove is that it is the
   * *canonical* mask of the *challenge's own* recipient — a value the response
   * merely copies — and that nothing else about the contact came with it.
   */
  describe('the masked destination', () => {
    it('is the canonical P01 mask of the normalized EMAIL recipient', async () => {
      const result = await issue('Nguoi.Dung@Example.com');

      // Compared against the authority rather than a literal, so a change to
      // the masking rule moves this expectation with it instead of failing here
      // and being "fixed" by pasting the new string.
      expect(result.recipientMasked).toBe(maskContact('EMAIL', NORMALIZED_EMAIL));
      // Masked, not merely present: the normalized value is what must not travel,
      // and the as-entered casing must not either.
      expect(result.recipientMasked).not.toBe(NORMALIZED_EMAIL);
      expect(result.recipientMasked).not.toContain('Nguoi.Dung');
    });

    it('masks a PHONE recipient from its E.164 form, not the digits typed', async () => {
      const result = await issue(PHONE, 'PHONE');

      const [event] = await deliveryEvents(context);
      if (event === undefined) throw new Error('no delivery event');
      const { normalizedRecipient } = openDeliveryEnvelope(context.envelopeKey, event.payload);

      expect(result.recipientMasked).toBe(maskContact('PHONE', normalizedRecipient));
      expect(result.recipientMasked).not.toBe(normalizedRecipient);
      expect(result.recipientMasked).not.toBe(PHONE);
    });

    it('describes the live challenge on a repeat issue, minting nothing', async () => {
      const first = await issue(EMAIL);
      context.clock.advanceSeconds(5);

      const second = await issue(EMAIL);

      // The `ALREADY_OPEN` branch computes the mask from the row it found, so
      // the second answer must be byte-identical to the first — a mask that
      // differed would tell a caller its call was the one that created nothing.
      expect(second.outcome).toBe('ALREADY_OPEN');
      expect(second.challengeId).toBe(first.challengeId);
      expect(second.recipientMasked).toBe(first.recipientMasked);

      // Obtaining the mask cost nothing: no code, no challenge, no notification.
      expect(context.minter.minted).toHaveLength(1);
      expect(await challengeCount(context)).toBe(1);
      expect(await intents(context)).toHaveLength(1);
      expect(await deliveryEvents(context)).toHaveLength(1);
    });

    it('is the only contact representation the public answer carries', async () => {
      const result = await issue('Nguoi.Dung@Example.com');

      // The serialized public shape, as the controller would project it.
      const published = JSON.stringify(result);
      expect(published).not.toContain(NORMALIZED_EMAIL);
      expect(published).not.toContain('Nguoi.Dung@Example.com');
      expect(published).not.toContain(context.minter.last);

      // And the shape itself is closed: four fields, no ownership references.
      expect(Object.keys(result).sort()).toEqual([
        'challengeId',
        'expiresAt',
        'outcome',
        'recipientMasked',
        'resendAvailableAt',
      ]);
    });
  });

  describe('a stale challenge', () => {
    it('is expired before the replacement is inserted', async () => {
      const stale = await issue(EMAIL);

      // Past its TTL, but still `ISSUED`: expiry alone never frees the CST-007
      // slot, so only the transition below can.
      context.clock.advanceSeconds(CHALLENGE_POLICY.ttlSeconds + 1);
      const fresh = await issue(EMAIL);

      expect(fresh.outcome).toBe('ISSUED');
      expect(fresh.challengeId).not.toBe(stale.challengeId);

      const challenges = await challengesFor(context, NORMALIZED_EMAIL);
      expect(challenges).toHaveLength(2);
      expect(challenges.find((row) => row.id === stale.challengeId)?.status).toBe('EXPIRED');
      expect(challenges.find((row) => row.id === fresh.challengeId)?.status).toBe('ISSUED');
      expect(await openChallengeCount(context, NORMALIZED_EMAIL, 'SUBMISSION')).toBe(1);
    });
  });

  describe('concurrent issue', () => {
    it('leaves exactly one challenge, one intent and one delivery event', async () => {
      const settled = await Promise.allSettled([issue(EMAIL), issue(EMAIL)]);

      expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(0);
      expect(await openChallengeCount(context, NORMALIZED_EMAIL, 'SUBMISSION')).toBe(1);
      expect(await challengeCount(context)).toBe(1);
      expect(await intents(context)).toHaveLength(1);
      expect(await deliveryEvents(context)).toHaveLength(1);

      // One caller created it and the other found it; neither can tell which it
      // was from the response, and both got the same challenge.
      const ids = settled.map((result) =>
        result.status === 'fulfilled' ? result.value.challengeId : undefined,
      );
      expect(ids[0]).toBe(ids[1]);
      for (const code of context.minter.minted) {
        expect(await codeAppearsAnywhere(context, code)).toEqual([]);
      }
    });
  });

  describe('atomicity', () => {
    it('rolls the challenge back when the delivery hand-off fails', async () => {
      // The failure is injected through the existing transaction seam rather
      // than through production code: an enclosing transaction that throws after
      // the use case returns proves the same boundary a downstream B01 failure
      // would hit, because both roll back the one transaction all four steps
      // share.
      await expect(
        context.inRequest(() =>
          context.inTransaction(async () => {
            await context.issuance.issue({
              contactKind: 'EMAIL',
              contact: EMAIL,
              purpose: 'SUBMISSION',
            });
            throw new Error('delivery hand-off failed after the challenge was written');
          }),
        ),
      ).rejects.toThrow('delivery hand-off failed');

      // No challenge with no way to deliver, and no envelope for a challenge
      // that never existed.
      expect(await challengeCount(context)).toBe(0);
      expect(await intents(context)).toHaveLength(0);
      expect(await deliveryEvents(context)).toHaveLength(0);
    });
  });

  describe('the arbiter is the database', () => {
    it('refuses a second open challenge inserted behind the application', async () => {
      // CST-007 with the advisory lock bypassed: a raw insert of a second
      // `ISSUED` row for one target and purpose. The partial unique index is
      // what makes the single-open rule true, not the code above it.
      await issue(EMAIL);

      await expect(
        context.disposable.client.db.execute(sql`
          insert into contact_verification_challenges
            (id, contact_kind, normalized_value, purpose, code_hash, status, expires_at)
          values (gen_random_uuid()::text, 'EMAIL', ${NORMALIZED_EMAIL}, 'SUBMISSION',
                  'not-a-real-digest', 'ISSUED', now() + interval '10 minutes')
        `),
      ).rejects.toThrow();

      expect(await openChallengeCount(context, NORMALIZED_EMAIL, 'SUBMISSION')).toBe(1);
    });
  });
});
