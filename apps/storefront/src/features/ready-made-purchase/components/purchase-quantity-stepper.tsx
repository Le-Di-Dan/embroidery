'use client';

import { availabilityLabel, READY_MADE_PURCHASE_COPY } from '../model/ready-made-purchase-copy';
import { clampQuantity, MIN_QUANTITY } from '../model/purchase-selection';

/**
 * The quantity control and the availability line beneath it (`904:65`).
 *
 * ## Why a real number input between two buttons
 *
 * `APP12-D01` draws `−  1  +` with 44px targets (`904:68`). The two steps are
 * real `<button type="button">`s with accessible names, and the value between
 * them is a real `<input type="number">` with `min`, `max` and `step` — so a
 * keyboard user can type a quantity and a screen reader is told the bounds,
 * rather than being shown a `<span>` that only a mouse can change.
 *
 * ## The bound is the server's number, enforced three ways
 *
 * `max` is the SKU's published `availableQuantity`, the `+` button stops there,
 * and `clampQuantity` re-derives the effective value from the raw text on every
 * render. The attribute alone would not be enough — a browser lets a typed value
 * exceed `max` — and the clamp alone would let the control display something the
 * customer cannot buy. The value that leaves this component is always a positive
 * integer within the published availability (`APP12-S01` §14).
 *
 * The raw string is held by the caller so a half-typed value is not fought with
 * mid-keystroke; the committed integer is what the continue URL carries.
 *
 * ## Availability is advisory
 *
 * The line states the exact count the server published and nothing else. It is a
 * read-time fact, not a hold: nothing is reserved by looking at this page, and
 * `APP12-B02` re-checks the number under the inventory lock when an order is
 * actually created (`BR-024`, `APP12-S01` §12).
 */
export interface PurchaseQuantityStepperProps {
  readonly rawQuantity: string;
  readonly availableQuantity: number;
  readonly onChange: (raw: string) => void;
}

export function PurchaseQuantityStepper({
  rawQuantity,
  availableQuantity,
  onChange,
}: PurchaseQuantityStepperProps) {
  const quantity = clampQuantity(rawQuantity, availableQuantity);
  const inputId = 'ready-made-purchase-quantity';

  return (
    <div className="ready-made-purchase__quantity">
      <label className="ready-made-purchase__legend" htmlFor={inputId}>
        {READY_MADE_PURCHASE_COPY.quantityLabel}
      </label>

      <div className="ready-made-purchase__stepper">
        <button
          type="button"
          className="ready-made-purchase__step"
          aria-label={READY_MADE_PURCHASE_COPY.quantityDecrease}
          disabled={quantity <= MIN_QUANTITY}
          onClick={() => {
            onChange(String(quantity - 1));
          }}
        >
          −
        </button>

        <input
          id={inputId}
          className="ready-made-purchase__quantity-input"
          type="number"
          inputMode="numeric"
          min={MIN_QUANTITY}
          max={availableQuantity}
          step={1}
          value={rawQuantity}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          // A blank or out-of-range value is normalized the moment the customer
          // leaves the field, so what they see and what the CTA carries agree.
          onBlur={() => {
            onChange(String(quantity));
          }}
        />

        <button
          type="button"
          className="ready-made-purchase__step"
          aria-label={READY_MADE_PURCHASE_COPY.quantityIncrease}
          disabled={quantity >= availableQuantity}
          onClick={() => {
            onChange(String(quantity + 1));
          }}
        >
          +
        </button>
      </div>

      <p className="ready-made-purchase__availability">
        <span className="ready-made-purchase__availability-mark" aria-hidden="true">
          ✓
        </span>
        {availabilityLabel(availableQuantity)}
      </p>
    </div>
  );
}
