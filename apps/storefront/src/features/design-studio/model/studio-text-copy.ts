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
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import { DESIGN_DOCUMENT_LIMITS, DESIGN_DOCUMENT_VALUE_RANGES } from '@embroidery/design-document';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `text`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const textMessage = messageView(VI_MESSAGES.studio, 'text');

export const STUDIO_TEXT_COPY = {
  panelLabel: textMessage.text('panelLabel'),

  // The three non-editable states. Each says *why*, because "the panel is empty"
  // and "this element is locked" are different facts to a customer.
  noSelection: textMessage.text('noSelection'),
  notText: textMessage.text('notText'),
  hiddenElement: textMessage.text('hiddenElement'),
  lockedElement: textMessage.text('lockedElement'),

  /*
   * There is no "this screen is too small" sentence any more.
   *
   * One stood here until `APP3-S11` shipped the approved mobile surface for this
   * capability. Keeping it would leave a false statement in the product for the
   * first person who renders it by mistake, so it was removed rather than left
   * unreferenced.
   */

  // The 1024 drawer (APP3-S05-C1, FIG-STUDIO-EDITING-TABLET-1024). The trigger
  // names the panel it opens rather than an icon, and the drawer carries the
  // same name, so the two are one thing to a screen reader.
  drawerOpen: textMessage.text('drawerOpen'),
  drawerClose: textMessage.text('drawerClose'),

  textLabel: textMessage.text('textLabel'),
  textHint: textMessage.text('textHint', {
    maxCharactersPerTextElement: DESIGN_DOCUMENT_LIMITS.maxCharactersPerTextElement,
  }),
  /** Code points remaining, counted exactly as `APP3-P01` counts them. */
  textRemaining: (remaining: number) => textMessage.text('textRemaining', { remaining }),

  fontLabel: textMessage.text('fontLabel'),
  fontHint: textMessage.text('fontHint'),
  styleLabel: textMessage.text('styleLabel'),
  styleNormal: textMessage.text('styleNormal'),
  styleItalic: textMessage.text('styleItalic'),
  weightLabel: textMessage.text('weightLabel'),
  sizeLabel: textMessage.text('sizeLabel'),
  alignLabel: textMessage.text('alignLabel'),
  alignLeft: textMessage.text('alignLeft'),
  alignCenter: textMessage.text('alignCenter'),
  alignRight: textMessage.text('alignRight'),

  // The controlled font's three honest states. "Ready" is deliberately silent:
  // a badge saying the font loaded is noise on every normal session.
  fontLoading: textMessage.text('fontLoading'),
  fontUnavailable: textMessage.text('fontUnavailable'),

  /**
   * One sentence per refusal, because they are different facts.
   *
   * None of them repairs anything: the working design stays exactly as it last
   * was, and the field keeps what the customer typed so they can correct it.
   */
  refusalTextTooLong: textMessage.text('refusalTextTooLong', {
    maxCharactersPerTextElement: DESIGN_DOCUMENT_LIMITS.maxCharactersPerTextElement,
  }),
  refusalDocumentTextLimit: textMessage.text('refusalDocumentTextLimit', {
    maxTotalTextCharacters: DESIGN_DOCUMENT_LIMITS.maxTotalTextCharacters,
  }),
  refusalInvalidText: textMessage.text('refusalInvalidText'),
  refusalUnknownFont: textMessage.text('refusalUnknownFont'),
  refusalUnsupportedVariant: textMessage.text('refusalUnsupportedVariant'),
  /**
   * The registry has the face and this browser could not load it. Deliberately
   * a different sentence from the one above: that face does not exist, this one
   * did not arrive, and only the second is worth trying again.
   */
  refusalControlledFontUnavailable: textMessage.text('refusalControlledFontUnavailable'),
  refusalInvalidValue: textMessage.text('refusalInvalidValue', {
    minFontSizePx: DESIGN_DOCUMENT_VALUE_RANGES.minFontSizePx,
    maxFontSizePx: DESIGN_DOCUMENT_VALUE_RANGES.maxFontSizePx,
    minFontWeight: DESIGN_DOCUMENT_VALUE_RANGES.minFontWeight,
    maxFontWeight: DESIGN_DOCUMENT_VALUE_RANGES.maxFontWeight,
  }),
  refusalOutsideArea: textMessage.text('refusalOutsideArea'),
  refusalTooLarge: textMessage.text('refusalTooLarge'),
  refusalUnreadable: textMessage.text('refusalUnreadable'),
} as const;
