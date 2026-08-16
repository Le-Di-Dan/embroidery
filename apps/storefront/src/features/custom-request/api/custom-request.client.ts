/**
 * Every network call `APP5-S01` makes, through **generated operations only**.
 *
 * No path string appears in this feature, so a route rename arrives as a
 * regenerated client rather than as a 404 nobody notices — the `APP4-S01`
 * precedent, for the same reason.
 *
 * The one thing the generated layer cannot express is the `Idempotency-Key`
 * header on the upload: `APP5-B02` requires it and Orval emits no parameter for
 * it, so it travels through the operation's own per-call config
 * (`ApiRequestOptions.config`) exactly as `APP3-B06B`'s session upload does. It
 * is *supplied* by the caller and never minted here — a function that generated
 * its own key could not be idempotent by construction, since a transport retry
 * would mint a second one and the arbiter would see two distinct uploads.
 */
import {
  publicCustomRequestAssetStatus,
  publicCustomRequestAssetUpload,
  publicCustomRequestSubmit,
  publicProductVariantList,
  PublicCustomRequestAssetUploadRole,
  type CustomRequestAssetIntakeResponse,
  type CustomRequestAssetStatusResponse,
  type CustomRequestSubmissionResponse,
  type PublicProductVariantListResponse,
  type SubmitCustomRequestBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import type { CustomerAssetRole } from '../model/request-asset-slot';

/** The header `APP5-B02` arbitrates a repeated upload by. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * The variants of one published product (`APP5-B07`).
 *
 * Takes the slug and nothing else: the operation has no parameter of any kind,
 * so a caller cannot select lifecycle visibility and delisted variants are
 * excluded by the query itself. An empty `variants` array is a truthful answer
 * about a product that exists, not an error — the caller distinguishes it from
 * a 404, which is the whole point of `APP5-B07` resolving the product first.
 */
export async function listCatalogVariants(
  productSlug: string,
): Promise<PublicProductVariantListResponse> {
  const body = await publicProductVariantList(productSlug, { instance: getBrowserApiClient() });
  return body.data;
}

export interface UploadRequestAssetInput {
  /** The verified `SUBMISSION` challenge that authorizes and scopes the upload. */
  readonly challengeId: string;
  readonly file: File;
  readonly role: CustomerAssetRole;
  /**
   * One logical upload's identity, minted once per customer action and reused
   * across a transport retry of that same action.
   */
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
}

/** Streams one image into private storage and queues inspection (`APP5-B02`). */
export async function uploadRequestAsset(
  input: UploadRequestAssetInput,
): Promise<CustomRequestAssetIntakeResponse> {
  const body = await publicCustomRequestAssetUpload(
    input.challengeId,
    { file: input.file },
    { role: PublicCustomRequestAssetUploadRole[input.role] },
    {
      instance: getBrowserApiClient(),
      config: {
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        // Content-Type is deliberately left to Axios: it derives the multipart
        // boundary from the FormData, which a literal `multipart/form-data`
        // would overwrite with a value that has no boundary at all.
        headers: { [IDEMPOTENCY_KEY_HEADER]: input.idempotencyKey },
      },
    },
  );
  return body.data;
}

/**
 * How far inspection has got, and whether the id may be submitted.
 *
 * Answers only for an attachment uploaded by this challenge; anything else is
 * indistinguishable from not existing, which is why the challenge id is part of
 * the address rather than a filter.
 */
export async function readRequestAssetStatus(
  challengeId: string,
  assetId: string,
): Promise<CustomRequestAssetStatusResponse> {
  const body = await publicCustomRequestAssetStatus(challengeId, assetId, {
    instance: getBrowserApiClient(),
  });
  return body.data;
}

/**
 * Creates the custom request (`APP5-B01`).
 *
 * The design-session credential is not in the body and cannot be: it is a
 * host-only `HttpOnly` cookie the browser attaches to this same-origin call, and
 * `catalog.designSessionId` is documented as being authorized by that cookie
 * rather than by the id. Nothing here reads or could read it.
 */
export async function submitCustomRequest(
  body: SubmitCustomRequestBody,
): Promise<CustomRequestSubmissionResponse> {
  const response = await publicCustomRequestSubmit(body, { instance: getBrowserApiClient() });
  return response.data;
}
