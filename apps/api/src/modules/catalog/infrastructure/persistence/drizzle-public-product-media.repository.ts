/**
 * Drizzle implementation of the public catalog-media delivery read
 * (`APP2-T01`).
 *
 * One statement, one row, one column. The entire visibility decision — product
 * publication, category publication, the attachment, the asset lane and the
 * derivative's readiness — is expressed as the join and WHERE of a single
 * query, so PostgreSQL evaluates it against one consistent snapshot. Splitting
 * it into "find the product, then find the media, then find the derivative"
 * would open windows between the checks in which an unpublish could commit, and
 * the earlier checks would have proved nothing about the row finally served.
 *
 * The repository opens no transaction (DEC-DB7-006). An ordinary read needs
 * none, and this one must not hold one: the caller streams several megabytes
 * from object storage afterwards, and a transaction spanning that would pin a
 * connection for the duration of a client's download.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';

import type {
  PublicProductMediaDescriptor,
  PublicProductMediaLookup,
  PublicProductMediaRepository,
} from '../../domain/repositories/public-product-media.repository';
import {
  APP2_CATEGORY_STATUS,
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
  PRODUCT_PUBLISHED_STATE,
} from '../../domain/public-product-media.policy';

const { products, categories, productMedia, assets, assetDerivatives } = schema;

@Injectable()
export class DrizzlePublicProductMediaRepository
  extends DrizzleRepository
  implements PublicProductMediaRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findDeliverable(
    lookup: PublicProductMediaLookup,
  ): Promise<PublicProductMediaDescriptor | undefined> {
    const conditions = [
      // Product identity and publication (LC-04). `status = 'PUBLISHED'` is the
      // only visibility predicate there is — no second visibility flag exists,
      // and unpublish is a real transition back to DRAFT (TR-LC04-05), so this
      // comparison is what makes an unpublished product disappear here.
      eq(products.slug, lookup.slug),
      eq(products.status, PRODUCT_PUBLISHED_STATE),
      // A published product inside a withdrawn category has no coherent public
      // placement, so it is not served. This mirrors the `PRODUCT_CATEGORY_READY`
      // publication requirement rather than inventing a second rule.
      eq(categories.status, APP2_CATEGORY_STATUS),
      isNull(categories.archivedAt),
      // The association, bound to *this* product: an id belonging to another
      // product must not resolve just because it exists.
      eq(productMedia.id, lookup.productMediaId),
      // The asset is re-checked rather than trusted from the B02 write that
      // created the link — an image can be rejected or tombstoned after it was
      // attached, and serving history would put a withdrawn image on a page.
      eq(assets.kind, PRODUCT_MEDIA_ASSET_KIND),
      eq(assets.classification, PRODUCT_MEDIA_ASSET_CLASSIFICATION),
      eq(assets.status, PRODUCT_MEDIA_ASSET_STATUS),
      isNull(assets.deletedAt),
      // The exact derivative the rendition maps to, in the only serveable state.
      eq(assetDerivatives.kind, lookup.derivativeKind),
      eq(assetDerivatives.status, PRODUCT_PUBLICATION_DERIVATIVE_STATE),
      // INV-22: a watermarked artifact is the customer/design preview, never
      // catalog display media. CST-126 already forbids a watermarked
      // CATALOG_PREVIEW physically; this keeps the rule true for THUMBNAIL too.
      eq(assetDerivatives.isWatermarked, false),
      // READY implies a key by CHECK, but the delivery path reads the value, so
      // it asserts the fact it depends on instead of trusting the constraint.
      isNotNull(assetDerivatives.storageKey),
    ];

    if (lookup.requiredRole !== undefined) {
      conditions.push(eq(productMedia.role, lookup.requiredRole));
    }

    const [row] = await this.db
      .select({ storageKey: assetDerivatives.storageKey })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(productMedia, eq(productMedia.productId, products.id))
      .innerJoin(assets, eq(assets.id, productMedia.assetId))
      .innerJoin(assetDerivatives, eq(assetDerivatives.assetId, assets.id))
      .where(and(...conditions))
      .limit(1);

    // `storage_key` is nullable in the column type even though the predicate
    // above excludes NULL, so the narrowing is explicit rather than asserted.
    if (row === undefined || row.storageKey === null) {
      return undefined;
    }
    return { storageKey: row.storageKey };
  }
}
