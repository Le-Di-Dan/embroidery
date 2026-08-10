/**
 * Every customer-visible string of the transform controls (`APP3-S03`).
 *
 * The rule `APP3-S02` set still holds — a label is a promise — but it now cuts
 * the other way for three verbs. Move, resize and rotate have shipped, so they
 * may be named; nothing here says "hoàn tác", "đã lưu", "khoá" or "lớp", because
 * `APP3-S08`, `S10` and `S04` own those and a control that names one it does not
 * have is worse than no control.
 *
 * A handle's name says which corner or edge it grabs. "Handle 3 of 8" tells a
 * screen-reader user nothing about where the element will grow.
 */
import type { ResizeHandleId } from './studio-transform-handles';

const HANDLE_NAMES: Readonly<Record<ResizeHandleId, string>> = Object.freeze({
  nw: 'góc trên bên trái',
  n: 'cạnh trên',
  ne: 'góc trên bên phải',
  e: 'cạnh phải',
  se: 'góc dưới bên phải',
  s: 'cạnh dưới',
  sw: 'góc dưới bên trái',
  w: 'cạnh trái',
});

export const STUDIO_TRANSFORM_COPY = {
  overlayLabel: 'Điều khiển biến đổi đối tượng',

  move: 'Kéo để di chuyển đối tượng',
  resize: (handle: ResizeHandleId) => `Đổi kích thước từ ${HANDLE_NAMES[handle]}`,
  rotate: 'Xoay đối tượng',

  /**
   * The live physical read-out.
   *
   * Millimetres, always — the only conversion authority is the Product Side's
   * `pxPerMm` (`IMP-D045` PO-10), so this number does not change when the
   * customer zooms. It is the size the piece will actually be stitched at.
   */
  physicalSize: (widthMm: number, heightMm: number) =>
    `Rộng ${format(widthMm)} mm · Cao ${format(heightMm)} mm`,
  physicalSizeUnavailable: 'Chưa tính được kích thước thật của đối tượng này.',

  // Three refusals, because they are three different facts, and none of them
  // repairs anything: the element stays where it legally was.
  outsideArea: 'Không thể đặt đối tượng ra ngoài vùng thêu cho phép.',
  tooLarge: 'Đối tượng vượt quá kích thước tối đa của vùng thêu.',
  unreadable: 'Chưa thể áp dụng thay đổi này cho đối tượng.',

  lockedElement: 'Đối tượng này đang bị khoá nên chưa thể chỉnh sửa.',
} as const;

/** One decimal is the useful precision for a stitched millimetre. */
function format(millimetres: number): string {
  return (Math.round(millimetres * 10) / 10).toLocaleString('vi-VN');
}
