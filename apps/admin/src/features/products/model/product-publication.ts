/**
 * The publication screen's view model: two server answers in, one coherent
 * authority out.
 *
 * The screen loads the product detail and the readiness report as two
 * independent requests. Each carries its own `status` and `updatedAt`, and
 * between the two responses the product may have been changed by someone else —
 * so the pair can genuinely disagree. When it does, neither answer is wrong;
 * they simply describe different moments.
 *
 * Composing a command out of a mixed pair is the failure this module exists to
 * prevent: taking the token from the detail record and the eligibility verdict
 * from the readiness report would send a command authorised by a state the
 * operator never saw. So a mutation is offered only when both snapshots agree
 * on status *and* token, and the token that goes on the wire comes from that
 * agreed snapshot as a unit.
 *
 * Disagreement is not an error state. It resolves by refetching the pair, which
 * is why it renders as "the product just changed, reload" rather than as a
 * failure the operator caused.
 */
import {
  AdminProductRequirementResponseCode,
  type AdminProductDetailResponse,
  type AdminProductPublicationReadinessResponse,
  type AdminProductRequirementResponse,
} from '@embroidery/api-client';

import { PRODUCT_PUBLICATION_COPY, PRODUCT_REQUIREMENT_LABEL } from './product-publication-copy';
import { parseProductStatus, type ProductStatusPresentation } from './product-status';

/** The exact `adminProduct_publish` / `adminProduct_unpublish` body. */
export interface PublicationCommandBody {
  readonly expectedUpdatedAt: string;
}

/** One rendered checklist row. */
export interface PublicationRequirementRow {
  /** The server's code, used as a stable key and test handle — never displayed. */
  readonly code: string;
  /** Approved copy, or the neutral unsupported-requirement label. */
  readonly label: string;
  readonly satisfied: boolean;
  /** True when this build has no copy for the code. */
  readonly unknown: boolean;
}

/**
 * A detail and readiness pair that agree, plus everything a command needs.
 *
 * `expectedUpdatedAt` is on the snapshot rather than passed separately so the
 * token cannot be sourced from anywhere else by accident.
 */
export interface CoherentPublicationSnapshot {
  readonly productId: string;
  readonly status: ProductStatusPresentation;
  readonly expectedUpdatedAt: string;
  readonly eligible: boolean;
  readonly requirements: readonly PublicationRequirementRow[];
}

const KNOWN_CODES: ReadonlySet<string> = new Set(
  Object.values(AdminProductRequirementResponseCode),
);

/**
 * Maps the server's requirement list to rendered rows, preserving the server's
 * order exactly.
 *
 * The order is the contract's, not this screen's: it groups the requirements
 * the way the operator has to act on them, and re-sorting — alphabetically or
 * by satisfaction — would scramble that. An unrecognised code keeps its place
 * and renders as visibly unmet, never as satisfied and never with its raw code
 * as prose.
 */
export function toRequirementRows(
  requirements: readonly AdminProductRequirementResponse[],
): readonly PublicationRequirementRow[] {
  return requirements.map((requirement) => {
    const code: string = requirement.code;
    const known = KNOWN_CODES.has(code);
    return {
      code,
      label: known
        ? PRODUCT_REQUIREMENT_LABEL[requirement.code]
        : PRODUCT_PUBLICATION_COPY.requirements.unknown,
      // An unknown requirement is never treated as satisfied, whatever the
      // server said about it: this build cannot explain what it means, so it
      // cannot let it authorise a publish.
      satisfied: known && requirement.satisfied === true,
      unknown: !known,
    };
  });
}

/**
 * Builds the coherent snapshot, or `null` when the two answers disagree.
 *
 * Both fields are compared. Status alone is not enough — two reads can agree
 * that a product is `DRAFT` while a save between them advanced the token, and
 * publishing with the older token is exactly the lost-update the server's
 * optimistic concurrency is there to catch. Comparing the token too means the
 * screen catches it before the request rather than after the refusal.
 */
export function toCoherentSnapshot(
  detail: AdminProductDetailResponse,
  readiness: AdminProductPublicationReadinessResponse,
): CoherentPublicationSnapshot | null {
  if (detail.updatedAt !== readiness.updatedAt) {
    return null;
  }
  const detailStatus = parseProductStatus(detail.status);
  if (detailStatus !== parseProductStatus(readiness.status)) {
    return null;
  }
  return {
    productId: detail.productId,
    status: detailStatus,
    expectedUpdatedAt: readiness.updatedAt,
    eligible: readiness.eligible === true,
    requirements: toRequirementRows(readiness.requirements),
  };
}

/**
 * Whether publish may be offered.
 *
 * Eligibility is necessary but not sufficient: the readiness report answers
 * "does this product meet the requirements", which a `PUBLISHED` or `ARCHIVED`
 * product can also do. Only `DRAFT` may be published (`TR-LC04-01`), so the
 * lifecycle state is checked independently of the verdict.
 */
export function canPublish(snapshot: CoherentPublicationSnapshot): boolean {
  return snapshot.status === 'DRAFT' && snapshot.eligible;
}

/**
 * Whether unpublish may be offered.
 *
 * Deliberately independent of readiness. A published product whose category was
 * later unpublished, or whose price was cleared, no longer satisfies the
 * requirements — and that is precisely when an operator most needs to take it
 * down. Gating unpublish on readiness would strand exactly those products in
 * public view.
 */
export function canUnpublish(snapshot: CoherentPublicationSnapshot): boolean {
  return snapshot.status === 'PUBLISHED';
}
