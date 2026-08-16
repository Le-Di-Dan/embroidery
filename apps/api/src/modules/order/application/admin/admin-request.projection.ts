/**
 * The Admin projection of a request (`APP5-B04` §5, §9, §10).
 *
 * Pure functions over already-narrow rows. Nothing here reads a database, so the
 * three rules that are easiest to get wrong — which subject a request has, which
 * statuses the queue triages by default, and which reason text is internal
 * versus customer-visible — are decidable in a unit test without a container.
 */
import type { CustomRequestState } from '@embroidery/database';

import type {
  CatalogProductLabels,
  CatalogSubjectLabels,
} from '../../../catalog/domain/repositories/catalog-subject.port';
import type {
  AdminRequestCustomerOwnedProduct,
  AdminRequestDetailRow,
  AdminRequestQueueRow,
  AdminRequestSubjectKind,
} from '../../domain/repositories/custom-request-admin.repository';

/**
 * The statuses the queue triages when the operator names none (`APP5-B04` §6).
 *
 * The three pre-quotation states APP5 owns a transition into or out of
 * (`APP5-G01` §2 — TR-LC11-01/02/03/04). A request that has reached `QUOTED` or
 * beyond belongs to APP6's surface, and one already `REJECTED` or `CANCELLED` is
 * finished: neither needs a moderation decision, and putting them in the default
 * page would bury the rows that do behind the ones that do not.
 *
 * It is a **default**, never a ceiling. A specifically requested canonical
 * status is honoured truthfully — see {@link resolveStatusFilter} — because a
 * queue that silently refused to show a `QUOTED` request would be lying about
 * what the database holds.
 */
export const DEFAULT_TRIAGE_STATUSES: readonly CustomRequestState[] = [
  'NEW',
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
];

/** The requested statuses, or the triage default when none were named. */
export function resolveStatusFilter(
  requested: readonly CustomRequestState[] | undefined,
): readonly CustomRequestState[] {
  if (requested === undefined || requested.length === 0) {
    return DEFAULT_TRIAGE_STATUSES;
  }
  // De-duplicated: `?status=NEW&status=NEW` is a client repeating itself, not a
  // request for the row twice, and an `IN` list with a repeat is a wider plan
  // for the same answer.
  return [...new Set(requested)];
}

/** How a queue row names its subject. One branch, never both. */
export interface AdminQueueSubject {
  readonly kind: AdminRequestSubjectKind;
  /**
   * The product name, or the customer-owned item's name.
   *
   * Absent when the catalog product can no longer be resolved. Reported as
   * missing rather than filled with a placeholder: an operator triaging a queue
   * must never be shown a subject the request does not have.
   */
  readonly summary: string | undefined;
}

/**
 * Which subject a queue row has.
 *
 * Decided by `custom_requests.product_id` alone, which is how the row itself
 * expresses `APP5-G01` §3's XOR — a request with no catalog product is a
 * customer-owned one, and there is no third branch the column can hold.
 */
export function projectQueueSubject(
  row: AdminRequestQueueRow,
  productLabels: CatalogProductLabels | undefined,
  customerOwnedName: string | undefined,
): AdminQueueSubject {
  if (row.productId !== undefined) {
    return { kind: 'CATALOG', summary: productLabels?.productName };
  }
  return { kind: 'CUSTOMER_OWNED', summary: customerOwnedName };
}

/**
 * The detail subject union (`APP5-B04` §9.3).
 *
 * Two members with disjoint fields, so a consumer cannot read a catalog field
 * off a customer-owned subject and a mapper cannot describe a COP request with a
 * product id. Deliberately **not** shared with `APP5-B03`'s customer union: this
 * one carries the design-session provenance an operator may see and the customer
 * may not, and one type serving both audiences is how that field would reach the
 * wrong one.
 */
export type AdminRequestSubject =
  | {
      readonly kind: 'CATALOG';
      readonly productId: string;
      readonly productVariantId: string | undefined;
      readonly productName: string | undefined;
      readonly productSlug: string | undefined;
      readonly variantColorName: string | undefined;
      readonly variantSizeLabel: string | undefined;
      /** `G01-D09` provenance. Server-written, and never a credential. */
      readonly designSessionId: string | undefined;
    }
  | {
      readonly kind: 'CUSTOMER_OWNED';
      readonly name: string;
      readonly description: string | undefined;
      /** `numeric` columns. Strings end to end — never parsed into a float. */
      readonly physicalWidthMm: string | undefined;
      readonly physicalHeightMm: string | undefined;
    };

/**
 * The detail subject.
 *
 * `undefined` only for a row that satisfies neither branch, which the submission
 * transaction cannot produce. Reported as an absent subject rather than raised
 * as a fault: an operator must still be able to open the request, read its
 * history and act on it if the subject rows ever became undescribable.
 */
export function projectDetailSubject(
  row: AdminRequestDetailRow,
  labels: CatalogSubjectLabels | undefined,
  customerOwnedProduct: AdminRequestCustomerOwnedProduct | undefined,
): AdminRequestSubject | undefined {
  if (row.productId !== undefined) {
    return {
      kind: 'CATALOG',
      productId: row.productId,
      productVariantId: row.productVariantId,
      productName: labels?.productName,
      productSlug: labels?.productSlug,
      variantColorName: labels?.variantColorName,
      variantSizeLabel: labels?.variantSizeLabel,
      designSessionId: row.submittedSessionId,
    };
  }
  if (customerOwnedProduct !== undefined) {
    return {
      kind: 'CUSTOMER_OWNED',
      name: customerOwnedProduct.name,
      description: customerOwnedProduct.description,
      physicalWidthMm: customerOwnedProduct.physicalWidthMm,
      physicalHeightMm: customerOwnedProduct.physicalHeightMm,
    };
  }
  return undefined;
}

/**
 * The two reason texts for the request's **current** status (`APP5-B04` §10).
 *
 * They are returned as a pair with two named members, and that is the whole
 * point: `APP5-B05` has to write both halves of a `NEEDS_CLARIFICATION`,
 * `REJECTED` or `CANCELLED` decision, and a read model that had already merged
 * them into one "reason" would make the distinction unrecoverable at the exact
 * moment the mutation checkpoint needs it.
 *
 * Both are scoped to the current status for the reason `APP5-B03` records: an
 * earlier clarification message must not resurface as the explanation of a later
 * rejection.
 *
 * On `CANCELLED` the request row's own columns win when present. COL-TBL037-08
 * and COL-TBL037-09 are where a cancellation's two texts are durably kept; the
 * transition row is evidence of the move, and stays the fallback so a
 * cancellation recorded only through `transition()` still explains itself.
 */
export interface AdminRequestReasons {
  readonly internalReason: string | undefined;
  readonly customerVisibleReason: string | undefined;
}

export function selectCurrentReasons(input: {
  readonly status: CustomRequestState;
  readonly cancelledReason: string | undefined;
  readonly cancelledCustomerReason: string | undefined;
  readonly transitionReason: string | undefined;
  readonly transitionCustomerVisibleReason: string | undefined;
}): AdminRequestReasons {
  if (input.status === 'CANCELLED') {
    return {
      internalReason: input.cancelledReason ?? input.transitionReason,
      customerVisibleReason: input.cancelledCustomerReason ?? input.transitionCustomerVisibleReason,
    };
  }
  return {
    internalReason: input.transitionReason,
    customerVisibleReason: input.transitionCustomerVisibleReason,
  };
}

/**
 * The latest transition **into** the current status, or nothing.
 *
 * `history` arrives oldest-first by append sequence, so the last matching entry
 * is the move that produced the state the request is in now. Pinning
 * `to_status` — rather than taking the final row outright — is what keeps a
 * reason attached to the status it explains even if a concurrent transition
 * lands between this read's statements.
 */
export function findCurrentStatusTransition<T extends { readonly toStatus: CustomRequestState }>(
  history: readonly T[],
  status: CustomRequestState,
): T | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry !== undefined && entry.toStatus === status) {
      return entry;
    }
  }
  return undefined;
}
