import { AUTHENTICATED_HOME_ROUTE } from '../../../config/routes';
import { ADMIN_ASSETS_ROUTE, ASSET_COPY } from '../../assets';
import { ADMIN_CUSTOMER_ACCESS_ROUTE, CUSTOMER_ACCESS_COPY } from '../../customer-access-support';
import { ADMIN_DESIGN_TEMPLATES_ROUTE, DESIGN_TEMPLATE_COPY } from '../../design-templates';
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
 * library as the first real business destination, `APP2-A02` adds the product
 * list, `APP3-A02` adds the Design Template list and `APP4-A01` adds customer
 * access support; the label and the route both come from the owning capability,
 * so there is one spelling of each. Order follows the approved Admin frames,
 * which put support last.
 */
export const ADMIN_PRIMARY_NAV: readonly AdminNavItem[] = [
  { id: 'overview', label: 'Tổng quan', href: AUTHENTICATED_HOME_ROUTE },
  { id: 'assets', label: ASSET_COPY.page.title, href: ADMIN_ASSETS_ROUTE },
  { id: 'products', label: PRODUCT_COPY.page.title, href: ADMIN_PRODUCTS_ROUTE },
  {
    id: 'design-templates',
    label: DESIGN_TEMPLATE_COPY.page.title,
    href: ADMIN_DESIGN_TEMPLATES_ROUTE,
  },
  {
    id: 'customer-access-support',
    label: CUSTOMER_ACCESS_COPY.page.title,
    href: ADMIN_CUSTOMER_ACCESS_ROUTE,
  },
];

/**
 * How an entry relates to the current location.
 *
 * - `page`: the entry *is* the current page.
 * - `section`: the current page lives inside the entry's subtree — the entry is
 *   still a destination the operator can go back to.
 * - `none`: unrelated.
 *
 * The distinction matters: a nested route such as `/products/{productId}`
 * belongs to the product section but is not the product list, so the list stays
 * reachable. Collapsing the two states is what makes a section unreachable from
 * its own detail screen.
 */
export type AdminNavItemState = 'page' | 'section' | 'none';

export function resolveNavItemState(item: AdminNavItem, pathname: string): AdminNavItemState {
  if (pathname === item.href) {
    return 'page';
  }
  // Home is a prefix of every route, so it is never a containing section.
  if (item.href === AUTHENTICATED_HOME_ROUTE) {
    return 'none';
  }
  return pathname.startsWith(`${item.href}/`) ? 'section' : 'none';
}

/** Whether an entry is the current page itself — never merely its section. */
export function isCurrentNavItem(item: AdminNavItem, pathname: string): boolean {
  return resolveNavItemState(item, pathname) === 'page';
}
