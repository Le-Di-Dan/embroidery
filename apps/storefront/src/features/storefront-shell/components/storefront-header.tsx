import { StorefrontBrand } from './storefront-brand';
import { StorefrontMobileNav } from './storefront-mobile-nav';
import { StorefrontPrimaryNav } from './storefront-primary-nav';
import { StorefrontSearchAffordance, StorefrontSearchStatus } from './storefront-search-affordance';

/**
 * The Storefront header (FIG-STOREFRONT-SHELL-DESKTOP/TABLET/MOBILE-DEFAULT). One
 * responsive component, not a tree per viewport: the Full layout (≥1024px) shows
 * the brand, inline primary navigation, and the search affordance; the Compact
 * layout (<1024px) collapses the navigation behind the mobile trigger. Only the
 * trigger + drawer (`StorefrontMobileNav`) is a Client Component; the rest is
 * server-rendered.
 */
export function StorefrontHeader() {
  return (
    <header className="storefront-shell__bar">
      <div className="storefront-shell__bar-lead">
        <StorefrontMobileNav />
        <StorefrontBrand />
      </div>
      <div className="storefront-shell__bar-nav">
        <StorefrontPrimaryNav variant="bar" />
      </div>
      <div className="storefront-shell__bar-trail">
        <StorefrontSearchAffordance />
        <StorefrontSearchStatus />
      </div>
    </header>
  );
}
