'use client';

import { SecureLinkShell } from '../../secure-link-access';
import { useSecureDeposit } from '../hooks/use-secure-deposit';
import { SECURE_DEPOSIT_COPY as COPY } from '../model/secure-deposit-copy';
import { DepositContent } from './deposit-content';

/**
 * `/truy-cap/thanh-toan` — the APP4 secure-link shell with the APP7 deposit
 * inside it.
 *
 * The whole checkpoint in one composition: the bootstrap owns the credential and
 * performs the locked capture → strip → body sequence, the shell draws loading
 * (`629:3`), the single indistinguishable unavailable card (`629:37`) and the
 * transient card with its one manual retry (`629:53`) exactly as `APP4-D01` drew
 * them, and the authorized branch is the deposit.
 *
 * The three access states are reused rather than redrawn on purpose, and
 * `APP7-D01`'s reuse map (`753:179`) says so explicitly. A second unavailable
 * card would be a second authority for the one behaviour that must never vary: a
 * token that does not open a live grant and an order with no live `DEPOSIT`
 * obligation answer identically, and nothing on this screen may make them
 * distinguishable.
 *
 * The state handed to the shell comes from the controller, not from the bootstrap
 * directly: a later call that answers with the grant-is-gone refusal ends the
 * secure session, and the customer must then see the same unavailable card as
 * anyone whose link never opened.
 */
export function SecureDepositScreen() {
  const controller = useSecureDeposit();

  return (
    <SecureLinkShell
      state={controller.linkState}
      retry={controller.retryLink}
      retrying={controller.retryingLink}
      authorizedAnnouncement={COPY.live.authorized}
      renderAuthorized={(deposit, headingRef) => (
        <DepositContent deposit={deposit} controller={controller} headingRef={headingRef} />
      )}
    />
  );
}
