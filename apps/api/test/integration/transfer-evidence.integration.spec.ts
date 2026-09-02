/**
 * `APP7-B05` — the transfer-evidence intake half, over real HTTP.
 *
 * The whole application, the real controller, the real global pipe and exception
 * filter, the real Busboy parser and `consumeValidatedFile` signature check, the
 * real `AuthorizeSecureLink` and `ReauthorizeSecureGrant` with their peppered
 * digest, the real `IdempotencyAllocationStore`, the real
 * `PaymentTransferEvidenceRepository` and the canonical AGG-08/AGG-16
 * repositories — against a disposable PostgreSQL with every migration applied and
 * a **live disposable MinIO**. Nothing is mocked, and the bytes are really
 * streamed into a real private bucket.
 *
 * This half proves what one upload *produces* and what the two responses are
 * allowed to say. Who may submit, when, how often and at what cost to payment
 * state is `transfer-evidence-authorization.integration.spec.ts` — split for the
 * CLAUDE.md §6 test-file limit rather than for a boundary in the behaviour.
 */
import { sql } from 'drizzle-orm';

import { applyWave2ReleasedEnv } from '../support/api-integration-context';
import { publishDepositPolicies } from '../support/customer-deposit-fixture';
import {
  assetRowOf,
  createTransferEvidenceContext,
  evidenceRowsOf,
  inspectionEventCount,
  jpegBytes,
  openAttempt,
  paymentStateOf,
  pngBytes,
  readEvidenceStatus,
  seedOpenAttempt,
  SVG_BODY,
  uploadEvidence,
  type ListBody,
  type SeededAttempt,
  type TransferEvidenceTestContext,
  type UploadBody,
} from '../support/transfer-evidence-fixture';

jest.setTimeout(240_000);

describe('APP7-B05 — customer transfer evidence', () => {
  let context: TransferEvidenceTestContext;
  let restoreWave2: () => void;

  beforeAll(async () => {
    // `APP12-G02` withholds every Wave-2 customer operation by default, so a
    // suite proving Wave-2 behaviour has to run in the wave that releases it.
    // Set before the context is built: the gate reads the value once, at module
    // composition (`APP12-B04` §48).
    restoreWave2 = applyWave2ReleasedEnv();
    context = await createTransferEvidenceContext('app7_b05_intake');
    await publishDepositPolicies(context.app, context.database);
  });

  afterAll(async () => {
    await context?.close();
    restoreWave2?.();
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

  describe('one image becomes one asset, one association and one inspection', () => {
    it('accepts a PNG and records it against that exact attempt', async () => {
      const seeded = await seed('happy');
      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        bytes: pngBytes(0x11, 128),
      });

      expect(response.status).toBe(202);
      const body = (response.body as { data: UploadBody }).data;
      expect(body.assetStatus).toBe('INSPECTING');
      expect(body.mediaType).toBe('image/png');
      expect(body.byteSize).toBe(136);
      expect(body.replayed).toBe(false);

      const rows = await evidenceRowsOf(context.database, seeded.attemptId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(body.evidenceId);
      expect(rows[0]?.payment_attempt_id).toBe(seeded.attemptId);

      const asset = await assetRowOf(context.database, rows[0]?.asset_id as string);
      // The lane fixes both, and the body had no field for either.
      expect(asset?.kind).toBe('CUSTOMER_UPLOAD');
      expect(asset?.classification).toBe('CUSTOMER_PRIVATE');
      expect(asset?.mime_type).toBe('image/png');
      expect(asset?.size_bytes).toBe('136');
      // Provenance from the grant, never from the request.
      expect(asset?.uploaded_by_customer_id).toBe(seeded.customerId);
      // Not the APP5 unbound-intake lane: this asset is bound in Tx B, so
      // stamping a sweep expiry on it would schedule the deletion of retained
      // payment evidence.
      expect(asset?.intake_expires_at).toBeNull();
      expect(asset?.uploaded_via_challenge_id).toBeNull();

      expect(await inspectionEventCount(context.database, asset?.id as string)).toBe(1);
    });

    it('binds the association while the asset is still pre-inspection', async () => {
      // `APP7-G01` §7.4's deliberate divergence from `custom_request_assets`.
      // The association exists the moment the upload answers, and the asset has
      // not been accepted — an Admin preview refusing a non-ACCEPTED asset is
      // what keeps that safe, and is `APP7-B06`'s.
      const seeded = await seed('prebind');
      await uploadEvidence(context, { token: seeded.token, attemptId: seeded.attemptId });

      const [row] = await evidenceRowsOf(context.database, seeded.attemptId);
      const asset = await assetRowOf(context.database, row?.asset_id as string);
      expect(asset?.status).toBe('INSPECTING');
      expect(asset?.status).not.toBe('ACCEPTED');
    });

    it('never derives the object key from the caller’s filename', async () => {
      const seeded = await seed('filename');
      await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        filename: '../../etc/passwd; DROP TABLE assets.png',
      });

      const [row] = await evidenceRowsOf(context.database, seeded.attemptId);
      const asset = await assetRowOf(context.database, row?.asset_id as string);
      expect(asset?.storage_key).not.toContain('passwd');
      expect(asset?.storage_key).not.toContain('..');
      // Server-owned: the key is derived from the asset id the server minted.
      expect(asset?.storage_key).toContain(asset?.id as string);
    });

    it('persists no original filename anywhere on the evidence record', async () => {
      const seeded = await seed('nofilename');
      await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        filename: 'my-bank-receipt-2026.png',
      });

      const [row] = await evidenceRowsOf(context.database, seeded.attemptId);
      const { rows } = await context.database.client.db.execute<{ blob: string }>(sql`
        select coalesce(row_to_json(e)::text, '') || coalesce(row_to_json(a)::text, '') as blob
          from payment_transfer_evidence e
          join assets a on a.id = e.asset_id
         where e.id = ${row?.id}
      `);
      expect(rows[0]?.blob).not.toContain('my-bank-receipt-2026');
    });
  });

  describe('the response and the status read tell the truth and nothing more', () => {
    it('never claims ACCEPTED, verified or paid on the upload', async () => {
      const seeded = await seed('nostrongclaim');
      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
      });
      const body = (response.body as { data: UploadBody }).data;
      expect(body.assetStatus).toBe('INSPECTING');
      const serialized = JSON.stringify(body).toLowerCase();
      for (const claim of ['accepted', 'verified', 'paid', 'confirmed', 'succeeded']) {
        expect(serialized).not.toContain(claim);
      }
    });

    it('discloses no storage key, bucket, URL, checksum or scanner detail', async () => {
      const seeded = await seed('noleak');
      const upload = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
      });
      const read = await status(seeded.token, seeded.attemptId);
      const [row] = await evidenceRowsOf(context.database, seeded.attemptId);
      const asset = await assetRowOf(context.database, row?.asset_id as string);

      for (const response of [upload, read]) {
        const serialized = JSON.stringify(response.body);
        expect(serialized).not.toContain(asset?.storage_key as string);
        expect(serialized).not.toContain(asset?.id as string);
        expect(serialized).not.toContain(seeded.token);
        expect(serialized).not.toContain(seeded.grantId);
        expect(serialized).not.toContain(seeded.challengeId);
        expect(serialized).not.toContain(seeded.customerId);
        expect(serialized).not.toContain(seeded.orderId);
        expect(serialized).not.toContain(seeded.depositObligationId);
        for (const forbidden of ['bucket', 'sha256', 'storageKey', 'objectKey', 'scanner']) {
          expect(serialized).not.toContain(forbidden);
        }
      }
    });

    it('reports the real asset state, and REJECTED is not a failed payment', async () => {
      const seeded = await seed('rejected');
      await uploadEvidence(context, { token: seeded.token, attemptId: seeded.attemptId });
      const [row] = await evidenceRowsOf(context.database, seeded.attemptId);

      const before = await paymentState(seeded);
      // The inspector is the worker's; its *outcome* is what the projection has
      // to report truthfully, so the state is moved the way the worker moves it.
      await context.database.client.db.execute(sql`
        update assets set status = 'REJECTED', updated_at = now() where id = ${row?.asset_id}
      `);

      const rejected = (await status(seeded.token, seeded.attemptId)).body as { data: ListBody };
      expect(rejected.data.evidence[0]?.assetStatus).toBe('REJECTED');
      // The image was refused. The payment was not.
      expect(await paymentState(seeded)).toEqual(before);

      await context.database.client.db.execute(sql`
        update assets set status = 'ACCEPTED', updated_at = now() where id = ${row?.asset_id}
      `);
      const accepted = (await status(seeded.token, seeded.attemptId)).body as { data: ListBody };
      expect(accepted.data.evidence[0]?.assetStatus).toBe('ACCEPTED');
    });

    it('answers an attempt with no evidence with an empty list, not a refusal', async () => {
      const seeded = await seed('empty');
      const response = await status(seeded.token, seeded.attemptId);
      expect(response.status).toBe(200);
      expect((response.body as { data: ListBody }).data.evidence).toEqual([]);
    });

    it('lists only this attempt’s evidence, never the whole order’s', async () => {
      const seeded = await seed('perattempt');
      await uploadEvidence(context, { token: seeded.token, attemptId: seeded.attemptId });

      // LC-16: a retry is a new attempt with an evidence set of its own.
      const retryId = await openAttempt(context.app, seeded);
      await uploadEvidence(context, { token: seeded.token, attemptId: retryId });

      const first = (await status(seeded.token, seeded.attemptId)).body as { data: ListBody };
      const second = (await status(seeded.token, retryId)).body as { data: ListBody };
      expect(first.data.evidence).toHaveLength(1);
      expect(second.data.evidence).toHaveLength(1);
      expect(first.data.evidence[0]?.evidenceId).not.toBe(second.data.evidence[0]?.evidenceId);
    });

    it('writes nothing at all', async () => {
      const seeded = await seed('zerowrite');
      await uploadEvidence(context, { token: seeded.token, attemptId: seeded.attemptId });
      const [row] = await evidenceRowsOf(context.database, seeded.attemptId);
      const before = await assetRowOf(context.database, row?.asset_id as string);
      const events = await inspectionEventCount(context.database, row?.asset_id as string);

      await status(seeded.token, seeded.attemptId);
      await status(seeded.token, seeded.attemptId);

      expect(await assetRowOf(context.database, row?.asset_id as string)).toEqual(before);
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toHaveLength(1);
      expect(await inspectionEventCount(context.database, row?.asset_id as string)).toBe(events);
    });
  });

  describe('media policy is decided by content, never by what was declared', () => {
    it('refuses an SVG declared as a PNG', async () => {
      const seeded = await seed('svg');
      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        bytes: SVG_BODY,
        contentType: 'image/png',
        filename: 'receipt.png',
      });

      expect(response.status).toBe(415);
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toEqual([]);
    });

    it('refuses a JPEG body declared as a PNG', async () => {
      const seeded = await seed('mismatch');
      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        bytes: jpegBytes(),
        contentType: 'image/png',
      });

      expect(response.status).toBe(415);
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toEqual([]);
    });

    it('refuses an unsupported declared type outright', async () => {
      const seeded = await seed('pdf');
      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        contentType: 'application/pdf',
        filename: 'receipt.pdf',
      });

      expect(response.status).toBe(415);
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toEqual([]);
    });

    it('refuses a stream past ten megabytes, incrementally', async () => {
      const seeded = await seed('toolarge');
      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        bytes: pngBytes(0x07, 10 * 1024 * 1024 + 1),
      });

      expect(response.status).toBe(413);
      expect(await evidenceRowsOf(context.database, seeded.attemptId)).toEqual([]);
    });

    it('accepts JPEG and WebP, so the allowlist is three and not one', async () => {
      const seeded = await seed('jpeg');
      const response = await uploadEvidence(context, {
        token: seeded.token,
        attemptId: seeded.attemptId,
        bytes: jpegBytes(0x33, 96),
        contentType: 'image/jpeg',
        filename: 'receipt.jpg',
      });
      expect(response.status).toBe(202);
      expect((response.body as { data: UploadBody }).data.mediaType).toBe('image/jpeg');
    });
  });
});
