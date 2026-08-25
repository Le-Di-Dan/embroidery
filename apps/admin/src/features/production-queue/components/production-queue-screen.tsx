'use client';

import { useProductionQueueFilters } from '../hooks/use-production-queue-filters';
import { PRODUCTION_QUEUE_COPY } from '../model/production-queue-copy';
import { ProductionQueueCollection } from './production-queue-collection';
import { ProductionQueueFilterBar } from './production-queue-filter-bar';

/**
 * `/san-xuat` — the Admin production queue (`780:3`, `780:105`).
 *
 * Composition only. The filter state lives in the URL and the collection owns
 * its own query, so this component holds no data and no derived list state.
 *
 * Read-only by construction. There is no create control — `APP8-B03` nests
 * creation under a specific order and requires that order's exact approval and
 * a satisfied deposit, so a global "tạo lệnh" button here would be a form with
 * no order to submit against (`782:40` says so on the empty state itself) — and
 * no Start, Complete or Cancel control, because a transition is taken on the
 * job detail beside the reservation and approval facts it is judged against.
 * The one thing this screen offers is entry into one job.
 */
export function ProductionQueueScreen() {
  const controller = useProductionQueueFilters();

  return (
    <section className="production">
      <header className="production__header">
        <p className="production__breadcrumb">{PRODUCTION_QUEUE_COPY.page.breadcrumb}</p>
        <h1 className="production__title">{PRODUCTION_QUEUE_COPY.page.title}</h1>
        {/* States what the queue publishes and what it does not, so an operator
            who expects an `ORD-…` code learns where it lives (`780:29`). */}
        <p className="production__source">{PRODUCTION_QUEUE_COPY.page.source}</p>
      </header>

      <ProductionQueueFilterBar controller={controller} />

      <ProductionQueueCollection controller={controller} />
    </section>
  );
}
