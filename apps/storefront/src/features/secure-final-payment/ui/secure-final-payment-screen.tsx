'use client';

import { SecureLinkShell } from '../../secure-link-access';
import { useSecureFinalPayment } from '../hooks/use-secure-final-payment';
import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../model/final-payment-copy';
import { FinalPaymentContent } from './final-payment-content';

/**
 * `/truy-cap/thanh-toan-con-lai` — the APP4 secure-link shell with the APP9
 * balance inside it.
 *
 * The whole checkpoint in one composition: the bootstrap owns the credential and
 * performs the locked capture → strip → body sequence, the shell draws loading,
 * the single indistinguishable unavailable card (`819:227`) and the transient
 * card with its one manual retry exactly as `APP4-D01` drew them, and the
 * authorized branch is the balance.
 *
 * The three access states are reused rather than redrawn on purpose. A second
 * unavailable card would be a second authority for the one behaviour that must
 * never vary: `819:234` states the rule for this route in the design itself —
 * one screen for expiry, a wrong token, a revoked token and a foreign order —
 * and `APP9-B02` answers every one of them, plus an order with no live
 * `REMAINING` obligation, with one byte-identical `404`. Nothing on this screen
 * may make them distinguishable, and nothing here can reveal whether another
 * customer's order exists.
 *
 * The state handed to the shell comes from the controller, not from the
 * bootstrap directly: a later call that answers with the grant-is-gone refusal
 * ends the secure session, and the customer must then see the same unavailable
 * card as anyone whose link never opened.
 */
export function SecureFinalPaymentScreen() {
  const controller = useSecureFinalPayment();

  return (
    <SecureLinkShell
      state={controller.linkState}
      retry={controller.retryLink}
      retrying={controller.retryingLink}
      authorizedAnnouncement={COPY.live.authorized}
      renderAuthorized={(payment, headingRef) => (
        <FinalPaymentContent payment={payment} controller={controller} headingRef={headingRef} />
      )}
    />
  );
}
