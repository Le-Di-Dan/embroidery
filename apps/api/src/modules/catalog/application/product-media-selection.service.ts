/**
 * Validates and orders an Admin media selection (`APP2-B02` §11 / IMP-D032).
 *
 * Every selected Asset is read through the Asset module's **public** repository
 * port, never by querying its tables from here — the association is Catalog's,
 * the asset metadata stays Asset's (ADR-DB4-003).
 *
 * Two properties this must have, and one it must not:
 *
 * - **One query, not one per item.** The whole distinct selection is resolved
 *   in a single round trip, so a large gallery costs the same as a small one.
 * - **Eligibility that still holds at commit.** The read takes a `FOR SHARE`
 *   lock inside the caller's transaction, so an Asset cannot leave `ACCEPTED`
 *   between validation and the media write. A plain read at `READ COMMITTED`
 *   would let exactly that happen and commit a link to an asset the store had
 *   already rejected.
 * - **A count bound that is a product rule, not a loop bound.** An earlier
 *   version capped the selection at twelve purely to bound a per-item loop;
 *   that was an invented rule with no authority behind it, and the batch query
 *   removed its reason. The cap that stands here is a different thing:
 *   `MAX_PRODUCT_MEDIA_ITEMS` is approved product authority (`APP12-M01.DB1`),
 *   it is the same constant migration 0039 renders into the `display_order`
 *   bound, and it is checked here — at the one boundary every Admin media write
 *   passes through — so a 21-image selection is refused before the first row is
 *   written rather than by the twenty-first insert failing halfway.
 *
 * Validation is all-or-nothing and completes before a single link is written,
 * so one bad item leaves the previous selection exactly as it was.
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
   *
   * The positions this returns are contiguous `0..N-1` and contain 0 whenever
   * the selection is non-empty, by construction — the two set-level rules the
   * database cannot state as constraints and therefore expects from here
   * (`APP12-M01.DB1`).
   *
   * Must run inside the caller's transaction — the repository asserts it.
   */
  async resolve(assetIds: readonly string[]): Promise<ProductDraftMediaLink[]> {
    // The count first: it is the coarsest structural bound, and it is decided
    // without reading a single Asset.
    if (assetIds.length > MAX_PRODUCT_MEDIA_ITEMS) {
      throw productDraftError('PRODUCT_MEDIA_TOO_MANY');
    }
    if (new Set(assetIds).size !== assetIds.length) {
      throw productDraftError('PRODUCT_MEDIA_DUPLICATE');
    }
    if (assetIds.length === 0) {
      return [];
    }

    // One locking read for the whole selection.
    const locked = await this.assets.lockScopedByIds(assetIds as readonly AssetId[], SCOPE);
    const byId = new Map(locked.map((asset) => [asset.id as string, asset]));

    // Checked against the complete requested set, not against the result size:
    // a duplicate-free request of N ids must resolve N distinct rows, and
    // comparing counts alone would miss which one was wrong.
    for (const assetId of assetIds) {
      const asset = byId.get(assetId);
      if (asset === undefined) {
        // Absent from the scoped read: either no such asset, or one outside the
        // catalog-media lane. Reported identically — as B01 does — so this
        // endpoint cannot confirm that a customer's private artwork exists.
        throw productDraftError('PRODUCT_MEDIA_ASSET_NOT_FOUND');
      }
      if (asset.status !== PRODUCT_MEDIA_ASSET_STATUS) {
        // Ours, but inspection has not accepted it — a different, retryable
        // situation from "no such image".
        throw productDraftError('PRODUCT_MEDIA_ASSET_UNAVAILABLE');
      }
    }

    return assetIds.map((assetId, position) => ({
      assetId,
      role: position === 0 ? PRODUCT_MEDIA_PRIMARY_ROLE : PRODUCT_MEDIA_SECONDARY_ROLE,
      displayOrder: position,
    }));
  }
}
