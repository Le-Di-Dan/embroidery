import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';
import {
  REQUIRED_SHIPPING_FIELDS,
  type ShippingFormField,
  type ShippingFormValues,
} from '../model/shipping-detail-form';

interface ShippingDetailFieldsProps {
  readonly values: ShippingFormValues;
  readonly invalid: readonly ShippingFormField[];
  readonly disabled: boolean;
  readonly onChange: (field: ShippingFormField, value: string) => void;
}

/**
 * The nine inputs of the shipping editor, in the order `812:46`…`812:84` draws
 * them.
 *
 * Split out of the card so the card is about *behaviour* — save, reset, refusal,
 * freeze — and this file is about the form. That is a responsibility boundary,
 * not a line count: the field list changes when the contract's members change,
 * and the save behaviour changes when the fee rules do.
 *
 * The nine are exactly the members `SaveShippingDetailBody` accepts, no more.
 * There is no country selector — `countryCode` is defaulted on the row and the
 * body has no member for it — and no profile or address-book prefill anywhere:
 * a delivery address is a fact about one order, and defaulting it from a
 * customer profile would silently ship to somewhere the order never said.
 *
 * The fee is a plain text input, not a number input. `feeAmount` is a decimal
 * string the server matches against its own pattern, and `<input type="number">`
 * would hand the value through the browser's numeric parsing on the way out.
 */
const FIELD_ORDER: readonly ShippingFormField[] = [
  'recipientName',
  'recipientPhone',
  'addressLine',
  'ward',
  'district',
  'province',
  'feeAmount',
  'carrierName',
  'trackingCode',
];

export function ShippingDetailFields({
  values,
  invalid,
  disabled,
  onChange,
}: ShippingDetailFieldsProps) {
  return (
    <div className="order-fulfillment__fields">
      {FIELD_ORDER.map((field) => {
        const required = REQUIRED_SHIPPING_FIELDS.includes(field);
        const isInvalid = invalid.includes(field);
        const inputId = `shipping-${field}`;
        return (
          <p
            className={`order-fulfillment__field${isInvalid ? ' order-fulfillment__field--invalid' : ''}`}
            key={field}
          >
            <label className="order-fulfillment__label" htmlFor={inputId}>
              {COPY.shippingFields[field]}
              {required ? <span aria-hidden="true"> *</span> : null}
            </label>
            <input
              id={inputId}
              className="order-fulfillment__input"
              type="text"
              value={values[field]}
              required={required}
              disabled={disabled}
              aria-invalid={isInvalid}
              data-testid={inputId}
              onChange={(event) => onChange(field, event.target.value)}
            />
          </p>
        );
      })}
    </div>
  );
}
