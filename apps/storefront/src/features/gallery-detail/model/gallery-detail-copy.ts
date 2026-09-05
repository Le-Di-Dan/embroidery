/**
 * Every user-facing string on the Gallery Entry Detail page (`APP11-S03`).
 *
 * One module because copy is business content, not component detail
 * (FRONTEND_CONVENTIONS §14). Nothing here promises a fact the contract does
 * not carry: `publicGalleryEntryDetail` publishes a title, one description, an
 * ordered image list, an optional linked product and three SEO fields — so
 * there is no year, technique, material, dimension, stitch count, member-work
 * count or "related collections" wording anywhere below, because inventing
 * that copy is exactly how a page starts claiming things the studio never
 * said.
 *
 * There is likewise no engineering commentary: no endpoint, contract field,
 * checkpoint identifier or "sắp ra mắt" note reaches a visitor.
 *
 * UI05's own detail strings were rewritten from collection semantics to
 * single-entry semantics by `APP11-D01` (22 desktop / 16 tablet / 13 mobile
 * strings); this catalog follows the rewritten frames, not the historical
 * `/collections` draft.
 */

import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/storefront.json`, under `galleryEntry`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const galleryEntryMessage = messageView(VI_MESSAGES.storefront, 'galleryEntry');

export const GALLERY_DETAIL_COPY = {
  /** Breadcrumb. */
  breadcrumbLabel: galleryEntryMessage.text('breadcrumbLabel'),
  /** The feed crumb, quoted from the approved H1 of `/bo-suu-tap`. */
  gallery: galleryEntryMessage.text('gallery'),
  backToGallery: galleryEntryMessage.text('backToGallery'),

  /** Media. */
  mediaLabel: galleryEntryMessage.text('mediaLabel'),
  mediaError: galleryEntryMessage.text('mediaError'),
  thumbnailUnavailable: galleryEntryMessage.text('thumbnailUnavailable'),
  zoomHint: galleryEntryMessage.text('zoomHint'),

  /** Narrative. */
  narrativeHeading: galleryEntryMessage.text('narrativeHeading'),

  /** Related product. */
  relatedProductHeading: galleryEntryMessage.text('relatedProductHeading'),
  relatedProductAction: galleryEntryMessage.text('relatedProductAction'),

  /** Continue discovering. */
  continueHeading: galleryEntryMessage.text('continueHeading'),
  continueAll: galleryEntryMessage.text('continueAll'),

  /** Soft commission call to action. */
  commissionHeading: galleryEntryMessage.text('commissionHeading'),
  commissionBody: galleryEntryMessage.text('commissionBody'),
  commissionAction: galleryEntryMessage.text('commissionAction'),

  /** Lightbox. */
  lightboxClose: galleryEntryMessage.text('lightboxClose'),
  lightboxPrevious: galleryEntryMessage.text('lightboxPrevious'),
  lightboxNext: galleryEntryMessage.text('lightboxNext'),

  /** Route-local loading and failure. */
  loading: galleryEntryMessage.text('loading'),
  errorHeading: galleryEntryMessage.text('errorHeading'),
  errorBody: galleryEntryMessage.text('errorBody'),
  errorRetry: galleryEntryMessage.text('errorRetry'),
} as const;

/**
 * Accessible text for one entry image.
 *
 * ```text
 * ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED
 * ```
 *
 * `APP11-D01-C1` locked this and `APP11-B03` publishes no `altText` field, so
 * there is nothing to read and nothing for an operator to author. What the
 * system honestly knows about image three is that it is the third image of
 * this entry — not its subject, not its technique and certainly not its upload
 * filename, which would leak how the studio names its files.
 *
 * The position is included only when there is more than one image: "ảnh 1 trên
 * 1" is noise a screen reader has to listen to for no information.
 */
export function galleryMediaAlt(title: string, index: number, total: number): string {
  return total <= 1
    ? title
    : galleryEntryMessage.text('galleryMediaAlt', { title, position: index + 1, total });
}

/** The accessible name of a thumbnail control. Index-based, for the same reason. */
export function galleryThumbnailLabel(index: number, total: number): string {
  return galleryEntryMessage.text('galleryThumbnailLabel', { position: index + 1, total });
}

/** The accessible name of the control that opens the large view. */
export function galleryOpenLightboxLabel(index: number): string {
  return galleryEntryMessage.text('galleryOpenLightboxLabel', { position: index + 1 });
}

/** The lightbox's textual position, so "which image" is never colour-only. */
export function galleryPositionLabel(index: number, total: number): string {
  return galleryEntryMessage.text('galleryPositionLabel', { position: index + 1, total });
}

/** The lightbox dialog's accessible title. */
export function galleryLightboxTitle(title: string): string {
  return title;
}
