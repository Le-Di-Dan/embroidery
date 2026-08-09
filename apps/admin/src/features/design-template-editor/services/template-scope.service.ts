/**
 * The two reads/writes the initial scope assignment needs (`APP3-A03-C1`).
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as a `TemplateEditorApiError` carrying only
 * the normalized envelope, so no raw transport error reaches React state.
 *
 * `adminProductList` is the repository's accepted Admin Product discovery
 * operation — the same one `APP3-A02`'s toolbar filter uses. Nothing here
 * invents a Product search, reaches the *public* catalogue list (which answers a
 * narrower, published-only model), or resolves Products one detail request at a
 * time.
 *
 * There is deliberately no clear-scope or rescope call. `APP3-B03B` publishes
 * neither, and a function here that looked like one would be a promise the
 * contract cannot keep.
 */
import {
  adminDesignTemplateAssignScope,
  adminProductList,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  AdminDesignTemplateDetailResponse,
  AdminProductSummaryResponse,
  AssignDesignTemplateScopeBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { TemplateEditorApiError } from '../model/editor-failure';

/** One page names the Products an operator picks from; the contract allows 1–100. */
export const SCOPE_PRODUCT_PAGE_SIZE = 100;

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

export async function fetchScopeProductOptions(
  signal?: AbortSignal,
): Promise<readonly AdminProductSummaryResponse[]> {
  try {
    const response = await adminProductList(
      { limit: SCOPE_PRODUCT_PAGE_SIZE },
      requestOptions(signal),
    );
    return response.data.items;
  } catch (error: unknown) {
    throw new TemplateEditorApiError(normalizeApiClientError(error));
  }
}

export interface AssignTemplateScopeInput {
  readonly templateId: string;
  readonly productId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

/**
 * Binds the Template to one exact placement, once.
 *
 * The body is exactly the three ids the contract declares. There is no version,
 * document, status, slug or name member to send — `APP3-B03B` accepts none, and
 * this operation never travels with a document save: the scope has to exist
 * before a document can be constructed at all.
 */
export async function assignTemplateScope(
  { templateId, productId, productSideId, embroideryAreaId }: AssignTemplateScopeInput,
  signal?: AbortSignal,
): Promise<AdminDesignTemplateDetailResponse> {
  const body: AssignDesignTemplateScopeBody = { productId, productSideId, embroideryAreaId };
  try {
    const response = await adminDesignTemplateAssignScope(templateId, body, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new TemplateEditorApiError(normalizeApiClientError(error));
  }
}
