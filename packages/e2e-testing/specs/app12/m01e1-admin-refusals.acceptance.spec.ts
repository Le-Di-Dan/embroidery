/**
 * `APP12-M01.E1` §10 — every invalid PUBLISHED media write, and what survives it.
 *
 * Seven cases, and one shared assertion after each: the Product is still
 * PUBLISHED, its stored images are exactly what they were, and its commercial
 * fields are untouched. That is what "atomic" means here, and it is checked
 * against the **rows** rather than against the response that refused.
 *
 * ```text
 * empty media set          the screen refuses before the request, and so does
 *                          the server when asked directly
 * rejected Asset           an Asset dies between staging and saving
 * missing derivative       the Asset survives; the rendition does not
 * duplicate Asset          composable only over HTTP — no control offers it
 * twenty-one Assets        likewise
 * stale expectedUpdatedAt  two real tabs, the second refused
 * ```
 *
 * The Admin surface must state each refusal in approved Vietnamese and never in
 * a backend code — the copy below is transcribed from
 * `packages/i18n/messages/vi/admin.json` rather than imported, so a wording
 * change has to be a deliberate one.
 */
import { expect, test, type APIResponse, type Page } from '@playwright/test';

import { COPY, NAMES, openProduct, tile, tileAction, tiles } from './support/m01a1-world';
import { adminOrigin, E1, operatorSession, readStoredMedia } from './support/m01e1-world';
import { dropDerivative, restoreDerivative, setAssetStatus } from './support/m01e1-public-surfaces';

test.describe.configure({ mode: 'serial' });

/** The approved refusal copy, transcribed from the message repository. */
const FAILURE = {
  notPublishable: 'Không thể lưu bộ ảnh này',
  assetUnavailable: 'Một ảnh chưa sẵn sàng',
  versionConflict: 'Sản phẩm vừa được người khác cập nhật',
} as const;

/** Every backend code that must never reach an operator's screen. */
const BACKEND_CODES = [
  'PRODUCT_MEDIA_NOT_PUBLISHABLE',
  'PRODUCT_MEDIA_ASSET_UNAVAILABLE',
  'PRODUCT_MEDIA_DUPLICATE',
  'PRODUCT_MEDIA_TOO_MANY',
  'PRODUCT_VERSION_CONFLICT',
] as const;

interface Envelope {
  readonly success: boolean;
  readonly code: string;
  readonly data?: { readonly updatedAt: string };
}

async function readProduct(page: Page, productId: string): Promise<Envelope> {
  const response = await page.request.get(`/api/admin/products/${productId}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as Envelope;
}

/**
 * A media write composed over HTTP, for the two refusals no screen can produce.
 *
 * The session is the browser's own — `page.request` shares the context's
 * cookies — and `Origin` is stated because `StaffOriginGuard` requires one and
 * an `APIRequestContext` sends none. Nothing is bypassed.
 */
async function putMedia(
  page: Page,
  productId: string,
  mediaAssetIds: string[],
  expectedUpdatedAt?: string,
): Promise<APIResponse> {
  const token = expectedUpdatedAt ?? (await readProduct(page, productId)).data?.updatedAt;
  return page.request.put(`/api/admin/products/${productId}/media`, {
    headers: { 'content-type': 'application/json', origin: adminOrigin() },
    data: { expectedUpdatedAt: token, mediaAssetIds },
  });
}

/** The form's own failure panel. Next's route announcer is also `role=alert`. */
function failurePanel(page: Page) {
  return page.locator('.product-form__failure');
}

/** The Product survived the refusal exactly as it was. */
async function expectIntact(page: Page, productId: string, before: unknown): Promise<void> {
  expect(await readStoredMedia(productId), 'the stored images are unchanged').toEqual(before);
  await openProduct(page, productId);
  // The banner's own element, not a text search: "Sản phẩm đang xuất bản" is a
  // prefix of the published-minimum notice, which is on screen in exactly the
  // state this helper is called from.
  await expect(page.locator('.product-form__published-title')).toHaveText(
    COPY.publishedBannerTitle,
  );
  await expect(page.locator('.product-status--published')).toHaveText(COPY.statusPublished);
  // The commercial half is still locked and still the operator's, which is the
  // half a partial write would have damaged silently.
  await expect(page.getByLabel(COPY.nameLabel)).toBeDisabled();
  await expect(page.getByLabel(COPY.priceLabel)).toBeDisabled();
}

const operator = operatorSession();

test('an empty selection is refused on the screen and at the server', async () => {
  const page = operator.page();
  const productId = E1.refusalId();
  const before = await readStoredMedia(productId);

  // The screen anticipates it by disabling, never by narrowing the request.
  // Reduce to one image first, which is a legal PUBLISHED state.
  await openProduct(page, productId);
  await expect(tiles(page)).toHaveCount(3);
  const single = [before[0]?.assetId as string];
  const reduced = await putMedia(page, productId, single);
  expect(reduced.status(), await reduced.text()).toBe(200);

  await openProduct(page, productId);
  await expect(tiles(page)).toHaveCount(1);
  await expect(tileAction(page, 1, NAMES.remove(1, 1))).toBeDisabled();
  await tile(page, 1)
    .getByRole('button', { name: NAMES.select(1, 1) })
    .click();
  await expect(page.getByText(COPY.publishedMinimum)).toBeVisible();

  // And the server refuses the same thing when asked directly, atomically.
  const oneImage = await readStoredMedia(productId);
  const response = await putMedia(page, productId, []);
  expect(response.status(), await response.text()).toBe(409);
  expect(((await response.json()) as Envelope).code).toBe('PRODUCT_MEDIA_NOT_PUBLISHABLE');
  await expectIntact(page, productId, oneImage);

  // Restore the three images so the later cases start where the fixture left it.
  const restored = await putMedia(
    page,
    productId,
    before.map((row) => row.assetId),
  );
  expect(restored.status(), await restored.text()).toBe(200);
});

test('an Asset rejected between staging and saving is refused whole, in Vietnamese', async () => {
  const page = operator.page();
  const productId = E1.refusalId();
  const revocable = E1.refusalRevocable();
  const before = await readStoredMedia(productId);
  expect(before.map((row) => row.assetId)).toContain(revocable);

  await openProduct(page, productId);
  // Stage an ordinary change first, so the refusal is about the Asset rather
  // than about an empty request.
  await tileAction(page, 2, NAMES.setPrimary(2, 3)).click();

  // The Asset dies. No application path produces that on demand.
  await setAssetStatus(revocable, 'REJECTED');

  await page.getByRole('button', { name: COPY.savePublished }).click();
  await expect(failurePanel(page)).toContainText(FAILURE.assetUnavailable);
  for (const code of BACKEND_CODES) {
    await expect(failurePanel(page)).not.toContainText(code);
  }
  // The staged arrangement is still the operator's — nothing was discarded.
  await expect(page.getByRole('button', { name: COPY.savePublished })).toBeVisible();

  await expectIntact(page, productId, before);
  await setAssetStatus(revocable, 'ACCEPTED');
});

test('an Asset whose required derivative is gone is refused whole', async () => {
  const page = operator.page();
  const productId = E1.refusalId();
  const target = E1.refusalRevocable();
  const before = await readStoredMedia(productId);

  // The Asset stays ACCEPTED and in the catalog-media lane; only the rendition
  // the publication rules require goes. A genuinely different state from the
  // previous case, and it earns a different refusal.
  const removed = await dropDerivative(target, 'CATALOG_PREVIEW');

  await openProduct(page, productId);
  await tileAction(page, 2, NAMES.setPrimary(2, 3)).click();
  await page.getByRole('button', { name: COPY.savePublished }).click();

  await expect(failurePanel(page)).toContainText(FAILURE.notPublishable);
  for (const code of BACKEND_CODES) {
    await expect(failurePanel(page)).not.toContainText(code);
  }
  await expectIntact(page, productId, before);

  // Put the rendition back. Left removed, it would decide every later case on
  // this Product — the stale-token journey would be refused for *this* reason
  // and would prove nothing about concurrency.
  await restoreDerivative(removed);
  const recovered = await putMedia(page, productId, [
    before[1]?.assetId as string,
    before[0]?.assetId as string,
    before[2]?.assetId as string,
  ]);
  expect(recovered.status(), await recovered.text()).toBe(200);
});

test('a duplicate and a twenty-first Asset are refused atomically over HTTP', async () => {
  const page = operator.page();
  const productId = E1.publishedId();
  const before = await readStoredMedia(productId);
  expect(before.length, 'the §9 journey left this Product with images').toBeGreaterThan(0);
  const ids = before.map((row) => row.assetId);
  const first = ids[0] as string;

  // Neither of these is composable from any screen: no control offers the same
  // image twice, and `Thêm ảnh` disables itself at the cap. They are still
  // refusals the operation owes, so they are asked for directly.
  const duplicate = await putMedia(page, productId, [first, first]);
  expect(duplicate.status(), await duplicate.text()).toBe(400);
  expect(((await duplicate.json()) as Envelope).code).toBe('PRODUCT_MEDIA_DUPLICATE');
  expect(await readStoredMedia(productId)).toEqual(before);

  const twentyOne = E1.domainPool().slice(0, 21);
  expect(twentyOne).toHaveLength(21);
  const tooMany = await putMedia(page, productId, twentyOne);
  expect(tooMany.status(), await tooMany.text()).toBe(400);
  expect(((await tooMany.json()) as Envelope).success).toBe(false);

  await expectIntact(page, productId, before);
});

test('a stale token cannot overwrite a write that already landed', async () => {
  const page = operator.page();
  const context = page.context();
  const productId = E1.refusalId();
  await openProduct(page, productId);
  const total = await tiles(page).count();
  expect(total).toBeGreaterThan(1);

  // A second real tab, holding the same concurrency token.
  const other = await context.newPage();
  await openProduct(other, productId);
  await expect(tiles(other)).toHaveCount(total);

  // Tab A saves first and moves the token forward.
  await tileAction(page, 2, NAMES.setPrimary(2, total)).click();
  await page.getByRole('button', { name: COPY.savePublished }).click();
  await expect(page.getByRole('button', { name: COPY.savePublished })).toHaveCount(0);
  const afterFirst = await readStoredMedia(productId);

  // Tab B now submits against the token it has held all along.
  await tileAction(other, 2, NAMES.setPrimary(2, total)).click();
  await other.getByRole('button', { name: COPY.savePublished }).click();

  const dialog = other.getByRole('dialog', { name: COPY.conflictTitle });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(FAILURE.versionConflict)).toBeVisible();
  // No force-save exists anywhere on this dialog.
  await expect(dialog.getByRole('button', { name: COPY.conflictReload })).toBeVisible();
  await expect(dialog.getByRole('button')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Đóng' }).click();

  // The refusal overwrote nothing: the server still holds tab A's write.
  expect(await readStoredMedia(productId)).toEqual(afterFirst);
  await other.close();
});
