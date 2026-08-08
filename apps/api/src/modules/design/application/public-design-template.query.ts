/**
 * The two public Design Template read operations (`APP3-B05`).
 *
 * Both are anonymous, both are read-only, and both answer the same two questions
 * in the same order: **is this Template published right now**, and **is the
 * placement it is scoped to still publicly designable right now**.
 *
 * ## Why eligibility is re-evaluated on every read
 *
 * A Template reaches `PUBLISHED` under `IMP-D042` PO-07's `GRD-T01`, which
 * proves at that moment that its Product, Side and Area form an active chain.
 * Nothing keeps that true afterwards. The Product can be unpublished or moved
 * out of a public category, the Side or the Area can be retired — none of which
 * touches the Template, because `IMP-D041` PO-07 retires without deleting so
 * that existing references still resolve. A Template can therefore be perfectly
 * `PUBLISHED` and no longer publicly usable, and the only honest answer is to
 * ask Catalog again on every request.
 *
 * The answer is never written back. A read that "repaired" the Template's status
 * would mutate store data from an anonymous request, and it would be wrong the
 * moment the Product was republished — the Template was never at fault.
 *
 * ## Why the scope triple is required on the list
 *
 * `IMP-D042` PO-06 makes APP3 Templates area-scoped and compatibility exact
 * triple equality; there is no product-wide, side-wide or wildcard match to fall
 * back to. A list that admitted a partial scope would have to mean *something*
 * by it, and every available meaning is a broader match than the caller asked
 * for. Requiring all three keeps the ordering well defined, keeps eligibility a
 * single bounded resolution per request rather than one per row, and leaves no
 * shape of this request that enumerates the store's published Templates.
 */
import { Inject, Injectable } from '@nestjs/common';
import { buildPage, resolveLimit } from '@embroidery/persistence';

import {
  PRODUCT_PLACEMENT_REPOSITORY,
  type ProductPlacementRepository,
} from '../../catalog/domain/repositories/product-placement.repository';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../../catalog/domain/repositories/placement-hierarchy.port';
import {
  decodePublicTemplateCursor,
  encodePublicTemplateCursor,
} from '../domain/public-design-template-cursor';
import { publicDesignTemplateNotFound } from '../domain/public-design-template.errors';
import {
  PUBLISHED_DESIGN_TEMPLATE_REPOSITORY,
  type PublishedDesignTemplate,
  type PublishedDesignTemplateRepository,
  type PublishedTemplateScope,
} from '../domain/repositories/published-design-template.repository';
import {
  toPublicDetailView,
  toPublicSummaryView,
  type PublicTemplateDetailView,
  type PublicTemplateListView,
} from './public-design-template.projection';

export interface PublicTemplateListInput {
  readonly productId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
  readonly cursor?: string | undefined;
  /** Bounded by the request schema; defaulted and clamped by `resolveLimit`. */
  readonly limit?: number | undefined;
}

@Injectable()
export class PublicDesignTemplateQuery {
  constructor(
    @Inject(PUBLISHED_DESIGN_TEMPLATE_REPOSITORY)
    private readonly templates: PublishedDesignTemplateRepository,
    @Inject(PRODUCT_PLACEMENT_REPOSITORY)
    private readonly placement: ProductPlacementRepository,
  ) {}

  /**
   * One keyset page of published Templates compatible with an exact scope.
   *
   * A scope that is not currently public yields an **empty page**, not an error.
   * That is the same non-disclosure rule the detail read applies: a caller must
   * not learn that a Product exists but has been withdrawn, and "no Templates
   * here" is indistinguishable from "this Area has none", which is a state that
   * is ordinary and public anyway.
   *
   * The cursor is still decoded first, and still refused when malformed, even
   * for an ineligible scope. Answering an invalid cursor with an empty page would
   * be the silent restart the whole codec exists to prevent, and it would make
   * the refusal depend on the Product's publication state — a caller could then
   * probe that state by watching which of two identical requests errored.
   */
  async list(input: PublicTemplateListInput): Promise<PublicTemplateListView> {
    const limit = resolveLimit(input.limit);
    const requested: PublishedTemplateScope = {
      productId: input.productId as ProductId,
      productSideId: input.productSideId as ProductSideId,
      embroideryAreaId: input.embroideryAreaId as EmbroideryAreaId,
    };

    const after =
      input.cursor === undefined || input.cursor === ''
        ? undefined
        : decodePublicTemplateCursor(input.cursor, requested);

    const scope = await this.eligibleScope(requested);
    if (scope === undefined) {
      return { items: [], hasNext: false };
    }

    const rows = await this.templates.listPublished({ scope, after, limit });

    const page = buildPage(rows, limit, (row: PublishedDesignTemplate) => ({
      sortValue: row.template.createdAt.toISOString(),
      tieBreaker: row.template.id,
    }));

    // Re-encoded through this module's own codec so the scope travels inside the
    // cursor. `buildPage` produces the position; the binding is this read's.
    const nextCursor =
      page.nextCursor === undefined
        ? undefined
        : encodePublicTemplateCursor(lastPositionOf(page.items), scope);

    return {
      items: page.items.map(toPublicSummaryView),
      ...(nextCursor === undefined ? {} : { nextCursor }),
      hasNext: nextCursor !== undefined,
    };
  }

  /**
   * One published Template by its public slug.
   *
   * Every failing reason produces the same `PUBLIC_DESIGN_TEMPLATE_NOT_FOUND`:
   * unknown slug, `DRAFT`, `ARCHIVED`, published-then-unpublished, no published
   * version, a Product no longer public, a retired Side or Area. The refusals are
   * ordered cheapest-first, but nothing about the answer reveals which one fired.
   */
  async detail(slug: string): Promise<PublicTemplateDetailView> {
    const row = await this.templates.findPublishedBySlug(slug);
    if (row === undefined) {
      throw publicDesignTemplateNotFound();
    }

    const scope = toScope(row);
    // A `PUBLISHED` Template always holds a complete scope (`GRD-T01`), so an
    // absent one is a row no delivered checkpoint can produce — and a public read
    // meeting an impossible state hides it rather than answering around it.
    if (scope === undefined || (await this.eligibleScope(scope)) === undefined) {
      throw publicDesignTemplateNotFound();
    }

    return toPublicDetailView(row);
  }

  /**
   * Catalog's answer to "is this exact chain publicly designable right now".
   *
   * Design asks; Catalog defines. Re-deriving the product-publication and
   * public-category predicates here would be a second definition of public
   * visibility that drifts the first time publication rules change — the
   * duplication `BACKEND_CONVENTIONS.md` §10 forbids, and the reason
   * `CatalogPlacementReadModule` exists.
   */
  private async eligibleScope(
    scope: PublishedTemplateScope,
  ): Promise<PublishedTemplateScope | undefined> {
    return this.placement.findPublicPlacementScope(scope);
  }
}

/** The scope triple of a row, or nothing when it is incomplete. */
function toScope(row: PublishedDesignTemplate): PublishedTemplateScope | undefined {
  const { productId, productSideId, embroideryAreaId } = row.template;
  if (productId === undefined || productSideId === undefined || embroideryAreaId === undefined) {
    return undefined;
  }
  return { productId, productSideId, embroideryAreaId };
}

/** The keyset position of the last row on the page. */
function lastPositionOf(items: readonly PublishedDesignTemplate[]): {
  readonly createdAt: Date;
  readonly id: string;
} {
  const last = items[items.length - 1];
  if (last === undefined) {
    // Unreachable: `buildPage` reports a next page only when it kept rows.
    throw new Error('A next page was reported for an empty page.');
  }
  return { createdAt: last.template.createdAt, id: last.template.id };
}
