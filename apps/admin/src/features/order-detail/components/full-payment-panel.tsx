'use client';

import { useState } from 'react';

import type { AdminOrderPaymentsResponse } from '@embroidery/api-client';

import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { STATUS_SYMBOLS } from '../../../shared/presentation/order-status';
import { READY_MADE_DETAIL_COPY as COPY } from '../model/ready-made-detail-copy';
import { selectActionableAttempt } from '../model/actionable-attempt';
import { DefinitionRow } from './definition-row';
import { PaymentEvidenceList } from './payment-evidence-list';
import { VerifyDepositDialog } from './verify-deposit-dialog';

interface FullPaymentPanelProps {
  readonly orderId: string;
  readonly payments: AdminOrderPaymentsResponse;
  /** Re-reads the payment metadata when a preview proves `previewEligible` stale. */
  readonly onMetadataStale: () => void;
}

/**
 * The single `FULL` payment workbench (`913:337`, `914:361`).
 *
 * ## It is the deposit workbench's `FULL` variant, not a second workbench
 *
 * The reconciliation dialog, the evidence list and the decision hook are the
 * **delivered APP7 components**, reused unchanged: the expected/observed
 * comparison, the two decisions, the lost-response recovery and the
 * supporting-only evidence semantics are all the same behaviour against a
 * different obligation kind. `APP12-A02-C1` created no Ready-Made verifier, and
 * `adminPaymentAttempt_verify` is the same operation a deposit is verified
 * through.
 *
 * ## Every figure is the server's
 *
 * The amount is the `FULL` obligation's own frozen column and the reference is
 * the memo the server derived for that kind (`…FL`). Nothing here adds a
 * subtotal to a fee, subtracts a deposit or re-derives a total: `APP12-A02-C1`
 * §18 makes the persisted obligation amount the verification authority, and it
 * is the figure an operator compares a real bank statement against.
 *
 * ## "No obligation yet" is a state, not an error
 *
 * A Ready-Made order at `AWAITING_SHIPPING_FEE` has no `FULL` at all
 * (`BR-029`), and the read answers `200` with none. The panel says so — the
 * obligation appears when the fee is confirmed — rather than rendering a
 * failure for an order that is simply not priced yet.
 *
 * ## The current attempt is the contract's, never chosen here
 *
 * `payments.attempts` are the attempts of the **live** obligation, listed from
 * its own id. After a fee correction the predecessor is superseded and its
 * attempts are not in this list at all, so a stale attempt cannot be presented
 * as the current one and its evidence cannot migrate to the successor. This
 * panel does no filtering to achieve that; the isolation is the read's.
 *
 * ## Nothing is optimistic
 *
 * No paid state is projected. After a decision the caller re-reads and this
 * panel renders whatever committed — including a mismatch routed to review,
 * which is a durable business outcome and not a form error.
 */
export function FullPaymentPanel({ orderId, payments, onMetadataStale }: FullPaymentPanelProps) {
  // The **attempt id**, not a boolean. A verification that settles makes the
  // attempt stop being actionable, so a dialog gated on `actionable` would
  // unmount at the exact moment it had an outcome to report — the operator
  // would submit and watch the panel vanish. Holding the id is what the
  // delivered deposit card does, and for this reason.
  const [verifyingAttemptId, setVerifyingAttemptId] = useState<string | null>(null);
  const obligation = payments.currentObligation;
  const actionable = selectActionableAttempt(payments);

  if (obligation === undefined) {
    return (
      <section className="order-card" aria-labelledby="full-payment-heading">
        <h2 className="order-card__title" id="full-payment-heading">
          {COPY.payment.heading}
        </h2>
        <p className="order-card__empty" data-testid="full-payment-empty">
          {COPY.payment.emptyBody}
        </p>
        <p className="order-card__note">{COPY.payment.note}</p>
      </section>
    );
  }

  // The attempt shown is the newest one on the live obligation. `attempts` is
  // oldest-first, so that is the last element — the same rule the deposit
  // workbench uses, and it addresses the same list.
  const current = payments.attempts.at(-1);
  const settled = obligation.status === 'SATISFIED';

  return (
    <section className="order-card" aria-labelledby="full-payment-heading">
      <h2 className="order-card__title" id="full-payment-heading">
        {COPY.payment.heading}
      </h2>

      <dl className="order-card__definitions">
        <DefinitionRow label={COPY.payment.amount} testId="full-payment-amount">
          {formatAmountWithCurrency(obligation.expectedAmount, obligation.expectedCurrencyCode)}
        </DefinitionRow>
        <DefinitionRow label={COPY.payment.status} testId="full-payment-status">
          <AdminStatusBadge
            token={obligation.status}
            label={obligation.status}
            tone={settled ? 'success' : 'warning'}
            symbol={settled ? STATUS_SYMBOLS.succeeded : STATUS_SYMBOLS.waiting}
            testId="full-payment-obligation-badge"
          />
        </DefinitionRow>
        <DefinitionRow label={COPY.payment.reference} testId="full-payment-reference">
          {obligation.expectedTransferReference}
        </DefinitionRow>
      </dl>

      {current === undefined ? (
        <p className="order-card__empty" data-testid="full-payment-no-attempt">
          {COPY.payment.noAttempt}
        </p>
      ) : (
        <section className="order-card__subsection" aria-label={COPY.payment.attemptHeading}>
          <h3 className="order-card__subtitle">{COPY.payment.attemptHeading}</h3>
          <dl className="order-card__definitions">
            <DefinitionRow label={COPY.payment.attemptStatus} testId="full-attempt-status">
              {current.status}
            </DefinitionRow>
            <DefinitionRow label={COPY.payment.attemptAmount} testId="full-attempt-amount">
              {formatAmountWithCurrency(current.amount, current.currencyCode)}
            </DefinitionRow>
          </dl>

          {/* Supporting material only. The list is the delivered APP7 component,
              and its status is never read as a payment fact. */}
          <PaymentEvidenceList
            orderId={orderId}
            evidence={current.evidence}
            onMetadataStale={onMetadataStale}
          />
          <p className="order-card__note">{COPY.payment.evidenceNote}</p>
        </section>
      )}

      {/*
        The action below is primary (`V01-UX-003`; `APP12-V02` §13.1). It is the
        write that settles money, and V01 measured it as the same white outline
        as `Cập nhật phí` above it — the screen gave the operator no way to see
        which of the two decisions was the irreversible one.
      */}
      {actionable === undefined ? null : (
        <button
          type="button"
          className="order-card__action order-card__action--primary"
          data-testid="full-payment-verify"
          onClick={() => setVerifyingAttemptId(actionable.attemptId)}
        >
          {COPY.payment.verify}
        </button>
      )}

      {settled ? (
        <p className="order-card__settled" data-testid="full-payment-settled">
          {COPY.payment.settled}
        </p>
      ) : null}

      <p className="order-card__note">{COPY.payment.note}</p>

      {verifyingAttemptId === null ? null : (
        <VerifyDepositDialog
          orderId={orderId}
          attemptId={verifyingAttemptId}
          payments={payments}
          onClose={() => setVerifyingAttemptId(null)}
        />
      )}
    </section>
  );
}
