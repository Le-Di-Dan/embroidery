'use client';

import { ORDER_QUEUE_COPY } from '../model/order-queue-copy';
import {
  ORDER_ORIGIN_FILTER_OPTIONS,
  ORDER_STATUS_FILTER_OPTIONS,
  isOrderQueueFiltered,
  type OrderOriginFilterValue,
  type OrderQueueFilters,
  type OrderStatusFilterValue,
} from '../model/order-queue-filters';

interface OrderQueueFilterBarProps {
  readonly filters: OrderQueueFilters;
  readonly onToggleStatus: (status: OrderStatusFilterValue) => void;
  readonly onToggleOrigin: (origin: OrderOriginFilterValue) => void;
  readonly onReset: () => void;
}

/**
 * The two approved queue filters (`732:3`, `732:110`; `912:337`).
 *
 * Each control is a **multi-select** over its contract values, with "Tất cả" as
 * the resting label and a count once something is chosen. Both are rendered as
 * a `fieldset` of native checkboxes rather than a custom listbox: that is
 * keyboard- and screen-reader-correct without a line of interaction code, and
 * it maps one-to-one onto the repeatable parameters — one box ticked is one
 * value sent.
 *
 * `912:337` adds `Nguồn đơn` as a **second fieldset in the same bar**, not a
 * second kind of control and not a segmented toggle: an operator who has
 * learned the status filter has already learned this one. Its note says so on
 * the screen.
 *
 * Each legend is permanently visible. A placeholder that disappears on
 * selection leaves the operator no way to re-read what the control means, and
 * these are the only controls on the screen that change what the list contains.
 *
 * The scope line states what the filters *can* do, because `adminOrder_list`
 * publishes only status, origin, limit and cursor: an operator who cannot find
 * a search box should be told there is none rather than left hunting for it.
 *
 * The reset control appears only when something is actually filtered, so the
 * operator is never offered a control that would do nothing. The boxes stay
 * mounted and enabled while a page is loading, so the operator can always see
 * and change what they asked for.
 */
export function OrderQueueFilterBar({
  filters,
  onToggleStatus,
  onToggleOrigin,
  onReset,
}: OrderQueueFilterBarProps) {
  const chosenStatuses = new Set<string>(filters.statuses);
  const chosenOrigins = new Set<string>(filters.origins);

  return (
    <div className="order-filters">
      <fieldset className="order-filters__group">
        <legend className="order-filters__legend">
          {ORDER_QUEUE_COPY.filters.legend}
          <span className="order-filters__summary" data-testid="order-filter-summary">
            {summaryOf(filters.statuses.length)}
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
                  checked={chosenStatuses.has(option.value)}
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

      <fieldset className="order-filters__group">
        <legend className="order-filters__legend">
          {ORDER_QUEUE_COPY.filters.originLegend}
          <span className="order-filters__summary" data-testid="order-origin-filter-summary">
            {summaryOf(filters.origins.length)}
          </span>
        </legend>

        <ul className="order-filters__options">
          {ORDER_ORIGIN_FILTER_OPTIONS.map((option) => (
            <li className="order-filters__option" key={option.value}>
              <label className="order-filters__label">
                <input
                  type="checkbox"
                  className="order-filters__checkbox"
                  value={option.value}
                  checked={chosenOrigins.has(option.value)}
                  data-testid={`order-origin-filter-${option.value}`}
                  onChange={() => onToggleOrigin(option.value)}
                />
                <span className="order-filters__option-label">{option.label}</span>
                <span className="order-filters__option-token">{option.value}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

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

/** "Tất cả" while nothing is chosen, otherwise the count — one rule for both. */
function summaryOf(selected: number): string {
  return selected === 0
    ? ORDER_QUEUE_COPY.filters.all
    : ORDER_QUEUE_COPY.filters.selected(selected);
}
