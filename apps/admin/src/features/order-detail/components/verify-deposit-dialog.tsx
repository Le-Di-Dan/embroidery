'use client';

import { useState } from 'react';

import type { AdminOrderPaymentsResponse, VerifyPaymentAttemptBody } from '@embroidery/api-client';

import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { usePaymentDecision } from '../hooks/use-payment-decision';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import {
  EMPTY_VERIFY_FORM,
  hasErrors,
  toVerifyBody,
  validateVerifyForm,
  type VerifyFormErrors,
  type VerifyFormValues,
} from '../model/payment-decision-command';
import type { PaymentTerminology } from '../model/payment-terminology';
import { verifyPaymentAttempt } from '../services/payment-decision.service';
import { DefinitionRow } from './definition-row';
import { ExpectedObservedTable } from './expected-observed-table';
import { PaymentDecisionStatus } from './payment-decision-status';
import { PaymentDialog } from './payment-dialog';
import { PaymentField } from './payment-field';

interface VerifyDepositDialogProps {
  readonly orderId: string;
  readonly attemptId: string;
  readonly payments: AdminOrderPaymentsResponse;
  readonly onClose: () => void;
  /**
   * The order origin's own vocabulary (`V01-UX-006`, `APP12-V02` §24).
   *
   * The title, the expected-amount label and the submit control all said
   * “tiền cọc” on a Ready-Made `FULL` obligation, which has no deposit. The
   * caller passes the branch explicitly from the order's `origin`; this dialog
   * infers nothing from the obligation kind.
   */
  readonly terms: PaymentTerminology;
}

/**
 * The deposit verification form and every way it can end (`737:3`, `737:57`,
 * `737:110`, `740:3`, `740:56`).
 *
 * ## Expected and observed are separated, and never bridged
 *
 * The expected block is read-only text under a badge that says the system
 * generated it. The observed block is three empty inputs under a badge that says
 * the operator fills them from a bank statement. Nothing prefills an observed
 * field from an expected one, and there is no "same as expected" affordance —
 * `737:50` is explicit about why: an operator handed the system's own
 * expectation can only confirm it back, instead of transcribing what the bank
 * actually recorded. That would turn a verification into a rubber stamp.
 *
 * ## The reference field carries no client-side rules
 *
 * No pattern, no maximum length, no uppercasing, no trimming. The contract
 * publishes an unrestricted string; the value is submitted exactly as typed. See
 * `payment-decision-command.ts` for the full reasoning.
 *
 * ## Submitting cannot double-fire, and a lost response is not a failure
 *
 * The submit control is disabled while a decision is in flight or being
 * reconciled, and the hook behind it drops a second call synchronously — but
 * that is UX protection only; the server remains the financial concurrency
 * authority. When the transport dies without an answer, the dialog stays open in
 * a "đang kiểm tra lại" state, re-reads the payment truth, and shows the
 * outcome that actually committed. The typed values survive that path on
 * purpose: the recovery from an unchanged state is re-sending *exactly the same
 * values*, which `APP7-B04` converges on.
 *
 * ## Resolving a review reuses this exact form
 *
 * There is no resolve-review endpoint and none is invented (`741:50`). An
 * attempt in `REQUIRES_REVIEW` is resolved by reopening this dialog, entering
 * what the bank now shows and verifying — the server records it as
 * `RESOLVE_REVIEW`.
 */
export function VerifyDepositDialog({
  orderId,
  attemptId,
  payments,
  onClose,
  terms,
}: VerifyDepositDialogProps) {
  const [values, setValues] = useState<VerifyFormValues>(EMPTY_VERIFY_FORM);
  const [errors, setErrors] = useState<VerifyFormErrors>({});

  const decision = usePaymentDecision<VerifyPaymentAttemptBody>({
    orderId,
    attemptId,
    send: verifyPaymentAttempt,
  });

  const settled = decision.phase.kind === 'settled';
  const update = (patch: Partial<VerifyFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  const submit = () => {
    if (decision.busy) return;
    const found = validateVerifyForm(values);
    setErrors(found);
    if (hasErrors(found)) return;
    decision.run(toVerifyBody(values));
  };

  // The expected facts are the **current** obligation's, whichever kind it is
  // (`APP12-A02-C1`): the deposit on a custom order, the FULL on a Ready-Made
  // one. They are read from the server's obligation and never composed here —
  // an amount this dialog derived would be the figure an operator then compares
  // a real bank statement against.
  //
  // `undefined` is unreachable from the mounted path — the dialog opens only
  // for an actionable attempt, which requires a `PENDING` obligation — but it
  // is handled rather than asserted away, because the alternative is a
  // reconciliation screen rendering `undefined` where an amount belongs.
  const obligation = payments.currentObligation;
  if (obligation === undefined) {
    return null;
  }

  const expectedAmount = formatAmountWithCurrency(
    obligation.expectedAmount,
    obligation.expectedCurrencyCode,
  );

  return (
    <PaymentDialog
      title={terms.dialogTitle}
      describedBy="verify-dialog-help"
      testId="verify-dialog"
      onDismiss={() => {
        // A dismiss mid-flight would leave a financial mutation running with
        // nothing on screen to report its outcome.
        if (!decision.busy) onClose();
      }}
    >
      <p className="payment-dialog__help" id="verify-dialog-help">
        {COPY.verify.help}
      </p>

      <section className="payment-dialog__expected" aria-label={COPY.verify.expectedBadge}>
        <p className="payment-dialog__badge">
          {COPY.verify.expectedBadge}
          <span className="payment-dialog__badge-note">{COPY.verify.expectedBadgeNote}</span>
        </p>
        <dl className="order-card__definitions">
          <DefinitionRow label={terms.expectedAmount} testId="verify-expected-amount">
            {expectedAmount}
          </DefinitionRow>
          <DefinitionRow label={COPY.deposit.expectedReference} testId="verify-expected-reference">
            {obligation.expectedTransferReference}
          </DefinitionRow>
        </dl>
      </section>

      {settled ? null : (
        <section className="payment-dialog__observed" aria-label={COPY.verify.observedBadge}>
          <p className="payment-dialog__badge">
            {COPY.verify.observedBadge}
            <span className="payment-dialog__badge-note">{COPY.verify.observedBadgeNote}</span>
          </p>

          {hasErrors(errors) ? (
            <p className="payment-dialog__validation" role="alert" data-testid="verify-validation">
              {COPY.validation.heading}
            </p>
          ) : null}

          <PaymentField
            label={COPY.verify.amountLabel}
            value={values.observedAmount}
            onChange={(observedAmount) => update({ observedAmount })}
            required
            requiredLabel={COPY.verify.required}
            optionalLabel={COPY.review.optional}
            help={COPY.verify.amountHelp}
            placeholder={COPY.verify.amountPlaceholder}
            inputMode="decimal"
            disabled={decision.busy}
            testId="verify-observed-amount"
            {...(errors.observedAmount === undefined ? {} : { error: errors.observedAmount })}
          />

          <PaymentField
            label={COPY.verify.referenceLabel}
            value={values.observedTransferReference}
            onChange={(observedTransferReference) => update({ observedTransferReference })}
            required
            requiredLabel={COPY.verify.required}
            optionalLabel={COPY.review.optional}
            help={COPY.verify.referenceHelp}
            placeholder={COPY.verify.referencePlaceholder}
            multiline
            disabled={decision.busy}
            testId="verify-observed-reference"
            {...(errors.observedTransferReference === undefined
              ? {}
              : { error: errors.observedTransferReference })}
          />

          <PaymentField
            label={COPY.verify.noteLabel}
            value={values.note}
            onChange={(note) => update({ note })}
            required
            requiredLabel={COPY.verify.required}
            optionalLabel={COPY.review.optional}
            help={COPY.verify.noteHelp}
            placeholder={COPY.verify.notePlaceholder}
            multiline
            disabled={decision.busy}
            testId="verify-note"
            {...(errors.note === undefined ? {} : { error: errors.note })}
          />

          <p className="payment-dialog__warning">{COPY.verify.prefillWarning}</p>
        </section>
      )}

      {settled ? (
        <ExpectedObservedTable
          expectedAmount={expectedAmount}
          expectedReference={obligation.expectedTransferReference}
          observedAmount={values.observedAmount}
          observedReference={values.observedTransferReference}
        />
      ) : null}

      <PaymentDecisionStatus phase={decision.phase} fromReview={false} terms={terms} />

      <p className="payment-dialog__sr-status" role="status" aria-live="polite">
        {decision.phase.kind === 'running' ? COPY.verify.submitting : ''}
      </p>

      <div className="payment-dialog__actions">
        {settled ? null : (
          <button
            type="button"
            className="payment-dialog__submit"
            disabled={decision.busy}
            aria-busy={decision.busy}
            data-testid="verify-submit"
            onClick={submit}
          >
            {decision.phase.kind === 'running' ? COPY.verify.submitting : terms.submit}
          </button>
        )}
        <button
          type="button"
          className="payment-dialog__dismiss"
          disabled={decision.busy}
          data-testid="verify-dismiss"
          onClick={onClose}
        >
          {settled ? COPY.actions.close : COPY.actions.dismiss}
        </button>
      </div>
    </PaymentDialog>
  );
}
