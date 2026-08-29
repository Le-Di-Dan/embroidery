import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';
import { StorefrontBrand } from './storefront-brand';

/**
 * Storefront footer. Desktop/tablet render the approved DS-Footer composition and
 * mobile renders the compact Mobile-Footer composition — the difference is layout
 * only, driven by responsive CSS, not a second DOM tree.
 *
 * Footer content is the brand wordmark, an approved generic tagline and a
 * rights line. Nothing else: no address, phone number, e-mail or policy route is
 * invented here, because those values are still not canonical (APP1-S01A §12)
 * and the remaining link columns arrive with the phases that own their content.
 *
 * APP10-I01 briefly added a `Kết nối` column of external contact CTAs here. PO
 * review at `APP10-E01` moved them to a floating bottom-right dock rendered by
 * the shell (`StorefrontContactHandoff`) and removed them from the footer, so
 * one URL is not published twice on every page. This footer is therefore back to
 * its pre-I01 composition, unconditionally — it no longer depends on contact
 * configuration at all.
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
