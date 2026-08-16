'use client';

/**
 * Choosing the one variant a catalog request is for (`650:3`).
 *
 * ## Nothing is pre-selected, and that is the whole component
 *
 * `APP5-B07` marks no variant as a default and `APP5-S01` §3.1 forbids inventing
 * one, so this renders a radio group with **no** `defaultChecked`, no
 * first-row-is-selected fallback and no effect that selects on load. `checked`
 * is driven entirely by the id the customer clicked; before that, every option
 * is unchecked and the step cannot be completed.
 *
 * A native radio group rather than a `<select>`: the approved frame draws the
 * options as visible cards with two attributes each, and a select would hide
 * them behind a control that also — on most platforms — reports its first option
 * as the current value before anything is chosen.
 */
import type { PublicProductVariantResponse } from '@embroidery/api-client';

import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';
import { variantLabel } from '../model/variant-option';

export interface VariantSelectorProps {
  readonly variants: readonly PublicProductVariantResponse[];
  readonly selectedVariantId: string | undefined;
  /** Set after a refetch withdrew the previous choice (`APP5-S01` §6.3). */
  readonly withdrawn: boolean;
  readonly invalid: boolean;
  readonly onSelect: (productVariantId: string) => void;
}

export function VariantSelector({
  variants,
  selectedVariantId,
  withdrawn,
  invalid,
  onSelect,
}: VariantSelectorProps) {
  const messageId = 'variant-message';
  const message = withdrawn
    ? CUSTOM_REQUEST_COPY.catalog.variantGone
    : invalid
      ? CUSTOM_REQUEST_COPY.catalog.variantHint
      : undefined;

  return (
    <fieldset className="custom-request__fieldset">
      <legend className="custom-request__legend">
        {CUSTOM_REQUEST_COPY.catalog.variantLegend}
      </legend>
      <p className="custom-request__hint">{CUSTOM_REQUEST_COPY.catalog.variantHint}</p>

      <div className="custom-request__options">
        {variants.map((variant) => (
          <label key={variant.productVariantId} className="custom-request__option">
            <input
              type="radio"
              name="product-variant"
              value={variant.productVariantId}
              checked={selectedVariantId === variant.productVariantId}
              {...(message === undefined ? {} : { 'aria-describedby': messageId })}
              onChange={() => {
                onSelect(variant.productVariantId);
              }}
            />
            {/*
              The two published attributes, composed for display only. The id
              beside them is what the submission carries and is never rendered:
              §13 keeps ids out of customer-facing values.
            */}
            <span className="custom-request__option-label">{variantLabel(variant)}</span>
          </label>
        ))}
      </div>

      {message === undefined ? null : (
        <p
          id={messageId}
          className={withdrawn || invalid ? 'custom-request__error' : 'custom-request__hint'}
          role={withdrawn ? 'status' : undefined}
        >
          {message}
        </p>
      )}
    </fieldset>
  );
}
