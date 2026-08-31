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

export const GALLERY_DETAIL_COPY = {
  /** Breadcrumb. */
  breadcrumbLabel: 'Đường dẫn',
  /** The feed crumb, quoted from the approved H1 of `/bo-suu-tap`. */
  gallery: 'Bộ sưu tập',
  backToGallery: '← Quay lại Bộ sưu tập',

  /** Media. */
  mediaLabel: 'Bộ ảnh của mục này',
  mediaError: 'Không tải được ảnh này. Bạn vẫn có thể xem các ảnh khác và đọc nội dung.',
  thumbnailUnavailable: 'Ảnh không khả dụng',
  zoomHint: 'Nhấn vào ảnh để mở chế độ xem lớn',

  /** Narrative. */
  narrativeHeading: 'Về mục này',

  /** Related product. */
  relatedProductHeading: 'Tác phẩm liên quan',
  relatedProductAction: 'Xem tác phẩm',

  /** Continue discovering. */
  continueHeading: 'Tiếp tục khám phá',
  continueAll: 'Xem tất cả bộ sưu tập',

  /** Soft commission call to action. */
  commissionHeading: 'Muốn một tác phẩm của riêng bạn?',
  commissionBody: 'Gửi yêu cầu để xưởng cùng bạn phác thảo ý tưởng.',
  commissionAction: 'Đặt thêu',

  /** Lightbox. */
  lightboxClose: 'Đóng',
  lightboxPrevious: 'Ảnh trước',
  lightboxNext: 'Ảnh sau',

  /** Route-local loading and failure. */
  loading: 'Đang tải mục bộ sưu tập…',
  errorHeading: 'Chưa thể tải mục này',
  errorBody: 'Vui lòng thử lại sau.',
  errorRetry: 'Thử lại',
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
  return total <= 1 ? title : `${title} — ảnh ${index + 1} trên ${total}`;
}

/** The accessible name of a thumbnail control. Index-based, for the same reason. */
export function galleryThumbnailLabel(index: number, total: number): string {
  return `Xem ảnh ${index + 1} trên ${total}`;
}

/** The accessible name of the control that opens the large view. */
export function galleryOpenLightboxLabel(index: number): string {
  return `Mở ảnh ${index + 1} trong chế độ xem lớn`;
}

/** The lightbox's textual position, so "which image" is never colour-only. */
export function galleryPositionLabel(index: number, total: number): string {
  return `Ảnh ${index + 1} trên ${total}`;
}

/** The lightbox dialog's accessible title. */
export function galleryLightboxTitle(title: string): string {
  return title;
}
