/**
 * `APP12-M01.E1` §13 — the operator's view of a degraded media set.
 *
 * ## §13 is an audit, not a feature
 *
 * The requirement is that an operator *can discover* that the stored canonical
 * primary is ineligible while the public surfaces are quietly serving a
 * fallback. §13 explicitly permits an already-delivered treatment to satisfy it
 * and explicitly forbids inventing an API in E1, so this file asks the question
 * rather than answering it: with the stored primary rejected, and after a
 * **fresh read** of the Admin product media screen, is anything on that screen
 * true about the degradation?
 *
 * Every candidate signal is probed and every result is printed, so a failure
 * names the seam that is missing instead of only reporting a boolean.
 *
 * A file of its own, and the split from §20 next door is deliberate: these
 * journeys are serial, so an audit that concludes "no signal exists" would
 * otherwise skip the accessibility gate and leave it reported as "did not run"
 * rather than as a result.
 */
import { expect, test, type Page } from '@playwright/test';

import { openProduct, tiles } from './support/m01a1-world';
import {
  capture,
  E1,
  expectAxeClean,
  operatorSession,
  readStoredMedia,
} from './support/m01e1-world';
import { setAssetStatus } from './support/m01e1-public-surfaces';

test.describe.configure({ mode: 'serial' });

/** The approved operator copy, transcribed from `vi/admin.json`. */
const PRIMARY_COPY = 'Ảnh đại diện';
const REJECTED_COPY = 'Ảnh đã bị từ chối';

/** The delivered asset-state captions the probe looks for. */
const MEDIA_STATE_COPY = {
  rejected: 'Ảnh đã bị từ chối',
  unavailable: 'Không tải được ảnh xem trước',
  processing: 'Ảnh đang được xử lý',
  absent: 'Chưa có ảnh xem trước',
} as const;

/**
 * Every place on the media screen a truthful degradation signal could appear.
 *
 * Probed as a set rather than as one assertion because §13 does not prescribe
 * the treatment — any of these would satisfy it, and naming them all is what
 * makes "none of them is present" a reviewable finding rather than an opinion.
 */
async function probeSignals(page: Page): Promise<Record<string, boolean>> {
  const editor = page.locator('.product-media-editor');
  const body = await editor.innerText();
  const glyphRoles = await editor.locator('[role="img"]').all();
  const captions = await Promise.all(glyphRoles.map((node) => node.getAttribute('aria-label')));
  const brokenTile = captions.some(
    (caption) =>
      caption === MEDIA_STATE_COPY.rejected ||
      caption === MEDIA_STATE_COPY.unavailable ||
      caption === MEDIA_STATE_COPY.processing,
  );
  return {
    // A tile that says its own image is rejected, unavailable or still working.
    tileStateCaption: brokenTile,
    // A section-level notice naming the degradation in the approved vocabulary.
    sectionNotice:
      body.includes(MEDIA_STATE_COPY.rejected) || body.includes(MEDIA_STATE_COPY.unavailable),
    // A structural marker a stylesheet could hang a treatment on.
    tileDataAttribute: (await editor.locator('[data-media-state], [data-degraded]').count()) > 0,
    // The image simply failing to arrive, which `AssetThumbnail` turns into the
    // `unavailable` caption on its own.
    imageFailed: await editor.locator('img').evaluateAll((nodes) =>
      nodes.some((node) => {
        const image = node as HTMLImageElement;
        return image.complete && image.naturalWidth === 0;
      }),
    ),
  };
}

const operator = operatorSession();

/**
 * The rejected Asset goes back whatever the audit concludes.
 *
 * In `afterAll` rather than at the end of the journey, because a **failing**
 * audit is the expected outcome to plan for: the first version restored inline,
 * the assertion failed before it, and the Asset stayed rejected for the rest of
 * the run. Nothing downstream reads this Product any more — §13 has its own —
 * but a suite that leaves deliberate damage behind on failure is a suite whose
 * later failures cannot be trusted.
 */
test.afterAll(async () => {
  await setAssetStatus(E1.signalPrimary(), 'ACCEPTED');
});

test('§13 — a degraded stored primary is discoverable on the Admin media screen', async () => {
  const page = operator.page();
  const productId = E1.signalId();
  const storedPrimary = E1.signalPrimary();

  // Healthy first, so the probe is calibrated: whatever it reports below has to
  // be a *change*, not a signal the screen shows all the time.
  await openProduct(page, productId);
  await expect(tiles(page)).toHaveCount(3);
  const healthy = await probeSignals(page);
  process.stdout.write(`[m01e1] §13 healthy signals ${JSON.stringify(healthy)}\n`);
  expect(
    Object.values(healthy).some(Boolean),
    'a healthy media set must not already look degraded',
  ).toBe(false);

  // Make the stored canonical primary ineligible through the real Asset
  // authority. `product_media` is untouched — that is §12's rule and it holds
  // here too.
  await setAssetStatus(storedPrimary, 'REJECTED');
  const stored = await readStoredMedia(productId);
  expect(stored[0]?.assetId, 'the stored primary is still the rejected Asset').toBe(storedPrimary);
  expect(stored[0]?.role).toBe('THUMBNAIL');

  // A fresh read, exactly as §13 words it — a new navigation, not a cached view.
  await page.goto('/products');
  await openProduct(page, productId);
  await expect(tiles(page)).toHaveCount(3);
  const degraded = await probeSignals(page);
  process.stdout.write(`[m01e1] §13 degraded signals ${JSON.stringify(degraded)}\n`);
  await capture(page, 'desktop', 'admin-degraded-stored-primary');

  // The API half is proved separately, so a failure below can be attributed to
  // the screen rather than to the contract: the Admin read does publish the
  // Asset's lifecycle state per media item.
  const detail = await page.request.get(`/api/admin/products/${productId}`);
  const payload = (await detail.json()) as {
    data: { media: { assetId: string; status: string }[] };
  };
  const primaryItem = payload.data.media.find((item) => item.assetId === storedPrimary);
  expect(primaryItem?.status, 'the Admin contract carries the truthful status').toBe('REJECTED');

  expect(
    Object.entries(degraded)
      .filter(([, present]) => present)
      .map(([name]) => name),
    'the Admin media screen must expose at least one truthful degradation signal; ' +
      `the contract reports status=${String(primaryItem?.status)} for the stored primary`,
  ).not.toHaveLength(0);

  // The degraded screen is a surface in its own right, and the one this
  // package added markup to. Scanned here rather than in the accessibility
  // file next door because it exists only while an Asset is rejected, and
  // that state is this journey's to create and to undo.
  await expectAxeClean(page, 'admin-degraded-stored-primary');

  // Never colour alone: the state is a word, and the word is the approved one.
  const editor = page.locator('.product-media-editor');
  await expect(editor.locator('.product-media-tile__state')).toHaveText(REJECTED_COPY);

  // And it stands beside the primary identity rather than replacing it — both
  // facts at once is the whole point of the signal.
  const primaryTile = editor.getByRole('listitem').first();
  await expect(primaryTile.getByText(PRIMARY_COPY)).toHaveCount(2);
  await expect(primaryTile.locator('.product-media-tile__state')).toHaveText(REJECTED_COPY);
});

test('§13 — the degradation is reversible and leaves no operator-visible residue', async () => {
  const page = operator.page();
  const productId = E1.signalId();
  await setAssetStatus(E1.signalPrimary(), 'ACCEPTED');
  await openProduct(page, productId);
  await expect(tiles(page)).toHaveCount(3);
  const healthy = await probeSignals(page);
  expect(Object.values(healthy).some(Boolean), 'the screen is clean again').toBe(false);

  // And the stored rows never moved through any of it.
  const stored = await readStoredMedia(productId);
  expect(stored.map((row) => row.displayOrder)).toEqual([0, 1, 2]);
  expect(stored[0]?.role).toBe('THUMBNAIL');
});
