'use client';

import { presentOrderStatus } from '../../../shared/presentation/order-status';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import type { PaymentDecisionPhase } from '../hooks/use-payment-decision';
import {
  attemptStatusCaption,
  presentAttemptStatus,
  presentDepositStatus,
} from '../model/payment-vocabulary';
import { DefinitionRow } from './definition-row';

interface PaymentDecisionStatusProps {
  readonly phase: PaymentDecisionPhase;
  /** True in the review dialog, whose success wording differs from a verify. */
  readonly fromReview: boolean;
}

/**
 * How every settled or in-flight state of a payment decision is reported
 * (`740:3`, `740:56`, `741:51`, `741:87`).
 *
 * ## `REQUIRES_REVIEW` is an outcome, not an error
 *
 * The single most important thing this component does is refuse to render a
 * mismatch as a failure. `APP7-B04` answered `200`, wrote a reconciliation row
 * and moved the attempt — a durable business transition (`740:105`). So it gets
 * an outcome heading, a state table and a next step, and the words "xác nhận
 * thất bại" appear nowhere in this file or in the copy it draws from.
 *
 * ## Success requires all three facts
 *
 * "Đã xác nhận tiền cọc" is rendered only for a `verified` outcome, which the
 * model grants only when the attempt is `SUCCEEDED`, the deposit `SATISFIED` and
 * the order `DEPOSIT_PAID` together. Anything else the contract can produce
 * reports neutrally and points at the refetched truth. There is no shared "đã
 * thanh toán" badge for an evidence or attempt state to reach (`751:3`).
 *
 * ## The two recovery states speak plainly
 *
 * The ambiguous state says the answer is being re-checked, never that the
 * verification failed, and the unchanged result invites an explicit re-send of
 * the same values rather than performing one. The conflict state says another
 * operator acted first and that the current truth has been reloaded —
 * `741:121`: no lock, transaction, version or contention language reaches an
 * operator.
 *
 * `role="status"` for the in-flight bands and `role="alert"` for the settled
 * ones, so a decision the operator is waiting on is announced when it lands.
 */
export function PaymentDecisionStatus({ phase, fromReview }: PaymentDecisionStatusProps) {
  if (phase.kind === 'idle' || phase.kind === 'running') {
    return null;
  }

  if (phase.kind === 'reconciling') {
    return (
      <div
        className="payment-outcome payment-outcome--checking"
        role="status"
        data-testid="payment-reconciling"
      >
        <p className="payment-outcome__title">
          {phase.reason === 'ambiguous' ? COPY.ambiguity.title : COPY.stale.title}
        </p>
        <p className="payment-outcome__body">
          {phase.reason === 'ambiguous' ? COPY.ambiguity.checking : COPY.stale.checking}
        </p>
      </div>
    );
  }

  if (phase.kind === 'unchanged') {
    return (
      <div
        className="payment-outcome payment-outcome--checking"
        role="alert"
        data-testid="payment-unchanged"
      >
        <p className="payment-outcome__badge">{COPY.ambiguity.badge}</p>
        <p className="payment-outcome__title">{COPY.ambiguity.unchangedTitle}</p>
        <p className="payment-outcome__body">{COPY.ambiguity.unchangedBody}</p>
      </div>
    );
  }

  if (phase.kind === 'stale') {
    return (
      <div
        className="payment-outcome payment-outcome--stale"
        role="alert"
        data-testid="payment-stale"
      >
        <p className="payment-outcome__badge">{COPY.stale.badge}</p>
        <p className="payment-outcome__title">{COPY.stale.title}</p>
        <p className="payment-outcome__body">{COPY.stale.body}</p>
      </div>
    );
  }

  if (phase.kind === 'failed') {
    const title =
      phase.failure === 'invalid'
        ? COPY.failure.decisionInvalidTitle
        : phase.failure === 'missing'
          ? COPY.failure.decisionMissingTitle
          : COPY.failure.decisionRetryTitle;
    const body =
      phase.failure === 'invalid'
        ? COPY.failure.decisionInvalidBody
        : phase.failure === 'missing'
          ? COPY.failure.decisionMissingBody
          : phase.failure === 'unauthenticated'
            ? COPY.failure.unauthenticated
            : COPY.failure.decisionRetryBody;
    return (
      <div
        className="payment-outcome payment-outcome--failed"
        role="alert"
        data-testid="payment-failed"
      >
        <p className="payment-outcome__title">{title}</p>
        <p className="payment-outcome__body">{body}</p>
      </div>
    );
  }

  const { outcome, reconciled } = phase;
  const attempt = presentAttemptStatus(outcome.attemptStatus);
  const deposit = presentDepositStatus(outcome.depositStatus);
  const order = presentOrderStatus(outcome.orderStatus);

  const heading =
    outcome.kind === 'verified'
      ? {
          badge: COPY.outcome.successBadge,
          title: COPY.outcome.successTitle,
          body: COPY.outcome.successBody,
        }
      : outcome.kind === 'requiresReview'
        ? {
            badge: COPY.outcome.reviewBadge,
            title: fromReview ? COPY.outcome.reviewRecordedTitle : COPY.outcome.reviewTitle,
            body: fromReview ? COPY.outcome.reviewRecordedBody : COPY.outcome.reviewBody,
          }
        : { badge: '', title: COPY.outcome.otherTitle, body: COPY.outcome.otherBody };

  return (
    <div
      className={`payment-outcome payment-outcome--${outcome.kind}`}
      role="alert"
      data-testid="payment-outcome"
      data-outcome={outcome.kind}
    >
      {heading.badge === '' ? null : <p className="payment-outcome__badge">{heading.badge}</p>}
      <p className="payment-outcome__title">{heading.title}</p>
      <p className="payment-outcome__body">{heading.body}</p>

      {outcome.replayed || reconciled ? (
        <p className="payment-outcome__note" data-testid="payment-outcome-replayed">
          {COPY.outcome.replayed}
        </p>
      ) : null}

      <p className="payment-outcome__heading">{COPY.outcome.heading}</p>
      <dl className="order-card__definitions">
        <DefinitionRow label={COPY.outcome.attempt} testId="outcome-attempt">
          <AdminStatusBadge
            token={attempt.token}
            label={attemptStatusCaption(outcome.attemptStatus)}
            tone={attempt.tone}
            symbol={attempt.symbol}
          />
        </DefinitionRow>
        <DefinitionRow label={COPY.outcome.obligation} testId="outcome-deposit">
          <AdminStatusBadge
            token={deposit.token}
            label={deposit.label}
            tone={deposit.tone}
            symbol={deposit.symbol}
          />
        </DefinitionRow>
        <DefinitionRow label={COPY.outcome.order} testId="outcome-order">
          <AdminStatusBadge
            token={order.token}
            label={order.label}
            tone={order.tone}
            symbol={order.symbol}
          />
        </DefinitionRow>
      </dl>

      {outcome.kind === 'verified' ? (
        <p className="order-card__note">{COPY.outcome.successNote}</p>
      ) : null}
      {outcome.kind === 'requiresReview' && !fromReview ? (
        <p className="order-card__note">{COPY.outcome.reviewNote}</p>
      ) : null}
    </div>
  );
}
