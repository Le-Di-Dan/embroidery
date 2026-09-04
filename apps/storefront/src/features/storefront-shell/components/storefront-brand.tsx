import Link from 'next/link';
import { BRAND_SYMBOL_APPLICATION_PX, BrandSymbol } from '@embroidery/ui';

import { STOREFRONT_HOME_ROUTE } from '../model/storefront-navigation';
import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';

/**
 * The Storefront brand mark: the approved Nét Thêu symbol beside the live-text
 * wordmark, linking to the canonical home route.
 *
 * ## Why two symbols are rendered
 *
 * The header is **one responsive component, not a tree per viewport** — the
 * Full layout (≥1024px) and the Compact layout (<1024px) are the same DOM with
 * different CSS. But the brand system uses a different *variant* at each: the
 * production symbol keeps its seal ring and is only proven readable down to
 * 48px on a light ground, while the micro symbol drops the ring and is the
 * required form below 32px. One element cannot be both.
 *
 * So both are rendered and the shell's own media query shows exactly one. The
 * cost is about 300 bytes of inline SVG; the alternative was either a client
 * component reading a media query — turning a server-rendered brand into
 * hydration-dependent chrome — or pushing the ring's geometry into the app's
 * stylesheet, which would put brand authority in three stylesheets instead of
 * one package.
 *
 * Both are decorative: the wordmark beside them is the accessible name, and the
 * link carries `aria-label`. Naming the symbols too would announce the brand
 * three times.
 *
 * `size` lets the footer and drawer ask for their own scale; the header takes
 * the approved application sizes by default.
 */
export interface StorefrontBrandProps {
  /**
   * `responsive` swaps production ↔ micro at the Full/Compact threshold and is
   * what the header wants. `micro` pins the small variant at every width, for a
   * slot whose usable height is under the production symbol's 48px light-ground
   * floor no matter how wide the viewport is — the footer is the one such slot.
   */
  readonly symbol?: 'responsive' | 'micro';
  /** Production-symbol size for the Full layout. */
  readonly desktopSize?: number;
  /** Micro-symbol size for the Compact layout, and for `symbol="micro"`. */
  readonly compactSize?: number;
}

export function StorefrontBrand({
  symbol = 'responsive',
  desktopSize = BRAND_SYMBOL_APPLICATION_PX.storefrontDesktopHeader,
  compactSize = BRAND_SYMBOL_APPLICATION_PX.storefrontMobileHeader,
}: StorefrontBrandProps = {}) {
  return (
    <Link
      href={STOREFRONT_HOME_ROUTE}
      className="storefront-shell__brand"
      aria-label={STOREFRONT_SHELL_COPY.brand.homeLabel}
    >
      {symbol === 'responsive' ? (
        <span className="storefront-shell__brand-symbol storefront-shell__brand-symbol--full">
          <BrandSymbol variant="production" size={desktopSize} tone="ink" />
        </span>
      ) : null}
      <span
        className={
          symbol === 'responsive'
            ? 'storefront-shell__brand-symbol storefront-shell__brand-symbol--compact'
            : 'storefront-shell__brand-symbol'
        }
      >
        <BrandSymbol variant="micro" size={compactSize} tone="ink" />
      </span>
      <span className="storefront-shell__brand-wordmark">
        {STOREFRONT_SHELL_COPY.brand.wordmark}
      </span>
    </Link>
  );
}
