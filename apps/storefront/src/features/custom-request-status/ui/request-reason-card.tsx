import { CUSTOM_REQUEST_STATUS_COPY as COPY } from '../model/custom-request-status-copy';
import type { StatusTone } from '../model/status-presentation';

/**
 * The workshop's message to this customer (`661:178` needs-clarification,
 * `661:246` rejected, `661:314` cancelled; `661:372` mobile).
 *
 * ### The one field, and why the component cannot render another
 *
 * This card takes a **string**, not a request. There is no transition, no note,
 * no moderator, no history and no audit metadata in its props — not because
 * those are unused, but because they are unreachable: `APP5-B03` returns only
 * `customerVisibleReason`, `APP5-B05` keeps the internal reason and the
 * moderation note on rows this endpoint never reads, and the projection between
 * them carries one optional string. A component that accepted more would be the
 * place a future edit leaked it.
 *
 * The note beneath (`661:181`) tells the customer the same thing in their own
 * words, so the separation is visible rather than merely true.
 *
 * `B05` allows a transition with no customer-facing message. The card still
 * renders — the state is the thing the customer came to read — and says so,
 * rather than showing an empty panel that reads as content failing to load.
 */
export function RequestReasonCard({
  title,
  reason,
  tone,
}: {
  title: string;
  reason: string | undefined;
  tone: StatusTone;
}) {
  return (
    <section
      className={`request-status__card request-status__card--${tone.toLowerCase()}`}
      aria-labelledby="request-reason-title"
    >
      <h2 className="request-status__card-title" id="request-reason-title">
        {title}
      </h2>
      <p className="request-status__reason-body">{reason ?? COPY.reason.absent}</p>
      <p className="request-status__card-note">{COPY.reason.note}</p>
    </section>
  );
}
