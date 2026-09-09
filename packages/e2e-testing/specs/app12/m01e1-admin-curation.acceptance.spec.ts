/**
 * `APP12-M01.E1` §8 and §9 — the Admin curation journeys, re-proved on the
 * final world.
 *
 * `A1` accepted these against a catalog holding only Admin fixtures. Here the
 * same screens run over a database that also carries the Storefront's twenty
 * PUBLISHED images and the cross-boundary Products, which is the point of a
 * cross-boundary acceptance: a screen that only works when nothing else exists
 * has not been accepted.
 *
 * ```text
 * §8  DRAFT     add · set primary · reorder · remove · one save · reload
 *               the cap at 20/20, and 1440 / 1024 / 390
 * §9  PUBLISHED [A,B,C] → [A,C,B] → [C,A,B] → [A,B], every save through
 *               adminProductMedia_replace and never a Product PATCH
 * ```
 */
import { expect, test, type Page } from '@playwright/test';

import {
  COPY,
  NAMES,
  PRODUCTS,
  capacity,
  everyImageLoaded,
  gridColumns,
  horizontalOverflow,
  openProduct,
  renderedOrder,
  resize,
  revealGrid,
  tile,
  tileAction,
  tiles,
} from './support/m01a1-world';
import { capture, E1, operatorSession, readStoredMedia } from './support/m01e1-world';

test.describe.configure({ mode: 'serial' });

/**
 * Watches for the two writes that must never both happen on a PUBLISHED Product.
 *
 * `APP12-M01.B2` exists so a PUBLISHED Product's images can change without the
 * Product itself being written, and "it used B2's authority" is a claim about
 * the wire. Reading it off the screen would only prove the screen believes it.
 *
 * For the PUBLISHED path only: a DRAFT saves through the ordinary Product update
 * and issues no media write at all, so arming the media watcher there would
 * leave a promise that can only ever reject.
 */
function watchWrites(page: Page) {
  const mediaWrite = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' && /\/api\/admin\/products\/[^/]+\/media$/.test(request.url()),
  );
  return { mediaWrite, productPatch: seenPatch(page) };
}

/** Resolves to whether an ordinary Product PATCH was issued. Never rejects. */
function seenPatch(page: Page): Promise<boolean> {
  return page
    .waitForRequest(
      (request) =>
        request.method() === 'PATCH' && /\/api\/admin\/products\/[^/]+$/.test(request.url()),
      { timeout: 10_000 },
    )
    .then(
      () => true,
      () => false,
    );
}

const operator = operatorSession();

test('§8 — a DRAFT is curated in one save and survives a reload', async () => {
  const page = operator.page();
  await openProduct(page, PRODUCTS.draft8());
  await expect(tiles(page)).toHaveCount(8);
  await expect(capacity(page)).toHaveText('8/20');

  // Real photographs. Twenty neutral blocks would satisfy every accessible-name
  // assertion below and prove nothing about the screen.
  await revealGrid(page);
  await expect.poll(() => everyImageLoaded(page)).toBe(true);
  const before = await renderedOrder(page);

  // Add through the real picker, and prove the duplicate route is closed while
  // it is open: an Asset the Product already carries is badged and offers no
  // checkbox, so a repeat cannot be composed from this screen at all.
  await page.getByRole('button', { name: COPY.add }).click();
  const picker = page.getByRole('dialog', { name: COPY.pickerTitle });
  await expect(picker).toBeVisible();
  const options = picker.locator('.product-picker__option');
  await expect.poll(() => options.count()).toBeGreaterThan(0);
  const optionCount = await options.count();
  const badgeCount = await picker.getByText(COPY.pickerAlreadyAdded).count();
  const boxes = picker.getByRole('checkbox');
  // The assertion is on the *partition*, never on a fixed badge count. The picker
  // pages at 24 and this world holds every M01 fixture's Assets, so how many of
  // this Product's eight land on the first cursor page is a property of the
  // cursor rather than of the rule under test — and requiring one here is exactly
  // what made this journey fail on a larger catalog while the rule held.
  await expect(boxes).toHaveCount(optionCount - badgeCount);
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await picker.getByRole('button', { name: /^Dùng 2 ảnh đã chọn$/ }).click();
  await expect(tiles(page)).toHaveCount(10);
  await expect(capacity(page)).toHaveText('10/20');

  // Set a non-primary as primary, reorder a non-primary, remove a non-primary.
  await tileAction(page, 4, NAMES.setPrimary(4, 10)).click();
  await tileAction(page, 6, NAMES.moveEarlier(6, 10)).click();
  await tileAction(page, 9, NAMES.remove(9, 10)).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(9);
  const staged = await renderedOrder(page);
  expect(staged).not.toEqual(before);

  // One save for the whole form — the ordinary DRAFT path, not a media-only one.
  const productPatch = seenPatch(page);
  await page.getByRole('button', { name: COPY.saveDraft }).click();
  expect(await productPatch, 'a DRAFT saves through the ordinary Product update').toBe(true);

  // The server agrees with the screen, and the roles are derived from position.
  await openProduct(page, PRODUCTS.draft8());
  await expect(tiles(page)).toHaveCount(9);
  await expect(capacity(page)).toHaveText('9/20');
  expect(await renderedOrder(page), 'exact server order preserved').toEqual(staged);
  await expect(tile(page, 1).getByText(COPY.rolePrimary)).toHaveCount(2);
  await expect(tile(page, 2).getByText(COPY.roleGallery)).toBeVisible();

  // No partial save and no lifecycle side effect: the whole form went in one
  // request, and the Product is still a DRAFT afterwards rather than having been
  // pushed anywhere by a media write it never made.
  await expect(page.locator('.product-status--published')).toHaveCount(0);
});

test('§8 — at twenty images every route to a twenty-first is closed', async () => {
  const page = operator.page();
  await openProduct(page, PRODUCTS.draft20());
  await expect(tiles(page)).toHaveCount(20);
  await expect(capacity(page)).toHaveText('20/20');
  await expect(page.getByText(COPY.capacityFull)).toBeVisible();
  await expect(page.getByRole('button', { name: COPY.add })).toBeDisabled();
  await revealGrid(page);
  await expect.poll(() => everyImageLoaded(page)).toBe(true);

  // Free one place: the picker must offer exactly one and refuse the rest.
  await tileAction(page, 20, NAMES.remove(20, 20)).click();
  await expect(capacity(page)).toHaveText('19/20');
  await page.getByRole('button', { name: COPY.add }).click();
  const picker = page.getByRole('dialog', { name: COPY.pickerTitle });
  await expect(picker.locator('.product-picker__remaining')).toHaveText('Còn 1 chỗ');
  const boxes = picker.getByRole('checkbox');
  await boxes.nth(0).check();
  await expect(picker.getByText(COPY.pickerFullNotice)).toBeVisible();
  await expect(boxes.nth(1)).toHaveAttribute('aria-disabled', 'true');
  await boxes.nth(1).click({ force: true });
  await expect(boxes.nth(1)).not.toBeChecked();

  // Nothing persisted: dismissed and reloaded.
  await picker.getByRole('button', { name: COPY.pickerCancel }).click();
  await openProduct(page, PRODUCTS.draft20());
  await expect(tiles(page)).toHaveCount(20);
});

test('§8 — the DRAFT editor holds at 1440, 1024 and 390', async () => {
  const page = operator.page();
  for (const [viewport, label] of [
    ['desktop', '1440'],
    ['tablet', '1024'],
    ['mobile', '390'],
  ] as const) {
    await resize(page, viewport);
    await openProduct(page, PRODUCTS.draft20());
    await expect(tiles(page)).toHaveCount(20);
    await revealGrid(page);
    await expect.poll(() => everyImageLoaded(page)).toBe(true);

    // Never one full-width column. `M01.D1-C1` exists because the approved Admin
    // design collapsed to that, and the failure is invisible unless counted.
    const columns = await gridColumns(page);
    process.stdout.write(`[m01e1] admin ${label} grid columns=${String(columns)}\n`);
    expect(columns, `${label}: the grid lays out more than one column`).toBeGreaterThanOrEqual(2);
    expect(await horizontalOverflow(page), `${label}: no document overflow`).toBe(0);
    await capture(page, viewport, `admin-draft-20-images`);
  }
  await resize(page, 'desktop');
});

test('§9 — a PUBLISHED Product is curated three times and never unpublished', async () => {
  const page = operator.page();
  const productId = E1.publishedId();
  const [a, b, c] = E1.publishedAssets() as [string, string, string];

  await openProduct(page, productId);

  // The commercial half is locked, programmatically rather than by appearance.
  await expect(page.getByText(COPY.publishedBannerTitle)).toBeVisible();
  await expect(page.getByLabel(COPY.nameLabel)).toBeDisabled();
  await expect(page.getByLabel(COPY.priceLabel)).toBeDisabled();
  // The media half is not.
  await expect(page.getByRole('button', { name: COPY.add })).toBeEnabled();
  await expect(page.getByText(COPY.publishedMediaNote)).toBeVisible();
  expect(await renderedOrder(page), 'the fixture starts at [A,B,C]').toEqual([a, b, c]);

  /** One media-only save, proved on the wire and then in the database. */
  const save = async (expected: string[], why: string) => {
    const { mediaWrite, productPatch } = watchWrites(page);
    await page.getByRole('button', { name: COPY.savePublished }).click();
    const request = await mediaWrite;
    const body = request.postDataJSON() as {
      expectedUpdatedAt: string;
      mediaAssetIds: string[];
    };
    expect(Object.keys(body).sort(), `${why}: the body carries nothing else`).toEqual([
      'expectedUpdatedAt',
      'mediaAssetIds',
    ]);
    expect(body.mediaAssetIds, `${why}: the request states the whole selection`).toEqual(expected);
    expect(await productPatch, `${why}: no generic PUBLISHED Product PATCH`).toBe(false);
    await expect(page.getByRole('button', { name: COPY.savePublished })).toHaveCount(0);

    // The rows, not the response. And still PUBLISHED: no unpublish/republish
    // transition happened anywhere in this sequence.
    const stored = await readStoredMedia(productId);
    expect(
      stored.map((row) => row.assetId),
      `${why}: stored order`,
    ).toEqual(expected);
    expect(stored.map((row) => row.displayOrder)).toEqual([...expected.keys()]);
    expect(stored.filter((row) => row.role === 'THUMBNAIL').map((row) => row.displayOrder)).toEqual(
      [0],
    );
    await openProduct(page, productId);
    await expect(page.getByText(COPY.publishedBannerTitle)).toBeVisible();
    await expect(page.locator('.product-status--published')).toHaveText(COPY.statusPublished);
    expect(await renderedOrder(page), `${why}: the reload agrees`).toEqual(expected);
  };

  // [A,B,C] → [A,C,B]. A reorder of the gallery, which never touches position 0.
  await tileAction(page, 3, NAMES.moveEarlier(3, 3)).click();
  expect(await renderedOrder(page)).toEqual([a, c, b]);
  await save([a, c, b], 'reorder');

  // [A,C,B] → [C,A,B]. Set-primary is the only action that may write position 0,
  // and it pushes the previous primary to 1 rather than swapping it away.
  await tileAction(page, 2, NAMES.setPrimary(2, 3)).click();
  expect(await renderedOrder(page)).toEqual([c, a, b]);
  await save([c, a, b], 'set-primary');
  await capture(page, 'desktop', 'admin-published-media-editable');

  // [C,A,B] → [A,B]. Removing the primary is the one removal that asks first,
  // because it rewrites the Product's canonical thumbnail.
  await tileAction(page, 1, NAMES.remove(1, 3)).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(COPY.removePrimaryTitle)).toBeVisible();
  await confirm.getByRole('button', { name: COPY.removePrimaryConfirm }).click();
  expect(await renderedOrder(page), 'the requested first remaining image is promoted').toEqual([
    a,
    b,
  ]);
  await save([a, b], 'remove-primary');
});

test('§9 — the PUBLISHED media editor holds at 390', async () => {
  const page = operator.page();
  await resize(page, 'mobile');
  await openProduct(page, E1.publishedId());
  await expect(page.getByText(COPY.publishedBannerTitle)).toBeVisible();
  await expect(page.getByRole('button', { name: COPY.add })).toBeEnabled();
  await expect(page.getByLabel(COPY.nameLabel)).toBeDisabled();
  expect(await horizontalOverflow(page)).toBe(0);
  await capture(page, 'mobile', 'admin-published-media-editable');

  await page.getByRole('button', { name: COPY.add }).click();
  await expect(page.getByRole('dialog', { name: COPY.pickerTitle })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  await capture(page, 'mobile', 'admin-picker');
  await page.getByRole('dialog').getByRole('button', { name: COPY.pickerCancel }).click();
  await resize(page, 'desktop');
});
