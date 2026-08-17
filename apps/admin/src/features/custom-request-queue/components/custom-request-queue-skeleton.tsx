import { CUSTOM_REQUEST_QUEUE_COPY } from '../model/custom-request-queue-copy';

/** How many placeholder rows the skeleton draws. Enough to fill the fold. */
const SKELETON_ROWS = 6;

/**
 * The loading state (`662:112`).
 *
 * Placeholder rows in the queue's own geometry rather than a spinner, so the
 * page does not jump when the real rows land — and, more importantly, so the
 * empty state never flashes before the first page has settled: "chưa có yêu cầu
 * nào" while nothing is known would be a claim the screen cannot make.
 *
 * The bars are `aria-hidden` and a single `role="status"` line carries the
 * announcement; six rows of decorative rectangles announced individually would
 * be noise.
 */
export function CustomRequestQueueSkeleton() {
  return (
    <div className="custom-request-skeleton" data-testid="request-queue-skeleton">
      <p className="custom-request-skeleton__status" role="status">
        {CUSTOM_REQUEST_QUEUE_COPY.states.loading}
      </p>
      <ul className="custom-request-skeleton__rows" aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <li key={index} className="custom-request-skeleton__row">
            <span className="custom-request-skeleton__bar custom-request-skeleton__bar--code" />
            <span className="custom-request-skeleton__bar custom-request-skeleton__bar--status" />
            <span className="custom-request-skeleton__bar custom-request-skeleton__bar--subject" />
            <span className="custom-request-skeleton__bar custom-request-skeleton__bar--meta" />
          </li>
        ))}
      </ul>
    </div>
  );
}
