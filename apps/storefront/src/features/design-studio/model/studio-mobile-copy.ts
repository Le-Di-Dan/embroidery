/**
 * Every customer-visible string the mobile composition adds (`APP3-S11`).
 *
 * The six approved section-15 frames are the authority for each sentence below,
 * and where a frame draws a glyph the **word** is here as well: `↶`, `⋮⋮` and
 * `⋯` are decoration, and a control whose only name is a glyph has no name at
 * all to anything that does not render one.
 *
 * The Studio copy rule holds. Nothing here names a capability this checkpoint
 * does not have: there is no "thêm chữ" (`APP3-S05` is edit-only and no toolbar
 * button may become a create button), no "nhóm" (`FU-APP3-S04-GROUP-AUTHORITY-01`
 * is open), no "tải xuống", and no autosave cadence of its own — the save chip is
 * `APP3-S10`'s and says what it already said.
 */
import { STUDIO_IMAGE_COPY } from './studio-image-copy';

export const STUDIO_MOBILE_COPY = {
  /** The bottom toolbar itself (`610:242`, `x=0 y=760 w=390 h=84`). */
  toolbarLabel: 'Công cụ thiết kế',

  /**
   * The five targets, named.
   *
   * `T` is the **text** tool and never an "add text" tool: `APP3-S05` is
   * `EDIT_ONLY_NO_CREATION`, so this opens the sheet for the text element the
   * customer has selected and says so when there is none.
   */
  text: 'Chữ thêu',
  image: 'Ảnh thiết kế',
  undo: 'Hoàn tác',
  redo: 'Làm lại',
  /**
   * The `⋯` target.
   *
   * Every other approved mobile tool has a target of its own, and the layer sheet
   * `610:353` is the one that is left — so this names that sheet rather than
   * promising a menu of things which do not exist.
   */
  more: 'Lớp thiết kế',

  /** Why a toolbar control is off, for the customers a grey rectangle does not reach. */
  textUnavailable: 'Chọn một đối tượng chữ trên khung thiết kế để chỉnh sửa.',
  undoUnavailable: 'Chưa có thay đổi nào để hoàn tác.',
  redoUnavailable: 'Không có thay đổi nào để làm lại.',

  /** The gesture contract `610:242` prints beside the stage, as real text. */
  gestureHint: 'Chạm để chọn · Kéo để di chuyển · Chụm hai ngón để thu phóng khung',

  /** Closing any sheet. One word, one behaviour, at every sheet. */
  sheetClose: 'Đóng',

  transform: {
    /** `610:294`. */
    title: 'Chỉnh phần tử',
    open: 'Chỉnh phần tử',
    width: 'Rộng (mm)',
    height: 'Cao (mm)',
    rotation: 'Xoay (°)',
    decrease: (field: string) => `Giảm ${field}`,
    increase: (field: string) => `Tăng ${field}`,
    /** `610:294`'s own note, kept because it is a promise this build keeps. */
    targetNote: 'Vùng chạm tối thiểu 44 px cho mọi điều khiển.',
    /**
     * The measured value is unavailable.
     *
     * Never a zero and never a guess: a millimetre figure that is wrong is worse
     * than one that is absent, because a customer acts on it.
     */
    unavailable: 'Chưa đo được kích thước thật của đối tượng này.',
    /** No selection, or one that may not be transformed. States which. */
    noSelection: 'Chọn một đối tượng trên khung thiết kế để chỉnh.',
  },

  layers: {
    /** `610:353`. */
    title: 'Lớp',
    /** The reorder affordance the frame draws, and its instruction. */
    handleHint: 'Giữ và kéo tay cầm ⋮⋮ để đổi thứ tự.',
  },

  text_: {
    /** `610:409`. */
    title: 'Văn bản',
    /**
     * `610:409`'s keyboard note.
     *
     * It is a statement about behaviour, so it is only true if the build makes it
     * true: the sheet is lifted by the on-screen keyboard's real inset and the
     * stage above it reflows, rather than the keyboard covering the field.
     */
    keyboardNote: 'Bàn phím hệ thống đẩy sheet lên; khung thiết kế thu nhỏ chứ không bị che.',
  },

  image_: {
    /** `610:465`. */
    title: 'Ảnh của bạn',
    /** The one affordance: a native picker, which on a phone offers the camera. */
    choose: 'Chụp ảnh hoặc chọn từ thư viện',
    /**
     * What is accepted, taken from the accepted `APP3-B06B` contract rather than
     * from the frame.
     *
     * `610:465` illustrates "PNG hoặc JPG, tối đa 10 MB". The runtime contract is
     * PNG, JPEG **and WebP** at a 10 MiB streaming ceiling, and this sentence is
     * already derived from those two constants for the desktop panel. Reusing it
     * is the reconciliation: a mobile customer is told exactly what the server
     * will accept from them, and WebP is not quietly dropped from the product to
     * match an illustration.
     */
    formats: STUDIO_IMAGE_COPY.chooseHint,
    /** `610:465`'s privacy line. True: `APP3-B06C` scopes every read to the Session. */
    privacy: 'Ảnh của bạn là riêng tư — chỉ phiên làm việc này xem được.',
  },

  conflict: {
    /** `610:514`, projecting the `APP3-S10` decision onto a sheet. */
    title: 'Bản thiết kế đã đổi ở nơi khác',
    body: 'Phiên này được mở ở thiết bị khác và đã lưu bản mới hơn. Máy chủ không bị ghi đè.',
  },
} as const;
