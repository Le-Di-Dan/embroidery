'use client';

import { SecureLinkShell } from '../../secure-link-access';
import { useSecureDesignReview } from '../hooks/use-secure-design-review';
import { DESIGN_REVIEW_COPY as COPY } from '../model/design-review-copy';
import { DesignReviewContent } from './design-review-content';

/**
 * `/truy-cap/duyet-thiet-ke` — the APP4 secure-link shell with the APP6 design
 * review and its two decisions inside it.
 *
 * The whole checkpoint in one composition: the bootstrap owns the credential
 * and performs the locked capture → strip → body sequence, the shell draws
 * loading (`712:3`), the single indistinguishable unavailable card and the
 * transient card with its one manual retry (`712:31`) exactly as `APP4-D01`
 * drew them, and the authorized branch is the review.
 *
 * The three access states are reused rather than redrawn on purpose. A second
 * unavailable card would be a second authority for the one behaviour that must
 * never vary — a token that does not open a live grant, a request with no
 * design awaiting review, and a target already decided all answer identically,
 * and nothing on this screen may make them distinguishable.
 *
 * The state handed to the shell comes from the controller, not from the
 * bootstrap directly: a decision that answers with a definitive refusal ends
 * the secure session, and the customer must then see the same unavailable card
 * as anyone whose link never opened.
 */
export function SecureDesignReviewScreen() {
  const controller = useSecureDesignReview();

  return (
    <SecureLinkShell
      state={controller.linkState}
      retry={controller.retryLink}
      retrying={controller.retryingLink}
      authorizedAnnouncement={COPY.live.authorized}
      renderAuthorized={(review, headingRef) => (
        <DesignReviewContent review={review} controller={controller} headingRef={headingRef} />
      )}
    />
  );
}
