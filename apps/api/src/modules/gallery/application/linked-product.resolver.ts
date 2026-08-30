/**
 * Proves that a `linked_product_id` names a real Product (`APP11-B01` §7).
 *
 * `REL-096` is a nullable set-null-candidate FK, so the database would accept
 * any product id that exists — but the insert happens later in the same
 * transaction, and a caught FK violation there would already have aborted it.
 * A refusal the caller can act on has to be decided before the write.
 *
 * The check goes through `CATALOG_SUBJECT_PORT`, the existing internal Catalog
 * read authority, rather than a second Product repository or an HTTP call to
 * our own public API: Gallery must not read the catalog tables
 * (`BACKEND_CONVENTIONS.md` §10), and the port already answers exactly the
 * question asked here — does this product resolve — without loading variants,
 * SKUs, sides or price.
 *
 * **Publication state is deliberately not a predicate.** An operator links a
 * gallery entry to a product they are still preparing, and refusing an
 * unpublished one would make the field unusable for the case it exists for.
 * Whether a link may be *shown* to the public is `APP11-B03`'s projection
 * decision, where the entry itself is already behind the publication predicate.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  CATALOG_SUBJECT_PORT,
  type CatalogSubjectPort,
} from '../../catalog/domain/repositories/catalog-subject.port';
import type { ProductId } from '../../catalog/domain/repositories/placement-hierarchy.port';
import { adminGalleryEntryError } from '../domain/admin-gallery-entry.errors';

@Injectable()
export class LinkedProductResolver {
  constructor(@Inject(CATALOG_SUBJECT_PORT) private readonly catalog: CatalogSubjectPort) {}

  /**
   * Throws `GALLERY_ENTRY_LINKED_PRODUCT_INVALID` unless the product resolves.
   *
   * `undefined` (the field was omitted) and `null` (the caller is clearing the
   * relationship) both name no product, so neither is looked up: a clear must
   * not fail because the product it used to point at has since been deleted.
   */
  async requireLinkable(productId: string | null | undefined): Promise<void> {
    if (productId === undefined || productId === null) {
      return;
    }
    const labels = await this.catalog.findProductLabels([productId as ProductId]);
    if (!labels.has(productId as ProductId)) {
      throw adminGalleryEntryError('GALLERY_ENTRY_LINKED_PRODUCT_INVALID');
    }
  }
}
