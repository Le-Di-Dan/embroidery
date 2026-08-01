/**
 * The safe Admin views of Product publication (`APP2-B03` §6).
 *
 * The projection is the security boundary for these three operations: a field
 * that is not built here cannot reach a browser, however the row was loaded.
 *
 * What is deliberately absent is as much the contract as what is present — no
 * category UUID, no Asset id, kind or classification, no storage key, bucket,
 * checksum or derivative key, no inspection detail, no SQL, table, column or
 * constraint name, and no request id offered as user guidance. A requirement
 * reports a **code and a boolean**, never the value that failed it.
 */
import type { ProductDraft } from '../domain/repositories/product-draft.repository';
import type {
  ProductPublicationReadiness,
  ProductPublicationRequirement,
} from '../domain/product-publication.readiness';

/** One requirement, as the wire sees it. */
export interface ProductPublicationRequirementView {
  readonly code: string;
  readonly satisfied: boolean;
}

export interface ProductPublicationReadinessView {
  readonly productId: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly eligible: boolean;
  /** Closed, complete and in the locked order. */
  readonly requirements: readonly ProductPublicationRequirementView[];
}

/**
 * The authoritative outcome of a transition.
 *
 * Status and the fresh concurrency token are the point: a client that just
 * published must be able to unpublish without re-fetching, and the token it
 * needs for that is the one the database actually stored.
 */
export interface ProductPublicationView {
  readonly productId: string;
  readonly slug: string;
  readonly status: string;
  readonly updatedAt: string;
}

function toRequirementView(
  requirement: ProductPublicationRequirement,
): ProductPublicationRequirementView {
  return { code: requirement.code, satisfied: requirement.satisfied };
}

export function toReadinessView(
  product: ProductDraft,
  readiness: ProductPublicationReadiness,
): ProductPublicationReadinessView {
  return {
    productId: product.id,
    status: product.status,
    updatedAt: product.updatedAt.toISOString(),
    eligible: readiness.eligible,
    requirements: readiness.requirements.map(toRequirementView),
  };
}

export function toPublicationView(product: ProductDraft): ProductPublicationView {
  return {
    productId: product.id,
    slug: product.slug,
    status: product.status,
    updatedAt: product.updatedAt.toISOString(),
  };
}
