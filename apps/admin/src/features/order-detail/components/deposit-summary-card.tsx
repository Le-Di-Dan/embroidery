import type { AdminOrderPaymentsResponse } from '@embroidery/api-client';

import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { formatInstant } from '../../../shared/presentation/instant';
import { presentOrderStatus } from '../../../shared/presentation/order-status';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { presentDepositStatus } from '../model/payment-vocabulary';
import { DefinitionRow } from './definition-row';

interface DepositSummaryCardProps {
  readonly payments: AdminOrderPaymentsResponse;
}

/**
 * The DEPOSIT obligation and the two expected facts (`734:109`).
 *
 * ## Expected values are read-only, and visibly system-owned
 *
 * `expectedAmount` is the obligation's own frozen column — no deposit
 * percentage is recomputed here and no quotation or catalog price is read — and
 * `expectedTransferReference` is derived by the server from the order code and
 * stored nowhere, which is why nothing can contradict it. Both are rendered as
 * text under a heading that says so. There is no control that could edit either,
 * and the verify form deliberately does not prefill them into its observed
 * fields (`737:50`).
 *
 * ## Two status groups, never merged
 *
 * The obligation's state and the order's state are separate badges with separate
 * vocabularies (`751:3`). The order badge is the shared order presentation, so
 * an order is named the same word here as in the queue it was opened from.
 *
 * The satisfying attempt is shown once one exists, because "which attempt
 * settled this" is the first thing an operator checks against a bank statement.
 * It is shortened for the row with the full id in `title`.
 *
 * Only `DEPOSIT` appears. The remaining payment is not shown and is not
 * collectible in this phase, and `APP7-B04` publishes no obligation for it.
 */
export function DepositSummaryCard({ payments }: DepositSummaryCardProps) {
  // The custom order collects a DEPOSIT, and `APP12-A02-C1` publishes it as the
  // read's `currentObligation` rather than as flat `deposit*` members. The card
  // is unchanged in meaning: same obligation, same figures, read one level in.
  const obligation = payments.currentObligation;
  if (obligation === undefined) {
    return null;
  }
  const deposit = presentDepositStatus(obligation.status);
  const order = presentOrderStatus(payments.orderStatus);

  return (
    <section className="order-card" aria-labelledby="order-deposit-heading">
      <h2 className="order-card__title" id="order-deposit-heading">
        {COPY.sections.deposit}
      </h2>
      <p className="order-card__help">{COPY.sections.depositHelp}</p>

      <div className="order-card__badges">
        <span className="order-card__badge-group">
          <span className="order-card__badge-prefix">{COPY.deposit.obligationPrefix}</span>
          <AdminStatusBadge
            token={deposit.token}
            label={deposit.label}
            tone={deposit.tone}
            symbol={deposit.symbol}
            testId="deposit-status"
          />
        </span>
        <span className="order-card__badge-group">
          <span className="order-card__badge-prefix">{COPY.deposit.orderPrefix}</span>
          <AdminStatusBadge
            token={order.token}
            label={order.label}
            tone={order.tone}
            symbol={order.symbol}
            testId="order-status"
          />
        </span>
      </div>

      <div className="order-card__expected">
        <p className="order-card__expected-heading">{COPY.deposit.expectedHeading}</p>
        <dl className="order-card__definitions">
          <DefinitionRow label={COPY.deposit.expectedAmount} testId="deposit-expected-amount">
            {formatAmountWithCurrency(obligation.expectedAmount, obligation.expectedCurrencyCode)}
          </DefinitionRow>
          <DefinitionRow label={COPY.deposit.expectedReference} testId="deposit-expected-reference">
            {obligation.expectedTransferReference}
          </DefinitionRow>
        </dl>
        <p className="order-card__note">{COPY.deposit.expectedNote}</p>
      </div>

      {obligation.satisfiedAt === undefined &&
      obligation.satisfiedByAttemptId === undefined ? null : (
        <dl className="order-card__definitions">
          {obligation.satisfiedAt === undefined ? null : (
            <DefinitionRow label={COPY.deposit.satisfiedAt}>
              <time dateTime={obligation.satisfiedAt}>{formatInstant(obligation.satisfiedAt)}</time>
            </DefinitionRow>
          )}
          {obligation.satisfiedByAttemptId === undefined ? null : (
            <DefinitionRow
              label={COPY.deposit.satisfiedBy}
              title={obligation.satisfiedByAttemptId}
              testId="deposit-satisfied-by"
            >
              {truncateIdentifier(obligation.satisfiedByAttemptId)}
            </DefinitionRow>
          )}
        </dl>
      )}
    </section>
  );
}
