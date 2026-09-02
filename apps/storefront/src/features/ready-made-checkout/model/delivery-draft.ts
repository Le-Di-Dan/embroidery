import type { ReadyMadeOrderDelivery } from '@embroidery/api-client';

import { READY_MADE_CHECKOUT_COPY } from './ready-made-checkout-copy';

/**
 * The delivery facts the customer supplies, and the client-side checks on them
 * (`APP12-S02` §18).
 *
 * ## The fields are the contract's, and the labels are the design's
 *
 * `ReadyMadeOrderDelivery` declares `recipientName`, `recipientPhone`,
 * `addressLine` and `province` as required and `ward` / `district` as optional.
 * `APP12-D01` draws the first three plus an optional workshop note. This form is
 * the **intersection made whole**: the four contracted required fields, in the
 * drawn field pattern, and nothing else.
 *
 * - `ward` and `district` are contract-optional and **not** rendered. The
 *   approved `Địa chỉ nhận hàng` placeholder writes them inline
 *   (`12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, …`), so adding two more inputs
 *   would redesign the drawn card to collect something the customer is already
 *   being asked for. They are omitted rather than derived: splitting a free-form
 *   address on commas would post administrative facts nobody stated.
 * - The drawn note field is **not** rendered, because no contract field carries
 *   it — see `ready-made-checkout-copy.ts`.
 *
 * ## Client validation is UX and never authority
 *
 * Every check below is presence-and-shape, matched to the contract's own
 * `minLength` / `maxLength`, so a customer learns about an empty field before a
 * round trip instead of after one. `APP12-B02` re-validates the same body and is
 * the only decision that counts; a refusal it returns is rendered as a refusal
 * (`checkout-failure.ts`) rather than silently re-attributed to a field here.
 *
 * There is **no phone-format rule**. The contract asks for 1–32 characters and
 * takes no position on shape, and inventing one here would reject a legitimate
 * number the server would have accepted — the customer's own delivery contact,
 * on a screen with no way to appeal.
 */

/** The four fields this form owns. Keys match the contract, values are as typed. */
export interface DeliveryDraft {
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly province: string;
}

export type DeliveryField = keyof DeliveryDraft;

export const EMPTY_DELIVERY_DRAFT: DeliveryDraft = {
  recipientName: '',
  recipientPhone: '',
  addressLine: '',
  province: '',
};

/** The contract's own bounds, restated so a field can say so before submitting. */
const MAX_LENGTH: Readonly<Record<DeliveryField, number>> = {
  recipientName: 200,
  recipientPhone: 32,
  addressLine: 500,
  province: 200,
};

/** The approved message bound to each field (`909:265`'s pattern). */
const REQUIRED_MESSAGE: Readonly<Record<DeliveryField, string>> = {
  recipientName: READY_MADE_CHECKOUT_COPY.validation.recipientNameRequired,
  recipientPhone: READY_MADE_CHECKOUT_COPY.validation.recipientPhoneRequired,
  addressLine: READY_MADE_CHECKOUT_COPY.validation.addressLineRequired,
  province: READY_MADE_CHECKOUT_COPY.validation.provinceRequired,
};

/** The field order the drawn card renders, so tab order and errors agree. */
export const DELIVERY_FIELDS: readonly DeliveryField[] = [
  'recipientName',
  'recipientPhone',
  'addressLine',
  'province',
];

export function maxLengthOf(field: DeliveryField): number {
  return MAX_LENGTH[field];
}

export type DeliveryErrors = Partial<Record<DeliveryField, string>>;

/**
 * Which fields are not yet fillable in.
 *
 * Trimmed before the emptiness test, and trimmed again on the way out
 * (`toDeliveryBody`), so a field holding only spaces is refused here rather than
 * posted as a name the server would reject for `minLength`.
 */
export function validateDelivery(draft: DeliveryDraft): DeliveryErrors {
  const errors: DeliveryErrors = {};
  for (const field of DELIVERY_FIELDS) {
    if (draft[field].trim() === '') errors[field] = REQUIRED_MESSAGE[field];
  }
  return errors;
}

export function hasDeliveryErrors(errors: DeliveryErrors): boolean {
  return DELIVERY_FIELDS.some((field) => errors[field] !== undefined);
}

/**
 * The contract body, from a draft that has already passed `validateDelivery`.
 *
 * `ward` and `district` are omitted rather than sent empty: the contract gives
 * them `minLength: 1`, so an empty string is a refusal and `undefined` is the
 * honest "not stated". The optional keys are left off the object entirely, which
 * is what `exactOptionalPropertyTypes` requires and what keeps the fingerprint
 * `APP12-B02` computes stable across retries of the same order.
 */
export function toDeliveryBody(draft: DeliveryDraft): ReadyMadeOrderDelivery {
  return {
    recipientName: draft.recipientName.trim(),
    recipientPhone: draft.recipientPhone.trim(),
    addressLine: draft.addressLine.trim(),
    province: draft.province.trim(),
  };
}

/**
 * A stable text of everything a resubmission must not silently change
 * (`APP12-S02` §20, §24).
 *
 * `APP12-B02` fingerprints `(skuId, quantity, delivery)` and replays a second
 * call with the same fingerprint on the same challenge, refusing a different one
 * as `IDEMPOTENCY_CONFLICT`. This is the browser's own view of that same tuple,
 * used for one purpose: noticing that a material input changed since the
 * submission currently in flight or already settled, so the screen drops that
 * submission's state instead of presenting its outcome as this order's. It is
 * **not** sent, and it is not a second fingerprint algorithm — it never has to
 * agree with the server's digest, only with itself.
 */
export function materialCheckoutFingerprint(input: {
  readonly skuId: string;
  readonly quantity: number;
  readonly delivery: DeliveryDraft;
  readonly challengeId: string | undefined;
}): string {
  const delivery = toDeliveryBody(input.delivery);
  return [
    input.challengeId ?? '-',
    input.skuId,
    String(input.quantity),
    delivery.recipientName,
    delivery.recipientPhone,
    delivery.addressLine,
    delivery.province,
  ]
    .map((value) => `${String(value.length)}:${value}`)
    .join('|');
}
