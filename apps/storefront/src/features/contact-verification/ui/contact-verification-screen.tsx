'use client';

import { useContactVerification } from '../hooks/use-contact-verification';
import { useNow } from '../hooks/use-now';
import { VERIFICATION_COPY } from '../model/verification-copy';
import { isResendAvailable, verificationUiState } from '../model/verification-state';
import { CodeEntryCard } from './code-entry-card';
import { ContactEntryCard } from './contact-entry-card';
import { VerificationOutcomeCard } from './verification-outcome-card';

/**
 * The `/xac-minh-lien-he` screen: one `h1`, one card, and the approved state
 * routing between them.
 *
 * The card is chosen from {@link verificationUiState}, which is a pure function
 * of the flow state and the current instant — so which approved frame is on
 * screen is decided in one place and can be asserted directly in a test rather
 * than inferred from what happens to be rendered.
 */
export function ContactVerificationScreen() {
  const verification = useContactVerification();
  const { state } = verification;

  // The clock runs only while a cooldown is actually counting down.
  const counting = state.status === 'CODE_ENTRY' && !isResendAvailable(state.challenge, Date.now());
  const nowMs = useNow(counting);
  const uiState = verificationUiState(state, nowMs);

  return (
    // A section, not a `main`: the Storefront shell already provides the one
    // `main` landmark, and a second would give assistive technology two.
    <section className="contact-verification">
      <h1 className="contact-verification__heading">{VERIFICATION_COPY.pageTitle}</h1>

      {/*
        One polite region for in-flight states. The outcome alerts announce
        themselves; this covers the two transitions that render no alert at all
        (`634:145`), which a screen reader would otherwise experience as silence.
      */}
      <p className="contact-verification__visually-hidden" aria-live="polite">
        {uiState === 'REQUESTING' ? VERIFICATION_COPY.live.requesting : ''}
        {uiState === 'VERIFYING' ? VERIFICATION_COPY.live.verifying : ''}
      </p>

      {renderCard()}
    </section>
  );

  function renderCard() {
    switch (uiState) {
      case 'SUCCESS':
      case 'EXPIRED':
      case 'LOCKED':
      case 'RECOVERABLE_ERROR':
        return (
          <VerificationOutcomeCard
            kind={uiState}
            recipientMasked={state.recipientMasked}
            // Expired and lockout both offer "Gửi mã mới", and the contact is
            // still held, so the action issues directly rather than making the
            // customer retype what the approved frames still show. Success has
            // nowhere of its own to go — APP5 owns that handoff — so its action
            // is rendered as a link out of the flow.
            onAction={uiState === 'SUCCESS' ? verification.restart : verification.requestCode}
            {...(uiState === 'SUCCESS' ? { actionHref: '/' } : {})}
          />
        );
      case 'CODE_ENTRY':
      case 'COOLDOWN':
      case 'MISMATCH':
      case 'RESEND_AVAILABLE':
      case 'VERIFYING':
        // Unreachable without a challenge — every path into these states sets
        // one — but the contract is stated rather than asserted away with `!`.
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
