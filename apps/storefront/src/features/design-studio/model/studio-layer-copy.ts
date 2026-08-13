/**
 * Every customer-visible string of the layer panel (`APP3-S04`).
 *
 * Two rules, inherited from `STUDIO_STAGE_COPY` and not relaxed here.
 *
 * Nothing names an internal identifier. A layer is called after what it *is* —
 * its own text, or the kind of thing it is — never after its element id, its
 * `assetId` or its `derivativeId`. Two layers may therefore read the same, and
 * that is correct: identity is the stable id the row is keyed by, and a
 * disambiguating suffix built from an internal reference would put that
 * reference on screen to solve a problem the customer does not have.
 *
 * And nothing promises a capability this checkpoint does not have. There is no
 * "nhóm", "tách nhóm", "nhân bản", "xoá", "hoàn tác" or "đã lưu": grouping is
 * not authorized by the accepted `APP3-S04` design (see `studio-layers.ts`),
 * duplicate and delete are not in this checkpoint's capability row, and history
 * and autosave belong to `APP3-S08` and `APP3-S10`. A label is a promise.
 */
export const STUDIO_LAYER_COPY = {
  panelLabel: 'Lớp thiết kế',
  title: 'Lớp thiết kế',
  /** Says which end of the list is the front, rather than leaving it to be inferred. */
  orderNote: 'Lớp trên cùng nằm trước, che các lớp bên dưới.',

  empty: 'Chưa có lớp nào trong thiết kế.',
  emptyHint: 'Thêm chữ hoặc ảnh để bắt đầu.',

  select: (label: string) => `Chọn lớp ${label}`,

  moveUp: 'Đưa lên trên',
  moveDown: 'Đưa xuống dưới',
  moveUpFor: (label: string) => `Đưa lớp ${label} lên trên`,
  moveDownFor: (label: string) => `Đưa lớp ${label} xuống dưới`,

  hide: 'Ẩn lớp',
  show: 'Hiện lớp',
  hideFor: (label: string) => `Ẩn lớp ${label}`,
  showFor: (label: string) => `Hiện lớp ${label}`,

  lock: 'Khoá lớp',
  unlock: 'Mở khoá lớp',
  lockFor: (label: string) => `Khoá lớp ${label}`,
  unlockFor: (label: string) => `Mở khoá lớp ${label}`,

  /** State carried as text, so it is never colour-only. */
  hiddenFlag: 'Đang ẩn',
  lockedFlag: 'Đang khoá',

  /** Why a row cannot be restacked. Truthful, and about this row. */
  nestedReason: 'Lớp nằm trong một nhóm nên chưa thể đổi thứ tự.',
  topReason: 'Lớp đã ở trên cùng.',
  bottomReason: 'Lớp đã ở dưới cùng.',

  // Announced through a polite live region, because a restack is a change a
  // customer who cannot see the stage would otherwise have no evidence of.
  movedUp: (label: string) => `Đã đưa lớp ${label} lên trên.`,
  movedDown: (label: string) => `Đã đưa lớp ${label} xuống dưới.`,
  moved: (label: string) => `Đã đổi thứ tự lớp ${label}.`,
  hidden: (label: string) => `Đã ẩn lớp ${label}.`,
  shown: (label: string) => `Đã hiện lớp ${label}.`,
  locked: (label: string) => `Đã khoá lớp ${label}.`,
  unlocked: (label: string) => `Đã mở khoá lớp ${label}.`,
  refused: 'Chưa thể thay đổi lớp này.',

  typeText: 'Chữ thêu',
  typeImage: 'Hình ảnh',
  typeShape: 'Hình khối',
  typeFreehand: 'Nét vẽ tay',
  typeGroup: 'Nhóm',

  /*
   * There is no "this screen is too small" sentence any more.
   *
   * One stood here until `APP3-S11` shipped the approved mobile surface for this
   * capability. Keeping it would leave a false statement in the product for the
   * first person who renders it by mistake, so it was removed rather than left
   * unreferenced.
   */
} as const;
