/**
 * `APP12-M01.A1` — Admin product multi-image management, live.
 *
 * ```text
 * A  DRAFT curation      add · reorder · set primary · remove · save · reload
 * B  PUBLISHED curation  core read-only · media live · B2 save · still PUBLISHED
 * C  full cap            20/20 · add disabled · picker cannot exceed capacity
 * D  stale write         two tabs · the second is refused, nothing overwritten
 * E  revoked Asset       an Asset dies mid-session · refusal mapped · rows intact
 * F  accessibility       axe serious/critical = 0 · keyboard media management
 * V  visual matrix       1440 / 1024 / 390, and no horizontal overflow at 390
 * ```
 *
 * Every journey runs against **this run's disposable database**, the real API,
 * the real Admin and the real gateway, as a real operator logged in through the
 * real form, over Assets carrying **real WebP derivatives**. No shared
 * development database is written and no `APP12-G03` dataset is created.
 *
 * Serial: the journeys curate media on Products in one shared fixture, and
 * `expectedUpdatedAt` makes a second concurrent writer's save a conflict —
 * which journey D inflicts deliberately and parallel workers would inflict by
 * accident.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  COPY,
  NAMES,
  PRODUCTS,
  actionBar,
  capacity,
  capture,
  databaseUrl,
  everyImageLoaded,
  grid,
  gridColumns,
  gridWidth,
  horizontalOverflow,
  loginAsOperator,
  openProduct,
  renderedOrder,
  resize,
  revealGrid,
  revocableAssetId,
  tile,
  tileAction,
  tiles,
  totalTiles,
} from './support/m01a1-world';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }: { page: Page }) => {
  await loginAsOperator(page);
});

test('A — the DRAFT curation journey survives a reload', async ({ page }) => {
  await openProduct(page, PRODUCTS.draft8());

  await expect(tiles(page)).toHaveCount(8);
  await expect(capacity(page)).toHaveText('8/20');
  // Real photographs, not placeholders: the whole point of the grid is that an
  // operator can tell twenty images apart.
  await revealGrid(page);
  await expect.poll(() => everyImageLoaded(page)).toBe(true);

  const before = await renderedOrder(page);

  // Add two more through the real picker.
  await page.getByRole('button', { name: COPY.add }).click();
  const picker = page.getByRole('dialog', { name: COPY.pickerTitle });
  await expect(picker).toBeVisible();
  // An asset the product already carries is badged and offers no checkbox, so a
  // duplicate cannot be composed from this screen at all. The assertion is on
  // the *partition* rather than on a fixed number: the picker pages at 24 and
  // the fixture holds thirty assets, so how many of this product's eight land on
  // the first page is a property of the cursor, not of the rule under test.
  const options = picker.locator('.product-picker__option');
  const badges = picker.getByText(COPY.pickerAlreadyAdded);
  const boxes = picker.getByRole('checkbox');
  // The first cursor page has to have landed before any of these counts mean
  // anything: an empty dialog satisfies every partition trivially.
  await expect.poll(() => options.count()).toBeGreaterThan(0);
  const optionCount = await options.count();
  const badgeCount = await badges.count();
  expect(badgeCount).toBeGreaterThan(0);
  await expect(boxes).toHaveCount(optionCount - badgeCount);
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await picker.getByRole('button', { name: /^Dùng 2 ảnh đã chọn$/ }).click();
  await expect(tiles(page)).toHaveCount(10);
  await expect(capacity(page)).toHaveText('10/20');

  // Reorder a gallery image, then promote another to primary.
  await tileAction(page, 5, NAMES.moveEarlier(5, 10)).click();
  await tileAction(page, 3, NAMES.setPrimary(3, 10)).click();

  // Remove one non-primary image — no confirmation, because nothing outside
  // this screen changes.
  await tileAction(page, 7, NAMES.remove(7, 10)).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(9);

  const staged = await renderedOrder(page);
  expect(staged).not.toEqual(before);

  // One save for all of it, through the DRAFT product update.
  await page.getByRole('button', { name: COPY.saveDraft }).click();

  // The save navigates back to the list, so the proof is the reload.
  await openProduct(page, PRODUCTS.draft8());
  await expect(tiles(page)).toHaveCount(9);
  await expect(capacity(page)).toHaveText('9/20');
  expect(await renderedOrder(page)).toEqual(staged);
  await expect(tile(page, 1).getByText(COPY.rolePrimary)).toHaveCount(2);
  await expect(tile(page, 2).getByText(COPY.roleGallery)).toBeVisible();
});

test('B — a PUBLISHED product curates its images and stays published', async ({ page }) => {
  await openProduct(page, PRODUCTS.published());

  // The commercial fields are locked, and locked programmatically.
  await expect(page.getByText(COPY.publishedBannerTitle)).toBeVisible();
  await expect(page.getByText(COPY.publishedBannerBody)).toBeVisible();
  await expect(page.getByLabel(COPY.nameLabel)).toBeDisabled();
  await expect(page.getByLabel(COPY.priceLabel)).toBeDisabled();
  await expect(page.getByText(COPY.readOnlyBadge).first()).toBeVisible();

  // The media section is not.
  await expect(page.getByRole('button', { name: COPY.add })).toBeEnabled();
  await expect(page.getByText(COPY.publishedMediaNote)).toBeVisible();
  await expect(tiles(page)).toHaveCount(3);

  const before = await renderedOrder(page);

  // The request is watched, so "it used B2's authority" is proved by the wire
  // rather than inferred from the screen.
  const mediaWrite = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' && /\/api\/admin\/products\/[^/]+\/media$/.test(request.url()),
  );
  const noDraftPatch = page
    .waitForRequest(
      (request) =>
        request.method() === 'PATCH' && /\/api\/admin\/products\/[^/]+$/.test(request.url()),
      { timeout: 3_000 },
    )
    .then(
      () => true,
      () => false,
    );

  await tileAction(page, 3, NAMES.setPrimary(3, 3)).click();
  await tileAction(page, 3, NAMES.moveEarlier(3, 3)).click();
  // Read what the operator is looking at rather than re-deriving it: the point
  // of the reload below is that the server agrees with the screen, and a
  // hand-computed expectation would only prove the test can apply two rules.
  const staged = await renderedOrder(page);
  expect(staged).not.toEqual(before);
  await page.getByRole('button', { name: COPY.savePublished }).click();

  const request = await mediaWrite;
  const body = request.postDataJSON() as { expectedUpdatedAt: string; mediaAssetIds: string[] };
  expect(Object.keys(body).sort()).toEqual(['expectedUpdatedAt', 'mediaAssetIds']);
  expect(body.mediaAssetIds).toHaveLength(3);
  expect(await noDraftPatch).toBe(false);

  // The save action disappears because the response cleared the dirty state.
  await expect(page.getByRole('button', { name: COPY.savePublished })).toHaveCount(0);

  await openProduct(page, PRODUCTS.published());
  expect(await renderedOrder(page)).toEqual(staged);
  await expect(tiles(page)).toHaveCount(3);
  // Never unpublished, at any point.
  await expect(page.getByText(COPY.publishedBannerTitle)).toBeVisible();
  // The rail badge, not a text search: "Đang hiển thị" is a substring of two
  // approved sentences on this page, and the badge is the one that states the
  // *lifecycle*.
  await expect(page.locator(`.product-status--published`)).toHaveText(COPY.statusPublished);
});

test('B2 — a published product refuses to give up its last image', async ({ page }) => {
  await openProduct(page, PRODUCTS.publishedSingle());

  await expect(tiles(page)).toHaveCount(1);
  await expect(tileAction(page, 1, NAMES.remove(1, 1))).toBeDisabled();

  // The reason is on the screen, not discovered after a refused round trip.
  await tile(page, 1)
    .getByRole('button', { name: NAMES.select(1, 1) })
    .click();
  await expect(page.getByText(COPY.publishedMinimum)).toBeVisible();
});

test('C — the twenty-image cap blocks every route to a twenty-first', async ({ page }) => {
  await openProduct(page, PRODUCTS.draft20());

  await expect(tiles(page)).toHaveCount(20);
  await expect(capacity(page)).toHaveText('20/20');
  await expect(page.getByText(COPY.capacityFull)).toBeVisible();
  await expect(page.getByRole('button', { name: COPY.add })).toBeDisabled();
  await revealGrid(page);
  await expect.poll(() => everyImageLoaded(page)).toBe(true);

  // Free one place, and the picker must offer exactly one and refuse the rest.
  await tileAction(page, 20, NAMES.remove(20, 20)).click();
  await expect(capacity(page)).toHaveText('19/20');
  await page.getByRole('button', { name: COPY.add }).click();
  const picker = page.getByRole('dialog', { name: COPY.pickerTitle });
  // The capacity pill specifically: the footer states the same remainder in a
  // longer sentence, so a text search would match two elements.
  await expect(picker.locator('.product-picker__remaining')).toHaveText('Còn 1 chỗ');

  const boxes = picker.getByRole('checkbox');
  await boxes.nth(0).check();
  await expect(picker.getByText(COPY.pickerFullNotice)).toBeVisible();
  // Every remaining option is now programmatically unavailable.
  await expect(boxes.nth(1)).toHaveAttribute('aria-disabled', 'true');
  await boxes.nth(1).click({ force: true });
  await expect(boxes.nth(1)).not.toBeChecked();

  // Nothing is persisted: the dialog is dismissed and the product reloaded.
  await picker.getByRole('button', { name: COPY.pickerCancel }).click();
  await openProduct(page, PRODUCTS.draft20());
  await expect(tiles(page)).toHaveCount(20);
});

test('D — a stale write is refused rather than silently applied', async ({ page, context }) => {
  const productId = PRODUCTS.publishedRace();
  await openProduct(page, productId);
  await expect(tiles(page)).toHaveCount(2);

  // A second real tab, holding the same concurrency token.
  const other = await context.newPage();
  await openProduct(other, productId);
  await expect(tiles(other)).toHaveCount(2);

  // Tab A saves first and moves the token forward.
  await tileAction(page, 2, NAMES.setPrimary(2, 2)).click();
  await page.getByRole('button', { name: COPY.savePublished }).click();
  await expect(page.getByRole('button', { name: COPY.savePublished })).toHaveCount(0);
  const afterFirst = await renderedOrder(page);

  // Tab B now submits against the token it has held all along.
  await tileAction(other, 2, NAMES.setPrimary(2, 2)).click();
  await other.getByRole('button', { name: COPY.savePublished }).click();

  const dialog = other.getByRole('dialog', { name: COPY.conflictTitle });
  await expect(dialog).toBeVisible();
  // No force-save exists, and the staged arrangement is still the operator's.
  await expect(dialog.getByRole('button', { name: COPY.conflictReload })).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng' }).click();
  await expect(other.getByRole('button', { name: COPY.savePublished })).toBeVisible();

  // The server kept tab A's write. The refusal overwrote nothing.
  await openProduct(page, productId);
  expect(await renderedOrder(page)).toEqual(afterFirst);
  await other.close();
});

test('E — an Asset revoked mid-session is refused whole, and nothing is lost', async ({ page }) => {
  const productId = PRODUCTS.publishedRace();
  await openProduct(page, productId);
  const before = await renderedOrder(page);
  expect(before).toContain(revocableAssetId());

  // Stage an ordinary change first, so the refusal is about the Asset and not
  // about an empty request.
  await tileAction(page, 2, NAMES.setPrimary(2, 2)).click();

  // The Asset dies between staging and saving. No application path produces
  // that on demand, so it is written into this run's disposable database.
  const { revokeAsset } = (await import('../../support/app12/m01a1-media-fixture.mjs')) as {
    revokeAsset: (input: { databaseUrl: string; assetId: string }) => Promise<void>;
  };
  await revokeAsset({ databaseUrl: databaseUrl(), assetId: revocableAssetId() });

  await page.getByRole('button', { name: COPY.savePublished }).click();

  // Production Vietnamese, and no backend code anywhere on the screen.
  // The form's own failure panel. Next's route announcer is also `role=alert`
  // and is always in the document, so an unscoped role query is ambiguous.
  const alert = page.locator('.product-form__failure');
  await expect(alert).toContainText(COPY.assetUnavailableTitle);
  await expect(alert).not.toContainText('PRODUCT_MEDIA_ASSET_UNAVAILABLE');

  // The refusal is whole: the operator's staged arrangement is still on screen,
  // and the server still holds exactly what it held before.
  await expect(page.getByRole('button', { name: COPY.savePublished })).toBeVisible();
  await openProduct(page, productId);
  expect(await renderedOrder(page)).toEqual(before);
  await expect(page.getByText(COPY.publishedBannerTitle)).toBeVisible();
});

test('F — the changed Admin surfaces are operable and axe-clean', async ({ page }) => {
  /**
   * `color-contrast` is excluded from the **gate** and from nothing else, for
   * the reason `APP12-H08` recorded: the three failing token pairs are named
   * by the Product Owner's own ruling `PO-APP12-004` and are `APP12-V02`'s to
   * change, not this package's. Every other rule counts, and no rule was
   * disabled to reach a number.
   */
  const { runAxe, describeViolations } = (await import('../../support/app12/h08-axe.mjs')) as {
    runAxe: (page: Page, options: Record<string, unknown>) => Promise<{ gated: unknown[] }>;
    describeViolations: (scan: unknown) => string;
  };
  const scan = async (label: string) => {
    const result = await runAxe(page, { label, disableRules: ['color-contrast'] });
    expect(result.gated.length, `axe ${label}: ${describeViolations(result)}`).toBe(0);
  };

  // The three changed surfaces at 1440 …
  await openProduct(page, PRODUCTS.draft20());
  await expect(tiles(page)).toHaveCount(20);
  await scan('draft-20-images');

  await openProduct(page, PRODUCTS.published());
  await scan('published-media-editor');

  await page.getByRole('button', { name: COPY.add }).click();
  await expect(page.getByRole('dialog', { name: COPY.pickerTitle })).toBeVisible();
  await scan('asset-picker');
  await page.getByRole('dialog').getByRole('button', { name: COPY.pickerCancel }).click();

  // … and the one that only exists at 390.
  await resize(page, 'mobile');
  await openProduct(page, PRODUCTS.draft8());
  const mobileTotal = await totalTiles(page);
  await tile(page, 4)
    .getByRole('button', { name: NAMES.select(4, mobileTotal) })
    .click();
  await expect(actionBar(page, 4, mobileTotal)).toBeVisible();
  await scan('mobile-selected-action-bar');

  // Keyboard media management: reach a control by Tab alone, operate it with
  // the keyboard, and be *told* what happened — a reorder changes nothing in a
  // tile's own text, so without the live region the operator perceives nothing.
  await resize(page, 'desktop');
  await openProduct(page, PRODUCTS.draft8());
  const total = await totalTiles(page);
  const moveEarlier = tileAction(page, 3, NAMES.moveEarlier(3, total));
  await moveEarlier.focus();
  await expect(moveEarlier).toBeFocused();
  await page.keyboard.press('Enter');

  const live = page.locator('.product-media-editor__sr-status');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await expect(live).toHaveText(`Đã chuyển ảnh tới vị trí 2 trên ${String(total)}.`);

  // The anchor rule is programmatic, not merely drawn.
  await expect(tileAction(page, 1, NAMES.moveEarlier(1, total))).toBeDisabled();
  await expect(tileAction(page, 1, NAMES.moveLater(1, total))).toBeDisabled();
  await expect(tile(page, 1).getByRole('button', { name: NAMES.setPrimary(1, total) })).toHaveCount(
    0,
  );
});

test('V — the visual matrix at 1440, 1024 and 390', async ({ page }) => {
  // ---- 1440 -------------------------------------------------------------
  await openProduct(page, PRODUCTS.draft8());
  await revealGrid(page);
  await expect.poll(() => everyImageLoaded(page)).toBe(true);
  await capture(page, 'desktop', 'draft-8-images');

  await openProduct(page, PRODUCTS.draft20());
  await expect(tiles(page)).toHaveCount(20);
  await revealGrid(page);
  await expect.poll(() => everyImageLoaded(page)).toBe(true);
  await capture(page, 'desktop', 'draft-20-images-cap');

  await openProduct(page, PRODUCTS.published());
  await capture(page, 'desktop', 'published-media-editable');

  await openProduct(page, PRODUCTS.draft8());
  await page.getByRole('button', { name: COPY.add }).click();
  await expect(page.getByRole('dialog', { name: COPY.pickerTitle })).toBeVisible();
  await capture(page, 'desktop', 'picker-remaining-capacity');
  await page.getByRole('dialog').getByRole('button', { name: COPY.pickerCancel }).click();

  // The section at the cap, and then the picker at the cap. They are two
  // different refusals — one disables `Thêm ảnh`, the other disables every
  // unattached option — and the package asks for both.
  await openProduct(page, PRODUCTS.draft20());
  await expect(page.getByRole('button', { name: COPY.add })).toBeDisabled();
  await capture(page, 'desktop', 'media-full-cap-state');

  // Free one place so the picker can be opened, then fill it again inside the
  // picker. Nothing is saved: the dialog is dismissed and the page left.
  await tileAction(page, 20, NAMES.remove(20, 20)).click();
  await page.getByRole('button', { name: COPY.add }).click();
  const fullPicker = page.getByRole('dialog', { name: COPY.pickerTitle });
  await expect.poll(() => fullPicker.locator('.product-picker__option').count()).toBeGreaterThan(1);
  await fullPicker.getByRole('checkbox').nth(0).check();
  await expect(fullPicker.getByText(COPY.pickerFullNotice)).toBeVisible();
  await capture(page, 'desktop', 'picker-full-cap-state');
  await fullPicker.getByRole('button', { name: COPY.pickerCancel }).click();

  // ---- 1024 -------------------------------------------------------------
  await resize(page, 'tablet');
  await openProduct(page, PRODUCTS.draft20());
  await expect(tiles(page)).toHaveCount(20);
  await revealGrid(page);
  await expect.poll(() => everyImageLoaded(page)).toBe(true);
  expect(await horizontalOverflow(page)).toBe(0);
  // Never one full-width column. The Admin nav and the 320px metadata rail leave
  // the form column ≈ 270px here, and the first implementation's 140px tile
  // floor collapsed the grid to a single column — twenty full-width tiles, the
  // exact anti-pattern this package removes. Measured, not assumed.
  const tabletColumns = await gridColumns(page);
  process.stdout.write(
    `[m01a1] 1024 grid: width=${String(await gridWidth(page))}px columns=${String(tabletColumns)}
`,
  );
  expect(tabletColumns).toBeGreaterThanOrEqual(2);
  await capture(page, 'tablet', 'draft-20-images');

  await openProduct(page, PRODUCTS.published());
  await expect(page.getByRole('button', { name: COPY.add })).toBeEnabled();
  await capture(page, 'tablet', 'published-media-editable');

  // ---- 390 --------------------------------------------------------------
  await resize(page, 'mobile');

  await openProduct(page, PRODUCTS.draft8());
  await capture(page, 'mobile', 'draft-several-images');
  expect(await horizontalOverflow(page)).toBe(0);

  // The mobile treatment: one bar for the selected image, not four controls on
  // each tile. The in-tile bar is not merely hidden — it is not in the layout.
  const shown = await totalTiles(page);
  await tile(page, 4)
    .getByRole('button', { name: NAMES.select(4, shown) })
    .click();
  const bar = actionBar(page, 4, shown);
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('button')).toHaveCount(5);
  await expect(tile(page, 4).locator('.product-media-tile__actions')).toBeHidden();
  await capture(page, 'mobile', 'selected-image-action-bar');

  // The bar must stay inside the viewport and must not cover the image it acts
  // on — a bar that hid its own subject would be worse than no bar.
  const barBox = await bar.boundingBox();
  const tileBox = await tile(page, 4).boundingBox();
  expect(barBox).not.toBeNull();
  expect(tileBox).not.toBeNull();
  expect(barBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((barBox?.x ?? 0) + (barBox?.width ?? 0)).toBeLessThanOrEqual(390);
  const barTop = barBox?.y ?? 0;
  const tileBottom = (tileBox?.y ?? 0) + (tileBox?.height ?? 0);
  expect(barTop).toBeGreaterThanOrEqual(tileBottom - 1);

  await openProduct(page, PRODUCTS.draft20());
  await expect(tiles(page)).toHaveCount(20);
  await revealGrid(page);
  await expect.poll(() => everyImageLoaded(page)).toBe(true);
  expect(await horizontalOverflow(page)).toBe(0);
  // Two columns, ten rows — not twenty full-width rows.
  process.stdout.write(
    `[m01a1] 390 grid: width=${String(await gridWidth(page))}px columns=${String(await gridColumns(page))}
`,
  );
  expect(await gridColumns(page)).toBe(2);
  await capture(page, 'mobile', 'draft-20-images-cap');

  await openProduct(page, PRODUCTS.published());
  await expect(page.getByText(COPY.publishedBannerTitle)).toBeVisible();
  await expect(page.getByRole('button', { name: COPY.add })).toBeEnabled();
  expect(await horizontalOverflow(page)).toBe(0);
  await capture(page, 'mobile', 'published-media-editable');

  await page.getByRole('button', { name: COPY.add }).click();
  await expect(page.getByRole('dialog', { name: COPY.pickerTitle })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  await capture(page, 'mobile', 'picker-sheet');
  await page.getByRole('dialog').getByRole('button', { name: COPY.pickerCancel }).click();

  // The approved empty state, on a Product that genuinely has no images rather
  // than on one emptied for the screenshot.
  await openProduct(page, PRODUCTS.draft0());
  await expect(page.getByText('Chưa chọn ảnh nào cho sản phẩm này.')).toBeVisible();
  await expect(grid(page)).toHaveCount(0);
  await expect(capacity(page)).toHaveText('0/20');
  expect(await horizontalOverflow(page)).toBe(0);
  await capture(page, 'mobile', 'draft-empty');
});
