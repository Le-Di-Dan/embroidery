/**
 * Feature service seam over the two `APP8-B01` Admin **read** operations this
 * workspace consumes: `adminSkuStock_get` and `adminSkuStock_ledger`.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves
 * this module as a `SkuStockApiError` carrying only the normalized envelope, so
 * no raw transport error reaches React state.
 *
 * The reads are kept apart from the write for the reason `APP7-A01` separated
 * them: a read may be re-issued freely and this one is, after every adjustment;
 * the write may not, and there is no idempotency key on it to make a resend
 * safe. Keeping them in different modules is what makes "this screen refetches"
 * and "this screen writes" different sentences.
 */
import {
  adminSkuStockGet,
  adminSkuStockLedger,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { AdminSkuStockLedgerResponse, AdminSkuStockResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { SkuStockApiError } from '../model/sku-stock-failure';

interface SkuScopedInput {
  readonly skuId: string;
  readonly signal?: AbortSignal | undefined;
}

/**
 * The stock record and its availability.
 *
 * This read is not side-effect free at the database, and that is deliberate:
 * `APP8-B01` creates the `sku_stocks` anchor lazily and idempotently on first
 * use, so opening the screen for a SKU that has never been counted succeeds and
 * reports zero rather than being refused. The client does nothing to provoke or
 * detect that — it issues one read and renders the answer.
 */
export async function fetchSkuStock({
  skuId,
  signal,
}: SkuScopedInput): Promise<AdminSkuStockResponse> {
  try {
    const body = await adminSkuStockGet(skuId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
    return body.data;
  } catch (error: unknown) {
    throw new SkuStockApiError(normalizeApiClientError(error));
  }
}

/**
 * The bounded movement history: at most 100 entries, newest first, with
 * `truncated` saying whether older ones exist.
 *
 * No cursor, page number or limit is passed, because the operation accepts
 * none. There is nothing here to paginate with and nothing above may pretend
 * otherwise.
 */
export async function fetchSkuStockLedger({
  skuId,
  signal,
}: SkuScopedInput): Promise<AdminSkuStockLedgerResponse> {
  try {
    const body = await adminSkuStockLedger(skuId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
    return body.data;
  } catch (error: unknown) {
    throw new SkuStockApiError(normalizeApiClientError(error));
  }
}
