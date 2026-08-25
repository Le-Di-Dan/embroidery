/**
 * The query-key factory for the Admin SKU stock workspace.
 *
 * Two entries, one per published read, both keyed by `skuId` because that is
 * the only address `APP8-B01` accepts:
 *
 * - **the stock record** — `adminSkuStock_get`. Availability is computed under
 *   the anchor row lock and never stored, so this entry is the screen's only
 *   source of on-hand, held, reserved and available. It is re-read after an
 *   adjustment, never patched from the operator's delta.
 * - **the ledger** — `adminSkuStock_ledger`. It changes for the same reasons
 *   and at the same moments, but it is a separate request and therefore a
 *   separate key: a failed history must not blank out the metrics beside it.
 *
 * Nothing else is ever a key part. The adjustment invalidates exactly these two
 * entries for exactly this SKU — never the whole cache, and never another
 * feature's root, because nothing else on the Admin surface reads stock.
 */
const ROOT = ['admin', 'sku-stock'] as const;

export const skuStockKeys = {
  all: ROOT,
  /** One SKU's stock truth. */
  stock: (skuId: string) => [...ROOT, skuId, 'stock'] as const,
  /** One SKU's bounded movement history. */
  ledger: (skuId: string) => [...ROOT, skuId, 'ledger'] as const,
} as const;
