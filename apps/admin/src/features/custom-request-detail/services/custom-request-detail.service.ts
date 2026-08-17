/**
 * Feature service seam over the two `APP5` Admin **read** operations this screen
 * consumes: `adminCustomRequest_detail` and `adminCustomRequestAsset_get`.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves this
 * module as a `CustomRequestDetailApiError` carrying only the normalized
 * envelope, so no raw transport error reaches React state.
 *
 * ### The evidence call is addressed by the pair, always
 *
 * `APP5-B06` publishes no address that reaches an asset outside the request it
 * is bound to, so both ids are parameters of the operation and neither is
 * optional. There is no bucket, object key, storage URL, presign or asset token
 * anywhere on this path — the response is bytes, and the only thing that
 * authorizes them is the Admin session cookie the shared client already carries.
 */
import {
  adminCustomRequestAssetGet,
  adminCustomRequestDetail,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { AdminCustomRequestDetailResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { CustomRequestDetailApiError } from '../model/custom-request-detail-failure';

interface RequestScopedInput {
  readonly requestId: string;
  readonly signal?: AbortSignal | undefined;
}

/** The canonical detail read. Nothing is written and no status moves. */
export async function fetchCustomRequestDetail({
  requestId,
  signal,
}: RequestScopedInput): Promise<AdminCustomRequestDetailResponse> {
  try {
    const body = await adminCustomRequestDetail(requestId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
    return body.data;
  } catch (error: unknown) {
    throw new CustomRequestDetailApiError(normalizeApiClientError(error));
  }
}

export interface FetchEvidenceInput extends RequestScopedInput {
  readonly assetId: string;
}

/**
 * One private evidence image, as a `Blob`.
 *
 * The generated operation already sets `responseType: 'blob'`; this seam adds
 * only the instance and the cancellation signal. The bytes are never persisted,
 * never logged and never turned into a URL here — the browser resource is the
 * caller's to own and, more importantly, to revoke.
 */
export async function fetchRequestEvidence({
  requestId,
  assetId,
  signal,
}: FetchEvidenceInput): Promise<Blob> {
  try {
    return await adminCustomRequestAssetGet(requestId, assetId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
  } catch (error: unknown) {
    throw new CustomRequestDetailApiError(normalizeApiClientError(error));
  }
}
