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
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `layers`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const layersMessage = messageView(VI_MESSAGES.studio, 'layers');

export const STUDIO_LAYER_COPY = {
  /** `610:353` marks the top row in words rather than by position alone. */
  topmostBadge: layersMessage.text('topmostBadge'),
  panelLabel: layersMessage.text('panelLabel'),
  title: layersMessage.text('title'),
  /** Says which end of the list is the front, rather than leaving it to be inferred. */
  orderNote: layersMessage.text('orderNote'),

  empty: layersMessage.text('empty'),
  emptyHint: layersMessage.text('emptyHint'),

  select: (label: string) => layersMessage.text('select', { label }),

  moveUp: layersMessage.text('moveUp'),
  moveDown: layersMessage.text('moveDown'),
  moveUpFor: (label: string) => layersMessage.text('moveUpFor', { label }),
  moveDownFor: (label: string) => layersMessage.text('moveDownFor', { label }),

  hide: layersMessage.text('hide'),
  show: layersMessage.text('show'),
  hideFor: (label: string) => layersMessage.text('hideFor', { label }),
  showFor: (label: string) => layersMessage.text('showFor', { label }),

  lock: layersMessage.text('lock'),
  unlock: layersMessage.text('unlock'),
  lockFor: (label: string) => layersMessage.text('lockFor', { label }),
  unlockFor: (label: string) => layersMessage.text('unlockFor', { label }),

  /** State carried as text, so it is never colour-only. */
  hiddenFlag: layersMessage.text('hiddenFlag'),
  lockedFlag: layersMessage.text('lockedFlag'),

  /** Why a row cannot be restacked. Truthful, and about this row. */
  nestedReason: layersMessage.text('nestedReason'),
  topReason: layersMessage.text('topReason'),
  bottomReason: layersMessage.text('bottomReason'),

  // Announced through a polite live region, because a restack is a change a
  // customer who cannot see the stage would otherwise have no evidence of.
  movedUp: (label: string) => layersMessage.text('movedUp', { label }),
  movedDown: (label: string) => layersMessage.text('movedDown', { label }),
  moved: (label: string) => layersMessage.text('moved', { label }),
  hidden: (label: string) => layersMessage.text('hidden', { label }),
  shown: (label: string) => layersMessage.text('shown', { label }),
  locked: (label: string) => layersMessage.text('locked', { label }),
  unlocked: (label: string) => layersMessage.text('unlocked', { label }),
  refused: layersMessage.text('refused'),

  typeText: layersMessage.text('typeText'),
  typeImage: layersMessage.text('typeImage'),
  typeShape: layersMessage.text('typeShape'),
  typeFreehand: layersMessage.text('typeFreehand'),
  typeGroup: layersMessage.text('typeGroup'),

  /*
   * There is no "this screen is too small" sentence any more.
   *
   * One stood here until `APP3-S11` shipped the approved mobile surface for this
   * capability. Keeping it would leave a false statement in the product for the
   * first person who renders it by mistake, so it was removed rather than left
   * unreferenced.
   */
} as const;
