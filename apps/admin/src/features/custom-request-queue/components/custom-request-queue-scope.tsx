import { CUSTOM_REQUEST_QUEUE_COPY } from '../model/custom-request-queue-copy';
import { appliedScopeLabels } from '../model/custom-request-presentation';

interface CustomRequestQueueScopeProps {
  /** `appliedStatuses` exactly as the server echoed it for this page. */
  readonly appliedStatuses: readonly string[];
}

/**
 * What the queue is actually showing (`662:3`).
 *
 * The sentence is built from the server's `appliedStatuses` and from nothing
 * else. That matters: with no explicit filter `APP5-B04` applies the triage set
 * itself, so a screen that printed its own idea of the default would drift the
 * moment the backend's default changed — and a screen that said "tất cả yêu
 * cầu" would be wrong today, because a queue filtered to three states is not the
 * whole table.
 *
 * Rendered only once a page has answered; before that nothing is known and
 * nothing is claimed.
 */
export function CustomRequestQueueScope({ appliedStatuses }: CustomRequestQueueScopeProps) {
  if (appliedStatuses.length === 0) {
    return null;
  }

  return (
    <div className="custom-request-scope" data-testid="request-queue-scope">
      <p className="custom-request-scope__applied">
        {CUSTOM_REQUEST_QUEUE_COPY.scope.applied(appliedScopeLabels(appliedStatuses).join(', '))}
      </p>
      <p className="custom-request-scope__note">{CUSTOM_REQUEST_QUEUE_COPY.scope.note}</p>
    </div>
  );
}
