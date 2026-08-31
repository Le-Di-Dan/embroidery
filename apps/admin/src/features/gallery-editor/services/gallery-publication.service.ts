/**
 * Feature service seam over the three **guarded** operations: the ordered media
 * replacement and the two publication transitions.
 *
 * Every call in this module carries `expectedUpdatedAt`, and every one of them
 * returns the full entry with an advanced token. That is the whole reason they
 * sit together: the token is not an argument the caller happens to pass, it is
 * the precondition the operation is defined by, and a module boundary is a
 * better place to state that than a comment on each call site.
 *
 * The token is never held by this layer. It arrives from the authoritative
 * cached record and is passed through verbatim — a token this module remembered
 * would be one that survived the response that superseded it.
 */
import {
  adminGalleryEntryPublish,
  adminGalleryEntryReplaceAssets,
  adminGalleryEntryUnpublish,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { AdminGalleryEntryDetailResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { GalleryEditorApiError } from '../model/gallery-editor-failure';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

export interface GuardedGalleryCommand {
  readonly entryId: string;
  /** The `updatedAt` last read for this entry. Never a remembered value. */
  readonly expectedUpdatedAt: string;
}

export interface ReplaceGalleryAssetsCommand extends GuardedGalleryCommand {
  /** The complete intended selection, in display order. Position 0 is the cover. */
  readonly assetIds: readonly string[];
}

/**
 * Stores the complete ordered selection.
 *
 * This is replacement, not append: whatever is absent from `assetIds` is
 * detached, and the array order becomes the display order. The list is sent
 * exactly as the operator arranged it — nothing here re-sorts, deduplicates a
 * second time or reorders a "cover" to the front, because the front *is* the
 * cover and the arrangement on screen is the arrangement being persisted.
 *
 * An empty array is a legal request that clears the selection.
 */
export async function replaceGalleryEntryAssets(
  command: ReplaceGalleryAssetsCommand,
  signal?: AbortSignal,
): Promise<AdminGalleryEntryDetailResponse> {
  try {
    const response = await adminGalleryEntryReplaceAssets(
      command.entryId,
      {
        assetIds: [...command.assetIds],
        expectedUpdatedAt: command.expectedUpdatedAt,
      },
      requestOptions(signal),
    );
    return response.data;
  } catch (error: unknown) {
    throw new GalleryEditorApiError(normalizeApiClientError(error));
  }
}

/**
 * `DRAFT` to `PUBLISHED`.
 *
 * Readiness is recomputed by the server inside its own transaction from
 * persisted state, so this call sends no readiness claim and the screen's
 * advisory verdict is never an argument to it.
 */
export async function publishGalleryEntry(
  command: GuardedGalleryCommand,
  signal?: AbortSignal,
): Promise<AdminGalleryEntryDetailResponse> {
  try {
    const response = await adminGalleryEntryPublish(
      command.entryId,
      { expectedUpdatedAt: command.expectedUpdatedAt },
      requestOptions(signal),
    );
    return response.data;
  } catch (error: unknown) {
    throw new GalleryEditorApiError(normalizeApiClientError(error));
  }
}

/**
 * `PUBLISHED` back to `DRAFT`.
 *
 * This deletes nothing and archives nothing: the title, slug, description,
 * linked product, both SEO fields and the whole ordered image selection all
 * remain. There is no archive operation on this boundary, so unpublishing is
 * the only withdrawal this build can perform — and the confirmation says so.
 */
export async function unpublishGalleryEntry(
  command: GuardedGalleryCommand,
  signal?: AbortSignal,
): Promise<AdminGalleryEntryDetailResponse> {
  try {
    const response = await adminGalleryEntryUnpublish(
      command.entryId,
      { expectedUpdatedAt: command.expectedUpdatedAt },
      requestOptions(signal),
    );
    return response.data;
  } catch (error: unknown) {
    throw new GalleryEditorApiError(normalizeApiClientError(error));
  }
}
