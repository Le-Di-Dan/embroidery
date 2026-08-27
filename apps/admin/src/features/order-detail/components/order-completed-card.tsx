import { formatInstant } from '../../../shared/presentation/instant';
import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';
import { DefinitionRow } from './definition-row';

interface OrderCompletedCardProps {
  readonly deliveredAt: string | null;
}

/**
 * `COMPLETED` — the terminal state, rendered as a record with no controls
 * (`815:191`).
 *
 * There is no button in this component. Not a reopen, not a cancel, not a
 * refund, not an edit, not a second dispatch and not a second completion — and
 * none of them disabled either, because a disabled control is still a claim that
 * the capability exists. `COMPLETED` is terminal in LC-14 and every APP9 command
 * would refuse from here.
 *
 * The list of what is gone is rendered rather than left to inference, so an
 * operator can tell that this screen deliberately ends here. Commercial
 * cancellation and refund are deferred (`PO-APP9-001 = OPTION A — DEFER`) — they
 * are not merely missing from this state, they have no Admin surface anywhere in
 * this phase, and the closing sentence says so instead of implying they live on
 * some other screen.
 */
export function OrderCompletedCard({ deliveredAt }: OrderCompletedCardProps) {
  return (
    <section
      className="order-card"
      aria-labelledby="completed-heading"
      data-testid="order-completed"
    >
      <h2 className="order-card__title" id="completed-heading">
        {COPY.completed.title}
      </h2>

      {deliveredAt === null ? null : (
        <dl className="order-card__definitions">
          <DefinitionRow label={COPY.completion.deliveredAtLabel} testId="delivered-at">
            <time dateTime={deliveredAt}>{formatInstant(deliveredAt)}</time>
          </DefinitionRow>
        </dl>
      )}

      <div className="order-fulfillment__gap">
        <p className="order-fulfillment__gap-title">{COPY.completed.noActionsTitle}</p>
        <ul className="order-fulfillment__no-actions">
          {COPY.completed.noActions.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </div>

      <p className="order-card__note">{COPY.completed.deferred}</p>
    </section>
  );
}
