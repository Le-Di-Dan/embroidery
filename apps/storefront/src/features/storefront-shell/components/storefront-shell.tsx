import type { ReactNode } from 'react';

import type { StorefrontShellVariant } from '../model/shell-variant';
import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';
import { StorePresentationBlock } from '../../store-presentation';
import { StorefrontContactHandoff } from './storefront-contact-handoff';
import { StorefrontFooter } from './storefront-footer';
import { StorefrontHeader } from './storefront-header';
import { StorefrontTransactionalFooter } from './storefront-transactional-footer';

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
 *
 * `StorePresentationBlock` (`APP11-S05`) is composed directly above the footer,
 * which is where the approved responsive authority `889:1030` puts it at all
 * three widths. It supplements the DS Footer rather than replacing it: the
 * footer keeps its own composition, and the supplement is a named `<section>`
 * rather than a second `<footer>`, so the document still has exactly one
 * `contentinfo` landmark.
 *
 * ## Two shells, one component (`V01-UX-022`, `APP12-V02` §10)
 *
 * The checkout and the secure order surface get a reduced shell: the same brand
 * and the same escape path, a compact policy/support row instead of the
 * four-column store-presentation block, and the contact dock unchanged because
 * it is the only support channel the product has.
 *
 * V01 measured that block as about a third of both pages, sitting beneath the
 * one control the customer came to use and advertising a service the order is
 * not for.
 *
 * The variant arrives as a request header the proxy stamps and the **root
 * layout** reads — `model/shell-variant.ts` explains why that seam and not a
 * client component. It is read there rather than here because this feature's
 * barrel is imported by client components for its route constants, and
 * `next/headers` in this file would pull a server-only API into their bundles.
 *
 * The shell takes the answer as a prop and defaults to the full composition, so
 * a caller that does not know about the variant — every existing test — gets
 * exactly what it got before. Nothing about the routes changes, and there is
 * still exactly one `contentinfo` landmark in either shape.
 */
export function StorefrontShell({
  children,
  variant = 'full',
}: {
  readonly children: ReactNode;
  readonly variant?: StorefrontShellVariant;
}) {
  return (
    <div className="storefront-shell">
      <a className="storefront-shell__skip-link" href={`#${STOREFRONT_MAIN_ID}`}>
        {STOREFRONT_SHELL_COPY.skipToContent}
      </a>
      <StorefrontHeader />
      <main id={STOREFRONT_MAIN_ID} className="storefront-shell__main">
        <div className="storefront-shell__main-inner">{children}</div>
      </main>
      {variant === 'transactional' ? (
        <StorefrontTransactionalFooter />
      ) : (
        <>
          <StorePresentationBlock />
          <StorefrontFooter />
        </>
      )}
      <StorefrontContactHandoff />
    </div>
  );
}
