import Link from 'next/link';
import type { RefObject } from 'react';

import { SECURE_LINK_COPY } from '../model/secure-link-copy';

/**
 * Transient network / system error — `629:53`.
 *
 * ### Why this is a separate screen at all
 *
 * Because a transport failure is **not a verdict about the link**. Folding it
 * into the unavailable state would tell a customer holding a perfectly good
 * link that it no longer works, and leave them nothing to do about it. The
 * design draws the distinction deliberately, and the Product Owner ruling in
 * §8 states it plainly: infrastructure uncertainty is not a resolution outcome.
 *
 * ### The retry
 *
 * Manual, always. There is no automatic retry, no backoff loop and no timer —
 * the TanStack mutation is declared `retry: false` and nothing here schedules
 * anything. The customer presses a button, one request goes out, and the token
 * for it comes from the same ephemeral ref it has been in since bootstrap; the
 * fragment is not restored and nothing is persisted to make the retry possible.
 *
 * The raw error is never shown. An Axios message or a backend string could
 * disclose an endpoint, a request id or a status the non-enumeration contract
 * keeps quiet; the customer is told what happened in their own terms instead.
 */
export function SecureLinkErrorCard({
  onRetry,
  retrying,
  headingRef,
}: {
  onRetry: () => void;
  retrying: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const copy = SECURE_LINK_COPY.transientError;
  return (
    <div className="secure-link-access__card">
      <h1 className="secure-link-access__title" ref={headingRef} tabIndex={-1}>
        {copy.title}
      </h1>
      <div className="secure-link-access__alert secure-link-access__alert--error">
        <p className="secure-link-access__alert-title">{copy.alertTitle}</p>
        <p className="secure-link-access__alert-body">{copy.alertBody}</p>
      </div>
      <button
        type="button"
        className="secure-link-access__button secure-link-access__button--primary"
        onClick={onRetry}
        disabled={retrying}
      >
        {copy.retry}
      </button>
      <Link className="secure-link-access__button" href="/" prefetch={false}>
        {SECURE_LINK_COPY.home}
      </Link>
    </div>
  );
}
