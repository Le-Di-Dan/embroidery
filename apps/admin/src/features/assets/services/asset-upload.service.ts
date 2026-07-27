/**
 * Feature service seam over the generated B01 upload operation.
 *
 * The generated operation owns the multipart body: it appends `assetKind`,
 * then `classification`, then `file`, in that order, which is exactly the
 * ordering B01 requires (both metadata parts must arrive before the file part).
 * The fixed metadata values are taken from the generated contract enums rather
 * than written as literals here.
 *
 * The per-call Axios override carries the three things the operation itself
 * cannot express: the `Idempotency-Key` header, the `AbortSignal` and the
 * upload-progress callback. The mutator merges this override *after* the
 * generated request config, so the generated `Content-Type` is replaced by this
 * header set — which is correct and deliberate: Axios derives the multipart
 * content type together with its boundary from the `FormData` body, and a
 * hand-set `multipart/form-data` without a boundary would be unparseable. No
 * boundary is ever written by this code.
 */
import {
  adminAssetUpload,
  normalizeApiClientError,
  AdminAssetUploadBodyAssetKind,
  AdminAssetUploadBodyClassification,
  type AdminAssetUploadReceiptResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { AssetApiError } from '../model/asset-failure';
import type { UploadIntent } from '../model/upload-intent';

/** Exact header name from the B01 contract. */
const IDEMPOTENCY_HEADER = 'Idempotency-Key';

export interface UploadAssetInput {
  readonly intent: UploadIntent;
  readonly signal: AbortSignal;
  /**
   * Transferred bytes as reported by the transport. `total` is `undefined`
   * when the environment cannot measure it; the caller then falls back to an
   * indeterminate presentation instead of inventing a percentage.
   */
  readonly onProgress: (loaded: number, total: number | undefined) => void;
}

export async function uploadAsset({
  intent,
  signal,
  onProgress,
}: UploadAssetInput): Promise<AdminAssetUploadReceiptResponse> {
  try {
    const body = await adminAssetUpload(
      {
        assetKind: AdminAssetUploadBodyAssetKind.CATALOG_MEDIA,
        classification: AdminAssetUploadBodyClassification.PRODUCTION_SENSITIVE,
        file: intent.file,
      },
      {
        instance: getBrowserApiClient(),
        config: {
          headers: { [IDEMPOTENCY_HEADER]: intent.idempotencyKey },
          signal,
          onUploadProgress: (event) => {
            onProgress(event.loaded, event.total);
          },
        },
      },
    );
    return body.data;
  } catch (error: unknown) {
    throw new AssetApiError(normalizeApiClientError(error));
  }
}
