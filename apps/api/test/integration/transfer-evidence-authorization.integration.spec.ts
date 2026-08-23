/**
 * `APP7-B05` — the transfer-evidence authorization half, over real HTTP.
 *
 * The same unmocked stack as `transfer-evidence.integration.spec.ts`: the whole
 * application, a disposable PostgreSQL and a live disposable MinIO. This half
 * proves who may submit, when, how many times, and that none of it moves money.
 *
 * The `4 → 5` race is the `APP7-B05` §13 proof and it is a real one: two
 * concurrent HTTP requests, each on its own pool connection and its own
 * transaction. No single serialised connection is used anywhere in it.
 */
import { sql } from 'drizzle-orm';

import { publishDepositPolicies } from '../support/customer-deposit-fixture';
import {
  createTransferEvidenceContext,
  customerUploadAssetCount,
  EVIDENCE_ROUTES,
  evidenceRowsOf,
  inspectionEventCount,
  nextEvidenceKey,
  openAttempt,
  paymentStateOf,
  pngBytes,
  readEvidenceStatus,
  seedOpenAttempt,
  uploadEvidence,
  withoutMeta,
  type ErrorBody,
  type ListBody,
  type SeededAttempt,
  type TransferEvidenceTestContext,
  type UploadBody,
} from '../support/transfer-evidence-fixture';

jest.setTimeout(240_000);

describe('APP7-B05 — customer transfer evidence', () => {
  let context: TransferEvidenceTestContext;

  beforeAll(async () => {
    context = await createTransferEvidenceContext('app7_b05_authorization');
    await publishDepositPolicies(context.app, context.database);
  });

  afterAll(async () => {
    await context?.close();
  });

  function status(token: string, attemptId: string) {
    return readEvidenceStatus(context, token, attemptId);
  }

  async function seed(suffix: string): Promise<SeededAttempt> {
    return seedOpenAttempt(context.app, context.database, suffix);
  }

  async function paymentState(seeded: SeededAttempt): Promise<unknown> {
    return paymentStateOf(context.database, seeded);
  }

  describe('the attempt locator is never authority', () => {
    it('refuses another customer’s attempt without disclosing that it exists', async () => {
      const mine = await seed('crossmine');
      const theirs = await seed('crosstheirs');

      const before = await paymentState(theirs);
      const response = await uploadEvidence(context, {
        token: mine.token,
        attemptId: theirs.attemptId,
      });

      expect(response.status).toBe(404);
      expect((response.body as ErrorBody).code).toBe('SECURE_LINK_UNAVAILABLE');
      // Zero durable effect on the foreign order: no association, no asset, no
      // payment mutation of any kind.
      expect(await evidenceRowsOf(context.database, theirs.attemptId)).toEqual([]);
      expect(await paymentState(theirs)).toEqual(before);

      const read = await status(mine.token, theirs.attemptId);
      expect(read.status).toBe(404);
      expect((read.body as ErrorBody).code).toBe('SECURE_LINK_UNAVAILABLE');
    });

    it('answers a fictional attempt exactly as it answers a foreign one', async () => {
      const mine = await seed('fictional');
      const theirs = await seed('realbutforeign');

      const fictional = await status(mine.token, '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07');
      const foreign = await status(mine.token, theirs.attemptId);

      expect(fictional.status).toBe(foreign.status);
      // Everything but the envelope's own per-request , which differs on
      // two identical successes just as much as on two identical refusals.
      expect(withoutMeta(fictional.body as ErrorBody)).toEqual(
        withoutMeta(foreign.body as ErrorBody),
      );
    });

    it('refuses an unknown token identically', async () => {
      const seeded = await seed('unknowntoken');
      const response = await status('a'.repeat(43), seeded.attemptId);
      expect(response.status).toBe(404);
      expect((response.body as ErrorBody).code).toBe('SECURE_LINK_UNAVAILABLE');
    });

    it('refuses an upload whose body carries no credential fields', async () => {
      const seeded = await seed('nofields');
      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        omitFields: true,
      });
      expect(response.status).toBe(400);
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toEqual([]);
    });
  });

  describe('the attempt state bounds when evidence may arrive', () => {
    it.each([['SUCCEEDED'], ['FAILED'], ['EXPIRED']])(
      'refuses a %s attempt without reopening it',
      async (state) => {
        const seeded = await seed(`closed${state.toLowerCase()}`);
        await context.database.client.db.execute(sql`
          update payment_attempts set status = ${state}, updated_at = now()
           where id = ${seeded.attemptId}
        `);
        const before = await paymentState(seeded);

        const response = await uploadEvidence(context, {
          token: seeded.token,
          attemptId: seeded.attemptId,
        });

        expect(response.status).toBe(409);
        expect((response.body as ErrorBody).code).toBe('EVIDENCE_ATTEMPT_CLOSED');
        expect(await evidenceRowsOf(context.database, seeded.attemptId)).toEqual([]);
        // The terminal state is preserved exactly: nothing reset it.
        expect(await paymentState(seeded)).toEqual(before);
      },
    );

    it('accepts supporting evidence on a REQUIRES_REVIEW attempt, unchanged', async () => {
      const seeded = await seed('review');
      await context.database.client.db.execute(sql`
        update payment_attempts
           set status = 'REQUIRES_REVIEW', review_reason = 'Manual reconciliation.',
               updated_at = now()
         where id = ${seeded.attemptId}
      `);
      const before = await paymentState(seeded);

      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
      });

      expect(response.status).toBe(202);
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toHaveLength(1);
      // The state the Admin is reviewing is exactly the state they were reviewing.
      expect(await paymentState(seeded)).toEqual(before);
    });

    it('still lists evidence for a settled attempt', async () => {
      const seeded = await seed('listclosed');
      await uploadEvidence(context, { token: seeded.token, attemptId: seeded.attemptId });
      await context.database.client.db.execute(sql`
        update payment_attempts set status = 'FAILED', failed_at = now(), updated_at = now()
         where id = ${seeded.attemptId}
      `);

      const response = await status(seeded.token, seeded.attemptId);
      expect(response.status).toBe(200);
      expect((response.body as { data: ListBody }).data.evidence).toHaveLength(1);
    });
  });

  describe('the step-up is the attempt’s own, and it is re-verified', () => {
    it('refuses when the attempt’s challenge is no longer a verified step-up', async () => {
      const seeded = await seed('nostepup');
      await context.database.client.db.execute(sql`
        update contact_verification_challenges set purpose = 'SUBMISSION'
         where id = ${seeded.challengeId}
      `);

      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
      });
      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).code).toBe('REVERIFICATION_REQUIRED');
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toEqual([]);
    });

    it('refuses when the contact that answered it is no longer the customer’s', async () => {
      const seeded = await seed('foreigncontact');
      await context.database.client.db.execute(sql`
        update customer_contact_points set deactivated_at = now()
         where customer_id = ${seeded.customerId}
      `);

      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
      });
      expect(response.status).toBe(403);
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toEqual([]);
    });
  });

  describe('idempotency: one key, one asset, one association, one dispatch', () => {
    it('replays the same result and writes nothing a second time', async () => {
      const seeded = await seed('replay');
      const key = nextEvidenceKey();
      const bytes = pngBytes(0x44, 200);

      const first = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        bytes,
        idempotencyKey: key,
      });
      const second = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        bytes,
        idempotencyKey: key,
      });

      expect(first.status).toBe(202);
      expect(second.status).toBe(202);
      const one = (first.body as { data: UploadBody }).data;
      const two = (second.body as { data: UploadBody }).data;
      expect(two.evidenceId).toBe(one.evidenceId);
      expect(two.replayed).toBe(true);

      const rows = await evidenceRowsOf(context.database, seeded.attemptId);
      expect(rows).toHaveLength(1);
      expect(await inspectionEventCount(context.database, rows[0]?.asset_id as string)).toBe(1);
    });

    it('refuses the same key with a different file', async () => {
      const seeded = await seed('conflict');
      const key = nextEvidenceKey();
      await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        bytes: pngBytes(0x55, 64),
        idempotencyKey: key,
      });
      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        bytes: pngBytes(0x66, 64),
        idempotencyKey: key,
      });

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).code).toBe('IDEMPOTENCY_CONFLICT');
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toHaveLength(1);
    });

    it('does not let one key replay across attempts or customers', async () => {
      const mine = await seed('scopemine');
      const theirs = await seed('scopetheirs');
      const key = nextEvidenceKey();
      const bytes = pngBytes(0x77, 64);

      await uploadEvidence(context, {
        token: mine.token,
        attemptId: mine.attemptId,
        bytes,
        idempotencyKey: key,
      });
      // Same key, same bytes, a different attempt on a different order: a
      // separate scope, so it claims fresh rather than replaying.
      const other = await uploadEvidence(context, {
        token: theirs.token,
        attemptId: theirs.attemptId,
        bytes,
        idempotencyKey: key,
      });

      expect(other.status).toBe(202);
      expect((other.body as { data: UploadBody }).data.replayed).toBe(false);
      expect(await evidenceRowsOf(context.database, mine.attemptId)).toHaveLength(1);
      expect(await evidenceRowsOf(context.database, theirs.attemptId)).toHaveLength(1);
    });

    it('never writes the raw idempotency key', async () => {
      const seeded = await seed('rawkey');
      const key = `app7-b05-secret-${Date.now()}`;
      await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        idempotencyKey: key,
      });

      const { rows } = await context.database.client.db.execute<{ total: string }>(sql`
        select count(*)::text as total from idempotency_records
         where scope_key like ${`%${key}%`} or result::text like ${`%${key}%`}
      `);
      expect(rows[0]?.total).toBe('0');
    });
  });

  describe('five per attempt, decided under the attempt row lock', () => {
    it('accepts the fifth and refuses the sixth', async () => {
      const seeded = await seed('quota');
      for (let index = 0; index < 5; index += 1) {
        const response = await uploadEvidence(context, {
          token: seeded.token,
          attemptId: seeded.attemptId,
          bytes: pngBytes(0x80 + index, 64),
        });
        expect(response.status).toBe(202);
      }
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toHaveLength(5);

      const sixth = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        bytes: pngBytes(0x99, 64),
      });
      expect(sixth.status).toBe(409);
      expect((sixth.body as ErrorBody).code).toBe('EVIDENCE_QUOTA_REACHED');
      // The database accepts a sixth row on purpose (`APP7-DB01`); the bound is
      // this application's, so five is what is actually there.
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toHaveLength(5);
    });

    it('gives each attempt its own independent quota', async () => {
      const seeded = await seed('perattemptquota');
      for (let index = 0; index < 5; index += 1) {
        await uploadEvidence(context, {
          token: seeded.token,
          attemptId: seeded.attemptId,
          bytes: pngBytes(0xa0 + index, 64),
        });
      }
      const retryId = await openAttempt(context.app, seeded);
      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: retryId,
        bytes: pngBytes(0xb0, 64),
      });

      expect(response.status).toBe(202);
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toHaveLength(5);
      expect(await evidenceRowsOf(context.database, retryId)).toHaveLength(1);
    });

    it('ends at five when two uploads race from four', async () => {
      const seeded = await seed('quotarace');
      for (let index = 0; index < 4; index += 1) {
        await uploadEvidence(context, {
          token: seeded.token,
          attemptId: seeded.attemptId,
          bytes: pngBytes(0xc0 + index, 64),
        });
      }
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toHaveLength(4);

      // Two independent HTTP requests, each on its own pool connection and its
      // own transaction. Nothing is serialised through a single connection.
      const [first, second] = await Promise.all([
        uploadEvidence(context, {
          token: seeded.token,
          attemptId: seeded.attemptId,
          bytes: pngBytes(0xd1, 64),
        }),
        uploadEvidence(context, {
          token: seeded.token,
          attemptId: seeded.attemptId,
          bytes: pngBytes(0xd2, 64),
        }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([202, 409]);
      const loser = first.status === 409 ? first : second;
      expect((loser.body as ErrorBody).code).toBe('EVIDENCE_QUOTA_REACHED');
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toHaveLength(5);
    });
  });

  describe('nothing this surface does moves money', () => {
    it('leaves attempt, obligation and order state exactly as they were', async () => {
      const seeded = await seed('nostatechange');
      const before = await paymentState(seeded);

      await uploadEvidence(context, { token: seeded.token, attemptId: seeded.attemptId });
      await status(seeded.token, seeded.attemptId);

      expect(await paymentState(seeded)).toEqual(before);
    });

    it('writes no reconciliation and no provider event, ever', async () => {
      const seeded = await seed('noevidenceofmoney');
      const assetsBefore = await customerUploadAssetCount(context.database);

      await uploadEvidence(context, { token: seeded.token, attemptId: seeded.attemptId });

      const { rows } = await context.database.client.db.execute<{
        reconciliations: string;
        provider_events: string;
        refunds: string;
      }>(sql`
        select (select count(*)::text from payment_reconciliations) as reconciliations,
               (select count(*)::text from payment_provider_events) as provider_events,
               (select count(*)::text from refunds) as refunds
      `);
      expect(rows[0]).toEqual({ reconciliations: '0', provider_events: '0', refunds: '0' });
      expect(await customerUploadAssetCount(context.database)).toBe(assetsBefore + 1);
    });
  });

  describe('append-only: there is nothing to remove evidence with', () => {
    it.each([['delete'], ['patch'], ['put']])('refuses %s on the evidence route', async (verb) => {
      const seeded = await seed(`verb${verb}`);
      await uploadEvidence(context, { token: seeded.token, attemptId: seeded.attemptId });
      const [row] = await evidenceRowsOf(context.database, seeded.attemptId);

      const method = verb as 'delete' | 'patch' | 'put';
      for (const path of [
        EVIDENCE_ROUTES.upload,
        `${EVIDENCE_ROUTES.upload}/${row?.id as string}`,
      ]) {
        const response = await context.http[method](path).send({
          accessToken: seeded.token,
          attemptId: seeded.attemptId,
        });
        expect(response.status).toBe(404);
      }

      // And the row is still there.
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toHaveLength(1);
    });

    it('has no content route to serve a byte from', async () => {
      const seeded = await seed('nocontent');
      await uploadEvidence(context, { token: seeded.token, attemptId: seeded.attemptId });
      const [row] = await evidenceRowsOf(context.database, seeded.attemptId);

      for (const path of [
        `${EVIDENCE_ROUTES.upload}/${row?.id as string}/content`,
        `${EVIDENCE_ROUTES.upload}/${row?.asset_id as string}/content`,
        `${EVIDENCE_ROUTES.upload}/${row?.id as string}`,
      ]) {
        const response = await context.http.post(path).send({ accessToken: seeded.token });
        expect(response.status).toBe(404);
      }
    });
  });
});
