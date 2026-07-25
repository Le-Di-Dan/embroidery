import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';
import { StorefrontBrand } from './storefront-brand';

/**
 * Storefront footer. Desktop/tablet render the approved DS-Footer composition and
 * mobile renders the compact Mobile-Footer composition — the difference is layout
 * only, driven by responsive CSS, not a second DOM tree.
 *
 * Footer content is limited to the brand wordmark, an approved generic tagline,
 * and a rights line. No contact details, social links, or policy routes are
 * rendered: those values are not canonical yet and must not be invented
 * (APP1-S01A §12). The footer link columns arrive with the phases that own that
 * content (recorded as a content follow-up in the report).
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
        <p className="storefront-shell__footer-rights">{footer.rights}</p>
      </div>
    </footer>
  );
}
