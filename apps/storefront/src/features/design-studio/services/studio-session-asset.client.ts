/**
 * The three private Session-asset calls (`APP3-B06B`, `APP3-B06C`, `APP3-S06`).
 *
 * All three are contextual: every address carries the Session id, and the
 * per-session `HttpOnly` cookie the browser attaches is what actually authorizes
 * them. Nothing here reads that cookie, builds a storage URL, presigns, or talks
 * to object storage — the browser holds no credential it could use and this
 * module has no address it could use one against.
 *
 * The upload is the only mutation. It carries the two headers `APP3-B06B`
 * requires, and it carries them through the generated operation's per-call
 * config rather than through a second HTTP client: `Idempotency-Key` and the
 * session revision are contract facts, so they are supplied at the call site
 * that knows them and never defaulted here.
 */
import {
  publicDesignSessionAssetCreate,
  publicDesignSessionAssetGet,
  publicDesignSessionAssetStatus,
  type DesignSessionAssetIntakeResponse,
  type DesignSessionAssetStatusResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { toStudioApiError } from '../model/studio-failure';

/** The two headers `APP3-B06B` requires on every upload attempt. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const SESSION_REVISION_HEADER = 'X-Design-Session-Revision';

export interface UploadImageInput {
  readonly sessionId: string;
  readonly file: File;
  /**
   * The revision the client last read. `APP3-B06B` refuses a stale one rather
   * than overwriting a newer change, so it is passed rather than assumed.
   */
  readonly expectedRevision: number;
  /**
   * One logical upload's identity.
   *
   * Minted once per attempt the customer initiated and **reused** across a
   * transport retry of that same attempt, which is what stops one retry from
   * minting a second durable Asset. It is not minted here, because a function
   * that generated its own key could not be idempotent by construction.
   */
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
  /** Fractional upload progress, only when the browser reports a real total. */
  readonly onProgress?: (fraction: number) => void;
}

export async function uploadSessionImage(
  input: UploadImageInput,
): Promise<DesignSessionAssetIntakeResponse> {
  try {
    const response = await publicDesignSessionAssetCreate(
      input.sessionId,
      { file: input.file },
      {
        instance: getBrowserApiClient(),
        config: {
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          headers: {
            [IDEMPOTENCY_KEY_HEADER]: input.idempotencyKey,
            [SESSION_REVISION_HEADER]: String(input.expectedRevision),
          },
          // Determinate progress only when the transport actually reports a
          // total. A percentage invented from elapsed time is a claim about how
          // far the file has got, and it is wrong exactly when a customer is
          // watching it.
          onUploadProgress: (event) => {
            if (input.onProgress === undefined) return;
            if (event.total === undefined || event.total <= 0) return;
            input.onProgress(Math.min(1, event.loaded / event.total));
          },
        },
      },
    );
    return response.data;
  } catch (error: unknown) {
    throw toStudioApiError(error);
  }
}

/**
 * How far one upload has got.
 *
 * The **only** thing that may be polled. `APP3-B06C` answers one
 * indistinguishable 404 for eleven different private misses, so polling the
 * binary route would be reading a refusal as progress and could never surface a
 * rejected upload at all.
 */
export async function fetchSessionAssetStatus(
  sessionId: string,
  assetId: string,
  signal: AbortSignal,
): Promise<DesignSessionAssetStatusResponse> {
  try {
    const response = await publicDesignSessionAssetStatus(sessionId, assetId, {
      instance: getBrowserApiClient(),
      config: { signal },
    });
    return response.data;
  } catch (error: unknown) {
    throw toStudioApiError(error);
  }
}

/**
 * The editor-safe bytes, as a `Blob`.
 *
 * The caller turns it into a browser object URL as a purely local rendering
 * handle — never persisted into the design document, never sent back, never a
 * storage address.
 */
export async function fetchSessionAssetBlob(
  sessionId: string,
  assetId: string,
  signal: AbortSignal,
): Promise<Blob> {
  try {
    return await publicDesignSessionAssetGet(sessionId, assetId, {
      instance: getBrowserApiClient(),
      config: { signal },
    });
  } catch (error: unknown) {
    throw toStudioApiError(error);
  }
}
