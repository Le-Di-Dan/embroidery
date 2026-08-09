/**
 * The two Product-owned reads the editor needs for context.
 *
 * Neither belongs to the Template. A Template carries three ids; the geometry,
 * the names and the artwork they point at are the Product's, and the editor
 * reads them through the operations that already publish them rather than
 * through anything Template-shaped.
 *
 * `fetchSideBackground` is deliberately this feature's own thin wrapper rather
 * than an import from `APP3-A01`'s placement feature. The two differ in the fact
 * that decides whether the request may happen at all — A01 gates on the
 * persisted background association matching an unsaved draft, A03 gates on the
 * Template's scope resolving — and they cache under different roots. What they
 * genuinely share is one generated call, which is what is reused here. A
 * cross-feature import would have coupled two capabilities to make one line
 * common.
 *
 * The response is `Blob`: the bytes themselves, streamed by the API from private
 * storage. There is no address in it. Nothing here builds a storage URL, reads a
 * key, or falls back to the public Side-background route, which requires a
 * PUBLISHED Product that a draft Template's Product need not be.
 */
import {
  adminProductPlacementGet,
  adminProductSideBackgroundGet,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { AdminProductPlacementResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { TemplateEditorApiError } from '../model/editor-failure';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

/** The Product's authoritative Sides and Areas, retired rows included. */
export async function fetchProductPlacement(
  productId: string,
  signal?: AbortSignal,
): Promise<AdminProductPlacementResponse> {
  try {
    const response = await adminProductPlacementGet(productId, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new TemplateEditorApiError(normalizeApiClientError(error));
  }
}

export async function fetchSideBackground(
  productId: string,
  sideId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  try {
    return await adminProductSideBackgroundGet(productId, sideId, requestOptions(signal));
  } catch (error: unknown) {
    throw new TemplateEditorApiError(normalizeApiClientError(error));
  }
}
