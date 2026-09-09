'use client';

/**
 * The contact card (`907:172` … `907:181`) — `APP4`'s verification, embedded.
 *
 * Every state on screen here is an approved `APP4-D01` frame rendered by the
 * `APP4` component that already implements it. `APP12-D01`'s reuse matrix marks
 * contact verification `REUSE_AS_IS` with the note *"Không có luồng xác minh thứ
 * hai"* (`917:404`), and `APP12-S02` §15 forbids an account, a password, a login,
 * a second OTP and a local-only verified boolean. So this file composes; it does
 * not redraw, and it holds no verification logic of its own.
 *
 * What belongs to the checkout is the surrounding card: the drawn `Liên hệ`
 * heading, the drawn hint about why the workshop wants the contact, and the
 * settled `✓ Đã xác minh` affordance with the one action that leaves it.
 *
 * The verification **code** does not exist on this path. It lives in `APP4`'s own
 * ref and in the code input's DOM value; nothing this component receives or
 * renders can reach it.
 */
import {
  CodeEntryCard,
  ContactEntryCard,
  contactEntryAlertOf,
  VerificationOutcomeCard,
  isResendAvailable,
  useNow,
  verificationUiState,
  type ContactVerification,
} from '../../contact-verification';
import { READY_MADE_CHECKOUT_COPY } from '../model/ready-made-checkout-copy';

export interface CheckoutContactCardProps {
  readonly verification: ContactVerification;
  /** True only while the retained challenge still matches the contact on screen. */
  readonly verified: boolean;
  /** Discards the retained authorization and returns to contact entry. */
  readonly onRestart: () => void;
  /** Shown when a submit was attempted with no verified contact (`§35`). */
  readonly error?: string;
}

export function CheckoutContactCard(props: CheckoutContactCardProps) {
  const { verification, verified, onRestart, error } = props;
  const { contact } = READY_MADE_CHECKOUT_COPY;
  const { state } = verification;

  // The cooldown ticks only while there is one to tick, exactly as `APP5-S01`
  // drives it: the resend instant is the server's and is never a local constant.
  const counting = state.status === 'CODE_ENTRY' && !isResendAvailable(state.challenge, Date.now());
  const nowMs = useNow(counting);
  const uiState = verificationUiState(state, nowMs);

  return (
    <section className="ready-made-checkout__card" aria-labelledby="checkout-contact-heading">
      <h2 className="ready-made-checkout__card-heading" id="checkout-contact-heading">
        {contact.heading}
      </h2>
      <p className="ready-made-checkout__hint">{contact.hint}</p>

      {/*
        The two transitions that render no alert of their own, announced once —
        the same gap `APP4-S01` covers on its own route and `APP5-S01` covers in
        its embedded step.
      */}
      <p className="ready-made-checkout__visually-hidden" aria-live="polite">
        {uiState === 'REQUESTING' || uiState === 'VERIFYING' ? contact.hint : ''}
      </p>

      {error === undefined ? null : (
        <p className="ready-made-checkout__error" role="alert">
          {error}
        </p>
      )}

      {renderBody()}
    </section>
  );

  function renderBody() {
    if (verified) {
      return (
        <div className="ready-made-checkout__verified">
          <p className="ready-made-checkout__verified-line" role="status">
            <span aria-hidden="true">{contact.verifiedMark}</span> {contact.verified}
          </p>
          <p className="ready-made-checkout__caption">{contact.changeNotice}</p>
          <button type="button" className="ready-made-checkout__link-action" onClick={onRestart}>
            {contact.change}
          </button>
        </div>
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
            // At `SUCCESS` the checkout is the destination `APP4` had none for,
            // and the verified affordance above replaces this card the moment
            // the binding is retained. Reaching the action here means the
            // binding was dropped — a changed contact — so restarting is right.
            onAction={uiState === 'SUCCESS' ? onRestart : verification.requestCode}
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
