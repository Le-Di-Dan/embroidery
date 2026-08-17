/**
 * The APP5-E01 fixture universe.
 *
 * Deliberately thin, for the same reason `support/app4/fixture-universe.mjs` is:
 * E01's claim is that the *production* path creates the Customer, the request,
 * its assets, its grant and its transitions, so anything a fixture pre-creates
 * is evidence the run no longer produces. Nothing here writes a
 * `custom_requests` row, a `customer` row, a challenge, an asset or a grant.
 *
 * What it does provide is the **catalog context** APP5's catalog branch needs
 * and that no APP5 checkpoint owns: a published Product under a public Category,
 * one designable placement (Side + Area), and two active Variants. Those are
 * APP2/APP3 facts, and E01 is not the place to re-prove how they are authored —
 * so they are created through the API's **own** repositories, taken from the
 * real in-process `AppModule` graph, rather than by hand-written INSERTs that
 * could write a shape the application never writes.
 *
 * The one exception is the Side's background Asset and its `NORMALIZED`
 * derivative. `findPublicPlacement` requires both to exist in an exact state,
 * and the only production path that produces them is an Admin media upload plus
 * a worker normalization pass — an APP2/APP3 journey, not an APP5 one, and far
 * more machinery than the fact needs. Those two rows are written directly, with
 * a comment naming every column the placement query actually reads, and no
 * object is ever stored behind them: nothing in the APP5 journeys fetches the
 * background bytes.
 *
 * Test-only. Never imported by application code.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { REPO_ROOT } from '../orchestration/config.mjs';

const requireFromApi = createRequire(join(REPO_ROOT, 'apps', 'api', 'package.json'));
const requireFromWorker = createRequire(join(REPO_ROOT, 'apps', 'worker', 'package.json'));

/** Public placement codes. Free values — the fixture names its own placement. */
export const FIXTURE_PLACEMENT = Object.freeze({ sideCode: 'front', areaCode: 'nguc-trai' });

/**
 * A real raster, generated rather than committed.
 *
 * The inspection lane APP5 uploads travel on (`CUSTOMER_UPLOAD` +
 * `CUSTOMER_PRIVATE`) writes no derivative, so it verifies the file by decoding
 * every pixel under `failOn: 'warning'`. A hand-built byte array would pass a
 * header check and fail that one, so the fixture asks the same `sharp` the
 * worker decodes with to produce the image — which also means the bytes are a
 * genuine JPEG rather than something only this suite believes is one.
 */
export async function createEvidenceImage({ width = 64, height = 64 } = {}) {
  const sharp = requireFromWorker('sharp');
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 32, g: 96, b: 160 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { buffer, name: 'app5-e01-evidence.jpg', mimeType: 'image/jpeg' };
}

/**
 * Creates the published catalog context the catalog branch submits against.
 *
 * Everything is created inside one transaction because `addVariant`,
 * `createSide` and `createArea` are all `@requiresTransaction`: they are steps of
 * an authoring operation that owns its own boundary in production, and calling
 * them outside one would be using them in a way no caller does.
 *
 * @param {object} runtime the APP4-E01 runtime (its `apiContext` is the real graph)
 * @param {{ runId: string }} options
 */
export async function createApp5CatalogFixture(runtime, { runId }) {
  const { newId, executeRaw, sql } = requireFromApi('@embroidery/database');
  const { TransactionManager, DATABASE_CONNECTION } = requireFromApi('@embroidery/persistence');
  const { CATEGORY_REPOSITORY, PRODUCT_REPOSITORY } = requireFromApi(
    './dist/modules/catalog/domain/repositories/product.repository.js',
  );
  const { PRODUCT_PLACEMENT_REPOSITORY } = requireFromApi(
    './dist/modules/catalog/domain/repositories/product-placement.repository.js',
  );

  const context = runtime.apiContext;
  const transactions = context.get(TransactionManager);
  const categories = context.get(CATEGORY_REPOSITORY);
  const products = context.get(PRODUCT_REPOSITORY);
  const placement = context.get(PRODUCT_PLACEMENT_REPOSITORY);
  const database = context.get(DATABASE_CONNECTION).database;

  // A run-scoped suffix, so a fixture left behind by a crashed run can never
  // collide with this one on `uq_products__slug`. Not `newId().slice(...)`:
  // UUIDv7 rows minted in the same millisecond share their leading characters.
  const suffix = runId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10);
  const categoryId = newId();
  const productId = newId();
  const sideId = newId();
  const areaId = newId();
  const backgroundAssetId = newId();
  const derivativeId = newId();
  const productSlug = `ao-thun-e01-${suffix}`;
  const variantIds = [];

  await transactions.runInTransaction(async () => {
    // The Side's background. Only the columns `findPublicPlacement`'s
    // `editorSafeBackgroundMetadata()` sub-select reads are meaningful here:
    // the Asset must be CATALOG_MEDIA / PRODUCTION_SENSITIVE / ACCEPTED and not
    // deleted, and the derivative must be a READY, unwatermarked NORMALIZED row
    // carrying a storage key, both dimensions and an `image/webp` media type.
    await executeRaw(
      database,
      sql`
        INSERT INTO assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
        VALUES (
          ${backgroundAssetId}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
          ${`e2e/app5-e01/${suffix}/side-background.webp`}, 'image/webp', ${1024}, 'ACCEPTED'
        )
      `,
    );
    await executeRaw(
      database,
      sql`
        INSERT INTO asset_derivatives
          (id, asset_id, kind, status, storage_key, is_watermarked, width_px, height_px, media_type, byte_size)
        VALUES (
          ${derivativeId}, ${backgroundAssetId}, 'NORMALIZED', 'READY',
          ${`e2e/app5-e01/${suffix}/side-background-normalized.webp`}, false,
          ${1200}, ${1600}, 'image/webp', ${1024}
        )
      `,
    );

    await categories.create({
      id: categoryId,
      name: 'Quần áo',
      slug: `quan-ao-e01-${suffix}`,
      displayOrder: 0,
    });
    await categories.changeStatus(categoryId, 'PUBLISHED');

    await products.create({
      id: productId,
      categoryId,
      name: 'Áo thun cotton E01',
      slug: productSlug,
      // Publication requires a real price; `0` is the draft "unset" marker.
      basePriceAmount: '250000',
      displayOrder: 0,
    });
    await products.changeStatus(productId, 'PUBLISHED');

    for (const variant of [
      { colorName: 'Trắng', sizeLabel: 'M', displayOrder: 0 },
      { colorName: 'Đen', sizeLabel: 'L', displayOrder: 1 },
    ]) {
      const id = newId();
      await products.addVariant({ id, productId, ...variant });
      variantIds.push(id);
    }

    await placement.createSide({
      id: sideId,
      productId,
      code: FIXTURE_PLACEMENT.sideCode,
      name: 'Mặt trước',
      displayOrder: 0,
      backgroundAssetId,
      imageWidthPx: 1200,
      imageHeightPx: 1600,
      physicalWidthMm: '400.00',
      physicalHeightMm: '533.33',
      pxPerMm: '3.000',
    });
    await placement.createArea({
      id: areaId,
      productSideId: sideId,
      code: FIXTURE_PLACEMENT.areaCode,
      name: 'Ngực trái',
      displayOrder: 0,
      boundXPx: '300.00',
      boundYPx: '400.00',
      boundWidthPx: '300.00',
      boundHeightPx: '300.00',
      maxWidthMm: '100.00',
      maxHeightMm: '100.00',
    });
  });

  return {
    productId,
    productSlug,
    sideCode: FIXTURE_PLACEMENT.sideCode,
    areaCode: FIXTURE_PLACEMENT.areaCode,
    variantIds,
    /** Safe to print: public codes and ids of store-owned catalog rows. */
    safeMetadata: { productSlug, variantCount: variantIds.length },
  };
}
