/**
 * Every customer-visible string of the Studio stage (`APP3-S02`).
 *
 * Kept apart from `STUDIO_COPY` because the two describe different things: that
 * one is the bootstrap route's vocabulary, this one is the drawing surface's.
 * Reviewing what the stage is willing to say — and what it refuses to say —
 * should not mean reading past the Template picker.
 *
 * Two rules run through all of it. Nothing here names an internal identifier: no
 * asset id, derivative id, element id, storage key or finding path is customer
 * copy, and an id is not a name. And nothing here promises a capability this
 * checkpoint does not have — there is no "kéo để di chuyển", no "hoàn tác", no
 * "đã lưu", because moving, undoing and saving belong to `APP3-S03`, `S08` and
 * `S10` and a label is a promise.
 */
export const STUDIO_STAGE_COPY = {
  stageLabel: 'Khung thiết kế',
  /** The stage's accessible description. Dimensions are the document's own. */
  canvasLabel: (widthPx: number, heightPx: number) =>
    `Khung thiết kế ${String(widthPx)}×${String(heightPx)} điểm ảnh`,

  empty: 'Thiết kế của bạn đang trống.',
  emptyHint: 'Các công cụ thêm chữ và hình sẽ có ở bước tiếp theo.',

  // Three separate refusals, because they are three different facts. None of
  // them shows the document, a path or an element id.
  unreadableDocument: 'Chưa thể mở bản thiết kế của phiên này.',
  unresolvableGeometry: 'Bản thiết kế của phiên này có lỗi bố cục nên chưa thể hiển thị.',
  uncontrolledFont: 'Bản thiết kế dùng phông chữ không được hỗ trợ nên chưa thể hiển thị.',
  failureHint: 'Vui lòng thử lại sau hoặc bắt đầu một phiên mới.',

  backgroundLoading: 'Đang tải hình sản phẩm…',
  backgroundUnavailable: 'Chưa có hình sản phẩm cho mặt thêu này.',
  backgroundFailed: 'Chưa thể tải hình sản phẩm.',
  backgroundRetry: 'Tải lại hình sản phẩm',

  areaLabel: 'Vùng thêu cho phép',

  selectionNone: 'Chưa chọn đối tượng nào.',
  selectionPrefix: 'Đang chọn',

  /*
   * An image element whose bytes this checkpoint cannot lawfully deliver.
   *
   * There is no public route that serves a Design Session's own image bytes:
   * `APP3-B06C` is not built, and `APP3-B05A` serves *published Template*
   * assets under a different authority that a cloned Session does not inherit.
   * So the element is drawn at its real geometry and labelled for what it is.
   * The label is never the asset id — an internal identifier is not a name, and
   * putting one on screen would leak the very reference the contextual routes
   * exist to avoid handing out.
   */
  imagePlaceholder: 'Hình ảnh',
  imagePlaceholderHint: 'Sẽ hiển thị ở bước tiếp theo',

  // Element names for the accessibility layer, used when the document carries
  // nothing better. A text element names itself with its own text.
  unnamedText: 'Chữ thêu',
  typeImage: 'Hình ảnh',
  typeShape: 'Hình khối',
  typeFreehand: 'Nét vẽ tay',
} as const;
