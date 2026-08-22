'use client';

import { SecureLinkShell } from '../../secure-link-access';
import { useSecureQuotation } from '../hooks/use-secure-quotation';
import { SECURE_QUOTATION_COPY as COPY } from '../model/secure-quotation-copy';
import { QuotationContent } from './quotation-content';

/**
 * `/truy-cap/bao-gia` — the APP4 secure-link shell with the APP6 quotation and
 * its decision inside it.
 *
 * The whole checkpoint in one composition: the bootstrap owns the credential
 * and performs the locked capture → strip → body sequence, the shell draws
 * loading (`703:3`), the single indistinguishable unavailable card and the
 * transient card with its one manual retry (`703:36`) exactly as `APP4-D01`
 * drew them, and the authorized branch is the quotation.
 *
 * The three access states are reused rather than redrawn on purpose. A second
 * unavailable card would be a second authority for the one behaviour that must
 * never vary — a token that does not open a live grant and a request with no
 * current quotation answer identically, and nothing on this screen may make
 * them distinguishable.
 *
 * The state handed to the shell comes from the controller, not from the
 * bootstrap directly: a decision that answers with a definitive refusal ends
 * the secure session, and the customer must then see the same unavailable card
 * as anyone whose link never opened.
 */
export function SecureQuotationScreen() {
  const controller = useSecureQuotation();

  return (
    <SecureLinkShell
      state={controller.linkState}
      retry={controller.retryLink}
      retrying={controller.retryingLink}
      authorizedAnnouncement={COPY.live.authorized}
      renderAuthorized={(quote, headingRef) => (
        <QuotationContent quote={quote} controller={controller} headingRef={headingRef} />
      )}
    />
  );
}
