import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';

export interface LockedCapability {
  readonly label: string;
  readonly reason: string;
}

interface LockedCapabilityListProps {
  readonly entries: readonly LockedCapability[];
}

/**
 * "Chưa khả dụng ở bước này" — the capabilities this stage does not have, and
 * why (`809:84`).
 *
 * Named rather than merely absent, because an operator arriving at a
 * `PRODUCTION_COMPLETED` order needs to know that shipping, dispatch and
 * completion exist and what unlocks each one; a rail that simply showed nothing
 * would read as a screen that is missing something.
 *
 * These are **not** disabled buttons. Each row is inert text with no control
 * inside it, so there is nothing for a keyboard or a screen reader to reach and
 * nothing that could be re-enabled by an inspector. The reasons are the
 * lifecycle's own, stated in the operator's language — they are not a guard, and
 * the server re-proves every one of them.
 */
export function LockedCapabilityList({ entries }: LockedCapabilityListProps) {
  return (
    <section className="order-card" aria-labelledby="fulfillment-locked-heading">
      <h2 className="order-card__title" id="fulfillment-locked-heading">
        {COPY.locked.title}
      </h2>
      <dl className="order-fulfillment__locked" data-testid="fulfillment-locked">
        {entries.map((entry) => (
          <div className="order-fulfillment__locked-row" key={entry.label}>
            <dt className="order-fulfillment__locked-label">{entry.label}</dt>
            <dd className="order-fulfillment__locked-reason">{entry.reason}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
