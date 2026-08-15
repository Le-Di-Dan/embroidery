'use client';

import { useEffect, useRef } from 'react';

import { useSecureLinkResolution } from '../hooks/use-secure-link-resolution';
import { SECURE_LINK_COPY } from '../model/secure-link-copy';
import { SecureLinkAuthorizedCard } from './secure-link-authorized-card';
import { SecureLinkBootstrapCard } from './secure-link-bootstrap-card';
import { SecureLinkErrorCard } from './secure-link-error-card';
import { SecureLinkUnavailableCard } from './secure-link-unavailable-card';

/**
 * The `/truy-cap` screen: one card at a time, chosen by resolution status.
 *
 * A `section`, not a `main`. The Storefront shell already provides the single
 * `main` landmark and the header and footer around it; a second would give
 * assistive technology two of each, which is the mistake `APP4-S01` shipped and
 * caught in a browser rather than in jsdom (§19).
 *
 * Each card owns the page `h1`, because on every approved frame the card's
 * title *is* the page title. Exactly one is mounted at any moment, so the
 * document always has exactly one `h1` — including the authorized card, whose
 * two approved wordings are two spans inside one heading rather than two
 * headings.
 *
 * The polite live region announces each settled state. It exists because the
 * page changes without any user action: the customer arrives, and some moments
 * later the screen has silently become one of three outcomes. A screen reader
 * would otherwise experience that as nothing at all (`634:145`, `634:146`).
 *
 * Focus follows the outcome to the new heading, so a keyboard user is left
 * where the answer is rather than at the top of a page that rearranged itself.
 * Bootstrap does not take focus — nothing has happened yet, and stealing focus
 * on load is its own accessibility problem.
 */
export function SecureLinkScreen() {
  const { state, retry, retrying } = useSecureLinkResolution();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const settled = state.status !== 'BOOTSTRAP';

  useEffect(() => {
    if (settled) headingRef.current?.focus();
  }, [settled, state.status]);

  return (
    <section className="secure-link-access">
      <p className="secure-link-access__visually-hidden" aria-live="polite">
        {SECURE_LINK_COPY.live[announcementKey(state.status)]}
      </p>
      {renderCard()}
    </section>
  );

  function renderCard() {
    switch (state.status) {
      case 'AUTHORIZED':
        return <SecureLinkAuthorizedCard headingRef={headingRef} />;
      case 'UNAVAILABLE':
        return <SecureLinkUnavailableCard headingRef={headingRef} />;
      case 'TRANSIENT_ERROR':
        return <SecureLinkErrorCard onRetry={retry} retrying={retrying} headingRef={headingRef} />;
      default:
        return <SecureLinkBootstrapCard />;
    }
  }
}

/** Maps a status onto its announcement, so the two cannot drift apart. */
function announcementKey(status: string): keyof typeof SECURE_LINK_COPY.live {
  switch (status) {
    case 'AUTHORIZED':
      return 'authorized';
    case 'UNAVAILABLE':
      return 'unavailable';
    case 'TRANSIENT_ERROR':
      return 'transientError';
    default:
      return 'bootstrap';
  }
}
