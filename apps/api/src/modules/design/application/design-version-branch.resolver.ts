/**
 * Deriving which placement branch a formal version is on (`APP6-B08` §8).
 *
 * The branch is a **server derivation from the request**, never a field the
 * Admin sends. `ADR-APP6-001` §3.2 fixes the rule in one sentence: a request that
 * has a `customer_owned_products` row is a COP request (CST-027 makes that row at
 * most one per request, so the test is total), and everything else is Catalog.
 * Because the derivation reads only persisted request state, two versions of one
 * request can never land on different branches — there is no input that could
 * make them.
 *
 * The Catalog side then resolves the **complete** quartet or refuses. Its four
 * parts come from two places on purpose:
 *
 * - `product_id` and `product_variant_id` from the request, because the variant a
 *   formal version freezes is the request's subject;
 * - `product_side_id` and `embroidery_area_id` from the exact submitted Design
 *   Session, because that is what the customer actually designed against.
 *
 * Every one of the four is then proved to form a single chain by the placement
 * hierarchy port inside the write transaction (G-DB7-10..13). A missing part is
 * a refusal, never a substitution: nothing here picks another active variant, the
 * first Side, the latest Area, or a Catalog row from a neighbouring request.
 */
import { Inject, Injectable } from '@nestjs/common';

import type { CustomRequestDesignContext } from '../../order/domain/repositories/custom-request-design-context.port';
import {
  SUBMITTED_DESIGN_PLACEMENT_PORT,
  type SubmittedDesignPlacementPort,
} from '../domain/repositories/submitted-design-placement.port';
import {
  SessionPlacementResolver,
  type SessionPlacementAuthority,
} from './session-placement.authority';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
  ProductVariantId,
} from '../../catalog/domain/repositories/placement-hierarchy.port';

/** The resolved Catalog context: the quartet plus the authority behind it. */
export interface ResolvedCatalogBranch {
  readonly branch: 'CATALOG';
  readonly productId: ProductId;
  readonly productVariantId: ProductVariantId;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
  /** The live Side and Area rows the document is reconciled against. */
  readonly authority: SessionPlacementAuthority;
}

export interface ResolvedCustomerOwnedBranch {
  readonly branch: 'CUSTOMER_OWNED';
  readonly customerOwnedProductId: string;
}

export type ResolvedVersionBranch = ResolvedCatalogBranch | ResolvedCustomerOwnedBranch;

@Injectable()
export class DesignVersionBranchResolver {
  constructor(
    @Inject(SUBMITTED_DESIGN_PLACEMENT_PORT)
    private readonly submitted: SubmittedDesignPlacementPort,
    private readonly placement: SessionPlacementResolver,
  ) {}

  /**
   * The branch this request's versions are on, or `undefined` when a Catalog
   * request's authoritative placement can no longer be resolved.
   *
   * The customer-owned branch cannot fail here: its only identity is the COP row
   * the caller already read, and there is nothing further to look up. That
   * asymmetry is the ADR's — a COP version needs no Catalog authority, which is
   * the entire reason the branch exists.
   */
  async resolve(request: CustomRequestDesignContext): Promise<ResolvedVersionBranch | undefined> {
    if (request.customerOwnedProductId !== undefined) {
      return { branch: 'CUSTOMER_OWNED', customerOwnedProductId: request.customerOwnedProductId };
    }
    return this.resolveCatalog(request);
  }

  private async resolveCatalog(
    request: CustomRequestDesignContext,
  ): Promise<ResolvedCatalogBranch | undefined> {
    // All three request-side facts are required together. A Catalog request with
    // no variant is the acceptance criterion this checkpoint is written around:
    // it fails, and it does not get "the product's other variant".
    if (
      request.productId === undefined ||
      request.productVariantId === undefined ||
      request.submittedSessionId === undefined
    ) {
      return undefined;
    }

    const submitted = await this.submitted.findSubmittedPlacement({
      sessionId: request.submittedSessionId,
      requestId: request.requestId,
    });
    if (submitted === undefined) return undefined;

    // The session's Product must be the request's Product. They are written by
    // the same submission transaction, so a disagreement is a broken invariant —
    // and the safe response to a broken invariant about *which product this is*
    // is to refuse, not to pick one of the two.
    if (submitted.productId !== request.productId) return undefined;

    // Resolves the live Side and Area rows and proves the Area hangs from the
    // Side. A retired row still resolves here; whether retirement matters is the
    // document authority's call, not this one's.
    const authority = await this.placement.resolve({
      productId: submitted.productId,
      productSideId: submitted.productSideId,
      embroideryAreaId: submitted.embroideryAreaId,
    });
    if (authority === undefined) return undefined;

    return {
      branch: 'CATALOG',
      productId: request.productId,
      productVariantId: request.productVariantId,
      productSideId: submitted.productSideId,
      embroideryAreaId: submitted.embroideryAreaId,
      authority,
    };
  }
}
