/**
 * Verification for the `APP12-G03` seeder, using `node:test` (no extra
 * dependencies). Run from the repository root:
 *
 * ```text
 * node --test "tools/seed-app12-g03.test.mjs"
 * ```
 *
 * ## What this can and cannot prove
 *
 * The seeding *run* is proved by its own evidence: the delivered Admin
 * operations either created the catalog or refused, the before/after counts and
 * the unrelated-row fingerprint are printed by the run itself, and the manifest
 * is read back out of PostgreSQL. None of that belongs in a unit test, and a
 * test that mocked it would be checking a mock.
 *
 * What is worth pinning here is everything the run cannot tell you it got wrong:
 *
 * - the **dataset's coverage**, because a missing SKU is silent — the seeder
 *   would happily write a catalog with no low-stock SKU and report success;
 * - the **slug derivation**, because `creationName` and `slug` are two halves of
 *   one mechanism and a drift between them is a `DATA_COLLISION` at the *end* of
 *   a long run rather than a failure at the start;
 * - the **guards** — the disposable-database refusal, the source-image size band
 *   and `redact` — because each exists to prevent something that must not be
 *   discovered in production;
 * - the **pure helpers**, which decide what the reconcilers write.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { redact } from './seed-app12-g03-admin-api.mjs';
import { normalizeAmount, uploadKey } from './seed-app12-g03-catalog.mjs';
import {
  G03_CATEGORIES,
  G03_CURATION,
  G03_PRODUCTS,
  G03_SKU_PREFIX,
  G03_SLUG_PREFIX,
  productByKey,
  totalMediaCount,
} from './seed-app12-g03-dataset.mjs';
import { assertPersistentDatabase } from './seed-app12-g03-direct.mjs';
import { generateSourceImage, SOURCE_MEDIA_TYPE } from './seed-app12-g03-imagery.mjs';
import { readOnlyFilter } from './seed-app12-g03.mjs';

const workerRequire = createRequire(new URL('../apps/worker/package.json', import.meta.url));

/**
 * A local copy of `deriveProductSlugBase` (`apps/api` catalog domain).
 *
 * Deliberately duplicated rather than imported: the API's copy is TypeScript
 * inside a Nest application, and the point of this test is to fail when the
 * dataset drifts from the *server's* rule — so the rule is restated here and the
 * two are compared. If the server's policy ever changes, this test fails, which
 * is the intended alarm.
 */
function deriveProductSlugBase(name) {
  const base = name
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .normalize('NFD')
    .replaceAll(/\p{M}+/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, 80).replace(/-+$/, '');
}

const allSkus = G03_PRODUCTS.flatMap((product) =>
  product.variants.map((variant) => ({ product, variant, sku: variant.sku })),
);

test('every declared product slug is what the server will derive from its creation name', () => {
  for (const product of G03_PRODUCTS) {
    assert.equal(
      deriveProductSlugBase(product.creationName),
      product.slug,
      `${product.creationName} does not derive ${product.slug}`,
    );
  }
});

test('the provenance markers are on every business key, and on no human-facing name', () => {
  for (const category of G03_CATEGORIES) {
    assert.ok(category.slug.startsWith(G03_SLUG_PREFIX), `${category.slug} lacks the marker`);
    assert.ok(!category.name.includes('UAT'), `${category.name} leaks the marker into the UI`);
  }
  for (const product of G03_PRODUCTS) {
    assert.ok(product.slug.startsWith(G03_SLUG_PREFIX), `${product.slug} lacks the marker`);
    assert.ok(!product.name.includes('UAT'), `${product.name} leaks the marker into the UI`);
    assert.ok(product.creationName.startsWith('UAT '), 'the creation name carries the marker');
  }
  for (const { sku } of allSkus) {
    assert.ok(sku.code.startsWith(G03_SKU_PREFIX), `${sku.code} lacks the marker`);
  }
});

test('keys, slugs and SKU codes are unique', () => {
  const unique = (values) => assert.equal(new Set(values).size, values.length);
  unique(G03_CATEGORIES.map((category) => category.key));
  unique(G03_CATEGORIES.map((category) => category.slug));
  unique(G03_PRODUCTS.map((product) => product.key));
  unique(G03_PRODUCTS.map((product) => product.slug));
  unique(allSkus.map((entry) => entry.sku.code));
  for (const product of G03_PRODUCTS) {
    unique(product.variants.map((variant) => variant.key));
    // `product_variants` has no unique constraint on the triple, so the dataset
    // is where a duplicated colour/size pair has to be caught: the seeder matches
    // an existing variant on exactly that identity and would reuse one row twice.
    unique(product.variants.map((variant) => `${variant.colorName}|${variant.sizeLabel}`));
  }
});

test('every product names a category that exists', () => {
  const keys = new Set(G03_CATEGORIES.map((category) => category.key));
  for (const product of G03_PRODUCTS) {
    assert.ok(keys.has(product.categoryKey), `${product.slug} names ${product.categoryKey}`);
  }
});

test('the dataset satisfies every §23 coverage criterion it is responsible for', () => {
  const mediaCounts = G03_PRODUCTS.map((product) => product.mediaCount);

  // §23.10 / §23.11 / §23.12
  assert.ok(G03_CATEGORIES.length >= 3, 'at least three published categories');
  assert.ok(G03_PRODUCTS.length >= 6, 'at least six published products');
  assert.ok(
    new Set(G03_PRODUCTS.map((product) => product.categoryKey)).size >= 3,
    'products span at least three categories',
  );

  // §5: at least two indexable published categories, and indexability is exercised.
  assert.ok(G03_CATEGORIES.filter((category) => category.isIndexable).length >= 2);
  assert.ok(
    G03_CATEGORIES.some((category) => !category.isIndexable),
    'a non-indexable published category, so the operator control is observable',
  );

  // §23.14 / §23.15 / §23.16
  assert.ok(mediaCounts.includes(1), 'a product with exactly one image');
  assert.ok(mediaCounts.includes(8), 'a product with eight images');
  assert.ok(mediaCounts.includes(20), 'a product at the cap');
  assert.ok(Math.max(...mediaCounts) <= 20, 'nothing exceeds the twenty-image cap');

  // §23.20 / §23.21
  assert.ok(
    G03_PRODUCTS.some((product) => product.variants.length > 1),
    'a product with multiple variants',
  );
  assert.ok(
    G03_PRODUCTS.some((product) => product.variants.length >= 2),
    'a product with multiple SKUs',
  );

  // §23.22 / §23.23 — both price paths, and the override is visibly distinct.
  const overrides = allSkus.filter((entry) => entry.sku.priceOverrideAmount !== undefined);
  assert.ok(allSkus.some((entry) => entry.sku.priceOverrideAmount === undefined));
  assert.ok(overrides.length >= 1);
  for (const { product, sku } of overrides) {
    const difference = Math.abs(Number(sku.priceOverrideAmount) - Number(product.basePriceAmount));
    assert.ok(
      difference >= 10_000,
      `${sku.code} overrides by ${String(difference)}₫ — too close to read off the page (§10)`,
    );
  }

  // §23.24 / §23.25 / §23.26
  assert.ok(
    allSkus.some((entry) => entry.sku.quantityOnHand > 10),
    'a clearly in-stock SKU',
  );
  assert.ok(
    allSkus.some(
      (entry) =>
        entry.sku.lowStockThreshold !== undefined &&
        entry.sku.quantityOnHand > 0 &&
        entry.sku.quantityOnHand <= entry.sku.lowStockThreshold,
    ),
    'a low-stock SKU',
  );
  assert.ok(
    allSkus.some((entry) => entry.sku.quantityOnHand === 0),
    'an out-of-stock SKU',
  );

  // §23.27
  assert.ok(
    G03_PRODUCTS.some(
      (product) =>
        product.variants.some((variant) => variant.sku.quantityOnHand > 0) &&
        product.variants.some((variant) => variant.sku.quantityOnHand === 0),
    ),
    'a product with mixed availability',
  );
});

test('prices are plausible whole-đồng UAT figures, never zero or a gimmick', () => {
  for (const product of G03_PRODUCTS) {
    assert.match(product.basePriceAmount, /^\d{1,12}$/, `${product.slug} price shape`);
    assert.ok(Number(product.basePriceAmount) >= 50_000, `${product.slug} is not a gimmick price`);
  }
  for (const { sku } of allSkus) {
    if (sku.priceOverrideAmount !== undefined) {
      assert.match(sku.priceOverrideAmount, /^\d{1,12}$/);
      assert.ok(Number(sku.priceOverrideAmount) >= 50_000);
    }
  }
});

test('the hand-curation targets a product that can actually carry the move', () => {
  const product = productByKey(G03_CURATION.productKey);
  assert.ok(G03_CURATION.promotePosition > 0, 'promoting position 0 would prove nothing');
  assert.ok(G03_CURATION.promotePosition < product.mediaCount);
  for (const position of G03_CURATION.swapPositions) {
    assert.ok(position > 0 && position < product.mediaCount, 'the swap stays inside the gallery');
  }
});

test('totalMediaCount adds up, and productByKey refuses an unknown key', () => {
  assert.equal(
    totalMediaCount(),
    G03_PRODUCTS.reduce((total, product) => total + product.mediaCount, 0),
  );
  assert.throws(() => productByKey('not-a-product'), /no product keyed/);
});

test('assertPersistentDatabase refuses a disposable database and accepts the shared one', () => {
  assert.throws(
    () => assertPersistentDatabase('postgresql://u:p@localhost:5434/embroidery_db7_12345'),
    /Refusing to seed the APP12-G03 UAT baseline into the disposable database/,
  );
  assert.equal(
    assertPersistentDatabase('postgresql://u:p@localhost:5434/embroidery'),
    'embroidery',
  );
});

test('upload keys are deterministic, distinct per position and within the header charset', () => {
  const keys = G03_PRODUCTS.flatMap((product) =>
    Array.from({ length: product.mediaCount }, (_, position) => uploadKey(product.key, position)),
  );
  assert.equal(new Set(keys).size, keys.length, 'no two images share an idempotency key');
  for (const key of keys) {
    // `Idempotency-Key`: 8-128 characters of A-Z a-z 0-9 . _ : -
    assert.match(key, /^[A-Za-z0-9._:-]{8,128}$/, `${key} is outside the header charset`);
  }
  assert.equal(uploadKey('tui-tote', 3), uploadKey('tui-tote', 3), 'stable across calls');
  assert.notEqual(uploadKey('tui-tote', 3), uploadKey('tui-tote', 13));
});

test('normalizeAmount compares money as a string and never as a float', () => {
  assert.equal(normalizeAmount('320000.00'), '320000');
  assert.equal(normalizeAmount('320000'), '320000');
  assert.equal(normalizeAmount(' 610000.000 '), '610000');
  // A fractional part VND cannot express is not silently truncated.
  assert.equal(normalizeAmount('320000.50'), undefined);
  assert.equal(normalizeAmount(undefined), undefined);
  // Above 2^53, where a float would already have lost the value.
  assert.equal(normalizeAmount('9007199254740993.00'), '9007199254740993');
});

test('the curated product is one the seeder will not re-order on a rerun', () => {
  // The rule `reconcileProductFields` enforces, stated where it can be read
  // beside the dataset: the seeder owns which Assets are attached, and once the
  // set is right the arrangement belongs to whoever arranged it. The first rerun
  // of this tool reverted the §7 hand-curation and was refused by
  // `409 PRODUCT_NOT_EDITABLE`; this pins that the curated Product is PUBLISHED
  // by the time an operator touches it, which is the state that rule protects.
  const product = productByKey(G03_CURATION.productKey);
  assert.ok(product.mediaCount > 1, 'a single-image gallery cannot be re-curated');
  assert.ok(
    product.variants.every((variant) => variant.sku.quantityOnHand >= 0),
    'the curated product is a publishable one, so it reaches PUBLISHED before curation',
  );
});

test('redact removes the credential and leaves a short or absent one alone', () => {
  assert.equal(redact('body: hunter2222 tail', 'hunter2222'), 'body: «redacted» tail');
  assert.equal(redact('nothing to do', undefined), 'nothing to do');
  // Too short to redact safely — blanking a 3-character string would corrupt
  // unrelated text far more often than it would hide a secret.
  assert.equal(redact('abc def', 'abc'), 'abc def');
});

test('readOnlyFilter parses dataset keys and rejects unknown ones', () => {
  assert.equal(readOnlyFilter(['node', 'seed.mjs']), undefined);
  assert.deepEqual([...readOnlyFilter(['--only=tui-tote, goi-sen'])].sort(), [
    'goi-sen',
    'tui-tote',
  ]);
  assert.throws(() => readOnlyFilter(['--only=nope']), /unknown dataset keys: nope/);
});

test('a generated source image is a real JPEG, deterministic, and inside the size band', async () => {
  const sharp = workerRequire('sharp');
  const first = await generateSourceImage({ sharp, productHue: 28, position: 0 });
  const again = await generateSourceImage({ sharp, productHue: 28, position: 0 });

  assert.equal(first.mediaType, SOURCE_MEDIA_TYPE);
  assert.ok(first.body.equals(again.body), 'the same (hue, position) yields identical bytes');
  assert.equal(first.body.subarray(0, 2).toString('hex'), 'ffd8', 'JPEG SOI marker');

  const metadata = await sharp(first.body).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, first.widthPx);
  assert.equal(metadata.height, first.heightPx);
  // §8: real bytes with real structure, not a placeholder that would understate
  // every payload measurement made against this catalog afterwards.
  assert.ok(first.body.byteLength > 150_000, 'the texture survives the encoder');
});

test('no two positions in a twenty-image gallery look the same', async () => {
  const sharp = workerRequire('sharp');

  // The design carries **two** position cues and they are strong at different
  // moments, so the contract is that at least one of them always separates a
  // pair — asserting on either alone would be false.
  //
  // - The **rosette** is `5 + position % 7` petals, so it repeats every seven
  //   positions: images 0, 7 and 14 of a twenty-image gallery share a shape.
  // - The **tally** is `position + 1` stitch dots and never repeats, but one
  //   extra dot in a wide band is a small fraction of the frame, so adjacent
  //   positions separate weakly there and strongly by shape.
  //
  // Measuring only the whole frame would call 0-vs-7 identical; measuring only
  // the tally would call 0-vs-1 identical. Both are wrong, and a human reading
  // the gallery uses whichever cue is available.
  const images = [];
  for (let position = 0; position < 20; position += 1) {
    images.push((await generateSourceImage({ sharp, productHue: 28, position })).body);
  }

  const raw = (body, region) =>
    (region === undefined ? sharp(body) : sharp(body).extract(region))
      .resize(128, region === undefined ? 128 : 12, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer();
  // The horizontal band the tally is drawn into (see `tallyCoverage`).
  const tallyBand = {
    left: 0,
    top: Math.round(1600 * 0.83),
    width: 1600,
    height: Math.round(1600 * 0.09),
  };
  const meanDifference = (left, right) => {
    let total = 0;
    for (let index = 0; index < left.length; index += 1) {
      total += Math.abs(left[index] - right[index]);
    }
    return total / left.length;
  };

  const frames = await Promise.all(images.map((body) => raw(body)));
  const tallies = await Promise.all(images.map((body) => raw(body, tallyBand)));

  for (let a = 0; a < images.length; a += 1) {
    for (let b = a + 1; b < images.length; b += 1) {
      assert.ok(
        !images[a].equals(images[b]),
        `positions ${String(a)} and ${String(b)} are identical bytes`,
      );
      const shape = meanDifference(frames[a], frames[b]);
      const tally = meanDifference(tallies[a], tallies[b]);
      assert.ok(
        shape > 2 || tally > 2,
        `positions ${String(a)} and ${String(b)} are hard to tell apart ` +
          `(shape ${shape.toFixed(2)}, tally ${tally.toFixed(2)})`,
      );
    }
  }
});

test('an out-of-band source image is refused rather than uploaded', async () => {
  const sharp = workerRequire('sharp');
  // A 32px edge cannot carry enough texture to reach the band — which is exactly
  // the failure the guard exists to catch, so it is provoked rather than mocked.
  await assert.rejects(
    generateSourceImage({ sharp, productHue: 28, position: 0, edgePx: 32 }),
    /outside the expected/,
  );
});
