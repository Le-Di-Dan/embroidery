/**
 * The public Design Template read contract (`APP3-B05`).
 *
 * A **separate port from `DesignTemplateRepository`**, for two reasons that
 * point the same way.
 *
 * The first is the read-only guarantee. `APP3-B05` must perform no insert, no
 * update, no delete, no audit append and no outbox append, and the strongest
 * form of that promise is a boundary where no write exists to call. Every method
 * here is a read; the anonymous public module binds this port and never the
 * lifecycle one, so the two public operations cannot reach `publishVersion`,
 * `archive` or `saveDraftVersion` even by mistake. Stated as a convention it
 * would need a reviewer to notice; stated as a port it needs a compiler.
 *
 * The second is that this is genuinely a different question. The Admin contract
 * reads a Template *as authored* — the newest version, whatever its state.
 * A public caller reads a Template *as published*, which is a different row
 * selected by a different predicate, and the existing `loadPublished` gets it
 * only accidentally right: it selects the version named by the header's
 * `current_version`, and this read must select the highest version whose
 * `published_at` is not null. Those two agree in every state the delivered
 * `IMP-D042` lifecycle can reach — `APP3-B03A` only saves while `DRAFT` and
 * `APP3-B04` only publishes from `DRAFT` — and a public surface must not depend
 * on that agreement. A row written before the lifecycle existed, restored from a
 * backup or repaired by hand must not be able to publish a version that nobody
 * published.
 *
 * Neither method decides **scope eligibility**. Whether the Product is still
 * publicly visible and its Side and Area still active is Catalog's answer, read
 * through the placement port; Design asks, Catalog defines.
 */
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { DesignTemplate, DesignTemplateVersion } from './design-template.repository';

/**
 * The exact `product → side → area` triple a public read is scoped to.
 *
 * All three ids, never a subset. `IMP-D042` PO-06 makes APP3 Templates
 * area-scoped, so compatibility is exact triple equality: a Template compatible
 * with one Area is compatible with that Area and with nothing else. Modelling it
 * as one required object rather than three optional filters is what makes a
 * partial scope unrepresentable here, instead of a predicate that quietly
 * matches more rows than the caller asked for.
 */
export interface PublishedTemplateScope {
  readonly productId: ProductId;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
}

export interface ListPublishedTemplatesInput {
  readonly scope: PublishedTemplateScope;
  /** Exclusive keyset position from the previous page. */
  readonly after?: { readonly createdAt: Date; readonly id: string } | undefined;
  /**
   * The page size. The adapter fetches `limit + 1` so `buildPage` can detect a
   * next page from the extra row; a caller never sees it.
   */
  readonly limit: number;
}

/**
 * A Template header paired with the version a public caller may see.
 *
 * The two travel together because neither is publicly meaningful alone: a
 * `PUBLISHED` header whose versions were never published has nothing to show,
 * and a published version whose header has since been archived must not be
 * shown. Returning them separately would let a caller hold one without the
 * other and answer with it.
 */
export interface PublishedDesignTemplate {
  readonly template: DesignTemplate;
  readonly version: DesignTemplateVersion;
}

export const PUBLISHED_DESIGN_TEMPLATE_REPOSITORY = Symbol('PUBLISHED_DESIGN_TEMPLATE_REPOSITORY');

export interface PublishedDesignTemplateRepository {
  /**
   * One keyset page of publicly visible Templates for an exact scope.
   *
   * Visibility is the header's state **and** the version's stamp, never either
   * alone: a `DRAFT` or `ARCHIVED` header yields nothing whatever `published_at`
   * history its versions carry, and a `PUBLISHED` header whose versions are all
   * unpublished yields nothing either.
   *
   * Ordered `created_at DESC, id DESC` — the same keyset the Admin list uses and
   * for the same reason: an offset page drifts under a concurrent publish and
   * the caller would see a Template twice or miss one entirely.
   */
  listPublished(input: ListPublishedTemplatesInput): Promise<PublishedDesignTemplate[]>;

  /**
   * One publicly visible Template by its public slug.
   *
   * The same header-and-version predicate as `listPublished`, so a Template can
   * never be reachable by address while absent from the page it belongs to.
   * `undefined` for an unknown slug, a `DRAFT`, an `ARCHIVED` header and a
   * `PUBLISHED` header with no published version alike — the caller turns every
   * one of them into the same answer, so none of them is distinguishable from
   * outside.
   */
  findPublishedBySlug(slug: string): Promise<PublishedDesignTemplate | undefined>;
}
