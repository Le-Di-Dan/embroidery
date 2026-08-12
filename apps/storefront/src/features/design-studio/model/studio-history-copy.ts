/**
 * Every customer-visible string of the history panel (`APP3-S08`).
 *
 * Three rules, inherited from `STUDIO_LAYER_COPY` and not relaxed here.
 *
 * **Nothing names an internal identifier.** A history row is called after what
 * the customer *did* — moved this layer, changed this text — never after an
 * element id, an `assetId`, a `derivativeId`, a revision number or a JSON
 * fragment. The layer name a row quotes is the same bounded label the layer
 * panel shows, and it is bounded there for the same reason.
 *
 * **Nothing promises a capability this checkpoint does not have.** There is no
 * "đã lưu", no "khôi phục phiên", no "lịch sử đầy đủ" and no "xoá": saving,
 * conflict and resume are `APP3-S10`'s, and the mobile sheets are `APP3-S11`'s.
 *
 * **Nothing implies the history is unlimited.** `APP3-D01`'s directive for this
 * section says so in terms — *do not imply infinite history* — so the panel
 * states the bound as a number rather than saying "toàn bộ" or "mọi thay đổi",
 * and the number comes from `MAX_HISTORY_ENTRIES` rather than being written out
 * a second time in prose.
 */
export const STUDIO_HISTORY_COPY = {
  panelLabel: 'Lịch sử chỉnh sửa',
  title: 'Lịch sử chỉnh sửa',

  undo: 'Hoàn tác',
  redo: 'Làm lại',
  /** Why the control is off, so a disabled button is never silent. */
  undoUnavailable: 'Chưa có thay đổi nào để hoàn tác.',
  redoUnavailable: 'Không có thay đổi nào để làm lại.',

  /**
   * The keyboard hints the approved frame carries, as readable text.
   *
   * Written out rather than drawn as glyphs so they can be read aloud, and
   * limited to the two combinations this checkpoint actually binds.
   */
  shortcutUndo: 'Ctrl/Cmd + Z',
  shortcutRedo: 'Ctrl/Cmd + Shift + Z',
  shortcutHint: 'Phím tắt:',

  listLabel: 'Các thay đổi gần đây',
  empty: 'Chưa có thay đổi nào.',
  emptyHint: 'Di chuyển, sửa chữ hoặc thêm ảnh để bắt đầu.',

  /** State carried as text, so an undone row is never distinguished by colour alone. */
  appliedFlag: 'Đang áp dụng',
  undoneFlag: 'Đã hoàn tác',

  /**
   * The bound, stated honestly.
   *
   * `APP3-D01`'s directive forbids implying an unlimited history, and the only
   * way to not imply it is to say what the limit is.
   */
  boundNote: (limit: number) => `Chỉ giữ ${String(limit)} thay đổi gần nhất trong phiên này.`,

  // One sentence per action kind. A layer's own name is quoted where the action
  // was about one layer, and left out where it was not.
  actionMove: (label: string) => `Di chuyển ${label}`,
  actionResize: (label: string) => `Đổi kích thước ${label}`,
  actionRotate: (label: string) => `Xoay ${label}`,
  actionReorder: (label: string) => `Đổi thứ tự ${label}`,
  actionLock: (label: string) => `Khoá ${label}`,
  actionUnlock: (label: string) => `Mở khoá ${label}`,
  actionHide: (label: string) => `Ẩn ${label}`,
  actionShow: (label: string) => `Hiện ${label}`,
  actionTextEdit: (label: string) => `Sửa nội dung ${label}`,
  actionTextFormat: (label: string) => `Đổi định dạng ${label}`,
  actionImagePlace: 'Thêm hình ảnh',
  actionImageReplace: (label: string) => `Thay hình ảnh ${label}`,
  /** The fallback when the action was not about one named layer. */
  actionFallback: 'Thay đổi thiết kế',

  // Announced through a polite live region, because an undo changes the stage
  // and a customer who cannot see it would otherwise have no evidence of it.
  undone: (label: string) => `Đã hoàn tác: ${label}.`,
  redone: (label: string) => `Đã làm lại: ${label}.`,

  /**
   * Mobile.
   *
   * `APP3-S11` owns the mobile editing surfaces, so 390 renders nothing that
   * edits. This sentence promises nothing: no "sắp có", and no disabled control
   * implying a button that will work later.
   */
  mobileUnavailable: 'Hoàn tác cần màn hình lớn hơn.',
} as const;
