/**
 * The customer's view of LC-14, and the four steps the approved frames draw
 * (`APP9-S01` §14, §15; `818:54`, `818:104`, `818:154`, `820:4`).
 *
 * ## Backend enum names never reach the screen
 *
 * `820:6` states the rule for the whole package: the Admin column keeps the
 * technical names because operators match them against logs, and the customer
 * column is product wording. So `orderStatus` is translated here — once — and no
 * component in this feature prints a raw contract value.
 *
 * The five mapped rows are `820:14` through `820:38`, transcribed exactly. The
 * three states *before* `PRODUCTION_COMPLETED` are not in that table because the
 * balance is unreachable from them; the approved not-payable frame (`818:13`)
 * prints *Đang sản xuất* for that whole region, so they share it rather than
 * acquiring three labels the package never approved.
 *
 * `ON_HOLD`, `CANCELLING` and `CANCELLED` are deliberately **absent**. No
 * approved frame names them to a customer, `PO-APP9-001 = OPTION A — DEFER`
 * keeps cancellation out of this surface entirely, and a label invented here
 * would be the first customer-visible sentence about cancelling an order. The
 * lookup answers `undefined` and the card renders no badge at all — the panel's
 * own body already carries the meaning.
 *
 * ## Why the progress is a stepper and not a timeline
 *
 * `APP9-S01` §14 asks for a simple status presentation and §15 forbids a
 * logistics timeline outright. There are no timestamps here, no carrier, no
 * courier events and no estimate — four labels and which of them has been
 * reached, derived from one field. Nothing in this module can express *when*
 * anything happened, which is the cheapest way to guarantee it never does.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import {
  CustomerFinalPaymentResponseOrderStatus as OrderStatus,
  type CustomerFinalPaymentResponse,
} from '@embroidery/api-client';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/custom.json`), not in this file
 * (`APP12-V02` §5A).
 */
const orderProgressMessage = messageView(VI_MESSAGES.custom, 'orderProgress');

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/custom.json`, under `orderProgress.stateLabels`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const orderProgressStateLabelsMessage = messageView(
  VI_MESSAGES.custom,
  'orderProgress.stateLabels',
);

/** `820:14`…`820:38`, plus the pre-production region the frame labels once. */
const CUSTOMER_ORDER_LABEL: Partial<
  Readonly<Record<CustomerFinalPaymentResponse['orderStatus'], string>>
> = {
  [OrderStatus.AWAITING_DEPOSIT]: orderProgressStateLabelsMessage.text('AWAITING_DEPOSIT'),
  [OrderStatus.DEPOSIT_PAID]: orderProgressStateLabelsMessage.text('DEPOSIT_PAID'),
  [OrderStatus.IN_PRODUCTION]: orderProgressStateLabelsMessage.text('IN_PRODUCTION'),
  [OrderStatus.PRODUCTION_COMPLETED]: orderProgressStateLabelsMessage.text('PRODUCTION_COMPLETED'),
  [OrderStatus.AWAITING_FINAL_PAYMENT]:
    orderProgressStateLabelsMessage.text('AWAITING_FINAL_PAYMENT'),
  [OrderStatus.READY_FOR_DELIVERY]: orderProgressStateLabelsMessage.text('READY_FOR_DELIVERY'),
  [OrderStatus.DELIVERED]: orderProgressStateLabelsMessage.text('DELIVERED'),
  [OrderStatus.COMPLETED]: orderProgressStateLabelsMessage.text('COMPLETED'),
};

/**
 * The customer label for one order state, or `undefined` where none is approved.
 *
 * `undefined` is a real answer and not a gap: it is how this module declines to
 * describe `ON_HOLD`, `CANCELLING` and `CANCELLED` to a customer, and callers
 * render no badge rather than substituting one.
 */
export function customerOrderLabel(
  orderStatus: CustomerFinalPaymentResponse['orderStatus'],
): string | undefined {
  return CUSTOMER_ORDER_LABEL[orderStatus];
}

/**
 * The four steps `818:54` draws, in order.
 *
 * One list in the message repository rather than four numbered keys: the
 * order is part of the meaning, and a Product Owner reordering the journey
 * should be reordering an array rather than renaming keys (`APP12-V02` §5A.6).
 */
export const ORDER_PROGRESS_STEPS = orderProgressMessage.list('steps');

/**
 * A step label.
 *
 * Was a literal union derived from the four hard-coded strings. It is `string`
 * now, and that is the correct consequence of the copy moving: a union built
 * out of Vietnamese sentences made the *wording* part of the type, so changing
 * a label was a type change. The labels are data; the step count and order are
 * what the card actually depends on.
 */
export type OrderProgressStep = string;

/**
 * How many of the four steps have been reached, from the order state alone.
 *
 * Only ever called once the balance is settled, so step 1 is always reached: the
 * money is in, which is the event this stepper starts from. `READY_FOR_DELIVERY`
 * fills two (`818:54`), `DELIVERED` three (`818:104`) and `COMPLETED` all four
 * (`818:154`) — exactly the three frames the package draws and no interpolation
 * between them.
 *
 * A settled obligation on an order that has not yet moved — `APP9-B03` satisfies
 * the obligation and advances the order in one transaction, but a fee increase
 * can re-open the balance behind an already-advanced order — reaches one step.
 * That is the honest floor: the payment is confirmed and nothing further is.
 */
export function orderProgressReached(
  orderStatus: CustomerFinalPaymentResponse['orderStatus'],
): number {
  switch (orderStatus) {
    case OrderStatus.COMPLETED:
      return 4;
    case OrderStatus.DELIVERED:
      return 3;
    case OrderStatus.READY_FOR_DELIVERY:
      return 2;
    default:
      return 1;
  }
}
