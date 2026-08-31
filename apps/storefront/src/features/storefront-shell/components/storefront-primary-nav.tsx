import { STOREFRONT_PRIMARY_NAV } from '../model/storefront-navigation';
import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';
import { StorefrontNavLink } from './storefront-nav-link';

interface StorefrontPrimaryNavProps {
  /** `bar` renders the inline desktop/tablet header nav; `drawer` renders in the mobile drawer. */
  variant: 'bar' | 'drawer';
}

/**
 * Primary navigation. The approved header shows the storefront's top-level
 * discovery areas. An item whose route exists is a real link that marks itself
 * as the current area; an item whose area is not built stays non-interactive
 * text with an explicit "unavailable" affordance (`aria-disabled`, a visible
 * tag, and a screen-reader suffix) — never a link to an unbuilt route and never
 * a dead anchor (APP1-S01A §9). `APP2-S01` routed `discover` to `/kham-pha`
 * (IMP-D038), `APP5-S01` routed `commission` to `/yeu-cau/moi` and `APP11-S02`
 * routed `collections` to `/bo-suu-tap`; Studio and Journal stay unrouted until
 * the phases that own them ship. The two variants carry distinct accessible
 * names so the header nav and the drawer nav do not collide for assistive tech.
 */
export function StorefrontPrimaryNav({ variant }: StorefrontPrimaryNavProps) {
  const { nav } = STOREFRONT_SHELL_COPY;
  return (
    <nav
      className={`storefront-shell__nav storefront-shell__nav--${variant}`}
      aria-label={variant === 'drawer' ? nav.drawerLabel : nav.primaryLabel}
    >
      <ul className="storefront-shell__nav-list">
        {STOREFRONT_PRIMARY_NAV.map((item) => (
          <li key={item.id} className="storefront-shell__nav-row">
            {item.route === null ? (
              <span className="storefront-shell__nav-item" aria-disabled="true">
                <span className="storefront-shell__nav-label">{item.label}</span>
                <span className="storefront-shell__nav-tag" aria-hidden="true">
                  {nav.unavailableTag}
                </span>
                <span className="storefront-shell__sr-only">{nav.unavailableAria}</span>
              </span>
            ) : (
              <StorefrontNavLink route={item.route} label={item.label} />
            )}
          </li>
        ))}
      </ul>
      <p className="storefront-shell__nav-note">{nav.future}</p>
    </nav>
  );
}
