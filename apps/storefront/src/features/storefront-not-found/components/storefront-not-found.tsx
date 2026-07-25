import Link from 'next/link';

import { STOREFRONT_HOME_ROUTE } from '../../storefront-shell';
import { STOREFRONT_NOT_FOUND_COPY } from '../model/storefront-not-found-copy';

/**
 * Storefront not-found content (APP1-S01B). Rendered by `app/not-found.tsx` into
 * the shared shell's existing `<main id="main-content">` slot — it adds no
 * header, footer, drawer, `<main>`, or shell wrapper of its own, and owns the
 * page's single `<h1>` (APP1-S01B §5, §11).
 *
 * It is a Server Component: the boundary needs no client interactivity. Recovery
 * is honest — the primary action links to the canonical home route; the secondary
 * "Khám phá tác phẩm" area is not built yet, so it renders as a clearly
 * unavailable, non-interactive affordance rather than a dead anchor or an invented
 * route (APP1-S01B §9, mirroring the accepted S01A nav treatment).
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
        <span
          className="storefront-not-found__action storefront-not-found__action--secondary"
          aria-disabled="true"
        >
          <span className="storefront-not-found__action-label">{copy.secondaryLabel}</span>
          <span className="storefront-not-found__action-tag">{copy.secondaryTag}</span>
          <span className="storefront-not-found__sr-only">{copy.secondaryUnavailable}</span>
        </span>
      </div>
    </section>
  );
}
