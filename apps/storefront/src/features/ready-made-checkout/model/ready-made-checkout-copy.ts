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

import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/checkout.json`, under `readyMade`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const readyMadeMessage = messageView(VI_MESSAGES.checkout, 'readyMade');

export const READY_MADE_CHECKOUT_COPY = {
  /** `907:168` / `907:5741` — the page heading, and the document title stem. */
  pageTitle: readyMadeMessage.text('pageTitle'),

  /** `907:172` … `907:181` — the contact card. */
  contact: {
    /** `907:173`. */
    heading: readyMadeMessage.text('contact.heading'),
    /** `907:178` — why the workshop asks for it. */
    hint: readyMadeMessage.text('contact.hint'),
    /** `907:180` / `907:181` — the verified affordance. The mark is decorative. */
    verifiedMark: readyMadeMessage.text('contact.verifiedMark'),
    verified: readyMadeMessage.text('contact.verified'),
    /**
     * Leaving a verified contact behind.
     *
     * Not drawn: the frames show the settled verified state and never the way
     * out of it. `APP12-S02` §16 requires that changing the contact invalidate
     * the verification, and a customer who verified the wrong address needs a
     * stated action rather than a reload — so the control names the change it
     * performs, in the delivered `APP4` restart voice. → `FU-APP12-S02-03`.
     */
    change: readyMadeMessage.text('contact.change'),
    changeNotice: readyMadeMessage.text('contact.changeNotice'),
  },

  /** `907:182` … `907:195` — the delivery card. */
  delivery: {
    /** `907:183` / `909:260`. */
    heading: readyMadeMessage.text('delivery.heading'),
    /**
     * One sentence, not four asterisks (`V01-UX-028`, `APP12-V02` §32).
     *
     * Every field on this card is required, so a per-field marker on all four
     * would be noise — `checkout-field.tsx` records that reasoning and `H08`
     * closed the accessibility half with `aria-required`. What was missing is
     * that the customer had no way to know before submitting.
     */
    allRequired: readyMadeMessage.text('delivery.allRequired'),
    /** `907:185`. */
    recipientNameLabel: readyMadeMessage.text('delivery.recipientNameLabel'),
    /** `907:189`. */
    recipientPhoneLabel: readyMadeMessage.text('delivery.recipientPhoneLabel'),
    /** `907:193`. */
    addressLineLabel: readyMadeMessage.text('delivery.addressLineLabel'),
    /**
     * The contracted administrative field the frames do not draw — see the
     * module note. The label is the delivered one from
     * `apps/admin/.../fulfillment-copy.ts`, not a new coinage.
     */
    provinceLabel: readyMadeMessage.text('delivery.provinceLabel'),
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
    recipientNameRequired: readyMadeMessage.text('validation.recipientNameRequired'),
    /**
     * The remaining three, in the same drawn sentence shape: `Vui lòng nhập` +
     * the field's own drawn label, lower-cased as the drawn example is. They are
     * a transcription of one approved pattern applied to the fields it was drawn
     * for, not four new sentences.
     */
    recipientPhoneRequired: readyMadeMessage.text('validation.recipientPhoneRequired'),
    addressLineRequired: readyMadeMessage.text('validation.addressLineRequired'),
    provinceRequired: readyMadeMessage.text('validation.provinceRequired'),
    /** Bound to the contact card when no verified contact backs the order yet. */
    contactUnverified: readyMadeMessage.text('validation.contactUnverified'),
  },

  /** `907:200` … `907:207` — the item snapshot. */
  item: {
    /** `907:201`. */
    heading: readyMadeMessage.text('item.heading'),
    /** `907:206` — `Trắng · M · SL 1`; the quantity prefix is drawn. */
    quantityPrefix: readyMadeMessage.text('item.quantityPrefix'),
    separator: readyMadeMessage.text('item.separator'),
  },

  /** `907:208` … `907:225` — the summary card. */
  summary: {
    /** `907:209`. */
    heading: readyMadeMessage.text('summary.heading'),
    /** `907:211`. */
    merchandiseLabel: readyMadeMessage.text('summary.merchandiseLabel'),
    /** `907:215`. */
    shippingLabel: readyMadeMessage.text('summary.shippingLabel'),
    /** `907:217` — never a number, and never a zero (`BR-027`). */
    shippingPending: readyMadeMessage.text('summary.shippingPending'),
    /** `907:220`. */
    totalLabel: readyMadeMessage.text('summary.totalLabel'),
    /** `907:222` — the total does not exist until an operator sets the fee. */
    totalPending: readyMadeMessage.text('summary.totalPending'),
    /** `907:224` — the one supporting block `APP12-D01` §M allows here. */
    notice: readyMadeMessage.text('summary.notice'),
    /** `907:225` — the primary action. */
    submit: readyMadeMessage.text('summary.submit'),
    /** `909:271` — the pending variant of the same button. */
    submitPending: readyMadeMessage.text('summary.submitPending'),
    /** `909:273`. */
    submitPendingNotice: readyMadeMessage.text('summary.submitPendingNotice'),
  },

  /** `909:274` … `909:281` — creation refused. */
  refusal: {
    /** `909:279`; the mark is decorative and the title carries the meaning. */
    mark: readyMadeMessage.text('refusal.mark'),
    /** `909:281` — back to the product, never a silent retry (`909:276`). */
    back: readyMadeMessage.text('refusal.back'),
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
    title: readyMadeMessage.text('invalidSelection.title'),
    body: readyMadeMessage.text('invalidSelection.body'),
  },

  /**
   * The confirmation, composed from the delivered `APP5-S02` surface — see the
   * module note. Three facts and nothing else: the order exists, the fee is
   * still pending, and the link is on its way to the verified contact.
   */
  success: {
    /** `660:9` — decorative, as it is there. */
    mark: readyMadeMessage.text('success.mark'),
    /** The `660:11` shape, said about an order rather than a request. */
    title: readyMadeMessage.text('success.title'),
    /** `660:12` — the quotable, non-credential reference (`ReadyMadeOrderCreatedResponse.orderCode`). */
    orderCodeLabel: readyMadeMessage.text('success.orderCodeLabel'),
    /** `660:14`, restated for an order: the code talks, the link opens. */
    orderCodeNote: readyMadeMessage.text('success.orderCodeNote'),
    /** `660:18`, with the masked contact removed: this screen holds no mask. */
    secureLinkTitle: readyMadeMessage.text('success.secureLinkTitle'),
    secureLinkBody: readyMadeMessage.text('success.secureLinkBody'),
    /** `660:21` — the same fallback advice, same voice. */
    secureLinkFallback: readyMadeMessage.text('success.secureLinkFallback'),
    /** The `907:224` rule, restated once the order exists. */
    shippingPendingNotice: readyMadeMessage.text('success.shippingPendingNotice'),
    /** `ReadyMadeOrderCreatedResponse.merchandiseSubtotal` — the frozen figure. */
    merchandiseLabel: readyMadeMessage.text('success.merchandiseLabel'),
    /** `ReadyMadeOrderCreatedResponse.reservationExpiresAt`, read and never computed. */
    reservationLabel: readyMadeMessage.text('success.reservationLabel'),
    /** Back to browsing; the secure surface is reached from the message only. */
    continue: readyMadeMessage.text('success.continue'),
  },
} as const;

/** `907:206` — `Trắng · M · SL 1`, built from what the projection published. */
export function itemVariantLine(labels: readonly (string | null)[], quantity: number): string {
  const { item } = READY_MADE_CHECKOUT_COPY;
  const parts = labels.filter((label): label is string => label !== null && label !== '');
  parts.push(`${item.quantityPrefix} ${String(quantity)}`);
  return parts.join(` ${item.separator} `);
}
