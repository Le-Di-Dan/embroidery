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

export const READY_MADE_PURCHASE_COPY = {
  /** The panel's accessible name. It is a region inside the Product article. */
  panelLabel: 'Mua sản phẩm có sẵn',

  /** Price block (`904:41`). */
  priceCaption: 'Chưa gồm phí giao hàng.',
  /** Replaces the caption when nothing on this Product can be bought (`906:146`). */
  priceCaptionOutOfStock: 'Hiện chưa có phân loại nào còn hàng.',

  /** The two option axes (`904:45`, `904:54`). */
  variantLegend: 'Phân loại',
  sizeLegend: 'Kích thước',
  /** The suffix on an option whose SKU is published with zero availability (`904:64`). */
  optionSoldOut: '· hết',

  /** Bound to the fieldset that is still unresolved (`906:229`). */
  variantRequired: 'Vui lòng chọn phân loại.',
  sizeRequired: 'Vui lòng chọn kích thước.',

  /** Quantity (`904:67`, `904:69`–`904:73`). */
  quantityLabel: 'Số lượng',
  quantityDecrease: 'Giảm số lượng',
  quantityIncrease: 'Tăng số lượng',

  /** The continue call to action (`904:79`, `906:143` disabled variant). */
  continue: 'Mua ngay',
  continueOutOfStock: 'Tạm hết hàng',

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
  unavailableHeading: 'Chưa thể tải thông tin mua hàng',
  unavailableBody: 'Vui lòng thử lại sau.',
} as const;

/**
 * The availability line beneath the stepper (`904:78`).
 *
 * The server's exact count, stated plainly. `APP12-S01` §15 forbids inventing
 * scarcity marketing, and this is the wording the approved frame carries — a
 * quantity, not an urgency.
 */
export function availabilityLabel(availableQuantity: number): string {
  return `Còn ${String(availableQuantity)} sản phẩm`;
}
