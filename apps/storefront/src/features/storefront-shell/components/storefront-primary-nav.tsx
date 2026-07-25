import { STOREFRONT_PRIMARY_NAV } from '../model/storefront-navigation';
import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';

interface StorefrontPrimaryNavProps {
  /** `bar` renders the inline desktop/tablet header nav; `drawer` renders in the mobile drawer. */
  variant: 'bar' | 'drawer';
}

/**
 * Primary navigation. The approved header shows the storefront's top-level
 * discovery areas, but none of those routes exist yet, so each item is rendered
 * as non-interactive text with an explicit "unavailable" affordance
 * (`aria-disabled`, a visible tag, and a screen-reader suffix) — never a link to
 * an unbuilt route and never a dead anchor (APP1-S01A §9). The owning phases add
 * real links later. The two variants carry distinct accessible names so the
 * header nav and the drawer nav do not collide for assistive tech.
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
            <span className="storefront-shell__nav-item" aria-disabled="true">
              <span className="storefront-shell__nav-label">{item.label}</span>
              <span className="storefront-shell__nav-tag" aria-hidden="true">
                {nav.unavailableTag}
              </span>
              <span className="storefront-shell__sr-only">{nav.unavailableAria}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="storefront-shell__nav-note">{nav.future}</p>
    </nav>
  );
}
