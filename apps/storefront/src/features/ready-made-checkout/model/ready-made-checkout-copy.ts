/**
 * Every user-facing string on `/mua-hang/[slug]` (`APP12-S02` §5).
 *
 * Transcribed from the approved `APP12-D01` checkout frames in file
 * `BQwqV8GdfUIELvsQDB1UQE`, page `APP_12` —
 * `FIG-APP12-S02-CHECKOUT-DESKTOP` (`907:142`), `-TABLET` (`907:252`),
 * `-MOBILE` (`907:5738`), `-VALIDATION` (`909:256`), `-SUBMIT-PENDING`
 * (`909:266`) and `-REFUSAL` (`909:274`) — with the node id beside each entry so
 * a copy change is traceable to the design that authorized it. Nothing here was
 * written from a DTO field name, an enum member or a backend message
 * (`APP12-S02` §6, `CLAUDE.md` §5).
 *
 * ## Three places this module departs from the frames, and why
 *
 * Each is a **design ↔ contract** reconciliation, recorded rather than resolved
 * by inventing UX or by widening an API this checkpoint may not touch
 * (`APP12-S02` §41).
 *
 * 1. **`province` has no drawn label.** `CreateReadyMadeOrderBody.delivery`
 *    requires `province`; the frames draw one free-form `Địa chỉ nhận hàng`
 *    whose placeholder happens to end in a province. An order cannot be created
 *    without the field, and splitting a free-form address into administrative
 *    parts in the browser would fabricate a fact the customer never stated. So
 *    the field is rendered, in the same drawn field pattern, under the label the
 *    repository **already ships** for this exact column — `Tỉnh/Thành`, from the
 *    delivered Admin shipping workspace — rather than under a label invented
 *    here. `ward` and `district` are contract-optional and are *not* added: the
 *    approved address field is where the customer writes them, exactly as the
 *    drawn placeholder does. → `FU-APP12-S02-01`.
 *
 * 2. **`Ghi chú cho xưởng` is drawn and has no carrier.** The contract has no
 *    note field anywhere on Ready-Made order creation, so the input would
 *    collect a sentence and silently drop it. `APP12-S02` §18 allows a field
 *    only when it is approved *and* contracted, so it is omitted rather than
 *    rendered inert. → `FU-APP12-S02-02`.
 *
 * 3. **There is no drawn success frame.** `APP12-D01` draws the checkout, its
 *    validation, its pending state and its refusal, and then continues at
 *    `/truy-cap/don-hang` — which `APP12-S02` §25 forbids navigating to, because
 *    this route never holds the `ORDER_ACCESS` token. The confirmation is
 *    therefore composed from the delivered `APP5-S02` confirmation surface
 *    (`660:11` … `660:20`), which states exactly the same three facts about a
 *    just-created record and a secure link sent to a verified contact, in the
 *    checkout's own card language. → `FU-APP12-S02-03`.
 *
 * ## What no string here says
 *
 * No shipping fee, no total, no "đã thanh toán", no delivery estimate, no
 * carrier, no tracking, and no internal vocabulary — `FULL`, `ORDER_ACCESS`,
 * `AWAITING_SHIPPING_FEE`, `reservation` and `SKU` appear nowhere a customer can
 * read (`APP12-D01` §M).
 */

export const READY_MADE_CHECKOUT_COPY = {
  /** `907:168` / `907:5741` — the page heading, and the document title stem. */
  pageTitle: 'Xác nhận đơn hàng',

  /** `907:172` … `907:181` — the contact card. */
  contact: {
    /** `907:173`. */
    heading: 'Liên hệ',
    /** `907:178` — why the workshop asks for it. */
    hint: 'Xưởng dùng thông tin này để gửi liên kết theo dõi đơn hàng.',
    /** `907:180` / `907:181` — the verified affordance. The mark is decorative. */
    verifiedMark: '✓',
    verified: 'Đã xác minh',
    /**
     * Leaving a verified contact behind.
     *
     * Not drawn: the frames show the settled verified state and never the way
     * out of it. `APP12-S02` §16 requires that changing the contact invalidate
     * the verification, and a customer who verified the wrong address needs a
     * stated action rather than a reload — so the control names the change it
     * performs, in the delivered `APP4` restart voice. → `FU-APP12-S02-03`.
     */
    change: 'Đổi liên hệ',
    changeNotice: 'Đổi liên hệ sẽ cần xác minh lại trước khi đặt hàng.',
  },

  /** `907:182` … `907:195` — the delivery card. */
  delivery: {
    /** `907:183` / `909:260`. */
    heading: 'Giao hàng',
    /** `907:185`. */
    recipientNameLabel: 'Người nhận',
    /** `907:189`. */
    recipientPhoneLabel: 'Số điện thoại người nhận',
    /** `907:193`. */
    addressLineLabel: 'Địa chỉ nhận hàng',
    /**
     * The contracted administrative field the frames do not draw — see the
     * module note. The label is the delivered one from
     * `apps/admin/.../fulfillment-copy.ts`, not a new coinage.
     */
    provinceLabel: 'Tỉnh/Thành',
  },

  /**
   * `909:257` / `909:265` — field-bound validation.
   *
   * `909:258` states the rule this implements: errors are bound to their field
   * through `aria-describedby`, never announced as a toast, and the button stays
   * pressable so the errors get published at all.
   */
  validation: {
    /** `909:265`, the one message the frame spells out. */
    recipientNameRequired: 'Vui lòng nhập tên người nhận.',
    /**
     * The remaining three, in the same drawn sentence shape: `Vui lòng nhập` +
     * the field's own drawn label, lower-cased as the drawn example is. They are
     * a transcription of one approved pattern applied to the fields it was drawn
     * for, not four new sentences.
     */
    recipientPhoneRequired: 'Vui lòng nhập số điện thoại người nhận.',
    addressLineRequired: 'Vui lòng nhập địa chỉ nhận hàng.',
    provinceRequired: 'Vui lòng nhập tỉnh/thành.',
    /** Bound to the contact card when no verified contact backs the order yet. */
    contactUnverified: 'Vui lòng xác minh liên hệ trước khi đặt hàng.',
  },

  /** `907:200` … `907:207` — the item snapshot. */
  item: {
    /** `907:201`. */
    heading: 'Sản phẩm',
    /** `907:206` — `Trắng · M · SL 1`; the quantity prefix is drawn. */
    quantityPrefix: 'SL',
    separator: '·',
  },

  /** `907:208` … `907:225` — the summary card. */
  summary: {
    /** `907:209`. */
    heading: 'Tạm tính',
    /** `907:211`. */
    merchandiseLabel: 'Tiền hàng',
    /** `907:215`. */
    shippingLabel: 'Phí giao hàng',
    /** `907:217` — never a number, and never a zero (`BR-027`). */
    shippingPending: 'Xưởng xác nhận sau',
    /** `907:220`. */
    totalLabel: 'Tổng thanh toán',
    /** `907:222` — the total does not exist until an operator sets the fee. */
    totalPending: 'Có sau khi xác nhận phí',
    /** `907:224` — the one supporting block `APP12-D01` §M allows here. */
    notice:
      'Xưởng xác nhận phí giao hàng rồi gửi bạn liên kết thanh toán. ' +
      'Không có tổng tiền nào được hiển thị trước bước đó.',
    /** `907:225` — the primary action. */
    submit: 'Đặt hàng',
    /** `909:271` — the pending variant of the same button. */
    submitPending: 'Đang gửi…',
    /** `909:273`. */
    submitPendingNotice: 'Vui lòng không đóng trang.',
  },

  /** `909:274` … `909:281` — creation refused. */
  refusal: {
    /** `909:279`; the mark is decorative and the title carries the meaning. */
    mark: '✕',
    /** `909:281` — back to the product, never a silent retry (`909:276`). */
    back: 'Quay lại sản phẩm',
  },

  /**
   * The invalid-selection state (`APP12-S02` §10, §11).
   *
   * `APP12-D01` draws no frame for a checkout reached without a resolvable
   * selection, and §10 forbids choosing one. It is rendered in the drawn refusal
   * card (`909:277`) because that is what the state is — this address cannot
   * name something to buy — and it offers the same drawn return path.
   * → `FU-APP12-S02-03`.
   */
  invalidSelection: {
    title: 'Chưa xác định được sản phẩm cần mua',
    body: 'Lựa chọn của bạn không còn hợp lệ. Vui lòng chọn lại trên trang sản phẩm.',
  },

  /**
   * The confirmation, composed from the delivered `APP5-S02` surface — see the
   * module note. Three facts and nothing else: the order exists, the fee is
   * still pending, and the link is on its way to the verified contact.
   */
  success: {
    /** `660:9` — decorative, as it is there. */
    mark: '✓',
    /** The `660:11` shape, said about an order rather than a request. */
    title: 'Đã tạo đơn hàng của bạn',
    /** `660:12` — the quotable, non-credential reference (`ReadyMadeOrderCreatedResponse.orderCode`). */
    orderCodeLabel: 'Mã đơn hàng',
    /** `660:14`, restated for an order: the code talks, the link opens. */
    orderCodeNote:
      'Mã này chỉ để bạn và xưởng nói chuyện về đơn hàng. ' +
      'Nó không mở được đơn hàng — chỉ liên kết trong tin nhắn mới mở được.',
    /** `660:18`, with the masked contact removed: this screen holds no mask. */
    secureLinkTitle: 'Chúng tôi đã gửi liên kết theo dõi tới liên hệ bạn đã xác minh',
    secureLinkBody:
      'Mở liên kết đó để xem đơn hàng và thanh toán khi xưởng đã xác nhận phí giao hàng.',
    /** `660:21` — the same fallback advice, same voice. */
    secureLinkFallback:
      'Chưa thấy tin nhắn sau vài phút? Kiểm tra thư rác, hoặc liên hệ xưởng kèm mã đơn hàng ở trên.',
    /** The `907:224` rule, restated once the order exists. */
    shippingPendingNotice:
      'Xưởng sẽ xác nhận phí giao hàng và gửi liên kết thanh toán. Chưa cần thanh toán lúc này.',
    /** `ReadyMadeOrderCreatedResponse.merchandiseSubtotal` — the frozen figure. */
    merchandiseLabel: 'Tiền hàng đã chốt',
    /** `ReadyMadeOrderCreatedResponse.reservationExpiresAt`, read and never computed. */
    reservationLabel: 'Xưởng giữ hàng đến',
    /** Back to browsing; the secure surface is reached from the message only. */
    continue: 'Tiếp tục xem sản phẩm',
  },
} as const;

/** `907:206` — `Trắng · M · SL 1`, built from what the projection published. */
export function itemVariantLine(labels: readonly (string | null)[], quantity: number): string {
  const { item } = READY_MADE_CHECKOUT_COPY;
  const parts = labels.filter((label): label is string => label !== null && label !== '');
  parts.push(`${item.quantityPrefix} ${String(quantity)}`);
  return parts.join(` ${item.separator} `);
}
