/**
 * Feature service seam over the three authoring operations the editor owns.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves
 * this module as a `GalleryEditorApiError` carrying only the normalized
 * envelope, so no raw transport error reaches React state.
 *
 * Publication and media live in `gallery-publication.service.ts`, and the two
 * asset lanes in `gallery-asset.service.ts`. The split is by what the operation
 * *guards*: everything here is unguarded authoring, everything there carries a
 * concurrency token — and keeping them apart is what makes "this call needs the
 * latest `updatedAt`" a property of the module rather than of a code review.
 */
import {
  adminGalleryEntryCreate,
  adminGalleryEntryDetail,
  adminGalleryEntryUpdate,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  AdminGalleryEntryDetailResponse,
  CreateGalleryEntryBody,
  UpdateGalleryEntryBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { GalleryEditorApiError } from '../model/gallery-editor-failure';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

/**
 * Creates the DRAFT with exactly the five fields the contract requires.
 *
 * One request. The status is not sent because it is not accepted; media is not
 * sent because it is a different operation; and there is no hidden follow-up
 * PATCH behind this call to smuggle in a field the create body does not take.
 */
export async function createGalleryEntry(
  body: CreateGalleryEntryBody,
  signal?: AbortSignal,
): Promise<AdminGalleryEntryDetailResponse> {
  try {
    const response = await adminGalleryEntryCreate(body, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new GalleryEditorApiError(normalizeApiClientError(error));
  }
}

/** The authoritative entry, including the `updatedAt` the guarded writes need. */
export async function fetchGalleryEntryDetail(
  entryId: string,
  signal?: AbortSignal,
): Promise<AdminGalleryEntryDetailResponse> {
  try {
    const response = await adminGalleryEntryDetail(entryId, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new GalleryEditorApiError(normalizeApiClientError(error));
  }
}

/**
 * Patches the authoring fields.
 *
 * The caller has already reduced the body to the fields that changed; this
 * layer adds nothing, so a field absent from the body is genuinely a field the
 * operator did not change. No concurrency token is attached, because the
 * contract does not accept one on this operation — inventing one would be this
 * screen retrofitting a guarantee the server does not make.
 */
export async function updateGalleryEntry(
  entryId: string,
  body: UpdateGalleryEntryBody,
  signal?: AbortSignal,
): Promise<AdminGalleryEntryDetailResponse> {
  try {
    const response = await adminGalleryEntryUpdate(entryId, body, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new GalleryEditorApiError(normalizeApiClientError(error));
  }
}
