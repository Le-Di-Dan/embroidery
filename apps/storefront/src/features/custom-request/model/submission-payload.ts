/**
 * Assembling the one body `APP5-B01` accepts.
 *
 * ## What the customer never supplies
 *
 * `APP5-G01` §4.1 makes the request code, `submitted_session_id`, the customer
 * id, the idempotency key and the grant token **server-owned**. None of them is
 * a parameter of this module and none appears in `SubmitCustomRequestBody`, so
 * there is no field through which the screen could supply one. The idempotency
 * scope in particular is the verified challenge id itself — the submission
 * carries no key of its own, which is why no idempotency-key control is drawn on
 * any approved frame.
 *
 * ## The catalog branch carries a real, chosen variant
 *
 * `catalog.productVariantId` is required and comes from the option the customer
 * explicitly selected out of the `APP5-B07` list. The `productId` beside it comes
 * from the **same** response rather than from a second read, which is why
 * `APP5-B07` publishes it: the pair is resolved once, together, and cannot
 * disagree.
 *
 * `designSessionId` is named but not authorized here — the host-only `HttpOnly`
 * session cookie is what authorizes it, and this code cannot read that cookie.
 *
 * ## The customer-owned branch carries neither
 *
 * No `catalog` key at all, so no product, no variant and no design session. The
 * two branches are separate functions rather than one function with flags,
 * because that is what makes "a COP payload containing a variant id" something
 * that cannot be written rather than something a test has to catch.
 */
import type {
  CustomRequestAssetBinding,
  CustomRequestQuantityLine,
  SubmitCustomRequestBody,
} from '@embroidery/api-client';

import type { CustomerOwnedDraft } from './customer-owned-draft';
import { toCustomerOwnedSubject } from './customer-owned-draft';

interface SharedInput {
  /** The verified `SUBMISSION` challenge: authorization and idempotency scope. */
  readonly challengeId: string;
  readonly breakdown: readonly CustomRequestQuantityLine[];
  /** Only `bindable` ids reach here; the caller filters on `APP5-B02`'s flag. */
  readonly assets: readonly CustomRequestAssetBinding[];
  readonly customerNote: string;
}

export interface CatalogSubmissionInput extends SharedInput {
  readonly productId: string;
  /** The variant the customer chose. Never a default, never the first row. */
  readonly productVariantId: string;
  readonly designSessionId: string;
}

export interface CustomerOwnedSubmissionInput extends SharedInput {
  readonly draft: CustomerOwnedDraft;
}

/** Optional collections are omitted when empty rather than sent as `[]`. */
function optionalParts(input: SharedInput) {
  const note = input.customerNote.trim();
  return {
    ...(input.breakdown.length === 0 ? {} : { breakdown: [...input.breakdown] }),
    ...(input.assets.length === 0 ? {} : { assets: [...input.assets] }),
    ...(note === '' ? {} : { customerNote: note }),
  };
}

export function buildCatalogSubmission(input: CatalogSubmissionInput): SubmitCustomRequestBody {
  return {
    challengeId: input.challengeId,
    catalog: {
      productId: input.productId,
      productVariantId: input.productVariantId,
      designSessionId: input.designSessionId,
    },
    ...optionalParts(input),
  };
}

export function buildCustomerOwnedSubmission(
  input: CustomerOwnedSubmissionInput,
): SubmitCustomRequestBody {
  return {
    challengeId: input.challengeId,
    customerOwnedProduct: toCustomerOwnedSubject(input.draft),
    ...optionalParts(input),
  };
}
