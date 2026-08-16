'use client';

/**
 * Step 2 (`652:3` … `652:229`) — `APP4`'s verification, embedded rather than
 * redrawn.
 *
 * Every state on screen here is an `APP4-D01` frame rendered by the `APP4`
 * component that already implements it: contact entry, code sent, mismatch,
 * expiry/lockout/rate-limit and success. `APP5-D01` reuses those frames by
 * reference (its own §F reuse map), so re-implementing them would be a second
 * copy of an approved design that could only diverge.
 *
 * What is `APP5`'s is the surrounding step: no `h1` (the screen owns the one
 * landmark heading), and the success card is not the end of a flow but the gate
 * that unlocks step 3.
 */
import {
  CodeEntryCard,
  ContactEntryCard,
  VerificationOutcomeCard,
  isResendAvailable,
  useNow,
  verificationUiState,
  type ContactVerification,
} from '../../contact-verification';
import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';

export interface VerificationStepProps {
  readonly verification: ContactVerification;
  /** Already-verified: the outcome card is replaced by the step-3 unlock. */
  readonly verified: boolean;
}

export function VerificationStep({ verification, verified }: VerificationStepProps) {
  const { state } = verification;
  const counting = state.status === 'CODE_ENTRY' && !isResendAvailable(state.challenge, Date.now());
  const nowMs = useNow(counting);
  const uiState = verificationUiState(state, nowMs);

  return (
    <section
      className="custom-request__section"
      aria-label={CUSTOM_REQUEST_COPY.verification.heading}
    >
      <h2 className="custom-request__section-heading">
        {CUSTOM_REQUEST_COPY.verification.heading}
      </h2>
      <p className="custom-request__hint">{CUSTOM_REQUEST_COPY.verification.intro}</p>

      {/*
        The two transitions that render no alert of their own, announced once —
        the same gap `APP4-S01` covers on its own route (`634:145`).
      */}
      <p className="custom-request__visually-hidden" aria-live="polite">
        {uiState === 'REQUESTING' || uiState === 'VERIFYING'
          ? CUSTOM_REQUEST_COPY.verification.intro
          : ''}
      </p>

      {renderCard()}
    </section>
  );

  function renderCard() {
    if (verified) {
      return (
        <p className="custom-request__notice" role="status">
          {CUSTOM_REQUEST_COPY.verification.verified}
        </p>
      );
    }

    switch (uiState) {
      case 'SUCCESS':
      case 'EXPIRED':
      case 'LOCKED':
      case 'RECOVERABLE_ERROR':
        return (
          <VerificationOutcomeCard
            kind={uiState}
            recipientMasked={state.recipientMasked}
            // Success needs no action here: `APP5` *is* the destination `APP4`
            // had none for, and the step rail moves on by itself the moment the
            // verified challenge id is retained.
            onAction={uiState === 'SUCCESS' ? verification.restart : verification.requestCode}
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
