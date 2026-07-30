/**
 * Validates and orders an Admin media selection (`APP2-B02` §11 / IMP-D032).
 *
 * Every selected Asset is read through the Asset module's **public** repository
 * port, never by querying its tables from here — the association is Catalog's,
 * the asset metadata stays Asset's (ADR-DB4-003).
 *
 * Validation is all-or-nothing and happens before a single link is written, so
 * one bad item leaves the previous selection exactly as it was rather than
 * half-replaced. The caller runs this inside the same transaction as the write,
 * so a concurrently rejected Asset cannot slip in between the check and the
 * insert.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  ASSET_REPOSITORY,
  type AssetId,
  type AssetRepository,
} from '../../asset/domain/repositories/asset.repository';
import { productDraftError } from '../domain/product-draft.errors';
import {
  MAX_PRODUCT_MEDIA_ITEMS,
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_MEDIA_PRIMARY_ROLE,
  PRODUCT_MEDIA_SECONDARY_ROLE,
} from '../domain/product-draft.policy';
import type { ProductDraftMediaLink } from '../domain/repositories/product-draft.repository';

const SCOPE = {
  kind: PRODUCT_MEDIA_ASSET_KIND,
  classification: PRODUCT_MEDIA_ASSET_CLASSIFICATION,
} as const;

@Injectable()
export class ProductMediaSelection {
  constructor(@Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository) {}

  /**
   * Turns an ordered list of Asset ids into the links to store.
   *
   * Roles come from position, never from the client: the first Asset is the one
   * `THUMBNAIL`, the rest are `GALLERY` at their zero-based request position.
   * `DETAIL` is never written by APP2-B02.
   */
  async resolve(assetIds: readonly string[]): Promise<ProductDraftMediaLink[]> {
    if (assetIds.length > MAX_PRODUCT_MEDIA_ITEMS) {
      throw productDraftError('PRODUCT_DRAFT_INVALID');
    }
    if (new Set(assetIds).size !== assetIds.length) {
      throw productDraftError('PRODUCT_MEDIA_DUPLICATE');
    }

    const links: ProductDraftMediaLink[] = [];
    for (const [position, assetId] of assetIds.entries()) {
      // A scoped read: an Asset outside the catalog-media lane is reported as
      // missing, exactly as B01 does, so this endpoint cannot be used to probe
      // whether a customer's private artwork exists.
      const asset = await this.assets.findScoped(assetId as AssetId, SCOPE);
      if (asset === undefined) {
        throw productDraftError('PRODUCT_MEDIA_ASSET_NOT_FOUND');
      }
      if (asset.status !== PRODUCT_MEDIA_ASSET_STATUS) {
        // It exists and is ours, but inspection has not accepted it — a
        // different, retryable situation from "no such image".
        throw productDraftError('PRODUCT_MEDIA_ASSET_UNAVAILABLE');
      }

      links.push({
        assetId,
        role: position === 0 ? PRODUCT_MEDIA_PRIMARY_ROLE : PRODUCT_MEDIA_SECONDARY_ROLE,
        displayOrder: position,
      });
    }
    return links;
  }
}
