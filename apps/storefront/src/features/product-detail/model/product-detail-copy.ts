/**
 * Every user-facing string on the Product Detail page (`APP2-S02`).
 *
 * One module because copy is business content, not component detail: it is
 * approved as a whole in the `APP2-S02-G01` state-authority board (`537:38`) and
 * has to be reviewable in one place. No string here describes a Product fact the
 * contract does not carry — there is no year, technique, dimension, collection
 * or material wording to be found, because inventing that copy is exactly how a
 * page starts claiming things the backend never said.
 */

import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/storefront.json`, under `productDetail`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const productDetailMessage = messageView(VI_MESSAGES.storefront, 'productDetail');

export const PRODUCT_DETAIL_COPY = {
  /** Breadcrumb / back navigation. */
  breadcrumbLabel: productDetailMessage.text('breadcrumbLabel'),
  discover: productDetailMessage.text('discover'),
  backToDiscover: productDetailMessage.text('backToDiscover'),

  /** Gallery. */
  galleryLabel: productDetailMessage.text('galleryLabel'),
  mediaEmpty: productDetailMessage.text('mediaEmpty'),
  mediaError: productDetailMessage.text('mediaError'),
  thumbnailUnavailable: productDetailMessage.text('thumbnailUnavailable'),
  zoomHint: productDetailMessage.text('zoomHint'),

  /** Story. */
  storyHeading: productDetailMessage.text('storyHeading'),

  /** Continue discovering. */
  continueHeading: productDetailMessage.text('continueHeading'),
  continueAll: productDetailMessage.text('continueAll'),

  /** Share. */
  share: productDetailMessage.text('share'),
  shareCopied: productDetailMessage.text('shareCopied'),
  shareCompleted: productDetailMessage.text('shareCompleted'),
  shareFailed: productDetailMessage.text('shareFailed'),

  /** Lightbox. */
  lightboxClose: productDetailMessage.text('lightboxClose'),
  lightboxPrevious: productDetailMessage.text('lightboxPrevious'),
  lightboxNext: productDetailMessage.text('lightboxNext'),

  /** Route-local loading and failure. */
  loading: productDetailMessage.text('loading'),
  errorHeading: productDetailMessage.text('errorHeading'),
  errorBody: productDetailMessage.text('errorBody'),
  errorRetry: productDetailMessage.text('errorRetry'),
} as const;

/**
 * The main image's alternative text.
 *
 * Built only from Product-owned text plus the visitor's own position in the
 * gallery. The backend publishes no caption and no original filename, so the
 * honest description of image three is "the third image of this artwork" — not
 * a fabricated subject, and never the upload's filename, which would leak how
 * the studio names its files.
 */
export function mainMediaAlt(name: string, index: number, total: number): string {
  return productDetailMessage.text('mainMediaAlt', { name, position: index + 1, total });
}

/** The accessible name of a thumbnail control. Index-based for the same reason. */
export function thumbnailLabel(index: number, total: number): string {
  return productDetailMessage.text('thumbnailLabel', { position: index + 1, total });
}

/** The accessible name of the control that opens the large view. */
export function openLightboxLabel(index: number): string {
  return productDetailMessage.text('openLightboxLabel', { position: index + 1 });
}

/** The lightbox's textual position, so "which image" is never colour-only. */
export function positionLabel(index: number, total: number): string {
  return productDetailMessage.text('positionLabel', { position: index + 1, total });
}

/** "Khám phá {category}" — the category-scoped continuation link. */
export function continueInCategoryLabel(categoryName: string): string {
  return productDetailMessage.text('continueInCategoryLabel', { categoryName });
}

/** The lightbox dialog's accessible title. */
export function lightboxTitle(name: string): string {
  return name;
}
