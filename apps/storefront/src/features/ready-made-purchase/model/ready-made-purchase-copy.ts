/**
 * Every user-facing string of the Ready-Made purchase panel (`APP12-S01`).
 *
 * One module, for the reason `PRODUCT_DETAIL_COPY` gives: copy is business
 * content approved as a whole, not component detail. Every string below is
 * transcribed from the approved `APP12-D01` frames —
 * `FIG-APP12-S01-PURCHASE-DESKTOP` (`902:4` / panel `904:40`), `-TABLET`
 * (`905:67` / `905:89`), `-MOBILE` (`905:187` / `905:209`), `-OUT-OF-STOCK`
 * (`906:140` / `906:143`) and `-SELECTION-INCOMPLETE` (`906:186` / `906:189`) —
 * and nothing here was written from a backend field name (`APP12-S01` §5).
 *
 * Nothing describes a fact the `publicProductVariant_list` contract does not
 * carry. In particular there is no restock promise, no delivery estimate and no
 * scarcity wording: the availability line states the exact count the server
 * published (`904:78`) and says nothing about how long it will last.
 */

import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/storefront.json`, under `purchase`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const purchaseMessage = messageView(VI_MESSAGES.storefront, 'purchase');

export const READY_MADE_PURCHASE_COPY = {
  /** The panel's accessible name. It is a region inside the Product article. */
  panelLabel: purchaseMessage.text('panelLabel'),

  /** Price block (`904:41`). */
  priceCaption: purchaseMessage.text('priceCaption'),
  /** Replaces the caption when nothing on this Product can be bought (`906:146`). */
  priceCaptionOutOfStock: purchaseMessage.text('priceCaptionOutOfStock'),

  /** The two option axes (`904:45`, `904:54`). */
  variantLegend: purchaseMessage.text('variantLegend'),
  sizeLegend: purchaseMessage.text('sizeLegend'),
  /** The suffix on an option whose SKU is published with zero availability (`904:64`). */
  optionSoldOut: purchaseMessage.text('optionSoldOut'),

  /** Bound to the fieldset that is still unresolved (`906:229`). */
  variantRequired: purchaseMessage.text('variantRequired'),
  sizeRequired: purchaseMessage.text('sizeRequired'),

  /** Quantity (`904:67`, `904:69`–`904:73`). */
  quantityLabel: purchaseMessage.text('quantityLabel'),
  quantityDecrease: purchaseMessage.text('quantityDecrease'),
  quantityIncrease: purchaseMessage.text('quantityIncrease'),

  /** The continue call to action (`904:79`, `906:143` disabled variant). */
  continue: purchaseMessage.text('continue'),
  continueOutOfStock: purchaseMessage.text('continueOutOfStock'),

  /**
   * The degraded state.
   *
   * `APP12-D01` draws no frame for a purchase projection that could not be
   * read, and `APP12-S01` §24 forbids answering one with stock copy — a backend
   * failure is not zero stock, and `Tạm hết hàng` would be a claim about
   * inventory this process never received. Rather than invent a visual system,
   * the panel states the failure in the delivered Product Detail error voice
   * (`PRODUCT_DETAIL_COPY.errorBody`, `537:38`), which is the reuse `APP12-S01`
   * §4 asks for. Recorded as `FU-APP12-S01-01` for `APP12-D01` to draw.
   */
  unavailableHeading: purchaseMessage.text('unavailableHeading'),
  unavailableBody: purchaseMessage.text('unavailableBody'),

  /**
   * What is still needed before the purchase action can be pressed
   * (`V01-UX-025`, `APP12-V02` §13.4).
   *
   * The panel used to open on a multi-variant product with a dead grey slab and
   * no explanation: the fieldset errors appear only once the customer has
   * *started* choosing, so a visitor who had just arrived saw the page's largest
   * element disabled and was told nothing. This says what is missing from the
   * moment the panel renders, and it names the axis rather than the control.
   */
  selectVariantPrompt: purchaseMessage.text('selectVariantPrompt'),
  selectSizePrompt: purchaseMessage.text('selectSizePrompt'),
  selectOptionsPrompt: purchaseMessage.text('selectOptionsPrompt'),
} as const;

/**
 * The availability line beneath the stepper (`904:78`).
 *
 * The server's exact count, stated plainly. `APP12-S01` §15 forbids inventing
 * scarcity marketing, and this is the wording the approved frame carries — a
 * quantity, not an urgency.
 */
export function availabilityLabel(availableQuantity: number): string {
  return purchaseMessage.text('availabilityLabel', { available: availableQuantity });
}
