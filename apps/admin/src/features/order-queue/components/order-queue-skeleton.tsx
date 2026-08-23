import { ORDER_QUEUE_COPY } from '../model/order-queue-copy';

/** How many placeholder rows the skeleton draws. Enough to fill the fold. */
const SKELETON_ROWS = 6;

/**
 * The loading state.
 *
 * Placeholder rows in the queue's own geometry rather than a spinner, so the
 * page does not jump when the real rows land — and, more importantly, so the
 * empty state never flashes before the first page has settled: "chưa có đơn hàng
 * nào" while nothing is known would be a claim the screen cannot make.
 *
 * The bars are `aria-hidden` and a single `role="status"` line carries the
 * announcement, which is what `753:120` asks for: the loading state is *told*
 * rather than shown as a silent skeleton.
 */
export function OrderQueueSkeleton() {
  return (
    <div className="order-skeleton" data-testid="order-queue-skeleton">
      <p className="order-skeleton__status" role="status">
        {ORDER_QUEUE_COPY.states.loading}
      </p>
      <ul className="order-skeleton__rows" aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <li key={index} className="order-skeleton__row">
            <span className="order-skeleton__bar order-skeleton__bar--code" />
            <span className="order-skeleton__bar order-skeleton__bar--status" />
            <span className="order-skeleton__bar order-skeleton__bar--total" />
            <span className="order-skeleton__bar order-skeleton__bar--meta" />
          </li>
        ))}
      </ul>
    </div>
  );
}
