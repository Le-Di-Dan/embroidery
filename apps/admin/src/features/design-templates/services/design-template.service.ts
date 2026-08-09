/**
 * Feature service seam over the two `APP3-B03` operations `APP3-A02` consumes.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as a `DesignTemplateApiError` carrying only
 * the normalized envelope, so no raw transport error reaches React state.
 *
 * `adminDesignTemplateDetail` is deliberately unreachable from here, and is not
 * on the client boundary at all. The list renders from summaries by design; a
 * detail read available to this screen is an invitation to resolve a row by
 * fetching it, which is exactly the N+1 a keyset list exists to avoid.
 *
 * The lifecycle operations are equally absent. `APP3-A02` is list management —
 * publish, unpublish and archive belong to `APP3-A04`.
 */
import {
  adminDesignTemplateCreate,
  adminDesignTemplateList,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  AdminDesignTemplateDetailResponse,
  AdminDesignTemplateListResponse,
  CreateDesignTemplateBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { DesignTemplateApiError } from '../model/design-template-failure';
import { toListParams, type DesignTemplateFilters } from '../model/design-template-filters';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

export interface FetchTemplatePageInput {
  readonly filters: DesignTemplateFilters;
  readonly pageSize: number;
  /** Opaque keyset cursor from the previous page; absent for the first page. */
  readonly cursor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One keyset page, newest first.
 *
 * The cursor is passed back **exactly** as the server issued it and is never
 * parsed, decoded or reconstructed — a retry after a failed continuation
 * re-sends the very same cursor rather than restarting the collection.
 */
export async function fetchTemplatePage({
  filters,
  pageSize,
  cursor,
  signal,
}: FetchTemplatePageInput): Promise<AdminDesignTemplateListResponse> {
  try {
    const response = await adminDesignTemplateList(
      { ...toListParams(filters, pageSize), ...(cursor === undefined ? {} : { cursor }) },
      requestOptions(signal),
    );
    return response.data;
  } catch (error: unknown) {
    throw new DesignTemplateApiError(normalizeApiClientError(error));
  }
}

/**
 * Creates a DRAFT header.
 *
 * The body is the generated one, unchanged: the server derives the slug from
 * the name, starts the template in `DRAFT` and writes **no** version. Nothing
 * here sends a slug, a status, a version, a document or a schema version —
 * there are no such members to send.
 *
 * The response is a *detail* view, which is the one place a fresh template's
 * "no version yet" is a fact the API actually states.
 */
export async function createTemplate(
  body: CreateDesignTemplateBody,
  signal?: AbortSignal,
): Promise<AdminDesignTemplateDetailResponse> {
  try {
    const response = await adminDesignTemplateCreate(body, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new DesignTemplateApiError(normalizeApiClientError(error));
  }
}
