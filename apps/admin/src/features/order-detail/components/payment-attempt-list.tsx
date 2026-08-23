import type { AdminPaymentAttemptResponse } from '@embroidery/api-client';

import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { formatInstant } from '../../../shared/presentation/instant';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { attemptStatusCaption, presentAttemptStatus } from '../model/payment-vocabulary';
import { DefinitionRow } from './definition-row';

interface PaymentAttemptListProps {
  readonly attempts: readonly AdminPaymentAttemptResponse[];
}

/**
 * Every attempt against this deposit, oldest first (`734:128`, `736:128`).
 *
 * Rendered exactly as `APP7-B04` returns them, with no client-side ordering: the
 * server's order is stable with an id tie-breaker, and re-sorting would move
 * rows under the operator while they read.
 *
 * ## `PENDING` is not "the customer paid"
 *
 * `734:147` is the note this list exists to carry: an attempt in `PENDING` means
 * transfer instructions were generated, and nothing more. The system has no way
 * to know whether money left the customer's account, which is exactly why an
 * operator has to verify against a bank statement. The note is rendered beside
 * the state rather than left implicit.
 *
 * ## No provider anything
 *
 * `method` is shown because LC-16 publishes it and APP7 opens `BANK_TRANSFER`
 * only, so an attempt claiming anything else is a fact the operator should see.
 * There is no provider reference, no provider event, no raw outbox or audit
 * JSON and no redirect anywhere on this card — none of it is in `APP7-B04`'s
 * response and none is invented.
 *
 * The optional timestamps are shown only when the contract sent them. An absent
 * `succeededAt` is an attempt that has not succeeded, not a blank to fill in.
 */
export function PaymentAttemptList({ attempts }: PaymentAttemptListProps) {
  if (attempts.length === 0) {
    return (
      <section className="order-card" aria-labelledby="order-attempts-heading">
        <h2 className="order-card__title" id="order-attempts-heading">
          {COPY.sections.attempts}
        </h2>
        <p className="order-card__help" data-testid="order-attempts-empty">
          {COPY.attempts.empty}
        </p>
      </section>
    );
  }

  return (
    <section className="order-card" aria-labelledby="order-attempts-heading">
      <h2 className="order-card__title" id="order-attempts-heading">
        {COPY.sections.attempts}
      </h2>
      <p className="order-card__help">{COPY.sections.attemptsHelp}</p>

      <ul className="order-attempts">
        {attempts.map((attempt) => {
          const status = presentAttemptStatus(attempt.status);
          return (
            <li className="order-attempt" key={attempt.attemptId} data-testid="order-attempt">
              <div className="order-attempt__badges">
                <AdminStatusBadge
                  token={status.token}
                  label={attemptStatusCaption(attempt.status)}
                  tone={status.tone}
                  symbol={status.symbol}
                  testId="attempt-status"
                />
                <span className="order-attempt__method">{attempt.method}</span>
              </div>

              <dl className="order-card__definitions">
                <DefinitionRow label={COPY.attempts.amount} testId="attempt-amount">
                  {formatAmountWithCurrency(attempt.amount, attempt.currencyCode)}
                </DefinitionRow>
                <DefinitionRow label={COPY.attempts.createdAt}>
                  <time dateTime={attempt.createdAt}>{formatInstant(attempt.createdAt)}</time>
                </DefinitionRow>
                <DefinitionRow label={COPY.attempts.updatedAt}>
                  <time dateTime={attempt.updatedAt}>{formatInstant(attempt.updatedAt)}</time>
                </DefinitionRow>
                {attempt.expiresAt === undefined ? null : (
                  <DefinitionRow label={COPY.attempts.expiresAt}>
                    <time dateTime={attempt.expiresAt}>{formatInstant(attempt.expiresAt)}</time>
                  </DefinitionRow>
                )}
                {attempt.succeededAt === undefined ? null : (
                  <DefinitionRow label={COPY.attempts.succeededAt}>
                    <time dateTime={attempt.succeededAt}>{formatInstant(attempt.succeededAt)}</time>
                  </DefinitionRow>
                )}
                {attempt.failedAt === undefined ? null : (
                  <DefinitionRow label={COPY.attempts.failedAt}>
                    <time dateTime={attempt.failedAt}>{formatInstant(attempt.failedAt)}</time>
                  </DefinitionRow>
                )}
                {attempt.reviewReason === undefined ? null : (
                  <DefinitionRow label={COPY.attempts.reviewReason} testId="attempt-review-reason">
                    {attempt.reviewReason}
                  </DefinitionRow>
                )}
              </dl>

              {attempt.status === 'PENDING' ? (
                <p className="order-card__note">{COPY.attempts.pendingNote}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
