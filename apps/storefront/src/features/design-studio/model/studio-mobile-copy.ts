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
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import { STUDIO_IMAGE_COPY } from './studio-image-copy';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `mobile`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const mobileMessage = messageView(VI_MESSAGES.studio, 'mobile');

export const STUDIO_MOBILE_COPY = {
  /** The bottom toolbar itself (`610:242`, `x=0 y=760 w=390 h=84`). */
  toolbarLabel: mobileMessage.text('toolbarLabel'),

  /**
   * The five targets, named.
   *
   * `T` is the **text** tool and never an "add text" tool: `APP3-S05` is
   * `EDIT_ONLY_NO_CREATION`, so this opens the sheet for the text element the
   * customer has selected and says so when there is none.
   */
  text: mobileMessage.text('text'),
  image: mobileMessage.text('image'),
  undo: mobileMessage.text('undo'),
  redo: mobileMessage.text('redo'),
  /**
   * The `⋯` target.
   *
   * Every other approved mobile tool has a target of its own, and the layer sheet
   * `610:353` is the one that is left — so this names that sheet rather than
   * promising a menu of things which do not exist.
   */
  more: mobileMessage.text('more'),

  /** Why a toolbar control is off, for the customers a grey rectangle does not reach. */
  textUnavailable: mobileMessage.text('textUnavailable'),
  undoUnavailable: mobileMessage.text('undoUnavailable'),
  redoUnavailable: mobileMessage.text('redoUnavailable'),

  /** The gesture contract `610:242` prints beside the stage, as real text. */
  gestureHint: mobileMessage.text('gestureHint'),

  /** Closing any sheet. One word, one behaviour, at every sheet. */
  sheetClose: mobileMessage.text('sheetClose'),

  transform: {
    /** `610:294`. */
    title: mobileMessage.text('transform.title'),
    open: mobileMessage.text('transform.open'),
    width: mobileMessage.text('transform.width'),
    height: mobileMessage.text('transform.height'),
    rotation: mobileMessage.text('transform.rotation'),
    decrease: (field: string) => mobileMessage.text('transform.decrease', { field }),
    increase: (field: string) => mobileMessage.text('transform.increase', { field }),
    /** `610:294`'s own note, kept because it is a promise this build keeps. */
    targetNote: mobileMessage.text('transform.targetNote'),
    /**
     * The measured value is unavailable.
     *
     * Never a zero and never a guess: a millimetre figure that is wrong is worse
     * than one that is absent, because a customer acts on it.
     */
    unavailable: mobileMessage.text('transform.unavailable'),
    /** No selection, or one that may not be transformed. States which. */
    noSelection: mobileMessage.text('transform.noSelection'),
  },

  layers: {
    /** `610:353`. */
    title: mobileMessage.text('layers.title'),
    /** The reorder affordance the frame draws, and its instruction. */
    handleHint: mobileMessage.text('layers.handleHint'),
  },

  text_: {
    /** `610:409`. */
    title: mobileMessage.text('text_.title'),
    /**
     * `610:409`'s keyboard note.
     *
     * It is a statement about behaviour, so it is only true if the build makes it
     * true: the sheet is lifted by the on-screen keyboard's real inset and the
     * stage above it reflows, rather than the keyboard covering the field.
     */
    keyboardNote: mobileMessage.text('text_.keyboardNote'),
  },

  image_: {
    /** `610:465`. */
    title: mobileMessage.text('image_.title'),
    /** The one affordance: a native picker, which on a phone offers the camera. */
    choose: mobileMessage.text('image_.choose'),
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
    privacy: mobileMessage.text('image_.privacy'),
  },

  conflict: {
    /** `610:514`, projecting the `APP3-S10` decision onto a sheet. */
    title: mobileMessage.text('conflict.title'),
    body: mobileMessage.text('conflict.body'),
  },
} as const;
