'use client';

import { useState } from 'react';

import type {
  AdminOrderPaymentsResponse,
  AdminPaymentAttemptResponse,
} from '@embroidery/api-client';

import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { ReviewAttemptDialog } from './review-attempt-dialog';
import type { PaymentTerminology } from '../model/payment-terminology';
import { VerifyDepositDialog } from './verify-deposit-dialog';

interface PaymentActionCardProps {
  readonly orderId: string;
  readonly payments: AdminOrderPaymentsResponse;
  /** The attempt the controls address, or `undefined` when none is open. */
  readonly attempt: AdminPaymentAttemptResponse | undefined;
  /** The origin's payment vocabulary, forwarded to the verification dialog. */
  readonly terms: PaymentTerminology;
}

const REQUIRES_REVIEW = 'REQUIRES_REVIEW';

/**
 * The two reconciliation controls (`734:155`, `741:43`).
 *
 * ## Two actions, and no third
 *
 * "Xác nhận đã nhận tiền cọc" is `adminPaymentAttempt_verify`; "Đưa vào cần đối
 * chiếu" is `adminPaymentAttempt_review`. There is no "resolve review" control,
 * because there is no such endpoint and inventing one would be inventing a
 * lifecycle: an attempt already in `REQUIRES_REVIEW` is resolved by *reopening
 * the verification*, which is why the labels change on that state rather than a
 * third button appearing (`741:44`, `741:50`).
 *
 * There is deliberately no checkbox saying the operator has seen an image that
 * proves payment. Evidence is not the basis of a verification — the received
 * amount is (`734:162`) — and a control that made a screenshot feel like the
 * grounds for releasing an order would invert the whole authority model.
 *
 * ## The controls disappear when there is nothing to reconcile
 *
 * A satisfied deposit hides them entirely (`741:114`): the work is done, even if
 * it was another operator who did it, and offering an action the server would
 * refuse is offering a dead end. An order with no open attempt shows the same
 * settled note.
 *
 * ## Zero evidence changes nothing here
 *
 * The verification control's availability is decided by the obligation and the
 * attempt, never by the evidence list. A deposit with no screenshots at all is
 * verified through exactly this control, in exactly this state.
 */
/**
 * Which dialog is open, and the attempt it was opened against.
 *
 * The attempt id is captured at open time rather than read from the props on
 * every render. That is load-bearing: a successful verification satisfies the
 * deposit, which removes the actionable attempt — so a dialog derived from the
 * current props would unmount itself at the exact moment it has a result to
 * show. The operator would watch the success they were waiting for disappear.
 */
type OpenDialog = { readonly kind: 'verify' | 'review'; readonly attemptId: string };

export function PaymentActionCard({ orderId, payments, attempt, terms }: PaymentActionCardProps) {
  const [openDialog, setOpenDialog] = useState<OpenDialog | null>(null);

  const dialogs =
    openDialog === null ? null : (
      <>
        {openDialog.kind === 'verify' ? (
          <VerifyDepositDialog
            orderId={orderId}
            attemptId={openDialog.attemptId}
            payments={payments}
            terms={terms}
            onClose={() => setOpenDialog(null)}
          />
        ) : (
          <ReviewAttemptDialog
            orderId={orderId}
            attemptId={openDialog.attemptId}
            terms={terms}
            onClose={() => setOpenDialog(null)}
          />
        )}
      </>
    );

  const awaitingReview = attempt?.status === REQUIRES_REVIEW;

  // One tree, always. An early return for the settled case would put `{dialogs}`
  // at a different position in a differently-shaped element tree, and React
  // would unmount and remount the dialog the moment the deposit became
  // satisfied — discarding the very decision state that has the result to show.
  return (
    <section className="order-card" aria-labelledby="order-actions-heading">
      <h2 className="order-card__title" id="order-actions-heading">
        {COPY.sections.actions}
      </h2>

      {attempt === undefined ? (
        <p className="order-card__note" data-testid="order-actions-settled">
          {terms.settledNote}
        </p>
      ) : (
        <>
          {awaitingReview ? (
            <div className="order-card__review-state" data-testid="order-requires-review">
              <p className="order-card__review-title">{COPY.requiresReview.title}</p>
              <p className="order-card__help">{COPY.requiresReview.body}</p>
            </div>
          ) : null}

          <div className="order-card__actions">
            <button
              type="button"
              className="order-card__action order-card__action--primary"
              data-testid="open-verify-dialog"
              onClick={() => setOpenDialog({ kind: 'verify', attemptId: attempt.attemptId })}
            >
              {awaitingReview ? terms.reopenSubmit : terms.submit}
            </button>
            <button
              type="button"
              className="order-card__action"
              data-testid="open-review-dialog"
              onClick={() => setOpenDialog({ kind: 'review', attemptId: attempt.attemptId })}
            >
              {awaitingReview ? COPY.actions.reviewAgain : COPY.actions.review}
            </button>
          </div>

          <p className="order-card__note">{COPY.actions.note}</p>
          {awaitingReview ? (
            <p className="order-card__note">{COPY.requiresReview.resolveNote}</p>
          ) : null}
        </>
      )}

      {/* A dialog opened while the deposit was still open stays mounted until
          the operator closes it — that is where its result is reported. */}
      {dialogs}
    </section>
  );
}
