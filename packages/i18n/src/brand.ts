import { VI_MESSAGES } from './messages';
import { messageView } from './message-view';

/**
 * The store's name and descriptor, as text.
 *
 * ## Why this lives in the message repository and not in `@embroidery/ui`
 *
 * `Nét Thêu` is human-facing static text that the Storefront paints in its
 * header, the Admin paints on its login screen, and both publish in page
 * metadata. `APP12-V02` moved every other such string into
 * `packages/i18n/messages/vi/*.json`; this one stayed behind in
 * `@embroidery/ui` as a `BRAND_NAME` constant, which meant the repository had a
 * copy authority for all human-facing text *except* the one word every surface
 * shows. `APP12-V02-C1` §2 closes that: the name is now a message like any
 * other, at `common.brand.name`.
 *
 * ## The split this preserves
 *
 * The *symbol* is untouched. `@embroidery/ui` remains the single canonical
 * source for the approved `BRD0-F02` vector paths, stroke weights, tones and
 * application sizes, and nothing here reads or restates a coordinate. What moved
 * is the four characters of live text beside the mark — which the lockup already
 * rendered as text rather than as exported artwork, precisely because it is
 * copy.
 *
 * ## Not a second literal
 *
 * These constants resolve the JSON value; they do not own one. There is no
 * string `'Nét Thêu'` anywhere in this file, and the static-text gate would
 * report it if there were. The accessor exists only so a call site keeps a typed
 * import rather than repeating a key path, and so a missing key fails at module
 * load in development rather than painting an empty header.
 */
const brandMessage = messageView(VI_MESSAGES.common, 'brand');

/** The store's name, rendered as live text in each application's own typography. */
export const BRAND_NAME = brandMessage.text('name');

/**
 * The approved descriptor. Distinct from the brand name and not interchangeable
 * with it: a surface may legitimately say "xưởng thêu" as a common noun.
 */
export const BRAND_DESCRIPTOR = brandMessage.text('descriptor');
