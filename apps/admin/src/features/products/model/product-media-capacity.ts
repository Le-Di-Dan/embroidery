/**
 * How many images a product may carry, and what remains.
 *
 * ## Why a frontend constant exists at all
 *
 * The cap is the backend's (`MAX_PRODUCT_MEDIA_ITEMS`, `product-draft.policy`),
 * and `APP12-M01.B2` renders it into the published contract as
 * `ReplaceProductMediaBody.mediaAssetIds.maxItems`. But `maxItems` survives
 * generation only as a JSDoc annotation — `@maxItems 20` above a plain
 * `string[]` — so there is no runtime value on the generated client to read.
 * The screen still has to say `8/20`, disable `Thêm ảnh` at the cap and stop the
 * picker before it composes a request the server would refuse.
 *
 * So one semantic constant lives here, in the feature that owns the Product
 * media selection, and **nowhere else**: no component writes the literal, and
 * no second copy exists in the picker. It is pinned to the contract by a parity
 * test that reads `packages/contracts/openapi/openapi.generated.json` directly,
 * which is what makes a future backend change to the cap a failing test rather
 * than a screen that quietly lies about the limit.
 *
 * No API operation was added to publish the number (`APP12-M01.A1` §6): an
 * endpoint whose whole payload is a compile-time constant would be a request
 * per page load to learn something the contract already states.
 */

/**
 * The maximum number of images one Product may carry.
 *
 * Mirrors `ReplaceProductMediaBody.mediaAssetIds.maxItems` in the committed
 * OpenAPI artifact. Changing it here without changing the contract is a test
 * failure, by design.
 */
export const MAX_PRODUCT_MEDIA_ITEMS = 20;

/** How many more images the product can accept. Never negative. */
export function remainingCapacity(selectedCount: number): number {
  return Math.max(0, MAX_PRODUCT_MEDIA_ITEMS - selectedCount);
}

/** True when no further image may be added. */
export function isAtCapacity(selectedCount: number): boolean {
  return remainingCapacity(selectedCount) === 0;
}
