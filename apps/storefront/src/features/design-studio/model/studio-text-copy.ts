/**
 * Every customer-visible string of the text inspector (`APP3-S05`).
 *
 * The rule the earlier Studio copy set still holds: a label is a promise, so
 * nothing here names a capability this checkpoint does not have. There is no
 * "thêm chữ" — `APP3-S05` edits the text a design already contains and cannot
 * create one — no "hoàn tác", no "đã lưu", no "lớp", no "màu chỉ".
 *
 * The second rule is about refusals. `APP3-P01` answers with a typed finding
 * carrying a JSON path and an English developer message; none of that is
 * customer copy. Each refusal below is a bounded Vietnamese sentence that states
 * the fact and nothing else — never the path, the raw message, the document, the
 * font file, the element id or the Session.
 */
import { DESIGN_DOCUMENT_LIMITS, DESIGN_DOCUMENT_VALUE_RANGES } from '@embroidery/design-document';

export const STUDIO_TEXT_COPY = {
  panelLabel: 'Thuộc tính chữ thêu',

  // The three non-editable states. Each says *why*, because "the panel is empty"
  // and "this element is locked" are different facts to a customer.
  noSelection: 'Chọn một đối tượng chữ trên khung thiết kế để chỉnh sửa.',
  notText: 'Đối tượng đang chọn không phải là chữ thêu.',
  hiddenElement: 'Đối tượng chữ này đang được ẩn nên chưa thể chỉnh sửa.',
  lockedElement: 'Đối tượng chữ này đang bị khoá nên chưa thể chỉnh sửa.',

  /**
   * The 390 state (`APP3-S05-C1`).
   *
   * It states the fact and promises nothing. Mobile text editing — the bottom
   * sheet and the touch surfaces around it — belongs to `APP3-S11`, and copy
   * saying it is "coming" would commit a checkpoint that has not been reviewed.
   */
  mobileUnavailable: 'Màn hình này chưa đủ rộng để chỉnh sửa chữ thêu.',

  // The 1024 drawer (APP3-S05-C1, FIG-STUDIO-EDITING-TABLET-1024). The trigger
  // names the panel it opens rather than an icon, and the drawer carries the
  // same name, so the two are one thing to a screen reader.
  drawerOpen: 'Mở bảng thuộc tính chữ',
  drawerClose: 'Đóng bảng thuộc tính chữ',

  textLabel: 'Nội dung chữ',
  textHint: `Tối đa ${String(DESIGN_DOCUMENT_LIMITS.maxCharactersPerTextElement)} ký tự.`,
  /** Code points remaining, counted exactly as `APP3-P01` counts them. */
  textRemaining: (remaining: number) => `Còn ${String(remaining)} ký tự.`,

  fontLabel: 'Phông chữ',
  fontHint: 'Chỉ dùng được các phông chữ đã được duyệt.',
  styleLabel: 'Kiểu chữ',
  styleNormal: 'Đứng',
  styleItalic: 'Nghiêng',
  weightLabel: 'Độ đậm',
  sizeLabel: 'Cỡ chữ (điểm ảnh)',
  alignLabel: 'Căn chữ',
  alignLeft: 'Căn trái',
  alignCenter: 'Căn giữa',
  alignRight: 'Căn phải',

  // The controlled font's three honest states. "Ready" is deliberately silent:
  // a badge saying the font loaded is noise on every normal session.
  fontLoading: 'Đang tải phông chữ…',
  fontUnavailable:
    'Chưa tải được phông chữ đã duyệt, nên chữ trên khung có thể hiển thị sai kiểu dáng.',

  /**
   * One sentence per refusal, because they are different facts.
   *
   * None of them repairs anything: the working design stays exactly as it last
   * was, and the field keeps what the customer typed so they can correct it.
   */
  refusalTextTooLong: `Nội dung chữ vượt quá ${String(DESIGN_DOCUMENT_LIMITS.maxCharactersPerTextElement)} ký tự cho một đối tượng.`,
  refusalDocumentTextLimit: `Tổng số ký tự của cả bản thiết kế vượt quá ${String(DESIGN_DOCUMENT_LIMITS.maxTotalTextCharacters)}.`,
  refusalInvalidText: 'Nội dung chữ này chưa hợp lệ nên chưa được áp dụng.',
  refusalUnknownFont: 'Phông chữ này không nằm trong danh sách được duyệt.',
  refusalUnsupportedVariant: 'Phông chữ này không có kiểu và độ đậm vừa chọn.',
  /**
   * The registry has the face and this browser could not load it. Deliberately
   * a different sentence from the one above: that face does not exist, this one
   * did not arrive, and only the second is worth trying again.
   */
  refusalControlledFontUnavailable:
    'Chưa tải được kiểu chữ vừa chọn nên thay đổi chưa được áp dụng. Bản thiết kế giữ nguyên kiểu chữ cũ.',
  refusalInvalidValue: `Giá trị chưa hợp lệ. Cỡ chữ nhận từ ${String(DESIGN_DOCUMENT_VALUE_RANGES.minFontSizePx)} đến ${String(DESIGN_DOCUMENT_VALUE_RANGES.maxFontSizePx)}, độ đậm từ ${String(DESIGN_DOCUMENT_VALUE_RANGES.minFontWeight)} đến ${String(DESIGN_DOCUMENT_VALUE_RANGES.maxFontWeight)}.`,
  refusalOutsideArea: 'Sau thay đổi này, đối tượng sẽ nằm ngoài vùng thêu cho phép.',
  refusalTooLarge: 'Sau thay đổi này, đối tượng vượt quá kích thước tối đa của vùng thêu.',
  refusalUnreadable: 'Chưa thể áp dụng thay đổi này cho đối tượng.',
} as const;
