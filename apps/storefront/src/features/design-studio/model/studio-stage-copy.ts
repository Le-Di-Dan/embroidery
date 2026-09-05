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
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `stage`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const stageMessage = messageView(VI_MESSAGES.studio, 'stage');

export const STUDIO_STAGE_COPY = {
  stageLabel: stageMessage.text('stageLabel'),
  /** The stage's accessible description. Dimensions are the document's own. */
  canvasLabel: (widthPx: number, heightPx: number) =>
    stageMessage.text('canvasLabel', { widthPx, heightPx }),

  empty: stageMessage.text('empty'),
  emptyHint: stageMessage.text('emptyHint'),

  // Three separate refusals, because they are three different facts. None of
  // them shows the document, a path or an element id.
  unreadableDocument: stageMessage.text('unreadableDocument'),
  unresolvableGeometry: stageMessage.text('unresolvableGeometry'),
  uncontrolledFont: stageMessage.text('uncontrolledFont'),
  failureHint: stageMessage.text('failureHint'),

  backgroundLoading: stageMessage.text('backgroundLoading'),
  backgroundUnavailable: stageMessage.text('backgroundUnavailable'),
  backgroundFailed: stageMessage.text('backgroundFailed'),
  backgroundRetry: stageMessage.text('backgroundRetry'),

  areaLabel: stageMessage.text('areaLabel'),

  selectionNone: stageMessage.text('selectionNone'),
  selectionPrefix: stageMessage.text('selectionPrefix'),

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
  imagePlaceholder: stageMessage.text('imagePlaceholder'),
  imagePlaceholderHint: stageMessage.text('imagePlaceholderHint'),

  // Element names for the accessibility layer, used when the document carries
  // nothing better. A text element names itself with its own text.
  unnamedText: stageMessage.text('unnamedText'),
  typeImage: stageMessage.text('typeImage'),
  typeShape: stageMessage.text('typeShape'),
  typeFreehand: stageMessage.text('typeFreehand'),
} as const;
