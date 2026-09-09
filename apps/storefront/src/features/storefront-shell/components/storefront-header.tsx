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
 * ## The compact trigger takes the trailing edge, opposite the brand
 *
 * The trigger used to sit *inside* `bar-lead`, ahead of the brand, so a compact
 * header opened with two marks crowded against the left edge and an empty right
 * half — the arrangement `APP12-V02` had already corrected on the Admin bar. It
 * is now the header's last child and is pushed to the trailing edge by the
 * stylesheet, so both shells read the same way: brand at the leading edge,
 * navigation trigger at the trailing one.
 *
 * DOM order is brand → inline nav → trigger, and it is the reading order of both
 * tiers rather than a compromise between them: on the Full layout the trigger is
 * hidden and the inline nav carries navigation; on the Compact layout the inline
 * nav is hidden and the trigger takes the edge it left free.
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
        <StorefrontBrand />
      </div>
      <div className="storefront-shell__bar-nav">
        <StorefrontPrimaryNav variant="bar" />
      </div>
      <StorefrontMobileNav />
    </header>
  );
}
