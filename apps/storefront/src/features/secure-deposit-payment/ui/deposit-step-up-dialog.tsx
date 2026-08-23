'use client';

import { useEffect, useRef } from 'react';

import {
  CodeEntryCard,
  ContactEntryCard,
  VerificationOutcomeCard,
  VERIFICATION_PURPOSES,
  isResendAvailable,
  useContactVerification,
  useNow,
  verificationUiState,
} from '../../contact-verification';
import { SECURE_DEPOSIT_COPY as COPY } from '../model/secure-deposit-copy';
import { DepositDialog } from './deposit-dialog';

/**
 * Step-up re-verification, run **inside** `/truy-cap/thanh-toan` (`747:41`,
 * reusing `APP6-D01`'s `701:3`).
 *
 * ### Why it is embedded and not a navigation
 *
 * §6 forbids sending the customer to `/xac-minh-lien-he` for this. Leaving the
 * page would unmount the secure session, and with it the credential — which
 * lives in one ephemeral ref, because the fragment that carried it was stripped
 * before the first request and cannot be read a second time. The customer would
 * verify successfully and return to a landing with no link to open, in the middle
 * of paying. So the flow happens over the payment screen, behind a scrim, and the
 * secure session is never interrupted.
 *
 * ### Why nothing was re-implemented
 *
 * This is the whole APP4 verification machine — the same controller, the same
 * three approved cards, the same code lifetime, the same cooldown — differing in
 * exactly one field: `purpose: STEP_UP`. That parameter was pushed down to the
 * transport seam by `APP6-S01` so that `/xac-minh-lien-he`, the quotation
 * decision and this dialog all run one implementation. There is no second OTP
 * mechanism here, no second code format and no second reducer.
 *
 * ### Verifying is not paying
 *
 * When the code is accepted this dialog calls `onVerified` and does nothing else.
 * It does not open an attempt, does not touch the deposit and certainly does not
 * settle a payment. What follows is the controller resuming the *same*
 * initiation, with the same idempotency key, because a step-up is evidence that
 * an action may proceed and never the action itself.
 */
interface DepositStepUpDialogProps {
  readonly onVerified: () => void;
  readonly onCancel: () => void;
}

export function DepositStepUpDialog({ onVerified, onCancel }: DepositStepUpDialogProps) {
  const verification = useContactVerification({ purpose: VERIFICATION_PURPOSES.STEP_UP });
  const { state } = verification;

  const counting = state.status === 'CODE_ENTRY' && !isResendAvailable(state.challenge, Date.now());
  const nowMs = useNow(counting);
  const uiState = verificationUiState(state, nowMs);

  /**
   * Success is reported once.
   *
   * The reducer holds `SUCCESS` for as long as the dialog is mounted, so without
   * this the initiation would be re-issued on every subsequent render — and this
   * one opens payment attempts.
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
    <DepositDialog title={COPY.stepUp.title} onDismiss={onCancel}>
      <p className="secure-deposit__dialog-body">{COPY.stepUp.body}</p>
      <p className="secure-deposit__dialog-note">{COPY.stepUp.stay}</p>

      <div className="secure-deposit__step-up">{renderCard()}</div>

      <p className="secure-deposit__dialog-note">{COPY.stepUp.safety}</p>
      <div className="secure-deposit__dialog-actions">
        <button type="button" className="secure-deposit__button" onClick={onCancel}>
          {COPY.stepUp.cancel}
        </button>
      </div>
    </DepositDialog>
  );

  function renderCard() {
    switch (uiState) {
      case 'SUCCESS':
        // The initiation is already on its way; saying so is more honest than
        // showing a "continue" the customer would have to press for nothing.
        return <p className="secure-deposit__dialog-body">{COPY.stepUp.verified}</p>;
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
            contactKind={state.contactKind}
            contact={state.contact}
            invalid={uiState === 'INVALID_CONTACT'}
            submitting={uiState === 'REQUESTING'}
            rateLimited={uiState === 'RATE_LIMITED'}
            onContactKindChange={verification.setContactKind}
            onContactChange={verification.setContact}
            onSubmit={verification.requestCode}
          />
        );
    }
  }
}
