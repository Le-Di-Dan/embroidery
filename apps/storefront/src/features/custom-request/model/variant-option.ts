/**
 * Turning one `APP5-B07` variant row into something a customer can pick.
 *
 * **There is no default variant, and this module is where that is enforced.**
 * `publicProductVariantList` publishes the variants in the product's own display
 * order and marks none of them as primary; `APP5-S01` §3.1 forbids inventing one.
 * So no function here returns "the" variant, and {@link selectionStillEligible}
 * is written to answer *whether a choice the customer already made survives a
 * refetch* — never to make a choice on their behalf.
 *
 * **The labels are published as they are.** `DB4` gave Product Variants two
 * relational attributes and no name column, and `APP5-B07` publishes both as
 * `string | null` rather than joining them into an invented variant name. This
 * module composes them for display only, and the `productVariantId` it carries
 * beside them is the value that actually goes to `APP5-B01`.
 */
import type { PublicProductVariantResponse } from '@embroidery/api-client';

import { CUSTOM_REQUEST_COPY } from './custom-request-copy';

/**
 * The customer-visible label for one variant.
 *
 * Both attributes are nullable and independently so, which produces four cases.
 * Three of them compose from what exists; the fourth — both null — is a real row
 * the customer must still be able to choose, so it falls back to approved copy
 * rather than rendering an empty control or leaking the id as a label.
 */
export function variantLabel(variant: PublicProductVariantResponse): string {
  const parts = [variant.colorName, variant.sizeLabel].filter(
    (part): part is string => typeof part === 'string' && part.trim() !== '',
  );
  return parts.length === 0 ? CUSTOM_REQUEST_COPY.catalog.variantUnnamed : parts.join(' · ');
}

/**
 * Is the id the customer picked still among the variants the server publishes?
 *
 * Called after every refetch. A `false` here means the selection is cleared and
 * the customer is asked to choose again (`APP5-S01` §6.3) — it is deliberately
 * **not** the stale-design-session state, which is a different fact about a
 * different subsystem (§17.C vs §17.D).
 */
export function selectionStillEligible(
  variants: readonly PublicProductVariantResponse[],
  selectedId: string | undefined,
): boolean {
  if (selectedId === undefined) return false;
  return variants.some((variant) => variant.productVariantId === selectedId);
}
