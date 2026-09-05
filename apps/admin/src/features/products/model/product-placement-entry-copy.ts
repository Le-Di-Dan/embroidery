/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`), not in this file
 * (`APP12-V02` §5A).
 */
const productPlacementEntryMessage = messageView(VI_MESSAGES.admin, 'productPlacementEntry');
/**
 * The label on the product detail screen's placement affordance (`APP3-A01`).
 *
 * Lives in the products feature because that is the screen that renders it. The
 * placement feature owns its own copy catalog; duplicating this one string
 * there would create two spellings of the same tab, and importing the placement
 * catalog here would make the products feature depend on it purely for a label.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
export const PLACEMENT_ENTRY_LABEL = productPlacementEntryMessage.text('placementEntryLabel');
