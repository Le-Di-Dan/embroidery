'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

import { SECURE_LINK_COPY } from '../model/secure-link-copy';
import type { SecureLinkState } from '../model/secure-link-state';
import { SecureLinkBootstrapCard } from './secure-link-bootstrap-card';
import { SecureLinkErrorCard } from './secure-link-error-card';
import { SecureLinkUnavailableCard } from './secure-link-unavailable-card';

/**
 * The secure-link landing shell: one state at a time, chosen by the bootstrap.
 *
 * Three of the four states are drawn entirely here, because all three are
 * *access* states and say nothing about what the link opens — bootstrap while
 * the call is in flight (`629:3`), the one indistinguishable unavailable card
 * (`629:37` / `629:87`) and the transport-failure card with its manual retry
 * (`629:53`). The fourth, authorized, is the consumer's: `APP5-D01` states
 * plainly that the resolve step belongs to `APP4-S02` and that APP5 content is
 * only built *after* a valid grant (`661:335` spec strip), so the shell hands
 * the payload back rather than knowing anything about it.
 *
 * A `section`, not a `main`. The Storefront shell already provides the single
 * `main` landmark and the header and footer around it; a second would give
 * assistive technology two of each, which is the mistake `APP4-S01` shipped and
 * caught in a browser rather than in jsdom (§19).
 *
 * Each card owns the page `h1`, because on every approved frame the card's
 * title *is* the page title. Exactly one is mounted at any moment, so the
 * document always has exactly one `h1` — and the authorized branch is handed
 * `headingRef` precisely so it can own that one heading itself rather than have
 * the shell render a second above it.
 *
 * The polite live region announces each settled state. It exists because the
 * page changes without any user action: the customer arrives, and some moments
 * later the screen has silently become one of three outcomes. A screen reader
 * would otherwise experience that as nothing at all (`634:145`, `634:146`).
 * The authorized announcement is a prop for the same reason the card is —
 * "what you can now see" is a fact only the consumer holds.
 *
 * Focus follows the outcome to the new heading, so a keyboard user is left
 * where the answer is rather than at the top of a page that rearranged itself.
 * Bootstrap does not take focus — nothing has happened yet, and stealing focus
 * on load is its own accessibility problem.
 */
export interface SecureLinkShellProps<TPayload> {
  readonly state: SecureLinkState<TPayload>;
  readonly retry: () => void;
  readonly retrying: boolean;
  /** What a screen reader is told once the link opens. */
  readonly authorizedAnnouncement: string;
  readonly renderAuthorized: (
    payload: TPayload,
    headingRef: RefObject<HTMLHeadingElement | null>,
  ) => ReactNode;
}

export function SecureLinkShell<TPayload>({
  state,
  retry,
  retrying,
  authorizedAnnouncement,
  renderAuthorized,
}: SecureLinkShellProps<TPayload>) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const settled = state.status !== 'BOOTSTRAP';

  useEffect(() => {
    if (settled) headingRef.current?.focus();
  }, [settled, state.status]);

  return (
    <section className="secure-link-access">
      <p className="secure-link-access__visually-hidden" aria-live="polite">
        {announcement()}
      </p>
      {renderState()}
    </section>
  );

  function announcement(): string {
    switch (state.status) {
      case 'AUTHORIZED':
        return authorizedAnnouncement;
      case 'UNAVAILABLE':
        return SECURE_LINK_COPY.live.unavailable;
      case 'TRANSIENT_ERROR':
        return SECURE_LINK_COPY.live.transientError;
      default:
        return SECURE_LINK_COPY.live.bootstrap;
    }
  }

  function renderState() {
    switch (state.status) {
      case 'AUTHORIZED':
        return renderAuthorized(state.payload, headingRef);
      case 'UNAVAILABLE':
        return <SecureLinkUnavailableCard headingRef={headingRef} />;
      case 'TRANSIENT_ERROR':
        return <SecureLinkErrorCard onRetry={retry} retrying={retrying} headingRef={headingRef} />;
      default:
        return <SecureLinkBootstrapCard />;
    }
  }
}
