/**
 * Feature service seam over the three `APP7` Admin **read** operations this
 * workspace consumes: `adminOrder_detail`, `adminOrderPayment_read` and
 * `adminPaymentEvidence_get`.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves this
 * module as an `OrderDetailApiError` carrying only the normalized envelope, so
 * no raw transport error reaches React state.
 *
 * ### The evidence call is addressed by `evidenceId`, always
 *
 * `APP7-B06` serves the `payment_transfer_evidence` association, not an asset.
 * There is no route that reaches a file by its own id, `APP7-B04` publishes no
 * `assetId` for one to be lifted from, and there is no bucket, object key,
 * storage URL, presign or download token anywhere on this path. The response is
 * bytes, and the only thing that authorizes them is the Admin session cookie the
 * shared client already carries — re-proved by the server on every single
 * request, so the id in a URL grants nothing on its own.
 *
 * ### The reads are kept apart from the writes
 *
 * `payment-decision.service.ts` holds the two mutations. A read may be re-issued
 * freely; neither decision may, and keeping them in separate modules is what
 * makes "this screen refetches" and "this screen writes" different sentences.
 */
import {
  adminOrderDetail,
  adminOrderPaymentRead,
  adminPaymentEvidenceGet,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { AdminOrderDetailResponse, AdminOrderPaymentsResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { OrderDetailApiError } from '../model/order-detail-failure';

interface OrderScopedInput {
  readonly orderId: string;
  readonly signal?: AbortSignal | undefined;
}

/** The frozen order and its lines. Nothing is written and no status moves. */
export async function fetchOrderDetail({
  orderId,
  signal,
}: OrderScopedInput): Promise<AdminOrderDetailResponse> {
  try {
    const body = await adminOrderDetail(orderId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
    return body.data;
  } catch (error: unknown) {
    throw new OrderDetailApiError(normalizeApiClientError(error));
  }
}

/**
 * The deposit obligation, every attempt, the evidence metadata and the
 * reconciliation history — the single source of payment truth on this screen.
 */
export async function fetchOrderPayments({
  orderId,
  signal,
}: OrderScopedInput): Promise<AdminOrderPaymentsResponse> {
  try {
    const body = await adminOrderPaymentRead(orderId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
    return body.data;
  } catch (error: unknown) {
    throw new OrderDetailApiError(normalizeApiClientError(error));
  }
}

export interface FetchEvidenceInput {
  readonly evidenceId: string;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One private transfer screenshot, as a `Blob`.
 *
 * The generated operation already sets `responseType: 'blob'`; this seam adds
 * only the instance and the cancellation signal. The bytes are never persisted,
 * never logged and never turned into a URL here — the browser resource is the
 * caller's to own and, more importantly, to revoke.
 */
export async function fetchPaymentEvidence({
  evidenceId,
  signal,
}: FetchEvidenceInput): Promise<Blob> {
  try {
    return await adminPaymentEvidenceGet(evidenceId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
  } catch (error: unknown) {
    throw new OrderDetailApiError(normalizeApiClientError(error));
  }
}
