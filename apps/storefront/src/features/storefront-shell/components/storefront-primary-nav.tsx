import { isCustomerRouteWithheld } from '../../release-isolation';
import { STOREFRONT_PRIMARY_NAV } from '../model/storefront-navigation';
import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';
import { StorefrontNavLink } from './storefront-nav-link';

interface StorefrontPrimaryNavProps {
  /** `bar` renders the inline desktop/tablet header nav; `drawer` renders in the mobile drawer. */
  variant: 'bar' | 'drawer';
}

/**
 * Primary navigation — every item a real link to a working destination.
 *
 * ## What changed at `APP12-V02`
 *
 * `V01-UX-008` measured three of five items dead. `APP1-S01A` had built an
 * "unavailable" affordance — non-interactive text with `aria-disabled`, a
 * visible `Sắp ra mắt` tag and a screen-reader suffix — so that an unbuilt area
 * could keep its place in the approved header without becoming a dead anchor,
 * and `APP12-G02` routed the withheld `Đặt thêu` through that same branch rather
 * than designing a new one.
 *
 * Both decisions were right for what they were solving and wrong for the
 * released product. §9: a released shop's masthead must not advertise
 * destinations it cannot deliver, and it must not draw grey disabled items to
 * say so. So the two areas that never had a route are gone from the model, and
 * the one that *has* a route the server currently refuses is **omitted** here
 * rather than drawn as unavailable.
 *
 * That is a strictly smaller surface than the affordance it replaces: the item
 * returns, unchanged, the moment the capability is released. The nav publishes
 * no roadmap, and there is nothing left in it that a visitor can look at and
 * not use.
 *
 * This is presentation, never enforcement — the release gate is `src/proxy.ts`
 * and this component withholds nothing. Its only job is that a released Wave-1
 * shop does not offer an address the server answers with a `404` by design.
 */
export function StorefrontPrimaryNav({ variant }: StorefrontPrimaryNavProps) {
  const { nav } = STOREFRONT_SHELL_COPY;
  const items = STOREFRONT_PRIMARY_NAV.filter((item) => !isCustomerRouteWithheld(item.route));

  return (
    <nav
      className={`storefront-shell__nav storefront-shell__nav--${variant}`}
      aria-label={variant === 'drawer' ? nav.drawerLabel : nav.primaryLabel}
    >
      <ul className="storefront-shell__nav-list">
        {items.map((item) => (
          <li key={item.id} className="storefront-shell__nav-row">
            <StorefrontNavLink route={item.route} label={item.label} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
