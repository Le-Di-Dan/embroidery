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

export const PRODUCT_DETAIL_COPY = {
  /** Breadcrumb / back navigation. */
  breadcrumbLabel: 'Đường dẫn',
  discover: 'Khám phá',
  backToDiscover: '← Quay lại Khám phá',

  /** Gallery. */
  galleryLabel: 'Ảnh tác phẩm',
  mediaEmpty: 'Chưa có ảnh cho tác phẩm này',
  mediaError: 'Không tải được ảnh này. Bạn vẫn có thể xem các ảnh khác và đọc câu chuyện.',
  thumbnailUnavailable: 'Ảnh không khả dụng',
  zoomHint: 'Nhấn vào ảnh để mở chế độ xem lớn',

  /** Story. */
  storyHeading: 'Câu chuyện về tác phẩm',

  /** Continue discovering. */
  continueHeading: 'Tiếp tục khám phá',
  continueAll: 'Khám phá tất cả',

  /** Share. */
  share: 'Chia sẻ',
  shareCopied: 'Đã sao chép liên kết.',
  shareCompleted: 'Đã chia sẻ tác phẩm.',
  shareFailed: 'Không thể chia sẻ liên kết. Vui lòng thử lại.',

  /** Lightbox. */
  lightboxClose: 'Đóng',
  lightboxPrevious: 'Ảnh trước',
  lightboxNext: 'Ảnh sau',

  /** Route-local loading and failure. */
  loading: 'Đang tải tác phẩm…',
  errorHeading: 'Chưa thể tải tác phẩm',
  errorBody: 'Vui lòng thử lại sau.',
  errorRetry: 'Thử lại',
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
  return `${name} — ảnh ${index + 1} trên ${total}`;
}

/** The accessible name of a thumbnail control. Index-based for the same reason. */
export function thumbnailLabel(index: number, total: number): string {
  return `Xem ảnh ${index + 1} trên ${total}`;
}

/** The accessible name of the control that opens the large view. */
export function openLightboxLabel(index: number): string {
  return `Mở ảnh ${index + 1} trong chế độ xem lớn`;
}

/** The lightbox's textual position, so "which image" is never colour-only. */
export function positionLabel(index: number, total: number): string {
  return `Ảnh ${index + 1} trên ${total}`;
}

/** "Khám phá {category}" — the category-scoped continuation link. */
export function continueInCategoryLabel(categoryName: string): string {
  return `Khám phá ${categoryName}`;
}

/** The lightbox dialog's accessible title. */
export function lightboxTitle(name: string): string {
  return name;
}
