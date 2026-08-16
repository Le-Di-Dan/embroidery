/**
 * The customer projection of one request (`APP5-B03` §6, §7, §8).
 *
 * Pure functions over already-narrow rows. Nothing here reads a database, so
 * the two rules that are easiest to get wrong — which subject a request has,
 * and which reason text a customer may see — are decidable in a unit test
 * without a container.
 */
import type { CustomRequestState } from '@embroidery/database';

import type { CatalogSubjectLabels } from '../../../catalog/domain/repositories/catalog-subject.port';
import type {
  CustomRequestStatusCustomerOwnedProduct,
  CustomRequestStatusRow,
} from '../../domain/repositories/custom-request-status.repository';

/**
 * `APP5-G01` §3's invariant, expressed as a type.
 *
 * A request is a catalog request or a customer-owned-product request, and the
 * two members carry disjoint fields — so a projection cannot accidentally
 * describe a COP request with a product id, and a consumer cannot read one
 * without narrowing.
 */
export type RequestStatusSubject =
  | {
      readonly kind: 'CATALOG';
      readonly productId: string;
      readonly productVariantId: string | undefined;
      /**
       * Absent when the catalog rows could not be resolved as one coherent
       * pair. Reported as missing rather than filled with a placeholder: the
       * status screen may say less than usual, but it never says something
       * untrue about what was ordered.
       */
      readonly productName: string | undefined;
      readonly productSlug: string | undefined;
      readonly variantColorName: string | undefined;
      readonly variantSizeLabel: string | undefined;
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
 * The three statuses that carry an explanation to the customer.
 *
 * A closed set, and it is the enforcement rather than a comment: the selector
 * below returns nothing for every other status, so a reason recorded against a
 * `NEW` or `UNDER_REVIEW` request — which no APP5 transition writes — could not
 * be shown even if a row carried one.
 *
 * `SE-004` (`NEEDS_CLARIFICATION`) and `SE-012` (`REJECTED`, `CANCELLED`) are
 * exactly the outbox events `APP5-G01` §8 marks as carrying customer-facing
 * reason text.
 */
export const REASON_BEARING_STATUSES: readonly CustomRequestState[] = [
  'NEEDS_CLARIFICATION',
  'REJECTED',
  'CANCELLED',
];

/**
 * Which subject this request has.
 *
 * `undefined` only for a row that satisfies neither branch, which the
 * submission transaction cannot produce (`APP5-G01` §3 refuses both-present and
 * neither-present before any write). It is reported as an absent subject rather
 * than raised as a fault, because a customer holding a valid grant should still
 * be told their request's code, status and quantities if the subject rows ever
 * became undescribable — a 500 would tell them nothing at all.
 */
export function projectSubject(
  request: CustomRequestStatusRow,
  labels: CatalogSubjectLabels | undefined,
  customerOwnedProduct: CustomRequestStatusCustomerOwnedProduct | undefined,
): RequestStatusSubject | undefined {
  if (request.productId !== undefined) {
    return {
      kind: 'CATALOG',
      productId: request.productId,
      productVariantId: request.productVariantId,
      productName: labels?.productName,
      productSlug: labels?.productSlug,
      variantColorName: labels?.variantColorName,
      variantSizeLabel: labels?.variantSizeLabel,
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
 * The one reason text a customer may read, or nothing.
 *
 * Both inputs are already customer-visible columns —
 * `custom_requests.cancelled_customer_reason` (COL-TBL037-09) and the
 * `customer_visible_reason` of the transition into the current status. The
 * internal `reason` / `cancelled_reason` pair is not a parameter of this
 * function, so no call site can pass one by mistake.
 *
 * On `CANCELLED` the request row wins when it carries a value: COL-TBL037-09 is
 * where a cancellation's customer-facing text is durably kept, and a transition
 * row is the evidence of the move rather than the record of the outcome. The
 * transition remains the fallback so a cancellation recorded only through
 * `transition()` still explains itself.
 */
export function selectCustomerVisibleReason(input: {
  readonly status: CustomRequestState;
  readonly cancelledCustomerReason: string | undefined;
  readonly transitionCustomerVisibleReason: string | undefined;
}): string | undefined {
  if (!REASON_BEARING_STATUSES.includes(input.status)) {
    return undefined;
  }
  if (input.status === 'CANCELLED' && input.cancelledCustomerReason !== undefined) {
    return input.cancelledCustomerReason;
  }
  return input.transitionCustomerVisibleReason;
}
