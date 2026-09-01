/**
 * The locked APP2 product-draft policy (`APP2-B02-G01` / IMP-D032).
 *
 * These are approved product values, not tuning knobs. They live in one module
 * so the service, the repository, the DTOs and the tests all read the same
 * value — a second copy is how a draft sentinel silently becomes two sentinels.
 *
 * The draft sentinels and the media roles are re-exported from
 * `@embroidery/database`, which is where the gate put the canonical values;
 * re-declaring them here would fork the source the migration itself used.
 *
 * **No category taxonomy is here, and none may return** (`APP12-C01-C1`,
 * `IMP-D062`). This module used to re-export `APP2_CATEGORY_SLUGS` and
 * `APP2_CATEGORY_TAXONOMY` and to carry a `categoryNameOf(slug)` lookup — a
 * slug-to-label map compiled into the API. The `categories` table is the sole
 * authority for which categories exist and what they are called;
 * `CategoryResolver` answers existence against rows, and a category's name
 * reaches a client from the row the query joined, never from a constant.
 */
import {
  APP2_PRODUCT_MEDIA_ROLES,
  PRODUCT_DRAFT_BASE_PRICE_AMOUNT,
  PRODUCT_DRAFT_DISPLAY_ORDER,
  PRODUCT_MEDIA_PRIMARY_ROLE,
  PRODUCT_MEDIA_SECONDARY_ROLE,
  type ProductState,
} from '@embroidery/database';

export {
  APP2_PRODUCT_MEDIA_ROLES,
  PRODUCT_DRAFT_BASE_PRICE_AMOUNT,
  PRODUCT_DRAFT_DISPLAY_ORDER,
  PRODUCT_MEDIA_PRIMARY_ROLE,
  PRODUCT_MEDIA_SECONDARY_ROLE,
};

/** The only currency DB6 permits (`ck_products__currency_allowed`). */
export const PRODUCT_CURRENCY = 'VND' as const;

/** The state a product is created in, and the only state B02 may edit. */
export const PRODUCT_DRAFT_STATE = 'DRAFT' as const satisfies ProductState;

/** The terminal state `POST /archive` moves a product to. */
export const PRODUCT_ARCHIVED_STATE = 'ARCHIVED' as const satisfies ProductState;

/**
 * States a draft edit may act on.
 *
 * Only `DRAFT`. `PUBLISHED` editing belongs to `APP2-B03` (a published product
 * has a public read model to keep consistent) and `ARCHIVED` is terminal here.
 */
export const PRODUCT_EDITABLE_STATES = [PRODUCT_DRAFT_STATE] as const;

/**
 * States that may be archived.
 *
 * `DRAFT` only in `APP2-B02`. Archiving a `PUBLISHED` product would have to
 * withdraw it from the Storefront as well, and unpublication is B03's — so this
 * checkpoint returns a safe conflict rather than half-performing it.
 */
export const PRODUCT_ARCHIVABLE_STATES = [PRODUCT_DRAFT_STATE] as const;

export function isEditableState(status: string): boolean {
  return (PRODUCT_EDITABLE_STATES as readonly string[]).includes(status);
}

export function isArchivableState(status: string): boolean {
  return (PRODUCT_ARCHIVABLE_STATES as readonly string[]).includes(status);
}

/** The catalog-media lane an Asset must belong to before a draft may use it. */
export const PRODUCT_MEDIA_ASSET_KIND = 'CATALOG_MEDIA' as const;
export const PRODUCT_MEDIA_ASSET_CLASSIFICATION = 'PRODUCTION_SENSITIVE' as const;
export const PRODUCT_MEDIA_ASSET_STATUS = 'ACCEPTED' as const;

/** Bounds on the free-text draft fields, mirroring nothing but sane input. */
export const PRODUCT_NAME_MAX_LENGTH = 200;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 5000;

/**
 * The largest base price the money column can hold.
 *
 * `numeric(14,2)` with the VND whole-number CHECK: twelve integer digits.
 */
export const MAX_BASE_PRICE_AMOUNT = 999_999_999_999n;
