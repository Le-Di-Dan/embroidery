'use client';

import { useCallback } from 'react';

import { useOrderPaymentsQuery, useOrderRefresh } from '../hooks/use-order-detail-queries';
import { selectActionableAttempt } from '../model/actionable-attempt';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { classifyOrderReadFailure } from '../model/order-detail-failure';
import { paymentTerminologyFor } from '../model/payment-terminology';
import { DepositSummaryCard } from './deposit-summary-card';
import { PaymentActionCard } from './payment-action-card';
import { PaymentAttemptList } from './payment-attempt-list';
import { PaymentEvidenceList } from './payment-evidence-list';
import { ReconciliationHistory } from './reconciliation-history';

interface DepositPaymentPanelProps {
  readonly orderId: string;
  /**
   * The order origin's payment vocabulary (`V01-UX-006`, `APP12-V02` §24).
   *
   * Passed down rather than derived: §24 requires the branch to be explicit,
   * and `origin` is the only authority for it.
   */
  readonly origin: string;
}

/**
 * The deposit workbench — everything `adminOrderPayment_read` publishes, and
 * nothing else (`734:109`…`734:163`, `736:109`…`736:164`).
 *
 * ## One query, one truth
 *
 * The whole panel is composed from a single payment read under a stable,
 * order-scoped key. Every card below is a pure projection of it; none fetches
 * anything of its own except the evidence bytes, which are a different kind of
 * thing entirely. That is what makes "re-read after a decision" a complete
 * refresh of the panel rather than a per-card scatter.
 *
 * ## What is deliberately not rendered
 *
 * No provider fields, no provider events, no raw outbox or audit JSON, no
 * storage metadata and no remaining-payment action. None of them is in the
 * response, and the remaining payment is neither shown nor collectible in this
 * phase — `DEPOSIT_PAID` is the last state APP7 owns.
 *
 * ## The evidence list can invalidate the panel, but never write to it
 *
 * `previewEligible` is computed when the read is taken and can go stale. When a
 * preview is refused, the evidence list asks for the payment metadata to be
 * re-read — a refetch of the same query, not a mutation. Opening or failing to
 * open an image changes no payment state anywhere.
 */
export function DepositPaymentPanel({ orderId, origin }: DepositPaymentPanelProps) {
  const terms = paymentTerminologyFor(origin);
  const query = useOrderPaymentsQuery(orderId);
  const { refreshPayments } = useOrderRefresh(orderId);

  const handleMetadataStale = useCallback(() => {
    void refreshPayments();
  }, [refreshPayments]);

  if (query.isPending) {
    return (
      <p className="order-panel__loading" role="status" data-testid="order-payments-loading">
        {COPY.failure.loading}
      </p>
    );
  }

  if (query.isError) {
    const failure = classifyOrderReadFailure(query.error);
    return (
      <div className="order-panel__failure" role="alert" data-testid="order-payments-error">
        <p className="order-panel__failure-title">
          {failure === 'missing' ? COPY.failure.detailMissingTitle : COPY.failure.detailRetryTitle}
        </p>
        <p className="order-panel__failure-body">
          {failure === 'missing'
            ? COPY.failure.detailMissingBody
            : failure === 'unauthenticated'
              ? COPY.failure.unauthenticated
              : COPY.failure.detailRetryBody}
        </p>
        {failure === 'retryable' ? (
          <button
            type="button"
            className="order-panel__action"
            data-testid="order-payments-retry"
            onClick={() => {
              void query.refetch();
            }}
          >
            {COPY.failure.retry}
          </button>
        ) : null}
      </div>
    );
  }

  const payments = query.data;
  const attempt = selectActionableAttempt(payments);

  return (
    <div className="order-panel" data-testid="order-payment-panel">
      <DepositSummaryCard payments={payments} />
      <PaymentAttemptList attempts={payments.attempts} />
      <PaymentEvidenceList
        orderId={orderId}
        evidence={payments.attempts.flatMap((candidate) => candidate.evidence)}
        onMetadataStale={handleMetadataStale}
        terms={terms}
      />
      <PaymentActionCard orderId={orderId} payments={payments} attempt={attempt} terms={terms} />
      <ReconciliationHistory reconciliations={payments.reconciliations} />
    </div>
  );
}
