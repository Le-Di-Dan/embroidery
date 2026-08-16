/**
 * The submission subject invariant (`APP5-G01` §3, `COL-TBL037-04`).
 *
 * A submission represents **exactly one** product context: a catalog product
 * with a design session, or a customer-owned garment. DB4 assigns the rule to
 * TX/App because it is cross-table — `custom-requests.ts` states it outright:
 * *"no same-row CHECK can see it and none is faked"* — so this module is the
 * only place the rule lives, and `APP5-B01` evaluates it before any write.
 *
 * ### Why the transport lets both/neither be expressed
 *
 * `G01` §3 requires a **named refusal** for both-present and neither-present.
 * A discriminated union would make those two cases structurally unsayable, and
 * the API would answer a shape complaint instead of `SUBMISSION_SUBJECT_INVALID`
 * — which is the answer the authority specifies and the one an Admin triaging a
 * client bug needs. So the published body carries two independent, internally
 * complete branch objects and the exclusivity is decided here, where G01 puts
 * it. Neither branch object is partially satisfiable: each is `.strict()` with
 * all of its own fields required, so "catalog present" cannot mean "half a
 * catalog subject".
 */
import type { ProductVariantId } from '../../../catalog/domain/repositories/placement-hierarchy.port';

/** The catalog subject: a published product, an exact variant, and its session. */
export interface CatalogSubjectInput {
  readonly productId: string;
  readonly productVariantId: string;
  readonly designSessionId: string;
}

/** The customer-owned garment. No catalog row, no session, no variant. */
export interface CustomerOwnedSubjectInput {
  readonly name: string;
  readonly description?: string | undefined;
  readonly physicalWidthMm?: string | undefined;
  readonly physicalHeightMm?: string | undefined;
}

export type SubmissionSubject =
  | {
      readonly branch: 'CATALOG';
      readonly productId: string;
      readonly productVariantId: ProductVariantId;
      readonly designSessionId: string;
    }
  | { readonly branch: 'COP'; readonly product: CustomerOwnedSubjectInput };

export interface SubjectCandidate {
  readonly catalog?: CatalogSubjectInput | undefined;
  readonly customerOwnedProduct?: CustomerOwnedSubjectInput | undefined;
}

/**
 * Resolves the one subject, or reports that there is not exactly one.
 *
 * `undefined` means `SUBMISSION_SUBJECT_INVALID` — both branches, or neither.
 * The caller names the failure; this module does not know about HTTP.
 */
export function resolveSubmissionSubject(
  candidate: SubjectCandidate,
): SubmissionSubject | undefined {
  const hasCatalog = candidate.catalog !== undefined;
  const hasCop = candidate.customerOwnedProduct !== undefined;

  if (hasCatalog === hasCop) {
    return undefined;
  }
  if (candidate.catalog !== undefined) {
    return {
      branch: 'CATALOG',
      productId: candidate.catalog.productId,
      // `G01-D08` — the variant is required, not optional: a request that
      // reaches APP6 without one cannot be quoted or digitized.
      productVariantId: candidate.catalog.productVariantId as ProductVariantId,
      designSessionId: candidate.catalog.designSessionId,
    };
  }
  return { branch: 'COP', product: candidate.customerOwnedProduct as CustomerOwnedSubjectInput };
}
