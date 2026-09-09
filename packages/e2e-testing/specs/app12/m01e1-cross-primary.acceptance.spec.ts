/**
 * `APP12-M01.E1` §11 and §12 — one association, five public surfaces.
 *
 * These are the two journeys neither `A1` nor `S1` could run, because each needs
 * an operator and a visitor in the same world:
 *
 * ```text
 * §11  the operator sets a new STORED primary
 *      → Discover card, Product Detail media[0], the initial stage, og:image
 *        and JSON-LD image[0] all follow it, and no page picks its own
 *
 * §12  the stored primary becomes INELIGIBLE, and product_media is not touched
 *      → the same five surfaces all fall back to the same next row
 *      → the stored primary is still the stored primary afterwards
 *      → restoring the Asset restores the original, with no repair step
 * ```
 *
 * ## What the surfaces are compared on
 *
 * The **`product_media` row's own id**, which is what every public address
 * carries: `publicProductMediaPath({ slug, productMediaId, rendition })`. Two
 * surfaces can name one association through two different renditions — the card
 * renders `thumbnail` and the stage renders `catalog-preview` — so comparing
 * URLs would report a difference that is not one. Comparing the *Asset* id
 * instead is the opposite mistake, and the one the first version of this suite
 * made: it reported a mismatch on a page that was entirely correct.
 *
 * The Admin-side assertions stay on Asset ids, because the operator's screen
 * addresses images by Asset and the write body is `mediaAssetIds`. The two
 * identities meet in `readStoredMedia`, which returns both.
 */
import { expect, test } from '@playwright/test';

import { COPY, NAMES, openProduct, renderedOrder, tileAction, tiles } from './support/m01a1-world';
import { capture, E1, operatorSession, readStoredMedia, sf } from './support/m01e1-world';
import {
  agreedPrimary,
  describeMediaOwners,
  readPublicPrimaries,
  setAssetStatus,
} from './support/m01e1-public-surfaces';

test.describe.configure({ mode: 'serial' });

const operator = operatorSession();

test('§11 — a new stored primary reaches every public surface, and none chooses its own', async () => {
  const page = operator.page();
  const productId = E1.propagateId();
  const slug = E1.propagateSlug();
  const [a, b, c] = E1.propagateAssets() as [string, string, string];

  // The reference is the **stored row**, read from the database. Comparing the
  // page to a literal the harness happens to hold would prove only that the
  // harness and the page were seeded from the same list.
  const storedBefore = await readStoredMedia(productId);
  expect(
    storedBefore.map((row) => row.assetId),
    `the fixture wrote [A,B,C] in order; stored=${JSON.stringify(storedBefore)}`,
  ).toEqual([a, b, c]);

  const before = await readPublicPrimaries(page, slug);
  expect(agreedPrimary(before), `surfaces disagree at rest: ${JSON.stringify(before)}`).toBe(true);
  if (before.card !== storedBefore[0]?.mediaId) {
    process.stdout.write(
      `[m01e1] §11 MISMATCH raw=${JSON.stringify(before.raw)} ` +
        `owners=${JSON.stringify(await describeMediaOwners(before.card))}\n`,
    );
  }
  expect(before.card, 'every surface starts on the stored primary association').toBe(
    storedBefore[0]?.mediaId,
  );

  // The operator promotes the third image, through the real screen and the real
  // media-only write.
  await openProduct(page, productId);
  expect(await renderedOrder(page)).toEqual([a, b, c]);
  await tileAction(page, 3, NAMES.setPrimary(3, 3)).click();
  await page.getByRole('button', { name: COPY.savePublished }).click();
  await expect(page.getByRole('button', { name: COPY.savePublished })).toHaveCount(0);

  // The stored truth moved, and moved the way `setPrimary` promises: the old
  // primary is pushed to position 1 rather than swapped to where C was.
  //
  // The association ids are **new**. `adminProductMedia_replace` replaces the
  // whole ordered set, so the rows are rewritten rather than reordered in place
  // — which is why the surfaces below are compared against a freshly read
  // `mediaId` and not against the one held from before the write.
  const stored = await readStoredMedia(productId);
  expect(
    stored.map((row) => row.assetId),
    'set-primary produced [C,A,B]',
  ).toEqual([c, a, b]);
  expect(stored[0]?.role).toBe('THUMBNAIL');
  expect(stored.map((row) => row.displayOrder)).toEqual([0, 1, 2]);

  // And every public surface followed that same association.
  const after = await readPublicPrimaries(page, slug);
  expect(agreedPrimary(after), `surfaces disagree after the write: ${JSON.stringify(after)}`).toBe(
    true,
  );
  const promoted = stored[0]?.mediaId;
  expect(after.card, 'Discover follows the stored primary').toBe(promoted);
  expect(after.detailFirst, 'Product Detail media[0] follows it').toBe(promoted);
  expect(after.stage, 'the initial stage follows it').toBe(promoted);
  expect(after.ogImage, 'og:image follows it').toBe(promoted);
  expect(after.jsonLdFirst, 'JSON-LD image[0] follows it').toBe(promoted);
  // And that association is the Asset the operator actually chose, which is the
  // half an id-only comparison would not have proved.
  expect(
    (await describeMediaOwners(promoted as string))[0],
    'the promoted association carries the Asset the operator promoted',
  ).toMatchObject({ assetId: c, displayOrder: 0, role: 'THUMBNAIL', slug });
  process.stdout.write(`[m01e1] §11 propagation ${JSON.stringify(after)}\n`);

  await page.goto(sf(`/san-pham/${slug}`), { waitUntil: 'domcontentloaded' });
  await capture(page, 'desktop', 'cross-stored-primary-propagated');
});

test('§12 — an ineligible stored primary degrades every surface to the same fallback', async () => {
  const page = operator.page();
  const productId = E1.degradeId();
  const slug = E1.degradeSlug();
  const [a] = E1.degradeAssets() as [string, string, string];
  expect(a, 'the stored primary is the fixture Asset at position 0').toBe(E1.storedPrimary());

  const storedBefore = await readStoredMedia(productId);
  expect(storedBefore.map((row) => row.assetId)).toEqual(E1.degradeAssets());

  const healthy = await readPublicPrimaries(page, slug);
  expect(agreedPrimary(healthy)).toBe(true);
  expect(healthy.card, 'every surface starts on the stored primary A').toBe(
    storedBefore[0]?.mediaId,
  );

  // A becomes ineligible through the real Asset authority — the same column the
  // public eligibility predicate compares. `product_media` is not touched.
  await setAssetStatus(a, 'REJECTED');

  const degraded = await readPublicPrimaries(page, slug);
  expect(
    agreedPrimary(degraded),
    `surfaces disagree while degraded: ${JSON.stringify(degraded)}`,
  ).toBe(true);
  const fallback = storedBefore[1]?.mediaId;
  expect(degraded.card, 'the lowest-display-order eligible media wins').toBe(fallback);
  expect(degraded.detailFirst).toBe(fallback);
  expect(degraded.stage).toBe(fallback);
  expect(degraded.ogImage).toBe(fallback);
  expect(degraded.jsonLdFirst).toBe(fallback);
  process.stdout.write(`[m01e1] §12 degraded ${JSON.stringify(degraded)}\n`);
  await capture(page, 'desktop', 'cross-degraded-effective-primary');

  // The read side wrote nothing. Not one row moved — same ids, same roles, same
  // positions — and A is still the stored canonical primary, which is what makes
  // recovery a no-op rather than a repair.
  const storedAfter = await readStoredMedia(productId);
  expect(storedAfter, 'no public read mutated product_media').toEqual(storedBefore);
  expect(storedAfter[0]?.assetId).toBe(a);
  expect(storedAfter[0]?.role).toBe('THUMBNAIL');

  // Restoring the Asset restores the original primary, with no operator action.
  await setAssetStatus(a, 'ACCEPTED');
  const recovered = await readPublicPrimaries(page, slug);
  expect(agreedPrimary(recovered)).toBe(true);
  expect(recovered.card, 'the original stored primary is effective again').toBe(
    storedBefore[0]?.mediaId,
  );
  expect(await readStoredMedia(productId)).toEqual(storedBefore);
});

test('§11 — no page independently chooses a primary the others do not know about', async () => {
  const page = operator.page();
  // A different Product, already curated by §9 into [A,B], so this is a second
  // independent observation of the same rule rather than a re-read of §11's.
  const slug = E1.publishedSlug();
  const stored = await readStoredMedia(E1.publishedId());
  expect(stored.length, 'the §9 journey left this Product published with images').toBeGreaterThan(
    0,
  );

  const primaries = await readPublicPrimaries(page, slug);
  expect(agreedPrimary(primaries), JSON.stringify(primaries)).toBe(true);
  expect(primaries.card, 'the surfaces agree with storage, not merely with each other').toBe(
    stored[0]?.mediaId,
  );

  // The gallery the visitor sees is the operator's order, not a re-sort.
  await page.goto(sf(`/san-pham/${slug}`), { waitUntil: 'domcontentloaded' });
  const strip = page.locator('.product-detail__thumbnail-image');
  if ((await strip.count()) > 1) {
    const rendered = await strip.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLImageElement).getAttribute('src') ?? ''),
    );
    const ids = rendered.map((url) => /\/media\/([0-9a-f-]{36})\//.exec(url)?.[1]);
    expect(ids, 'the strip is the stored order').toEqual(stored.map((row) => row.mediaId));
  }

  // Nothing in this journey was an Admin write, and the Admin screen still shows
  // the same set — the public read did not disturb the operator's view either.
  await openProduct(page, E1.publishedId());
  await expect(tiles(page)).toHaveCount(stored.length);
  expect(await renderedOrder(page)).toEqual(stored.map((row) => row.assetId));
});
