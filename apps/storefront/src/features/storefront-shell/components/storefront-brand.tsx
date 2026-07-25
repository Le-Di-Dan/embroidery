import Link from 'next/link';

import { STOREFRONT_HOME_ROUTE } from '../model/storefront-navigation';
import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';

/**
 * Storefront brand mark: a text wordmark that links to the canonical home route
 * (the only implemented Storefront route). The storefront ships no logo asset, so
 * the brand is type — no code-drawn logo and no external image dependency
 * (APP1-S01A §11). Presentational and reused in the header and the mobile drawer.
 */
export function StorefrontBrand() {
  return (
    <Link
      href={STOREFRONT_HOME_ROUTE}
      className="storefront-shell__brand"
      aria-label={STOREFRONT_SHELL_COPY.brand.homeLabel}
    >
      <span className="storefront-shell__brand-wordmark">
        {STOREFRONT_SHELL_COPY.brand.wordmark}
      </span>
    </Link>
  );
}
