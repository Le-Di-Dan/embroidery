'use client';

/**
 * The delivery card (`907:182` … `907:195`, error state `909:259`).
 *
 * A `<fieldset>` with the drawn `Giao hàng` heading as its `<legend>`: the four
 * inputs are one group answering one question, which is exactly what the element
 * is for and what `APP12-S02` §35 asks for. The heading is the legend rather than
 * a sibling `h2` so a screen reader announces "Giao hàng" with every field
 * inside it, instead of the customer having to remember which section they are
 * in four fields later.
 *
 * The field set is the contract's required four — see `delivery-draft.ts` for
 * why `ward`, `district` and the drawn workshop note are all absent. Nothing here
 * offers a carrier, a shipping fee, a payment field, an invoice block or an
 * operator note (§18): none of them is contracted, and a control with nowhere to
 * send its value is worse than no control.
 */
import {
  DELIVERY_FIELDS,
  maxLengthOf,
  type DeliveryDraft,
  type DeliveryErrors,
  type DeliveryField,
} from '../model/delivery-draft';
import { READY_MADE_CHECKOUT_COPY } from '../model/ready-made-checkout-copy';
import { CheckoutField } from './checkout-field';

export interface CheckoutDeliveryCardProps {
  readonly draft: DeliveryDraft;
  readonly errors: DeliveryErrors;
  readonly disabled: boolean;
  readonly onChange: (field: DeliveryField, value: string) => void;
}

const { delivery } = READY_MADE_CHECKOUT_COPY;

/** The drawn label for each contracted field, resolved once. */
const LABEL: Readonly<Record<DeliveryField, string>> = {
  recipientName: delivery.recipientNameLabel,
  recipientPhone: delivery.recipientPhoneLabel,
  addressLine: delivery.addressLineLabel,
  province: delivery.provinceLabel,
};

/**
 * The browser's autofill vocabulary for each field.
 *
 * Standard `autocomplete` tokens, not business values: they let a phone fill an
 * address the customer has already given some other site, which is a real
 * accessibility and mobile-usability gain at 390 (§36) and costs nothing. The
 * address is `street-address` because the drawn field is the free-form line;
 * `province` maps to `address-level1`, which is what the token means.
 */
const AUTOCOMPLETE: Readonly<Record<DeliveryField, string>> = {
  recipientName: 'name',
  recipientPhone: 'tel',
  addressLine: 'street-address',
  province: 'address-level1',
};

export function CheckoutDeliveryCard(props: CheckoutDeliveryCardProps) {
  const { draft, errors, disabled, onChange } = props;

  return (
    <fieldset className="ready-made-checkout__card ready-made-checkout__fieldset">
      <legend className="ready-made-checkout__card-heading">{delivery.heading}</legend>
      {/* Said once for the card rather than marked four times (`V01-UX-028`). */}
      <p className="ready-made-checkout__card-note">{delivery.allRequired}</p>
      {DELIVERY_FIELDS.map((field) => (
        <CheckoutField
          key={field}
          label={LABEL[field]}
          value={draft[field]}
          maxLength={maxLengthOf(field)}
          // All four are contract-required and `validateDelivery` refuses an
          // empty one; `DELIVERY_FIELDS` is exactly the required set, so this is
          // a constant rather than a per-field flag (`APP12-H08`).
          required
          disabled={disabled}
          autoComplete={AUTOCOMPLETE[field]}
          {...(field === 'recipientPhone' ? { inputMode: 'tel' as const } : {})}
          {...(errors[field] === undefined ? {} : { error: errors[field] })}
          onChange={(value) => {
            onChange(field, value);
          }}
        />
      ))}
    </fieldset>
  );
}
