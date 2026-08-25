import { SkuStockScreen } from '../../../../../features/sku-stock';

interface SkuStockPageProps {
  readonly params: Promise<{ readonly skuId: string }>;
}

/**
 * `/kho/skus/{skuId}` — the Admin SKU stock workspace (`APP8-A01`).
 *
 * A thin boundary: the `(protected)` layout has already resolved the session
 * and rendered the shell, and the capability owns the stock read, the ledger
 * read and the audited adjustment.
 *
 * This segment does not prefetch. Availability is computed under the
 * `sku_stocks` row lock and is true only for the transaction that produced it —
 * a reservation worker can move it between the server render and the browser's
 * first paint. A quantity baked into a document is exactly the kind of stale
 * truth an operator must not act on, and the client's own read would supersede
 * it on mount regardless.
 *
 * The route key is passed down as a plain string and is never treated as an
 * authorization: all three `APP8-B01` operations re-check the Admin session on
 * every request, and a SKU id in a URL grants nothing on its own.
 */
export default async function SkuStockPage({ params }: SkuStockPageProps) {
  const { skuId } = await params;

  return <SkuStockScreen skuId={skuId} />;
}
