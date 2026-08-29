import type { ReactNode } from 'react';

import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';
import { StorefrontContactHandoff } from './storefront-contact-handoff';
import { StorefrontFooter } from './storefront-footer';
import { StorefrontHeader } from './storefront-header';

/** DOM id of the main content region; the skip link targets it. */
export const STOREFRONT_MAIN_ID = 'main-content';

/**
 * The shared public Storefront shell (APP1-S01A). It wraps every route with the
 * responsive header, the `<main>` content slot, and the footer, and owns the shell
 * landmarks and the skip link. It is a Server Component: no client state lives here
 * — the only interactivity (the mobile drawer) is isolated inside the header's
 * client island.
 *
 * The shell deliberately creates **no** page `<h1>`: each page owns its own
 * heading and business content, which render once into `{children}`. Content width
 * and padding follow the approved shell notes (FIG-STOREFRONT-SHELL-NOTES).
 *
 * `StorefrontContactHandoff` is the APP10-I01 external contact dock. It is a
 * sibling of `<main>` and the footer rather than a child of either, because it
 * floats over the page at every scroll position and belongs to no one section;
 * it renders nothing at all when neither channel is configured, which is why the
 * shell can hold it unconditionally.
 */
export function StorefrontShell({ children }: { children: ReactNode }) {
  return (
    <div className="storefront-shell">
      <a className="storefront-shell__skip-link" href={`#${STOREFRONT_MAIN_ID}`}>
        {STOREFRONT_SHELL_COPY.skipToContent}
      </a>
      <StorefrontHeader />
      <main id={STOREFRONT_MAIN_ID} className="storefront-shell__main">
        <div className="storefront-shell__main-inner">{children}</div>
      </main>
      <StorefrontFooter />
      <StorefrontContactHandoff />
    </div>
  );
}
