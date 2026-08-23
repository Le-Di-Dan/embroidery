'use client';

import { useState } from 'react';

import type { ReviewPaymentAttemptBody } from '@embroidery/api-client';

import { usePaymentDecision } from '../hooks/use-payment-decision';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import {
  EMPTY_REVIEW_FORM,
  hasErrors,
  toReviewBody,
  validateReviewForm,
  type ReviewFormErrors,
  type ReviewFormValues,
} from '../model/payment-decision-command';
import { reviewPaymentAttempt } from '../services/payment-decision.service';
import { PaymentDecisionStatus } from './payment-decision-status';
import { PaymentDialog } from './payment-dialog';
import { PaymentField } from './payment-field';

interface ReviewAttemptDialogProps {
  readonly orderId: string;
  readonly attemptId: string;
  readonly onClose: () => void;
}

/**
 * Routing one attempt to manual reconciliation (`740:111`).
 *
 * ## The caller chooses no status
 *
 * `740:117`: the endpoint itself means `REQUIRES_REVIEW`. There is no status
 * control here, no admin id and no expected value — the generated body has a
 * field for none of them, and this dialog adds none. What it sends is a reason
 * and, optionally, what the operator has actually seen.
 *
 * ## Omitting an observation records nothing, not zero
 *
 * Both observed fields are optional and both start empty (`740:131`). An empty
 * box omits the property from the body entirely: "no transaction has appeared
 * yet" is an absence, and writing `0` into a reconciliation row would put a
 * figure in the audit trail that nobody observed. The reference here carries the
 * same non-constraints as in the verify form — free text, submitted verbatim.
 *
 * ## The result is read back, never assumed
 *
 * The response is a receipt; the panel behind this dialog re-reads the payment
 * truth and renders the persisted state. A lost response and a concurrent
 * conflict are handled by the same hook the verification uses, for the same
 * reasons — a review writes an immutable reconciliation row, so concluding
 * failure from a dropped connection would be just as wrong here.
 */
export function ReviewAttemptDialog({ orderId, attemptId, onClose }: ReviewAttemptDialogProps) {
  const [values, setValues] = useState<ReviewFormValues>(EMPTY_REVIEW_FORM);
  const [errors, setErrors] = useState<ReviewFormErrors>({});

  const decision = usePaymentDecision<ReviewPaymentAttemptBody>({
    orderId,
    attemptId,
    send: reviewPaymentAttempt,
  });

  const settled = decision.phase.kind === 'settled';
  const update = (patch: Partial<ReviewFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  const submit = () => {
    if (decision.busy) return;
    const found = validateReviewForm(values);
    setErrors(found);
    if (hasErrors(found)) return;
    decision.run(toReviewBody(values));
  };

  return (
    <PaymentDialog
      title={COPY.review.title}
      describedBy="review-dialog-help"
      testId="review-dialog"
      onDismiss={() => {
        if (!decision.busy) onClose();
      }}
    >
      <p className="payment-dialog__help" id="review-dialog-help">
        {COPY.review.help}
      </p>

      {settled ? null : (
        <section className="payment-dialog__observed" aria-label={COPY.review.title}>
          {hasErrors(errors) ? (
            <p className="payment-dialog__validation" role="alert" data-testid="review-validation">
              {COPY.validation.heading}
            </p>
          ) : null}

          <PaymentField
            label={COPY.review.reasonLabel}
            value={values.reviewReason}
            onChange={(reviewReason) => update({ reviewReason })}
            required
            requiredLabel={COPY.verify.required}
            optionalLabel={COPY.review.optional}
            help={COPY.review.reasonHelp}
            multiline
            disabled={decision.busy}
            testId="review-reason"
            {...(errors.reviewReason === undefined ? {} : { error: errors.reviewReason })}
          />

          <PaymentField
            label={COPY.review.amountLabel}
            value={values.observedAmount}
            onChange={(observedAmount) => update({ observedAmount })}
            required={false}
            requiredLabel={COPY.verify.required}
            optionalLabel={COPY.review.optional}
            help={COPY.verify.amountHelp}
            placeholder={COPY.review.amountPlaceholder}
            inputMode="decimal"
            disabled={decision.busy}
            testId="review-observed-amount"
            {...(errors.observedAmount === undefined ? {} : { error: errors.observedAmount })}
          />

          <PaymentField
            label={COPY.review.referenceLabel}
            value={values.observedTransferReference}
            onChange={(observedTransferReference) => update({ observedTransferReference })}
            required={false}
            requiredLabel={COPY.verify.required}
            optionalLabel={COPY.review.optional}
            help={COPY.verify.referenceHelp}
            placeholder={COPY.review.referencePlaceholder}
            multiline
            disabled={decision.busy}
            testId="review-observed-reference"
          />

          <p className="payment-dialog__warning">{COPY.review.optionalNote}</p>
        </section>
      )}

      <PaymentDecisionStatus phase={decision.phase} fromReview />

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
            data-testid="review-submit"
            onClick={submit}
          >
            {decision.phase.kind === 'running' ? COPY.verify.submitting : COPY.actions.review}
          </button>
        )}
        <button
          type="button"
          className="payment-dialog__dismiss"
          disabled={decision.busy}
          data-testid="review-dismiss"
          onClick={onClose}
        >
          {settled ? COPY.actions.close : COPY.actions.dismiss}
        </button>
      </div>
    </PaymentDialog>
  );
}
