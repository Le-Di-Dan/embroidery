import Link from 'next/link';

import { STOREFRONT_DISCOVER_ROUTE, STOREFRONT_HOME_ROUTE } from '../../storefront-shell';
import { STOREFRONT_NOT_FOUND_COPY } from '../model/storefront-not-found-copy';

/**
 * Storefront not-found content (APP1-S01B). Rendered by `app/not-found.tsx` into
 * the shared shell's existing `<main id="main-content">` slot — it adds no
 * header, footer, drawer, `<main>`, or shell wrapper of its own, and owns the
 * page's single `<h1>` (APP1-S01B §5, §11).
 *
 * It is a Server Component: the boundary needs no client interactivity. Both
 * recovery actions are now real links — the primary to the canonical home route,
 * the secondary to `/kham-pha`, which `APP2-S01` built (IMP-D038). Until then the
 * secondary rendered as an explicitly unavailable affordance rather than a dead
 * anchor; its `Sắp ra mắt` tag is retired because the area exists.
 *
 * Design source: FIG-STOREFRONT-NOTFOUND (411:2337) / FIG-STOREFRONT-NOTFOUND-
 * MOBILE (411:3851), FIG-APPROVAL-APP1-D02-STOREFRONT-001.
 */
export function StorefrontNotFound() {
  const copy = STOREFRONT_NOT_FOUND_COPY;
  return (
    <section className="storefront-not-found" aria-labelledby="storefront-not-found-title">
      <p className="storefront-not-found__code" aria-hidden="true">
        {copy.code}
      </p>
      <h1 id="storefront-not-found-title" className="storefront-not-found__title">
        {copy.heading}
      </h1>
      <p className="storefront-not-found__lead">{copy.explanation}</p>
      <div className="storefront-not-found__actions">
        <Link
          href={STOREFRONT_HOME_ROUTE}
          className="storefront-not-found__action storefront-not-found__action--primary"
        >
          {copy.primaryLabel}
        </Link>
        <Link
          href={STOREFRONT_DISCOVER_ROUTE}
          className="storefront-not-found__action storefront-not-found__action--secondary"
        >
          <span className="storefront-not-found__action-label">{copy.secondaryLabel}</span>
        </Link>
      </div>
    </section>
  );
}
