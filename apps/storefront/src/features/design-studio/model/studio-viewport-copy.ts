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
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `viewport`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const viewportMessage = messageView(VI_MESSAGES.studio, 'viewport');

export const STUDIO_VIEWPORT_COPY = {
  toolbarLabel: viewportMessage.text('toolbarLabel'),

  zoomOut: viewportMessage.text('zoomOut'),
  zoomIn: viewportMessage.text('zoomIn'),
  /** Stated as text, not only as the size of things, so it is readable aloud. */
  zoomValue: (percent: number) => viewportMessage.text('zoomValue', { percent }),
  fit: viewportMessage.text('fit'),
  fitHint: viewportMessage.text('fitHint'),

  safeAreaShow: viewportMessage.text('safeAreaShow'),
  safeAreaHide: viewportMessage.text('safeAreaHide'),
  /**
   * The legend the approved Safe Area frame carries.
   *
   * It explains what the dashed rectangle means, which is the only thing that
   * makes hiding it a meaningful choice rather than a switch with no subject.
   */
  safeAreaLegend: viewportMessage.text('safeAreaLegend'),

  /**
   * The pan affordance, worded for what it actually does.
   *
   * Only shown above the fitted zoom, because at fit the whole canvas is
   * already visible and there is nowhere to pan to — the pan bounds collapse to
   * a single position. A hint offering a gesture that cannot move anything is
   * the same defect as a disabled button with no reason.
   */
  panHint: viewportMessage.text('panHint'),
} as const;
