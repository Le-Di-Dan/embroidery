'use client';

import { READY_MADE_PURCHASE_COPY } from '../model/ready-made-purchase-copy';
import type { PurchaseOption } from '../model/purchase-selection';

/**
 * One option axis of the purchase panel — `Phân loại` (`904:44`) or
 * `Kích thước` (`904:53`).
 *
 * ## Real radio semantics, not clickable divs
 *
 * The approved frame draws pills, and a pill is what this renders — but every
 * one of them is a `<label>` around a native `<input type="radio">` inside a
 * `<fieldset>` with a real `<legend>`. That gives the group a name, arrow-key
 * navigation, a checked state assistive technology can report and a genuine
 * disabled state, none of which a styled `<div onClick>` has. The input is
 * visually hidden rather than removed, so focus is real and the ring is drawn on
 * the pill it belongs to.
 *
 * ## Disabled is disabled, and only sometimes "hết"
 *
 * An option the projection did not mark `selectable` is rendered with the
 * `disabled` attribute, so it cannot be reached by pointer, keyboard or a
 * programmatic click — `APP12-S01` §11 asks that a non-purchasable SKU not be
 * selectable, and the attribute is what enforces it. The `· hết` caption
 * (`904:64`) is attached only when the projection says the refusal is inventory;
 * an option refused because its variant resolves to no SKU, or to more than one,
 * is disabled **without** it, because neither of those is a statement about
 * stock.
 */
export interface PurchaseOptionFieldsetProps {
  readonly legend: string;
  /** Distinguishes the two radio groups within one panel. */
  readonly name: string;
  readonly options: readonly PurchaseOption[];
  readonly selected: string | undefined;
  /**
   * The approved message bound to this fieldset, or `undefined` when it is
   * complete. An explicit `undefined` rather than an optional property, so the
   * caller passes the resolver's answer straight through instead of rebuilding
   * the same conditional spread at each of the two call sites.
   */
  readonly error: string | undefined;
  readonly onSelect: (value: string) => void;
}

export function PurchaseOptionFieldset({
  legend,
  name,
  options,
  selected,
  error,
  onSelect,
}: PurchaseOptionFieldsetProps) {
  const errorId = `ready-made-purchase-${name}-error`;

  return (
    <fieldset
      className="ready-made-purchase__fieldset"
      // Bound to the group rather than announced as a toast, exactly as
      // `906:186`'s annotation requires.
      {...(error === undefined ? {} : { 'aria-describedby': errorId })}
    >
      <legend className="ready-made-purchase__legend">{legend}</legend>

      <div className="ready-made-purchase__options">
        {options.map((option) => (
          <label
            key={option.value}
            className="ready-made-purchase__option"
            data-selectable={String(option.selectable)}
          >
            <input
              className="ready-made-purchase__option-input"
              type="radio"
              name={name}
              value={option.value}
              checked={selected === option.value}
              disabled={!option.selectable}
              onChange={() => {
                onSelect(option.value);
              }}
            />
            <span className="ready-made-purchase__option-pill">
              <span className="ready-made-purchase__option-value">{option.value}</span>
              {option.soldOut ? (
                <span className="ready-made-purchase__option-note">
                  {READY_MADE_PURCHASE_COPY.optionSoldOut}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      {error === undefined ? null : (
        <p id={errorId} className="ready-made-purchase__error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
