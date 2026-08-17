'use client';

import { CUSTOM_REQUEST_QUEUE_COPY } from '../model/custom-request-queue-copy';
import { useCustomRequestQueueFilters } from '../hooks/use-custom-request-queue-filters';
import { CustomRequestQueueCollection } from './custom-request-queue-collection';
import { CustomRequestQueueFilterBar } from './custom-request-queue-filter-bar';

/**
 * `/requests` — the Admin custom-request queue (`662:3`).
 *
 * Composition only. The filter state lives in the URL and the collection owns
 * its own query, so this component holds no data and no derived list state.
 *
 * Read-only by construction: there is no create control (a customer raises a
 * request, an operator never does) and no moderation control (`APP5-A02` owns
 * the detail screen, `APP5-B05` owns the transitions). The one thing this screen
 * offers is entry into one request.
 */
export function CustomRequestQueueScreen() {
  const { filters, setStatus, setSubjectKind, reset } = useCustomRequestQueueFilters();

  return (
    <section className="custom-requests">
      <header className="custom-requests__header">
        <h1 className="custom-requests__title">{CUSTOM_REQUEST_QUEUE_COPY.page.title}</h1>
        <p className="custom-requests__subtitle">{CUSTOM_REQUEST_QUEUE_COPY.page.subtitle}</p>
      </header>

      <CustomRequestQueueFilterBar
        filters={filters}
        onStatusChange={setStatus}
        onSubjectKindChange={setSubjectKind}
        onReset={reset}
      />

      <CustomRequestQueueCollection filters={filters} onResetFilters={reset} />
    </section>
  );
}
