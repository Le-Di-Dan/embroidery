'use client';

import { useEffect, useRef } from 'react';

import {
  CodeEntryCard,
  ContactEntryCard,
  contactEntryAlertOf,
  VerificationOutcomeCard,
  VERIFICATION_PURPOSES,
  isResendAvailable,
  useContactVerification,
  useNow,
  verificationUiState,
} from '../../contact-verification';
import { ORDER_ACCESS_COPY as COPY } from '../model/order-access-copy';
import { OrderDialog } from './order-dialog';

/**
 * Step-up re-verification, run **inside** `/truy-cap/don-hang` (§18).
 *
 * ### Why it is embedded and not a navigation
 *
 * Sending the customer to `/xac-minh-lien-he` would unmount the secure session,
 * and with it the credential — which lives in one ephemeral ref because the
 * fragment that carried it was stripped before the first request and cannot be
 * read a second time (§34). The customer would verify successfully and return
 * to a landing with no link to open, in the middle of paying. So the flow
 * happens over the payment screen, behind a scrim, and the secure session is
 * never interrupted.
 *
 * ### Why nothing was re-implemented (§18, §24 of the prompt's prohibitions)
 *
 * This is the whole APP4 verification machine — the same controller, the same
 * three approved cards, the same code lifetime, the same cooldown — differing
 * in exactly one field: `purpose: STEP_UP`. That parameter was pushed down to
 * the transport seam by `APP6-S01` so that `/xac-minh-lien-he`, the quotation
 * decision, the deposit, the remaining balance and this dialog all run one
 * implementation. There is no second OTP mechanism here, no second code format
 * and no second reducer, and `917:404` records the rule the design holds this
 * package to: *không có luồng xác minh thứ hai*.
 *
 * ### Possession of the link is not authority to pay
 *
 * `APP12-B04` locks the initiation behind a delivered step-up precisely so an
 * `ORDER_ACCESS` token that leaked — a forwarded message, a shared screen —
 * cannot by itself open a payment attempt. This dialog is the customer proving
 * the contact is still theirs, and §18 forbids treating the token alone as
 * enough.
 *
 * ### Verifying is not paying
 *
 * When the code is accepted this dialog calls `onVerified` and does nothing
 * else. It does not open an attempt, does not touch the obligation and
 * certainly does not settle a payment. What follows is the controller resuming
 * the *same* initiation, with the same idempotency key, because a step-up is
 * evidence that an action may proceed and never the action itself.
 */
interface OrderStepUpDialogProps {
  readonly onVerified: () => void;
  readonly onCancel: () => void;
}

export function OrderStepUpDialog({ onVerified, onCancel }: OrderStepUpDialogProps) {
  const verification = useContactVerification({ purpose: VERIFICATION_PURPOSES.STEP_UP });
  const { state } = verification;

  const counting = state.status === 'CODE_ENTRY' && !isResendAvailable(state.challenge, Date.now());
  const nowMs = useNow(counting);
  const uiState = verificationUiState(state, nowMs);

  /**
   * Success is reported once.
   *
   * The reducer holds `SUCCESS` for as long as the dialog is mounted, so
   * without this the initiation would be re-issued on every subsequent render —
   * and this one opens payment attempts.
   */
  const reportedRef = useRef(false);
  const verifiedRef = useRef(onVerified);
  verifiedRef.current = onVerified;
  useEffect(() => {
    if (uiState !== 'SUCCESS' || reportedRef.current) return;
    reportedRef.current = true;
    verifiedRef.current();
  }, [uiState]);

  return (
    <OrderDialog title={COPY.stepUp.title} onDismiss={onCancel}>
      <p className="secure-order__dialog-body">{COPY.stepUp.body}</p>
      <p className="secure-order__dialog-note">{COPY.stepUp.stay}</p>

      <div className="secure-order__step-up">{renderCard()}</div>

      <p className="secure-order__dialog-note">{COPY.stepUp.safety}</p>
      <div className="secure-order__dialog-actions">
        <button type="button" className="secure-order__button" onClick={onCancel}>
          {COPY.stepUp.cancel}
        </button>
      </div>
    </OrderDialog>
  );

  function renderCard() {
    switch (uiState) {
      case 'SUCCESS':
        // The initiation is already on its way; saying so is more honest than
        // showing a "continue" the customer would have to press for nothing.
        return <p className="secure-order__dialog-body">{COPY.stepUp.verified}</p>;
      case 'EXPIRED':
      case 'LOCKED':
      case 'RECOVERABLE_ERROR':
        return (
          <VerificationOutcomeCard
            kind={uiState}
            recipientMasked={state.recipientMasked}
            onAction={verification.requestCode}
          />
        );
      case 'CODE_ENTRY':
      case 'COOLDOWN':
      case 'MISMATCH':
      case 'RESEND_AVAILABLE':
      case 'VERIFYING':
        return state.challenge === undefined ? null : (
          <CodeEntryCard
            challenge={state.challenge}
            nowMs={nowMs}
            verifying={uiState === 'VERIFYING'}
            resending={verification.isResending}
            notice={state.notice}
            onSubmit={verification.submitCode}
            onResend={verification.resendCode}
          />
        );
      default:
        return (
          <ContactEntryCard
            contact={state.contact}
            invalid={uiState === 'INVALID_CONTACT'}
            submitting={uiState === 'REQUESTING'}
            alert={contactEntryAlertOf(uiState)}
            onContactChange={verification.setContact}
            onSubmit={verification.requestCode}
          />
        );
    }
  }
}
