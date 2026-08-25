'use client';

import { useEffect, useState } from 'react';

import { AdminTextField } from '../../../shared/forms/admin-text-field';
import type { ProductionQueueFilterController } from '../hooks/use-production-queue-filters';
import { PRODUCTION_QUEUE_COPY } from '../model/production-queue-copy';
import {
  PRODUCTION_STATUS_FILTER_OPTIONS,
  isOrderIdShaped,
} from '../model/production-queue-filters';

interface ProductionQueueFilterBarProps {
  readonly controller: ProductionQueueFilterController;
}

/**
 * The two approved queue filters (`780:30`, `780:105`).
 *
 * **Status** is rendered as a `fieldset` of native checkboxes rather than a
 * custom listbox: that is keyboard- and screen-reader-correct without a line of
 * interaction code, and it maps one-to-one onto the repeatable `status`
 * parameter — one box ticked is one value sent. The legend is permanently
 * visible with the "Tất cả" / "n đã chọn" summary `780:33` and `780:135` draw,
 * because a placeholder that disappears on selection leaves the operator no way
 * to re-read what the control means. The four options are the whole LC-18
 * vocabulary, and `780:176`'s sentence — that "tất cả" is not a submitted value
 * — is on screen rather than only in a comment.
 *
 * **Đơn hàng** filters on `orderId`, and the label says `orderId` in the help
 * line so it cannot be mistaken for the `ORD-…` code the queue never receives.
 * The field holds a *draft*: only a value shaped like the id the accepted schema
 * takes is committed to the URL and sent. A half-typed or malformed id is
 * reported in place and no request is made — there is no hidden lookup turning
 * an order code into an id, because `APP8-B03` publishes no such resolution and
 * a silent second query is not a filter the operator asked for.
 *
 * The scope line states what the filters *can* do. An operator who cannot find
 * a priority or operator filter should be told there is none rather than left
 * hunting for it.
 */
export function ProductionQueueFilterBar({ controller }: ProductionQueueFilterBarProps) {
  const { filters, toggleStatus, setOrderId } = controller;
  const selected = filters.statuses.length;
  const chosen = new Set<string>(filters.statuses);

  // The committed filter is the source of truth; the draft only exists so a
  // partially typed id can be seen while it is not yet a filter.
  const [draft, setDraft] = useState(filters.orderId ?? '');
  useEffect(() => {
    setDraft(filters.orderId ?? '');
  }, [filters.orderId]);

  const trimmed = draft.trim();
  const malformed = trimmed !== '' && !isOrderIdShaped(trimmed);

  return (
    <div className="production-filters">
      <fieldset className="production-filters__group">
        <legend className="production-filters__legend">
          {PRODUCTION_QUEUE_COPY.filters.statusLegend}
          <span className="production-filters__summary" data-testid="production-filter-summary">
            {selected === 0
              ? PRODUCTION_QUEUE_COPY.filters.all
              : PRODUCTION_QUEUE_COPY.filters.selected(selected)}
          </span>
        </legend>

        <ul className="production-filters__options">
          {PRODUCTION_STATUS_FILTER_OPTIONS.map((option) => (
            <li className="production-filters__option" key={option.value}>
              <label className="production-filters__label">
                <input
                  type="checkbox"
                  className="production-filters__checkbox"
                  value={option.value}
                  checked={chosen.has(option.value)}
                  data-testid={`production-filter-${option.value}`}
                  onChange={() => toggleStatus(option.value)}
                />
                <span className="production-filters__option-label">{option.label}</span>
                {/* The stored token beside the label, as `780:151` draws it: the
                    operator reconciles this queue against a database and needs
                    to know which contract value they just asked for. */}
                <span className="production-filters__option-token">{option.value}</span>
              </label>
            </li>
          ))}
        </ul>

        <p className="production-filters__vocabulary">{PRODUCTION_QUEUE_COPY.filters.vocabulary}</p>
      </fieldset>

      <div className="production-filters__order">
        <AdminTextField
          label={PRODUCTION_QUEUE_COPY.filters.orderLabel}
          value={draft}
          placeholder={PRODUCTION_QUEUE_COPY.filters.orderPlaceholder}
          testId="production-filter-order"
          {...(malformed
            ? { error: PRODUCTION_QUEUE_COPY.filters.orderInvalid }
            : { help: PRODUCTION_QUEUE_COPY.filters.orderHelp })}
          onChange={(value) => {
            setDraft(value);
            setOrderId(value);
          }}
        />
      </div>

      <p className="production-filters__scope">{PRODUCTION_QUEUE_COPY.filters.scope}</p>
    </div>
  );
}
