import type { AdminRequestTransitionResponse } from '@embroidery/api-client';

import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import { actorLabel, presentInstant, presentStatus } from '../model/request-detail-presentation';

interface RequestTransitionHistoryProps {
  readonly transitions: readonly AdminRequestTransitionResponse[];
}

/**
 * The whole recorded history of one request (`665:3`, `665:115`).
 *
 * ### Rendered in the order the server returned
 *
 * `APP5-B04` returns the history oldest first by append sequence, and that order
 * is reproduced as received. The list is not re-sorted client-side: `sequence`
 * is the server's append authority, and a screen that sorted by `occurredAt`
 * would reorder two moves recorded in the same millisecond and quietly disagree
 * with the audit record.
 *
 * ### No synthetic creation row
 *
 * Submission writes no transition (`G01-D05`), so a request nobody has moderated
 * has an empty history — and this component says so instead of inventing a
 * "created" entry. That fabricated row would be the only entry in the list whose
 * `sequence` belonged to nothing, and it would claim an actor that never acted.
 *
 * ### The two reasons stay two reasons
 *
 * Each entry labels the internal reason and the customer-visible text
 * separately, and neither is ever filled in from the other. An operator reading
 * the history has to be able to see exactly what the customer was told — which
 * is a different question from why the decision was taken.
 */
export function RequestTransitionHistory({ transitions }: RequestTransitionHistoryProps) {
  return (
    <section className="request-detail__panel" aria-labelledby="request-history-heading">
      <h2 className="request-detail__panel-title" id="request-history-heading">
        {COPY.sections.history}
      </h2>

      {transitions.length === 0 ? (
        <p className="request-detail__hint" data-testid="request-history-empty">
          {COPY.history.empty}
        </p>
      ) : (
        <ol className="request-timeline" data-testid="request-history">
          {transitions.map((transition) => (
            <li className="request-timeline__entry" key={transition.sequence}>
              <p className="request-timeline__headline">
                <span className="request-timeline__sequence">
                  {`${COPY.history.sequence} ${String(transition.sequence)}`}
                </span>
                <span className="request-timeline__move">
                  {`${presentStatus(transition.fromStatus).label} → ${presentStatus(transition.toStatus).label}`}
                </span>
              </p>
              <p className="request-timeline__meta">
                {`${COPY.history.actor}: ${actorLabel(transition)} · ${COPY.history.occurredAt}: ${presentInstant(transition.occurredAt)}`}
              </p>
              <dl className="request-timeline__reasons">
                <dt className="request-detail__term">{COPY.reason.internal}</dt>
                <dd className="request-detail__value" data-testid="transition-internal-reason">
                  {transition.internalReason ?? COPY.reason.none}
                </dd>
                <dt className="request-detail__term">{COPY.reason.customerVisible}</dt>
                <dd className="request-detail__value" data-testid="transition-customer-reason">
                  {transition.customerVisibleReason ?? COPY.reason.none}
                </dd>
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
