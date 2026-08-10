/**
 * Every customer-visible string of the Studio viewport controls (`APP3-S07`).
 *
 * Separate from `STUDIO_STAGE_COPY` for the same reason that one is separate
 * from `STUDIO_COPY`: these words describe the camera, not the drawing.
 *
 * The rule that governs all of it is the one `APP3-S02` set — a label is a
 * promise. Nothing here says "kéo để di chuyển đối tượng", "hoàn tác" or "đã
 * lưu", because moving an element, undoing and saving belong to `APP3-S03`,
 * `S08` and `S10`. The pan hint speaks only of the view, and it is the one
 * sentence that has to be precise: a customer told they can drag will try to
 * drag an element, and this checkpoint moves the picture, never the design.
 */
export const STUDIO_VIEWPORT_COPY = {
  toolbarLabel: 'Thu phóng khung thiết kế',

  zoomOut: 'Thu nhỏ',
  zoomIn: 'Phóng to',
  /** Stated as text, not only as the size of things, so it is readable aloud. */
  zoomValue: (percent: number) => `Mức phóng ${String(percent)}%`,
  fit: 'Vừa khung',
  fitHint: 'Đưa khung thiết kế về mức phóng ban đầu',

  safeAreaShow: 'Hiện vùng thêu cho phép',
  safeAreaHide: 'Ẩn vùng thêu cho phép',
  /**
   * The legend the approved Safe Area frame carries.
   *
   * It explains what the dashed rectangle means, which is the only thing that
   * makes hiding it a meaningful choice rather than a switch with no subject.
   */
  safeAreaLegend: 'Đường nét đứt là vùng thêu cho phép của mặt thêu này.',

  /**
   * The pan affordance, worded for what it actually does.
   *
   * Only shown above the fitted zoom, because at fit the whole canvas is
   * already visible and there is nowhere to pan to — the pan bounds collapse to
   * a single position. A hint offering a gesture that cannot move anything is
   * the same defect as a disabled button with no reason.
   */
  panHint: 'Kéo trên nền khung để xem phần khác của thiết kế.',
} as const;
