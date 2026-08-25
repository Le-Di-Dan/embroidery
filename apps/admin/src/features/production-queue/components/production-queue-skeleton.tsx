import { PRODUCTION_QUEUE_COPY } from '../model/production-queue-copy';

/** How many placeholder rows the skeleton draws (`782:124` draws six). */
const SKELETON_ROWS = 6;

/**
 * The loading state (`782:89`).
 *
 * Placeholder rows in the queue's own geometry rather than a spinner, so the
 * page does not jump when the real rows land — and, more importantly, so the
 * empty state never flashes before the first page has settled. `782:205` is
 * explicit about it: "0 kết quả" while nothing is known would be a claim the
 * screen cannot make.
 *
 * The bars are `aria-hidden` and a single `role="status"` line carries the
 * announcement, so the loading state is *told* rather than shown as a silent
 * skeleton.
 */
export function ProductionQueueSkeleton() {
  return (
    <div className="production-skeleton" data-testid="production-queue-skeleton">
      <p className="production-skeleton__status" role="status">
        {PRODUCTION_QUEUE_COPY.states.loading}
      </p>
      <ul className="production-skeleton__rows" aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <li key={index} className="production-skeleton__row">
            <span className="production-skeleton__bar production-skeleton__bar--job" />
            <span className="production-skeleton__bar production-skeleton__bar--order" />
            <span className="production-skeleton__bar production-skeleton__bar--approval" />
            <span className="production-skeleton__bar production-skeleton__bar--status" />
            <span className="production-skeleton__bar production-skeleton__bar--meta" />
          </li>
        ))}
      </ul>
      <p className="production-skeleton__note">{PRODUCTION_QUEUE_COPY.states.loadingNote}</p>
    </div>
  );
}
