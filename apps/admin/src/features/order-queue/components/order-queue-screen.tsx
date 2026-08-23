'use client';

import { useOrderQueueFilters } from '../hooks/use-order-queue-filters';
import { ORDER_QUEUE_COPY } from '../model/order-queue-copy';
import { OrderQueueCollection } from './order-queue-collection';
import { OrderQueueFilterBar } from './order-queue-filter-bar';

/**
 * `/orders` — the Admin order queue (`732:3`, `732:110`).
 *
 * Composition only. The filter state lives in the URL and the collection owns
 * its own query, so this component holds no data and no derived list state.
 *
 * Read-only by construction: there is no create control (an order is created by
 * the conversion worker from an approved design, never by an operator) and no
 * payment control at all — the deposit workbench lives on the order detail,
 * because a decision that can move money must be taken next to the expected and
 * observed facts it is judged against. The one thing this screen offers is
 * entry into one order.
 */
export function OrderQueueScreen() {
  const { filters, toggleStatus, reset } = useOrderQueueFilters();

  return (
    <section className="orders">
      <header className="orders__header">
        <p className="orders__breadcrumb">{ORDER_QUEUE_COPY.page.breadcrumb}</p>
        <h1 className="orders__title">{ORDER_QUEUE_COPY.page.title}</h1>
        <p className="orders__subtitle">{ORDER_QUEUE_COPY.page.subtitle}</p>
      </header>

      <OrderQueueFilterBar filters={filters} onToggleStatus={toggleStatus} onReset={reset} />

      <OrderQueueCollection filters={filters} onResetFilters={reset} />
    </section>
  );
}
