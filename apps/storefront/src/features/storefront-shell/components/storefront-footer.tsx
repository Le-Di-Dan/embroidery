import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';
import { StorefrontBrand } from './storefront-brand';
import { StorefrontContactHandoff } from './storefront-contact-handoff';

/**
 * Storefront footer. Desktop/tablet render the approved DS-Footer composition and
 * mobile renders the compact Mobile-Footer composition — the difference is layout
 * only, driven by responsive CSS, not a second DOM tree.
 *
 * Footer content is the brand wordmark, an approved generic tagline, a rights
 * line, and — from APP10-I01 — the `Kết nối` external contact handoff. Nothing
 * else: no address, phone number, e-mail or policy route is invented here,
 * because those values are still not canonical (APP1-S01A §12) and the
 * remaining link columns arrive with the phases that own their content.
 *
 * The handoff group is the one exception to APP1-S01A's "no contact channels"
 * rule, and it is not an invented value: both URLs are published by an operator
 * as configuration, and with none configured the group disappears and this
 * footer is byte-for-byte its pre-I01 self.
 */
export function StorefrontFooter() {
  const { footer } = STOREFRONT_SHELL_COPY;
  return (
    <footer className="storefront-shell__footer">
      <div className="storefront-shell__footer-inner">
        <div className="storefront-shell__footer-brand">
          <StorefrontBrand />
          <p className="storefront-shell__footer-tagline">{footer.tagline}</p>
        </div>
        <StorefrontContactHandoff />
        <p className="storefront-shell__footer-rights">{footer.rights}</p>
      </div>
    </footer>
  );
}
