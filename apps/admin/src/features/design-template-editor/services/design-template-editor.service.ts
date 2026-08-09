/**
 * Feature service seam over the two `APP3-B03A` operations `APP3-A03` consumes.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as a `TemplateEditorApiError` carrying only
 * the normalized envelope, so no raw transport error reaches React state.
 *
 * The lifecycle operations are absent, and not merely unused: they are not on
 * the `@embroidery/api-client` boundary at all, so no amount of editing in this
 * feature can reach a publish, unpublish or archive. `APP3-A04` owns them.
 *
 * No route is spelled here. The generated client owns every URL, and a copy of
 * one in application code is how the two drift after a contract change.
 */
import {
  adminDesignTemplateDetail,
  adminDesignTemplateSaveDocument,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  AdminDesignTemplateDetailResponse,
  SaveDesignTemplateDocumentBody,
  TransportDesignDocument,
} from '@embroidery/api-client';
import type { DesignDocument } from '@embroidery/design-document';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { TemplateEditorApiError } from '../model/editor-failure';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

/** The Template header and, when it has one, its current version's document. */
export async function fetchTemplateDetail(
  templateId: string,
  signal?: AbortSignal,
): Promise<AdminDesignTemplateDetailResponse> {
  try {
    const response = await adminDesignTemplateDetail(templateId, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new TemplateEditorApiError(normalizeApiClientError(error));
  }
}

export interface SaveTemplateDocumentInput {
  readonly templateId: string;
  /** Exactly what the last authoritative read returned; `0` when unversioned. */
  readonly expectedCurrentVersion: number;
  readonly document: DesignDocument;
}

/**
 * Saves the draft as the next immutable version.
 *
 * The body is exactly the two members the contract declares. There is no
 * lifecycle field, no scope, no slug, no schema version and no binary — the
 * server derives the next version number and this call never proposes one.
 *
 * The single cast is the readonly boundary and nothing more. `APP3-P01`'s
 * `DesignDocument` is deeply readonly and Orval's projection of the very same
 * types is mutable, so the two are identical in shape and incompatible in
 * variance. Widening a `readonly T[]` to `T[]` is unsound in general, which is
 * why TypeScript refuses it; it is safe here because the value is serialized
 * immediately and never written to.
 */
export async function saveTemplateDocument(
  { templateId, expectedCurrentVersion, document }: SaveTemplateDocumentInput,
  signal?: AbortSignal,
): Promise<AdminDesignTemplateDetailResponse> {
  const body: SaveDesignTemplateDocumentBody = {
    expectedCurrentVersion,
    document: document as unknown as TransportDesignDocument,
  };
  try {
    const response = await adminDesignTemplateSaveDocument(
      templateId,
      body,
      requestOptions(signal),
    );
    return response.data;
  } catch (error: unknown) {
    throw new TemplateEditorApiError(normalizeApiClientError(error));
  }
}
