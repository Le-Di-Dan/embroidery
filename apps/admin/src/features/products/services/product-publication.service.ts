/**
 * Feature service seam over the three `APP2-B03` publication operations.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as a `ProductApiError` carrying only the
 * normalized envelope, so no raw transport error reaches React state.
 *
 * The command bodies are typed by this feature *and* by the generated tree.
 * Until `APP3-P03` the generated `PublishProductBody` and `UnpublishProductBody`
 * were open index signatures — the Zod DTOs contributed no properties to the
 * artifact — so an object with a stray field, or with no `expectedUpdatedAt` at
 * all, compiled and each call needed a cast. `PublicationCommandBody` still
 * pins the single field the server's `.strict()` schema accepts; the compiler
 * now checks it against the published contract too.
 *
 * `adminProductArchive` is deliberately not reachable from here. It is not
 * re-exported from `@embroidery/api-client`, so unpublish cannot be confused
 * with archive even by a wrong import.
 */
import {
  adminProductPublicationReadiness,
  adminProductPublish,
  adminProductUnpublish,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  AdminProductPublicationReadinessResponse,
  AdminProductPublicationResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { ProductApiError } from '../model/product-failure';
import type { PublicationCommandBody } from '../model/product-publication';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

/**
 * The readiness report: the complete requirement set, the verdict, and the
 * status and token as of this read.
 *
 * Read-only on the server — it records nothing — so it is safe to refetch as
 * often as the screen needs, including immediately after a command refused.
 */
export async function fetchPublicationReadiness(
  productId: string,
  signal?: AbortSignal,
): Promise<AdminProductPublicationReadinessResponse> {
  try {
    const response = await adminProductPublicationReadiness(productId, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new ProductApiError(normalizeApiClientError(error));
  }
}

/**
 * `DRAFT → PUBLISHED` (`TR-LC04-01`).
 *
 * The server re-evaluates every requirement inside its own transaction against
 * locked rows, so a readiness report that passed a moment ago is never trusted
 * and this call may still refuse. The caller must treat refusal as normal.
 */
export async function publishProduct(
  productId: string,
  body: PublicationCommandBody,
  signal?: AbortSignal,
): Promise<AdminProductPublicationResponse> {
  try {
    const response = await adminProductPublish(productId, body, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new ProductApiError(normalizeApiClientError(error));
  }
}

/**
 * `PUBLISHED → DRAFT` (`TR-LC04-05`).
 *
 * Removes public eligibility by lifecycle state alone. This is not archive and
 * not a delete: slug, category, price, media links and derivatives all survive,
 * `archivedAt` is never written, and the product becomes editable again. There
 * is no reason field — the contract does not accept one, and the body is
 * `.strict()`.
 */
export async function unpublishProduct(
  productId: string,
  body: PublicationCommandBody,
  signal?: AbortSignal,
): Promise<AdminProductPublicationResponse> {
  try {
    const response = await adminProductUnpublish(productId, body, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new ProductApiError(normalizeApiClientError(error));
  }
}
