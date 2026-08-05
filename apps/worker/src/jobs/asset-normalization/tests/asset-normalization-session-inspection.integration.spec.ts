/**
 * Session normalization arriving before inspection finished (`APP3-W01C`).
 *
 * `APP3-G08` measured the defect this closes: a Session upload commits its
 * association and its inspection request in one transaction, so a normalization
 * attempt can genuinely observe an Asset that is still `INSPECTING` — and the
 * delivered worker answered that with a terminal verdict. Every session upload
 * that lost the race would have ended with no derivative, no retry and nothing
 * surfaced to anyone.
 *
 * So the question these cases answer is not "does it retry" but "does the same
 * event, unchanged and un-reproduced, converge on exactly one authoritative
 * derivative once inspection is done" — and, just as importantly, that nothing
 * durable is left behind by the attempts that waited.
 *
 * Live PostgreSQL and MinIO: the claim, the partial unique index and the object
 * are the things at risk, and a double would prove none of them.
 */
import { sql } from '@embroidery/database';

import { pngWithAlpha } from '../../asset-inspection/tests/image-fixtures';
import {
  startAssetNormalizationContext,
  type AssetNormalizationContext,
} from './asset-normalization-context';

interface DerivativeRow extends Record<string, unknown> {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly storage_key: string | null;
  readonly width_px: number | null;
  readonly height_px: number | null;
}

describe('Session normalization while inspection is in progress (live PostgreSQL + MinIO)', () => {
  let ctx: AssetNormalizationContext;

  beforeAll(async () => {
    ctx = await startAssetNormalizationContext('app3w01c-inspection-retry');
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  }, 300_000);

  const rows = (assetId: string) =>
    ctx.query<DerivativeRow>(
      sql`select id, kind, status, storage_key, width_px, height_px from asset_derivatives
           where asset_id = ${assetId} order by kind, id`,
    );

  const events = (assetId: string) =>
    ctx.query<{ readonly count: string }>(
      sql`select count(*)::text as count from outbox_events
           where event_type = 'asset.normalization.requested'
             and payload->>'assetId' = ${assetId}`,
    );

  const objects = (assetId: string) =>
    ctx.storage.listObjectsByPrefix({
      bucket: 'DERIVATIVES',
      prefix: `test/derivatives/${assetId}/`,
    });

  const run = (assetId: string, associationId: string) =>
    ctx.useCase.normalize(
      {
        schemaVersion: 1,
        assetId,
        normalizationPolicyVersion: 1,
        associationRef: { kind: 'DESIGN_SESSION_ASSET', designSessionAssetId: associationId },
      },
      new AbortController().signal,
    );

  /** A Session upload exactly as `APP3-B06B` will commit one: still `INSPECTING`. */
  async function seedInspectingSessionUpload() {
    const image = await pngWithAlpha(240, 180);
    const { assetId } = await ctx.seedAsset(image, {
      status: 'INSPECTING',
      kind: 'CUSTOMER_UPLOAD',
      classification: 'CUSTOMER_PRIVATE',
    });
    const associationId = await ctx.seedSessionAssociation(assetId);
    await ctx.appendEvent(assetId, {
      kind: 'DESIGN_SESSION_ASSET',
      designSessionAssetId: associationId,
    });
    return { assetId, associationId };
  }

  const setAssetStatus = (assetId: string, status: string) =>
    ctx.query(sql`update assets set status = ${status} where id = ${assetId}`);

  describe('the attempt that arrives too early', () => {
    it('fails retryably instead of recording a verdict', async () => {
      const { assetId, associationId } = await seedInspectingSessionUpload();
      await expect(run(assetId, associationId)).rejects.toMatchObject({
        name: 'WorkerJobError',
        errorClass: 'JOB_TRANSIENT_FAILURE',
      });
    });

    it('leaves no derivative row at all — not PROCESSING, not FAILED, not READY', async () => {
      // The refusal happens before the claim, so the next attempt starts clean
      // rather than taking over a row this one abandoned.
      const { assetId, associationId } = await seedInspectingSessionUpload();
      await expect(run(assetId, associationId)).rejects.toThrow();
      expect(await rows(assetId)).toEqual([]);
    });

    it('writes no object', async () => {
      const { assetId, associationId } = await seedInspectingSessionUpload();
      await expect(run(assetId, associationId)).rejects.toThrow();
      expect(await objects(assetId)).toHaveLength(0);
    });

    it('appends no second normalization event', async () => {
      const { assetId, associationId } = await seedInspectingSessionUpload();
      await expect(run(assetId, associationId)).rejects.toThrow();
      expect((await events(assetId))[0]?.count).toBe('1');
    });

    it('does not consume the request: repeated early attempts stay retryable', async () => {
      const { assetId, associationId } = await seedInspectingSessionUpload();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await expect(run(assetId, associationId)).rejects.toMatchObject({
          errorClass: 'JOB_TRANSIENT_FAILURE',
        });
      }
      expect(await rows(assetId)).toEqual([]);
    });
  });

  describe('convergence once inspection completes', () => {
    it('produces exactly one READY NORMALIZED derivative from the same event', async () => {
      const { assetId, associationId } = await seedInspectingSessionUpload();
      await expect(run(assetId, associationId)).rejects.toThrow();

      await setAssetStatus(assetId, 'ACCEPTED');
      const result = await run(assetId, associationId);

      expect(result.outcome).toBe('NORMALIZED');
      const derivatives = await rows(assetId);
      expect(derivatives).toHaveLength(1);
      expect(derivatives[0]).toMatchObject({ kind: 'NORMALIZED', status: 'READY' });
      expect(derivatives[0]?.width_px).toBe(240);
      expect(derivatives[0]?.height_px).toBe(180);
      expect(await objects(assetId)).toHaveLength(1);
    });

    it('needed no second producer event to get there', async () => {
      const { assetId, associationId } = await seedInspectingSessionUpload();
      await expect(run(assetId, associationId)).rejects.toThrow();
      await setAssetStatus(assetId, 'ACCEPTED');
      await run(assetId, associationId);
      expect((await events(assetId))[0]?.count).toBe('1');
    });

    it('is idempotent afterwards, as a duplicate delivery would be', async () => {
      const { assetId, associationId } = await seedInspectingSessionUpload();
      await expect(run(assetId, associationId)).rejects.toThrow();
      await setAssetStatus(assetId, 'ACCEPTED');
      await run(assetId, associationId);

      const again = await run(assetId, associationId);
      expect(again.outcome).toBe('ALREADY_NORMALIZED');
      expect(await rows(assetId)).toHaveLength(1);
      expect(await objects(assetId)).toHaveLength(1);
    });
  });

  describe('convergence when inspection refuses the file', () => {
    it('becomes terminal and produces no derivative', async () => {
      const { assetId, associationId } = await seedInspectingSessionUpload();
      await expect(run(assetId, associationId)).rejects.toThrow();

      await setAssetStatus(assetId, 'REJECTED');
      const result = await run(assetId, associationId);

      expect(result).toMatchObject({
        outcome: 'REJECTED',
        code: 'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
      });
      expect(await rows(assetId)).toEqual([]);
      expect(await objects(assetId)).toHaveLength(0);
    });
  });

  describe('what the retry never bypasses', () => {
    it('is terminal when the association was removed while it waited', async () => {
      const { assetId, associationId } = await seedInspectingSessionUpload();
      await expect(run(assetId, associationId)).rejects.toThrow();

      await ctx.query(sql`delete from design_session_assets where id = ${associationId}`);
      await setAssetStatus(assetId, 'ACCEPTED');

      expect(await run(assetId, associationId)).toMatchObject({
        outcome: 'REJECTED',
        code: 'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
      });
      expect(await rows(assetId)).toEqual([]);
    });

    it('retries rather than reusing an existing READY while the Asset is still inspecting', async () => {
      // W01A's rule is that bytes are never an answer on their own. `APP3-W01C`
      // must not weaken it into "bytes exist, so stop asking".
      const { assetId, associationId } = await seedInspectingSessionUpload();
      await setAssetStatus(assetId, 'ACCEPTED');
      await run(assetId, associationId);
      expect(await rows(assetId)).toHaveLength(1);

      await setAssetStatus(assetId, 'INSPECTING');
      await expect(run(assetId, associationId)).rejects.toMatchObject({
        errorClass: 'JOB_TRANSIENT_FAILURE',
      });

      // The winner's row and bytes are untouched by the attempt that waited.
      const derivatives = await rows(assetId);
      expect(derivatives).toHaveLength(1);
      expect(derivatives[0]).toMatchObject({ status: 'READY' });
      expect(await objects(assetId)).toHaveLength(1);
    });

    it('leaves a Product Side background terminal while its Asset is inspecting', async () => {
      // The narrowing, proved against the live schema rather than a double.
      const image = await pngWithAlpha(120, 90);
      const { assetId } = await ctx.seedAsset(image, { status: 'INSPECTING' });
      const sideId = await ctx.seedProductSide(assetId);

      const result = await ctx.useCase.normalize(
        {
          schemaVersion: 1,
          assetId,
          normalizationPolicyVersion: 1,
          associationRef: { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: sideId },
        },
        new AbortController().signal,
      );

      expect(result).toMatchObject({
        outcome: 'REJECTED',
        code: 'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
      });
    });
  });
});
