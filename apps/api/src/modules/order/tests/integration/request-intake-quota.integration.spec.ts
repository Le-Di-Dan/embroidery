/**
 * `APP5-B02` §6 — the per-challenge reservation bound, against real PostgreSQL
 * locking.
 *
 * ### Why the slots are seeded rather than uploaded
 *
 * Proving the twentieth upload is admitted does not require twenty real file
 * pipelines: what the bound counts is *rows*, and a row seeded with the same
 * columns the intake path writes is the same input to the same query. Running
 * twenty real uploads would spend twenty multipart parses and twenty object
 * writes to establish a precondition, and would make a slow suite that proves
 * the parser rather than the quota. The one upload that matters — the slot-20
 * admission, the slot-21 refusal, and the race — is real end to end.
 *
 * ### The race is a real race
 *
 * Two uploads run concurrently against one challenge with nineteen slots
 * taken. Both pass the pre-stream check, because that check commits and
 * releases its lock before either reads a byte — that is precisely the window
 * the design acknowledges. The arbiter is Tx A, whose `FOR UPDATE` on the
 * challenge row serializes them, so exactly one reservation can exist
 * afterwards. The assertion is on the resulting **row count**, not on which
 * caller won: either outcome is correct, and asserting a winner would be a
 * flaky test of scheduling rather than a test of the bound.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import {
  isRequestIntakeError,
  type RequestIntakeErrorCode,
} from '../../domain/intake/request-intake.errors';
import { MAX_ACCEPTED_UPLOADS_PER_CHALLENGE } from '../../domain/intake/request-intake.policy';
import type { ChallengeId } from '../../../customer/domain/repositories/verification-challenge.repository';
import {
  createRequestIntakeContext,
  multipartRequest,
  pngBytes,
  type IntakeChallenge,
  type RequestIntakeTestContext,
} from './request-intake-context';

const CHECKSUM = `sha256:${'b'.repeat(64)}`;

describe('APP5-B02 per-challenge intake quota (integration)', () => {
  let context: RequestIntakeTestContext;

  beforeAll(async () => {
    context = await createRequestIntakeContext('app5-b02-quota');
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    context.storage.reset();
  });

  /**
   * Seeds one intake row in `status`, exactly as the production path writes it.
   *
   * `intake_expires_at` is always set, because CST-128 refuses a challenge id
   * without one — a fixture that could sidestep the constraint would be
   * seeding a row production cannot produce.
   */
  async function seedSlot(challenge: IntakeChallenge, status: string): Promise<string> {
    const id = newId();
    await context.disposable.client.db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes,
                          checksum, status, uploaded_by_customer_id,
                          uploaded_via_challenge_id, intake_expires_at)
      values (${id}, 'CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE', ${`intake/${id}/original.png`},
              'image/png', 2048, ${CHECKSUM}, ${status},
              ${await resolveCustomerId(challenge)}, ${challenge.challengeId}, ${challenge.expiresAt})
    `);
    return id;
  }

  /**
   * The customer the production path would resolve for this challenge.
   *
   * Read from the contact point rather than from the fixture's generated id:
   * `ResolveOrCreateVerifiedCustomer` resolves through the contact, so a seeded
   * row carrying a different customer would not be the row the quota counts
   * alongside a real upload.
   */
  async function resolveCustomerId(challenge: IntakeChallenge): Promise<string> {
    const result = await context.disposable.client.db.execute<{ customer_id: string }>(sql`
      select cp.customer_id
        from customer_contact_points cp
        join contact_verification_challenges c
          on c.normalized_value = cp.normalized_value and c.contact_kind = cp.contact_kind
       where c.id = ${challenge.challengeId}
       limit 1
    `);
    return result.rows[0]?.customer_id ?? challenge.customerId;
  }

  async function liveSlotCount(challenge: IntakeChallenge): Promise<number> {
    const result = await context.disposable.client.db.execute<{ n: number }>(sql`
      select count(*)::int as n from assets
       where uploaded_via_challenge_id = ${challenge.challengeId}
         and deleted_at is null
         and status in ('UPLOADED', 'INSPECTING', 'ACCEPTED')
    `);
    return result.rows[0]?.n ?? 0;
  }

  async function refusalCode(work: () => Promise<unknown>): Promise<RequestIntakeErrorCode> {
    try {
      await work();
    } catch (error: unknown) {
      if (isRequestIntakeError(error)) return error.code;
      throw error;
    }
    throw new Error('Expected the upload to be refused, but it succeeded.');
  }

  const upload = (challenge: IntakeChallenge, key?: string): Promise<unknown> =>
    context.intake.upload(
      multipartRequest(pngBytes(), key === undefined ? {} : { idempotencyKey: key }),
      { challengeId: challenge.challengeId as ChallengeId, role: 'REFERENCE' },
    );

  it('admits the twentieth upload when nineteen slots are held', async () => {
    const challenge = await context.seedVerifiedChallenge();
    for (let i = 0; i < MAX_ACCEPTED_UPLOADS_PER_CHALLENGE - 1; i += 1) {
      await seedSlot(challenge, i % 2 === 0 ? 'ACCEPTED' : 'INSPECTING');
    }
    expect(await liveSlotCount(challenge)).toBe(19);

    await expect(upload(challenge)).resolves.toBeDefined();
    expect(await liveSlotCount(challenge)).toBe(MAX_ACCEPTED_UPLOADS_PER_CHALLENGE);
  });

  it('refuses the twenty-first, without writing an object', async () => {
    const challenge = await context.seedVerifiedChallenge();
    for (let i = 0; i < MAX_ACCEPTED_UPLOADS_PER_CHALLENGE; i += 1) {
      await seedSlot(challenge, 'ACCEPTED');
    }

    const code = await refusalCode(() => upload(challenge));
    expect(code).toBe('REQUEST_INTAKE_QUOTA_REACHED');
    // The pre-stream check caught it, so no byte was read and no object exists.
    expect(context.storage.written).toHaveLength(0);
    expect(await liveSlotCount(challenge)).toBe(MAX_ACCEPTED_UPLOADS_PER_CHALLENGE);
  });

  it('counts UPLOADED and INSPECTING rows, not only ACCEPTED ones', async () => {
    const challenge = await context.seedVerifiedChallenge();
    for (let i = 0; i < MAX_ACCEPTED_UPLOADS_PER_CHALLENGE; i += 1) {
      // Not one of them is ACCEPTED yet. A bound that counted only accepted
      // rows would admit a twenty-first here and breach G01-D13 the moment the
      // inspector finished.
      await seedSlot(challenge, 'INSPECTING');
    }

    expect(await refusalCode(() => upload(challenge))).toBe('REQUEST_INTAKE_QUOTA_REACHED');
  });

  it('releases the slot of a rejected upload', async () => {
    const challenge = await context.seedVerifiedChallenge();
    const doomed: string[] = [];
    for (let i = 0; i < MAX_ACCEPTED_UPLOADS_PER_CHALLENGE; i += 1) {
      doomed.push(await seedSlot(challenge, 'ACCEPTED'));
    }
    expect(await refusalCode(() => upload(challenge))).toBe('REQUEST_INTAKE_QUOTA_REACHED');

    // The canonical asset state, not a deletion: a customer whose file was
    // refused must not be locked out of their own request.
    await context.disposable.client.db.execute(
      sql`update assets set status = 'REJECTED' where id = ${doomed[0]}`,
    );

    await expect(upload(challenge)).resolves.toBeDefined();
  });

  it('counts by challenge, not by customer', async () => {
    // Two challenges resolving to two customers, so a customer-wide count and a
    // challenge-scoped count would agree — then the same customer's *second*
    // challenge is what separates them.
    const first = await context.seedVerifiedChallenge();
    for (let i = 0; i < MAX_ACCEPTED_UPLOADS_PER_CHALLENGE; i += 1) {
      await seedSlot(first, 'ACCEPTED');
    }
    const second = await context.seedVerifiedChallenge();

    // A full challenge does not exhaust a different one's capacity.
    await expect(upload(second)).resolves.toBeDefined();
    expect(await liveSlotCount(second)).toBe(1);
  });

  it('lets at most one of two concurrent attempts take the final slot', async () => {
    const challenge = await context.seedVerifiedChallenge();
    for (let i = 0; i < MAX_ACCEPTED_UPLOADS_PER_CHALLENGE - 1; i += 1) {
      await seedSlot(challenge, 'ACCEPTED');
    }
    expect(await liveSlotCount(challenge)).toBe(19);

    // Distinct keys, so the idempotency arbiter cannot be what separates them —
    // the only thing standing between these two and a twenty-first reservation
    // is the challenge row lock in Tx A.
    const outcomes = await Promise.allSettled([
      upload(challenge, 'race-attempt-a'),
      upload(challenge, 'race-attempt-b'),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    expect(await liveSlotCount(challenge)).toBe(MAX_ACCEPTED_UPLOADS_PER_CHALLENGE);

    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    const reason: unknown = rejected?.status === 'rejected' ? rejected.reason : undefined;
    expect(isRequestIntakeError(reason) ? reason.code : reason).toBe(
      'REQUEST_INTAKE_QUOTA_REACHED',
    );
  });
});
