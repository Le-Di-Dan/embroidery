import { AUTHENTICATED_HOME_ROUTE } from '../../../config/routes';
import { ADMIN_ASSETS_ROUTE, ASSET_COPY } from '../../assets';
import { ADMIN_PRODUCTS_ROUTE, PRODUCT_COPY } from '../../products';

/**
 * A primary-navigation entry. Every item points at a route that exists — the
 * shell never renders an anchor to an unbuilt screen (CLAUDE.md §16). Later
 * phases add their destinations here as they ship.
 */
export interface AdminNavItem {
  readonly id: string;
  readonly label: string;
  /** An implemented Admin route. */
  readonly href: string;
}

/**
 * The authenticated shell's primary navigation. `APP2-A01` adds the asset
 * library as the first real business destination and `APP2-A02` adds the
 * product list; the label and the route both come from the owning capability,
 * so there is one spelling of each. Order follows the approved Admin frames.
 */
export const ADMIN_PRIMARY_NAV: readonly AdminNavItem[] = [
  { id: 'overview', label: 'Tổng quan', href: AUTHENTICATED_HOME_ROUTE },
  { id: 'assets', label: ASSET_COPY.page.title, href: ADMIN_ASSETS_ROUTE },
  { id: 'products', label: PRODUCT_COPY.page.title, href: ADMIN_PRODUCTS_ROUTE },
];

/**
 * Whether an entry is the current location. Home matches exactly — every route
 * starts with `/`, so a prefix test would mark it current everywhere — while a
 * section also matches its own subtree, so a future detail route still
 * highlights the section it belongs to.
 */
export function isCurrentNavItem(item: AdminNavItem, pathname: string): boolean {
  if (item.href === AUTHENTICATED_HOME_ROUTE) {
    return pathname === AUTHENTICATED_HOME_ROUTE;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
