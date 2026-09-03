'use client';

import { SecureLinkShell } from '../../secure-link-access';
import { useSecureOrderSession } from '../hooks/use-secure-order-session';
import { ORDER_ACCESS_COPY as COPY } from '../model/order-access-copy';
import { OrderAccessContent } from './order-access-content';

/**
 * `/truy-cap/don-hang` — the APP4 secure-link shell with the Ready-Made order
 * inside it.
 *
 * The whole checkpoint in one composition: the session owns the credential and
 * performs APP4's locked capture → strip → body sequence, the shell draws
 * loading, the single indistinguishable unavailable card and the transient card
 * with its one manual retry exactly as `APP4-D01` drew them, and the authorized
 * branch is the order.
 *
 * The three access states are reused rather than redrawn on purpose (§10).
 * `917:407`/`917:409` classifies the secure access shell `REUSE_AS_IS` —
 * *bootstrap / unavailable / transient giữ nguyên* — and a second unavailable
 * card would be a second authority for the one behaviour that must never vary:
 * `APP12-B04` answers one byte-identical `404` for an unknown, expired, revoked,
 * superseded or wrong-scope token, for a custom request rather than an order,
 * for another customer's order, and for an order that no longer exists. Nothing
 * on this screen may make them distinguishable, and nothing here can reveal
 * whether another customer's order exists.
 *
 * The state handed to the shell comes from the session, not from APP4's
 * bootstrap directly: a *later* call that answers with the grant-is-gone
 * refusal ends the secure session, and the customer must then see the same
 * unavailable card as anyone whose link never opened — with the order code, the
 * amount, the bank account and the evidence list gone from the screen rather
 * than sitting behind an overlay (§31).
 */
export function SecureOrderScreen() {
  const session = useSecureOrderSession();

  return (
    <SecureLinkShell
      state={session.linkState}
      retry={session.retryLink}
      retrying={session.retryingLink}
      authorizedAnnouncement={COPY.live.authorized}
      renderAuthorized={(order, headingRef) => (
        <OrderAccessContent order={order} session={session} headingRef={headingRef} />
      )}
    />
  );
}
