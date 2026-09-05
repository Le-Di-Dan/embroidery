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
 *
 * **The blank-start row is not a new string.** `APP3-S08-C1` §5 says to reuse an
 * already accepted blank-start label where one exists, and `APP3-S01` has one —
 * so the baseline row references it rather than inventing a second sentence that
 * could later disagree with the button the customer pressed to get here.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import { STUDIO_COPY } from './studio-copy';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `history`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const historyMessage = messageView(VI_MESSAGES.studio, 'history');

export const STUDIO_HISTORY_COPY = {
  panelLabel: historyMessage.text('panelLabel'),
  /** Exactly the heading `609:147` and `609:209` draw. */
  title: historyMessage.text('title'),

  undo: historyMessage.text('undo'),
  redo: historyMessage.text('redo'),
  /** Why the control is off, so a disabled button is never silent. */
  undoUnavailable: historyMessage.text('undoUnavailable'),
  redoUnavailable: historyMessage.text('redoUnavailable'),

  /**
   * The keyboard hints, exactly as the approved frames write them.
   *
   * A separate informational block below the history panel — `609:147` places it
   * at its own y, not inside the panel — and readable text rather than drawn
   * glyphs, so it can be announced instead of only seen. Limited to the two
   * combinations this checkpoint actually binds.
   */
  shortcutHeading: historyMessage.text('shortcutHeading'),
  shortcutUndo: historyMessage.text('shortcutUndo'),
  shortcutRedo: historyMessage.text('shortcutRedo'),
  shortcutSeparator: historyMessage.text('shortcutSeparator'),
  /**
   * Where undo lives on a phone.
   *
   * The approved desktop note delegates the mobile controls to `APP3-S11` in
   * these words. It is a desktop string: 390 renders no history surface at all,
   * so this sentence is never the thing a phone is shown instead of one.
   */
  mobileDelegation: historyMessage.text('mobileDelegation'),

  listLabel: historyMessage.text('listLabel'),
  /** The marker exactly one projected row carries. */
  currentBadge: historyMessage.text('currentBadge'),

  /**
   * Where the design started, as `609:209` presents it.
   *
   * A presentation row, never an entry. The clone sentence is the frame's own,
   * with the Template's real display name in place of the frame's example; the
   * blank sentence is `APP3-S01`'s already-accepted blank-start label rather
   * than a second way of saying the same thing.
   */
  baselineClone: (name: string) => historyMessage.text('baselineClone', { name }),
  baselineBlank: STUDIO_COPY.startBlank,
  /**
   * `BASELINE_GENERIC_COPY = PRESENTATION_FALLBACK_FOR_RUNTIME_WITHOUT_DISPLAY_NAME`.
   *
   * A resumed clone: the Session snapshot's lineage carries a slug and a version
   * and no display name, and neither may be rendered as though it were one. This
   * says only that the design was opened from a Template, which is true and
   * exposes no technical identity — no slug, no version, no id.
   */
  baselineGeneric: historyMessage.text('baselineGeneric'),

  /**
   * The bound, stated honestly, in the frame's own words.
   *
   * `APP3-D01`'s directive forbids implying an unlimited history, and the only
   * way to not imply it is to say what the limit is. The number is interpolated
   * from `MAX_HISTORY_ENTRIES` rather than written out, so the sentence cannot
   * drift from the limit it describes.
   */
  boundNote: (limit: number) => historyMessage.text('boundNote', { limit }),

  // One sentence per action kind. A layer's own name is quoted where the action
  // was about one layer, and left out where it was not.
  actionMove: (label: string) => historyMessage.text('actionMove', { label }),
  actionResize: (label: string) => historyMessage.text('actionResize', { label }),
  actionRotate: (label: string) => historyMessage.text('actionRotate', { label }),
  actionReorder: (label: string) => historyMessage.text('actionReorder', { label }),
  actionLock: (label: string) => historyMessage.text('actionLock', { label }),
  actionUnlock: (label: string) => historyMessage.text('actionUnlock', { label }),
  actionHide: (label: string) => historyMessage.text('actionHide', { label }),
  actionShow: (label: string) => historyMessage.text('actionShow', { label }),
  actionTextEdit: (label: string) => historyMessage.text('actionTextEdit', { label }),
  actionTextFormat: (label: string) => historyMessage.text('actionTextFormat', { label }),
  actionImagePlace: historyMessage.text('actionImagePlace'),
  actionImageReplace: (label: string) => historyMessage.text('actionImageReplace', { label }),
  /** The fallback when the action was not about one named layer. */
  actionFallback: historyMessage.text('actionFallback'),

  // Announced through a polite live region, because an undo changes the stage
  // and a customer who cannot see it would otherwise have no evidence of it.
  undone: (label: string) => historyMessage.text('undone', { label }),
  redone: (label: string) => historyMessage.text('redone', { label }),

  /*
   * There is no "this screen is too small" sentence any more.
   *
   * One stood here until `APP3-S11` shipped the approved mobile surface for this
   * capability. Keeping it would leave a false statement in the product for the
   * first person who renders it by mistake, so it was removed rather than left
   * unreferenced.
   */
} as const;
