/**
 * Catalog subject labels for a request that names a product (`APP5-B03` §6).
 *
 * A **port**, for the reason `placement-hierarchy.port.ts` records: Ordering
 * must not call the catalog module's concrete repositories or read its tables
 * (`BACKEND_CONVENTIONS.md` §10). It depends on this interface; Catalog provides
 * the implementation.
 *
 * ### Why not `ProductRepository.findById` and `loadStructure`
 *
 * `findById` returns the authoring row — `basePriceAmount`, `currencyCode`,
 * `status`, `displayOrder`, `categoryId` — none of which a request's status page
 * may show, and `status` in particular is Catalog's own lifecycle rather than a
 * fact about the request. `loadStructure` loads every variant, SKU, side and
 * area of the product to answer a question about one variant. `APP5-B03` §10
 * forbids loading a wider aggregate and redacting it afterwards when a narrow
 * query can avoid retrieving the internal data at all, so this port returns
 * exactly the four display strings and nothing that would have to be dropped.
 *
 * ### Why publication state is not a predicate
 *
 * `PublicProductRepository` applies the publication predicate, which is right
 * for a storefront listing and wrong here. The customer is being shown **their
 * own submitted request**; unpublishing or archiving the product afterwards is a
 * merchandising decision that must not make their request unreadable or, worse,
 * make it describe a different subject. This port therefore resolves by id
 * regardless of publication state, and returns only fields that are public for
 * any product anyway — a name, a slug and the two variant attribute labels.
 */
import type { ProductId, ProductVariantId } from './placement-hierarchy.port';

export const CATALOG_SUBJECT_PORT = Symbol('CATALOG_SUBJECT_PORT');

/** What a request's catalog subject is called. No price, no state, no category. */
export interface CatalogSubjectLabels {
  readonly productName: string;
  readonly productSlug: string;
  /**
   * `product_variants` has no `name`: DB4 locked two relational attribute
   * columns instead (`color_name`, `size_label`), and both are nullable. They
   * are projected as they are stored rather than joined into an invented
   * "variant name", so nothing downstream has to guess a separator or a fallback
   * for a variant that carries only one of them.
   */
  readonly variantColorName: string | undefined;
  readonly variantSizeLabel: string | undefined;
}

export interface CatalogSubjectReference {
  readonly productId: ProductId;
  readonly productVariantId: ProductVariantId;
}

/** What a queue row calls a catalog subject: the product, without its variant. */
export interface CatalogProductLabels {
  readonly productName: string;
  readonly productSlug: string;
}

export interface CatalogSubjectPort {
  /**
   * Resolves the labels of one product/variant pair, or nothing.
   *
   * `undefined` when either row is absent **or** the variant does not belong to
   * the product — the same conjunctive read `PlacementHierarchyPort` uses, so a
   * mismatched pair cannot be labelled as if it were coherent. A caller treats
   * absence as "the subject cannot be described", never as an error to report.
   */
  findSubjectLabels(reference: CatalogSubjectReference): Promise<CatalogSubjectLabels | undefined>;

  /**
   * Product labels for a whole page of requests, in one statement (`APP5-B04`
   * §8, §12).
   *
   * A second method rather than a loop over {@link findSubjectLabels}, because
   * the Admin queue resolves up to a page of subjects at once and calling the
   * single-pair read per row is exactly the N+1 the checkpoint forbids.
   *
   * It answers a deliberately *weaker* question than the pair read: a queue row
   * says which product a request is for, not which variant, so no variant is
   * joined and no conjunctive pair rule applies. The detail read keeps using
   * {@link findSubjectLabels}, where naming the wrong variant would matter.
   *
   * Ids absent from the result are products that no longer resolve; the caller
   * reports the subject as unnamed rather than inventing a placeholder.
   */
  findProductLabels(
    productIds: readonly ProductId[],
  ): Promise<ReadonlyMap<ProductId, CatalogProductLabels>>;
}
