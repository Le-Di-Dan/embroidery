import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';

/**
 * The loading state (`FIG-APP5-A02-DETAIL-DESKTOP-LOADING`, `667:3`).
 *
 * The placeholder blocks are `aria-hidden`: they are a shape, not information,
 * and a screen reader announcing eight empty boxes tells the operator nothing.
 * The one thing that *is* announced is the status line, which says the request
 * is loading — so the state is perceivable without seeing the skeleton.
 */
export function CustomRequestDetailSkeleton() {
  return (
    <section
      className="request-detail request-detail--loading"
      data-testid="request-detail-loading"
    >
      <p className="request-detail__sr-status" role="status" aria-live="polite">
        {COPY.states.loading}
      </p>
      <div className="request-detail__skeleton" aria-hidden="true">
        <span className="request-detail__skeleton-line request-detail__skeleton-line--title" />
        <span className="request-detail__skeleton-line" />
        <span className="request-detail__skeleton-block" />
        <span className="request-detail__skeleton-block" />
      </div>
    </section>
  );
}
