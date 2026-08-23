import { SECURE_DEPOSIT_COPY as COPY } from '../model/secure-deposit-copy';
import { DepositNote } from './deposit-note';
import { DepositStatusPill } from './deposit-status-pill';

/**
 * `749:3` — the workshop is reconciling this transfer.
 *
 * ## What this card must not contain
 *
 * No Admin note, no review reason, no observed amount, no observed reference, no
 * reconciliation history, no internal mismatch. §21 forbids all of them and the
 * customer contract publishes none of them, so there is no field here to leak:
 * the screen literally has nothing to say beyond what is written below, which is
 * the safest form the rule can take — a prop that does not exist cannot be
 * passed by a later edit.
 *
 * ## It is not a failure, and evidence stays open
 *
 * The obligation is untouched and the order is untouched; the customer is told
 * plainly not to send more money. The evidence list and its intake stay
 * available beneath this card (`749:23`), because a reconciliation is precisely
 * when another image helps — that is decided by `evidenceIntakeOpen`, which
 * deliberately does not treat `REQUIRES_REVIEW` as a closed attempt.
 */
export function AttemptReviewCard() {
  return (
    <section className="secure-deposit__card" aria-labelledby="secure-deposit-review">
      <DepositStatusPill tone="PROGRESS" label={COPY.review.badge} />
      <h2 className="secure-deposit__card-title" id="secure-deposit-review">
        {COPY.review.title}
      </h2>
      <p className="secure-deposit__body">{COPY.review.body}</p>
      <DepositNote tone="INFO">{COPY.review.note}</DepositNote>
    </section>
  );
}
