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
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import type { ResizeHandleId } from './studio-transform-handles';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `transform`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const transformMessage = messageView(VI_MESSAGES.studio, 'transform');

const HANDLE_NAMES: Readonly<Record<ResizeHandleId, string>> = Object.freeze({
  nw: transformMessage.text('handleNames.nw'),
  n: transformMessage.text('handleNames.n'),
  ne: transformMessage.text('handleNames.ne'),
  e: transformMessage.text('handleNames.e'),
  se: transformMessage.text('handleNames.se'),
  s: transformMessage.text('handleNames.s'),
  sw: transformMessage.text('handleNames.sw'),
  w: transformMessage.text('handleNames.w'),
});

export const STUDIO_TRANSFORM_COPY = {
  overlayLabel: transformMessage.text('overlayLabel'),

  move: transformMessage.text('move'),
  resize: (handle: ResizeHandleId) =>
    transformMessage.text('resize', { handle: HANDLE_NAMES[handle] }),
  rotate: transformMessage.text('rotate'),

  /**
   * The live physical read-out.
   *
   * Millimetres, always — the only conversion authority is the Product Side's
   * `pxPerMm` (`IMP-D045` PO-10), so this number does not change when the
   * customer zooms. It is the size the piece will actually be stitched at.
   */
  physicalSize: (widthMm: number, heightMm: number) =>
    transformMessage.text('physicalSize', { width: format(widthMm), height: format(heightMm) }),
  physicalSizeUnavailable: transformMessage.text('physicalSizeUnavailable'),

  // Three refusals, because they are three different facts, and none of them
  // repairs anything: the element stays where it legally was.
  outsideArea: transformMessage.text('outsideArea'),
  tooLarge: transformMessage.text('tooLarge'),
  unreadable: transformMessage.text('unreadable'),

  lockedElement: transformMessage.text('lockedElement'),
} as const;

/** One decimal is the useful precision for a stitched millimetre. */
function format(millimetres: number): string {
  return (Math.round(millimetres * 10) / 10).toLocaleString('vi-VN');
}
