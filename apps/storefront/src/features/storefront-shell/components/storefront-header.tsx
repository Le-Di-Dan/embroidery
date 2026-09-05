import { StorefrontBrand } from './storefront-brand';
import { StorefrontMobileNav } from './storefront-mobile-nav';
import { StorefrontPrimaryNav } from './storefront-primary-nav';

/**
 * The Storefront header (FIG-STOREFRONT-SHELL-DESKTOP/TABLET/MOBILE-DEFAULT). One
 * responsive component, not a tree per viewport: the Full layout (≥1024px) shows
 * the brand and the inline primary navigation; the Compact layout (<1024px)
 * collapses the navigation behind the mobile trigger. Only the trigger + drawer
 * (`StorefrontMobileNav`) is a Client Component; the rest is server-rendered.
 *
 * ## The search affordance is gone (`V01-UX-008`, `APP12-V02` §9)
 *
 * The approved header composes a search bar, and `APP1-S01A` built the most
 * honest thing available to it: a non-focusable presentational glyph plus a
 * screen-reader note saying search was not available yet. It preserved the
 * approved visual without shipping a control that looks functional and does
 * nothing.
 *
 * On a released shop it is still a search box the customer cannot search with,
 * on every page, and the note beside it is a sentence whose subject is a missing
 * capability (`V01-UX-004`). §9 removes it. The phase that builds search adds a
 * real control wired to a canonical route, which is what the approved frame was
 * always drawing.
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
    </header>
  );
}
