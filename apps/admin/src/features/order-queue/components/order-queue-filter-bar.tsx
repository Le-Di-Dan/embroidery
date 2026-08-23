'use client';

import { ORDER_QUEUE_COPY } from '../model/order-queue-copy';
import {
  ORDER_STATUS_FILTER_OPTIONS,
  isOrderQueueFiltered,
  type OrderQueueFilters,
  type OrderStatusFilterValue,
} from '../model/order-queue-filters';

interface OrderQueueFilterBarProps {
  readonly filters: OrderQueueFilters;
  readonly onToggleStatus: (status: OrderStatusFilterValue) => void;
  readonly onReset: () => void;
}

/**
 * The one approved queue filter (`732:3`, `732:110`).
 *
 * The approved control is a **multi-select** over the eleven contract states,
 * with "Tất cả" as the resting label and a count once something is chosen. It is
 * rendered as a `fieldset` of native checkboxes rather than a custom listbox:
 * that is keyboard- and screen-reader-correct without a line of interaction
 * code, and it maps one-to-one onto the repeatable `status` parameter — one box
 * ticked is one value sent.
 *
 * The legend is permanently visible. A placeholder that disappears on selection
 * leaves the operator no way to re-read what the control means, and this is the
 * only control on the screen that changes what the list contains.
 *
 * The scope line states what the filter *can* do, because `APP7-B02` publishes
 * only status, limit and cursor: an operator who cannot find a search box should
 * be told there is none rather than left hunting for it. There is deliberately
 * no text search, product/SKU filter, provider filter, evidence filter,
 * inventory filter or date range here — none is in the consumed design authority
 * and none exists on the wire.
 *
 * The reset control appears only when something is actually filtered, so the
 * operator is never offered a control that would do nothing. The boxes stay
 * mounted and enabled while a page is loading, so the operator can always see
 * and change what they asked for.
 */
export function OrderQueueFilterBar({
  filters,
  onToggleStatus,
  onReset,
}: OrderQueueFilterBarProps) {
  const selected = filters.statuses.length;
  const chosen = new Set<string>(filters.statuses);

  return (
    <div className="order-filters">
      <fieldset className="order-filters__group">
        <legend className="order-filters__legend">
          {ORDER_QUEUE_COPY.filters.legend}
          <span className="order-filters__summary" data-testid="order-filter-summary">
            {selected === 0
              ? ORDER_QUEUE_COPY.filters.all
              : ORDER_QUEUE_COPY.filters.selected(selected)}
          </span>
        </legend>

        <ul className="order-filters__options">
          {ORDER_STATUS_FILTER_OPTIONS.map((option) => (
            <li className="order-filters__option" key={option.value}>
              <label className="order-filters__label">
                <input
                  type="checkbox"
                  className="order-filters__checkbox"
                  value={option.value}
                  checked={chosen.has(option.value)}
                  data-testid={`order-filter-${option.value}`}
                  onChange={() => onToggleStatus(option.value)}
                />
                <span className="order-filters__option-label">{option.label}</span>
                {/* The stored token beside the label, as `732:110` draws it: the
                    operator reconciles this queue against a database and needs
                    to know which contract value they just asked for. */}
                <span className="order-filters__option-token">{option.value}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <p className="order-filters__scope">{ORDER_QUEUE_COPY.filters.scope}</p>

      {isOrderQueueFiltered(filters) ? (
        <button
          type="button"
          className="order-filters__reset"
          data-testid="order-filter-reset"
          onClick={onReset}
        >
          {ORDER_QUEUE_COPY.filters.reset}
        </button>
      ) : null}
    </div>
  );
}
