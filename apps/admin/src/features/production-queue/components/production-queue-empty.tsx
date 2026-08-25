'use client';

import Link from 'next/link';

import { ADMIN_ORDERS_ROUTE } from '../../order-queue';
import { truncateIdentifier } from '../../../shared/presentation/identifier';
import type { ProductionQueueFilterController } from '../hooks/use-production-queue-filters';
import { PRODUCTION_QUEUE_COPY } from '../model/production-queue-copy';
import { isProductionQueueFiltered } from '../model/production-queue-filters';
import { productionStatusLabel } from '../model/production-status';

interface ProductionQueueEmptyProps {
  readonly controller: ProductionQueueFilterController;
}

/**
 * The two empty states, which are deliberately not one (`782:3`, `782:44`).
 *
 * `782:81` states the rule in the design itself: an empty queue because of a
 * filter and an empty queue because there is no work are different facts, and
 * they may not share a sentence. Getting it backwards sends an operator hunting
 * for a filter they never set, or tells them the workshop is idle when they
 * merely asked for cancelled jobs.
 *
 * ### The unfiltered state offers navigation, not creation
 *
 * `782:42` offers "Mở danh sách đơn hàng" — and no "tạo lệnh sản xuất". That is
 * the truthful affordance: `APP8-B03` nests creation under a specific order and
 * requires that order's exact approval snapshot and a satisfied deposit
 * obligation, so a standalone create button on the queue would be a form with
 * no order to submit against. The body says so rather than leaving the absence
 * unexplained.
 *
 * ### The filtered state names the conditions back
 *
 * Recovery is offered per filter, and only for filters that are actually on, so
 * the operator is never offered a control that would do nothing. The active
 * conditions are read back in the operator's own words — the status label the
 * pill uses, and the shortened order id — so they can see what to drop.
 */
export function ProductionQueueEmpty({ controller }: ProductionQueueEmptyProps) {
  const { filters, clearStatuses, clearOrderId, clearAll } = controller;

  if (!isProductionQueueFiltered(filters)) {
    return (
      <div className="production-panel" data-testid="production-queue-empty">
        <p className="production-panel__title">{PRODUCTION_QUEUE_COPY.states.emptyTitle}</p>
        <p className="production-panel__body">{PRODUCTION_QUEUE_COPY.states.emptyBody}</p>
        <Link className="production-panel__action" href={ADMIN_ORDERS_ROUTE}>
          {PRODUCTION_QUEUE_COPY.actions.openOrders}
        </Link>
      </div>
    );
  }

  const { states, filters: filterCopy } = PRODUCTION_QUEUE_COPY;
  const hasStatuses = filters.statuses.length > 0;
  const hasOrder = filters.orderId !== undefined;
  const conditions = [
    ...(hasStatuses
      ? [states.filteredEmptyStatuses(filters.statuses.map(productionStatusLabel).join(', '))]
      : []),
    ...(filters.orderId === undefined
      ? []
      : [states.filteredEmptyOrder(truncateIdentifier(filters.orderId))]),
  ].join(', ');

  return (
    <div className="production-panel" data-testid="production-queue-filter-empty">
      <p className="production-panel__title">{states.filteredEmptyTitle}</p>
      <p className="production-panel__body" data-testid="production-queue-filter-conditions">
        {states.filteredEmptyActive(conditions)}
      </p>
      <p className="production-panel__body">{states.filteredEmptyBody}</p>
      <div className="production-panel__actions">
        {hasStatuses ? (
          <button
            type="button"
            className="production-panel__action"
            data-testid="production-clear-status"
            onClick={clearStatuses}
          >
            {filterCopy.clearStatus}
          </button>
        ) : null}
        {hasOrder ? (
          <button
            type="button"
            className="production-panel__action"
            data-testid="production-clear-order"
            onClick={clearOrderId}
          >
            {filterCopy.clearOrder}
          </button>
        ) : null}
        {/* Offered only when clearing everything is genuinely different from
            clearing the one filter that is on. */}
        {hasStatuses && hasOrder ? (
          <button
            type="button"
            className="production-panel__action production-panel__action--primary"
            data-testid="production-clear-all"
            onClick={clearAll}
          >
            {filterCopy.clearAll}
          </button>
        ) : null}
      </div>
    </div>
  );
}
