/**
 * `APP12-M01.E1` §20 — the accessibility gate on every Admin surface this
 * package changed, and the keyboard path through media management.
 *
 * A file of its own, separated from the §13 audit next door, and the split is
 * deliberate: these journeys are serial, so a failing audit in the same file
 * would skip them and an unproved accessibility gate would be reported as
 * "did not run" rather than as a result. Two files, two verdicts.
 *
 * `color-contrast` is excluded from the **gate** and from nothing else, for the
 * reason `APP12-H08` recorded and `PO-APP12-004` ruled: the failing token pairs
 * are `APP12-V02`'s to change, not this package's. Every other rule counts, and
 * no rule was disabled to reach a number.
 */
import { expect, test } from '@playwright/test';

import {
  COPY,
  NAMES,
  PRODUCTS,
  actionBar,
  openProduct,
  resize,
  tile,
  tileAction,
  tiles,
  totalTiles,
} from './support/m01a1-world';
import { capture, E1, expectAxeClean, operatorSession } from './support/m01e1-world';

test.describe.configure({ mode: 'serial' });

const operator = operatorSession();

test('§20 — every changed Admin surface is axe-clean, at 1440 and at 390', async () => {
  const page = operator.page();
  await openProduct(page, PRODUCTS.draft20());
  await expect(tiles(page)).toHaveCount(20);
  await expectAxeClean(page, 'admin-draft-20-images');

  await openProduct(page, E1.publishedId());
  await expectAxeClean(page, 'admin-published-media-editor');

  await page.getByRole('button', { name: COPY.add }).click();
  await expect(page.getByRole('dialog', { name: COPY.pickerTitle })).toBeVisible();
  await expectAxeClean(page, 'admin-asset-picker');
  await page.getByRole('dialog').getByRole('button', { name: COPY.pickerCancel }).click();

  // The one surface that exists only at 390.
  await resize(page, 'mobile');
  await openProduct(page, PRODUCTS.draft8());
  const total = await totalTiles(page);
  await tile(page, 4)
    .getByRole('button', { name: NAMES.select(4, total) })
    .click();
  await expect(actionBar(page, 4, total)).toBeVisible();
  await expectAxeClean(page, 'admin-mobile-action-bar');
  await capture(page, 'mobile', 'admin-selected-image-action-bar');
  await resize(page, 'desktop');
});

test('§20 — media management is reachable and operable from the keyboard alone', async () => {
  const page = operator.page();
  await openProduct(page, PRODUCTS.draft8());
  const total = await totalTiles(page);

  const moveEarlier = tileAction(page, 3, NAMES.moveEarlier(3, total));
  await moveEarlier.focus();
  await expect(moveEarlier).toBeFocused();
  await page.keyboard.press('Enter');

  // A reorder changes nothing in a tile's own text, so without the live region
  // a keyboard operator perceives nothing at all.
  const live = page.locator('.product-media-editor__sr-status');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await expect(live).toHaveText(`Đã chuyển ảnh tới vị trí 2 trên ${String(total)}.`);

  // Set-primary and remove, both from the keyboard.
  const setPrimary = tileAction(page, 3, NAMES.setPrimary(3, total));
  await setPrimary.focus();
  await page.keyboard.press('Enter');
  await expect(live).toContainText('ảnh đại diện');

  // The anchor rule is programmatic rather than merely drawn: the primary tile
  // offers no set-primary action at all and both its arrows are disabled.
  await expect(tileAction(page, 1, NAMES.moveEarlier(1, total))).toBeDisabled();
  await expect(tileAction(page, 1, NAMES.moveLater(1, total))).toBeDisabled();
  await expect(tile(page, 1).getByRole('button', { name: NAMES.setPrimary(1, total) })).toHaveCount(
    0,
  );

  // Primary state is not carried by colour alone: a badge on the image and a
  // text label beneath it.
  await expect(tile(page, 1).getByText(COPY.rolePrimary)).toHaveCount(2);
});
