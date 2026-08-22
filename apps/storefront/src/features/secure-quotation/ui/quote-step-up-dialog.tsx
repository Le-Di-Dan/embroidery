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
import { SECURE_QUOTATION_COPY as COPY } from '../model/secure-quotation-copy';
import { QuotationDialog } from './quotation-dialog';

/**
 * Step-up re-verification, run **inside** `/truy-cap/bao-gia` (`701:3`).
 *
 * ### Why it is embedded and not a navigation
 *
 * §8 forbids sending the customer to `/xac-minh-lien-he` for this. Leaving the
 * page would unmount the secure session, and with it the credential — which
 * lives in one ephemeral ref, because the fragment that carried it was stripped
 * before the first request and cannot be read a second time. The customer would
 * verify successfully and return to a landing that no longer had a link to
 * open. So the flow happens over the quotation, behind a scrim, and the secure
 * session is never interrupted.
 *
 * ### Why nothing was re-implemented
 *
 * This is the whole APP4 verification machine — the same controller, the same
 * three approved cards, the same code lifetime — differing in exactly one
 * field: `purpose: STEP_UP`. That parameter was pushed down to the transport
 * seam so that `/xac-minh-lien-he` and this dialog run one implementation. No
 * new code format, no second cooldown constant, no second reducer.
 *
 * ### The contact question
 *
 * `701:66` shows the code already sent to a masked number, as if the
 * destination were known. It is not: `APP6-B04` returns no contact — by design,
 * §17 — and `APP4-B03` requires one to issue a challenge. So the customer names
 * their contact first, and the server decides whether it is one of the grant
 * customer's own verified, active contact points; a contact that is not is
 * refused there, not here. The mask on the code card is still the server's own.
 *
 * ### Verifying is not accepting
 *
 * When the code is accepted this dialog calls `onVerified` and does nothing
 * else. It never accepts the quotation. What follows is the controller's
 * mandatory re-read and, if the version still stands, a return to the
 * confirmation where the customer presses accept again (§9).
 */
interface QuoteStepUpDialogProps {
  readonly onVerified: () => void;
  readonly onCancel: () => void;
}

export function QuoteStepUpDialog({ onVerified, onCancel }: QuoteStepUpDialogProps) {
  const verification = useContactVerification({ purpose: VERIFICATION_PURPOSES.STEP_UP });
  const { state } = verification;

  const counting = state.status === 'CODE_ENTRY' && !isResendAvailable(state.challenge, Date.now());
  const nowMs = useNow(counting);
  const uiState = verificationUiState(state, nowMs);

  /**
   * Success is reported once.
   *
   * The reducer holds `SUCCESS` for as long as the dialog is mounted, so
   * without this the re-read would be requested on every subsequent render.
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
    <QuotationDialog title={COPY.stepUp.title} onDismiss={onCancel}>
      <p className="secure-quotation__dialog-body">{COPY.stepUp.body}</p>
      <p className="secure-quotation__dialog-note">{COPY.stepUp.stay}</p>

      <div className="secure-quotation__step-up">{renderCard()}</div>

      <p className="secure-quotation__dialog-note">{COPY.stepUp.safety}</p>
      <div className="secure-quotation__dialog-actions">
        <button type="button" className="secure-quotation__button" onClick={onCancel}>
          {COPY.stepUp.cancel}
        </button>
      </div>
    </QuotationDialog>
  );

  function renderCard() {
    switch (uiState) {
      case 'SUCCESS':
        // The re-read is already on its way; saying so is more honest than
        // showing a "continue" the customer would have to press for nothing.
        return <p className="secure-quotation__dialog-body">{COPY.stepUp.verified}</p>;
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
