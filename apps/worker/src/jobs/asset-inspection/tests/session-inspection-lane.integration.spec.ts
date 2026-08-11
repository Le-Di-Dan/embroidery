/**
 * The Design Session inspection lane, against a live stack (`APP3-S06` §10.3).
 *
 * This suite exists because of a defect `APP3-B06C` found by driving the real
 * pipeline instead of seeding its end state: nothing inspected the
 * `CUSTOMER_UPLOAD` lane at all, so every Session upload's inspection job raised
 * a contradiction, dead-lettered, and left the Asset in `INSPECTING` forever
 * (`FU-APP3-B06C-SESSION-LANE-INSPECTION-01`). The delivery route refused it
 * correctly, which made the whole customer-upload capability a closed and empty
 * loop.
 *
 * So the assertions here are deliberately about *effects on real rows*, not
 * about a use case having been called:
 *
 * - a valid Session raster reaches `ACCEPTED`, which is the state `APP3-W01C`
 *   is waiting for and `APP3-B06C` requires;
 * - it produces **no** derivative, because the Session lane's editor-safe output
 *   is `APP3-W01A`'s `NORMALIZED` and nothing here may write a second producer's
 *   kind, nor a `THUMBNAIL`/`CATALOG_PREVIEW` of a private customer image;
 * - a corrupt raster that a signature check cannot catch reaches `REJECTED`;
 * - the pair is matched, so a `CUSTOMER_UPLOAD` carrying the wrong
 *   classification is still refused.
 *
 * The catalog lane's own regression stays in its own accepted suites; the one
 * assertion repeated here is the one that would silently break if the lane
 * parameterization leaked — that a `CATALOG_MEDIA` asset still writes both
 * catalogue derivatives.
 */
import { sql } from '@embroidery/database';

import {
  startAssetInspectionContext,
  type AssetInspectionContext,
  type SeededAsset,
} from './asset-inspection-context';
import { jpeg, pngWithAlpha, staticWebp, truncatedPng } from './image-fixtures';

interface StatusRow extends Record<string, unknown> {
  status: string;
}

interface DerivativeRow extends Record<string, unknown> {
  kind: string;
  status: string;
}

interface InspectionRow extends Record<string, unknown> {
  outcome: string;
}

/** Exactly what `APP3-B06B` writes for an anonymous Session upload. */
const SESSION_LANE = { kind: 'CUSTOMER_UPLOAD', classification: 'CUSTOMER_PRIVATE' } as const;

describe('asset inspection — Design Session lane (live PostgreSQL + MinIO)', () => {
  let context: AssetInspectionContext;

  beforeAll(async () => {
    context = await startAssetInspectionContext('s06-session-lane');
  }, 600_000);

  afterAll(async () => {
    await context?.close();
  }, 300_000);

  function status(assetId: string): Promise<StatusRow[]> {
    return context.query<StatusRow>(sql`select status from assets where id = ${assetId}`);
  }

  function derivatives(assetId: string): Promise<DerivativeRow[]> {
    return context.query<DerivativeRow>(sql`
      select kind, status from asset_derivatives where asset_id = ${assetId} order by kind
    `);
  }

  function inspections(assetId: string): Promise<InspectionRow[]> {
    return context.query<InspectionRow>(sql`
      select outcome from asset_inspections where asset_id = ${assetId} order by id
    `);
  }

  function objects(assetId: string): Promise<readonly { key: string }[]> {
    return context.storage.listObjectsByPrefix({
      bucket: 'DERIVATIVES',
      prefix: `test/derivatives/${assetId}/`,
    });
  }

  function inspect(seeded: SeededAsset, attemptNo = 1): Promise<void> {
    return context.useCase.inspect(
      { assetId: seeded.assetId, attemptNo },
      new AbortController().signal,
    );
  }

  it.each([
    ['PNG', pngWithAlpha],
    ['JPEG', jpeg],
    ['WebP', staticWebp],
  ])(
    'accepts a valid session %s and writes no derivative',
    async (_label, build) => {
      const seeded = await context.seedAsset(await build(300, 200), SESSION_LANE);

      await inspect(seeded);

      // The state `APP3-W01C` retries until it sees, and the only state
      // `APP3-B06C` will deliver bytes for.
      expect(await status(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
      expect(await inspections(seeded.assetId)).toEqual([{ outcome: 'ACCEPTED' }]);
      // No THUMBNAIL, no CATALOG_PREVIEW, and no NORMALIZED: the editor-safe
      // output belongs to `APP3-W01A` and this lane must not pre-empt it.
      expect(await derivatives(seeded.assetId)).toEqual([]);
      expect(await objects(seeded.assetId)).toEqual([]);
    },
    120_000,
  );

  it('rejects a corrupt raster that a signature check cannot catch', async () => {
    // A real PNG signature followed by a truncated stream: `APP3-B06B`'s
    // synchronous intake accepts it, and only an actual decode refuses it.
    const seeded = await context.seedAsset(await truncatedPng(), SESSION_LANE);

    await inspect(seeded);

    expect(await status(seeded.assetId)).toEqual([{ status: 'REJECTED' }]);
    expect(await inspections(seeded.assetId)).toEqual([{ outcome: 'REJECTED' }]);
    expect(await derivatives(seeded.assetId)).toEqual([]);
    expect(await objects(seeded.assetId)).toEqual([]);
  }, 120_000);

  it('replays an already-accepted session asset without writing anything', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(200, 200), SESSION_LANE);
    await inspect(seeded);

    // Redelivery of the same event. The lane owns no derivative, so the replay
    // verification has no key to check and must still succeed rather than
    // report a missing derivative.
    await expect(inspect(seeded, 2)).resolves.toBeUndefined();

    expect(await status(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
    expect(await inspections(seeded.assetId)).toHaveLength(1);
    expect(await derivatives(seeded.assetId)).toEqual([]);
  }, 120_000);

  it('replays an already-rejected session asset', async () => {
    const seeded = await context.seedAsset(await truncatedPng(), SESSION_LANE);
    await inspect(seeded);

    await expect(inspect(seeded, 2)).resolves.toBeUndefined();

    expect(await status(seeded.assetId)).toEqual([{ status: 'REJECTED' }]);
    expect(await inspections(seeded.assetId)).toHaveLength(1);
  }, 120_000);

  it('refuses a customer upload whose classification is not the lane pair', async () => {
    // The lane is matched on the pair. A `CUSTOMER_UPLOAD` marked
    // `PRODUCTION_SENSITIVE` is not a Session upload with an odd label — it is a
    // row no delivered checkpoint can produce, and inspecting it under either
    // lane's privacy assumptions is the mistake the original check prevented.
    const seeded = await context.seedAsset(await pngWithAlpha(200, 200), {
      kind: 'CUSTOMER_UPLOAD',
      classification: 'PRODUCTION_SENSITIVE',
    });

    await expect(inspect(seeded)).rejects.toMatchObject({
      errorClass: 'JOB_INVARIANT_VIOLATION',
    });

    expect(await status(seeded.assetId)).toEqual([{ status: 'INSPECTING' }]);
    expect(await derivatives(seeded.assetId)).toEqual([]);
    expect(await inspections(seeded.assetId)).toEqual([]);
  }, 120_000);

  it('leaves the catalog lane producing both derivatives', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(300, 200), {
      kind: 'CATALOG_MEDIA',
      classification: 'PRODUCTION_SENSITIVE',
    });

    await inspect(seeded);

    expect(await status(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
    expect(await derivatives(seeded.assetId)).toEqual([
      { kind: 'CATALOG_PREVIEW', status: 'READY' },
      { kind: 'THUMBNAIL', status: 'READY' },
    ]);
    expect(await objects(seeded.assetId)).toHaveLength(2);
  }, 120_000);
});
