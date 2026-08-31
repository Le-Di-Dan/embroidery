import { AUTHENTICATED_HOME_ROUTE } from '../../../config/routes';
import { ADMIN_ASSETS_ROUTE, ASSET_COPY } from '../../assets';
import { ADMIN_CUSTOMER_ACCESS_ROUTE, CUSTOMER_ACCESS_COPY } from '../../customer-access-support';
import { ADMIN_REQUESTS_ROUTE, CUSTOM_REQUEST_QUEUE_COPY } from '../../custom-request-queue';
import { ADMIN_DESIGN_TEMPLATES_ROUTE, DESIGN_TEMPLATE_COPY } from '../../design-templates';
import { ADMIN_GALLERY_ROUTE, GALLERY_LIST_COPY } from '../../gallery-list';
import { ADMIN_ORDERS_ROUTE, ORDER_QUEUE_COPY } from '../../order-queue';
import { ADMIN_PRODUCTION_ROUTE, PRODUCTION_QUEUE_COPY } from '../../production-queue';
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
 * list, `APP3-A02` adds the Design Template list, `APP4-A01` adds customer
 * access support, `APP5-A01` adds the custom-request queue, `APP7-A01` adds the
 * order queue, `APP8-A02` adds the production queue and `APP11-A01` adds the
 * gallery; the label and the route both come from the owning capability, so
 * there is one spelling of each. Order follows the approved Admin frames, which
 * put orders after requests — the sequence an order actually travels —
 * production after orders (`780:22`), and support last (`732:9`).
 *
 * `Bộ sưu tập` sits beside the catalog rather than at the end: it is a
 * merchandising surface over published work, so it belongs with assets and
 * products and not among the operational queues. `APP11-D01` records that the
 * side navigation gains the entry but fixes no ordinal for it, so this is the
 * grouping the existing order implies rather than a position read off a frame.
 *
 * `resolveNavItemState` already gives this entry what `APP11-A02` will need:
 * `/gallery/{entryId}` resolves to `section` on the same item, so the editor
 * keeps `Bộ sưu tập` active without a second nav entry to keep in step.
 *
 * `APP8-D01` also draws a `Kho` entry beside this one (`780:20`). It is
 * deliberately **not** added: `APP8-B01` publishes stock by SKU only, so a
 * parameterless `/kho` destination would have to be an all-SKU list no accepted
 * contract can serve, and this shell's own rule is that every item points at a
 * route that exists. `/san-xuat` is a real parameterless route, which is why
 * production may join and inventory may not. `FU-APP8-A01-04` stays open.
 */
export const ADMIN_PRIMARY_NAV: readonly AdminNavItem[] = [
  { id: 'overview', label: 'Tổng quan', href: AUTHENTICATED_HOME_ROUTE },
  { id: 'assets', label: ASSET_COPY.page.title, href: ADMIN_ASSETS_ROUTE },
  { id: 'products', label: PRODUCT_COPY.page.title, href: ADMIN_PRODUCTS_ROUTE },
  { id: 'gallery', label: GALLERY_LIST_COPY.page.navLabel, href: ADMIN_GALLERY_ROUTE },
  {
    id: 'design-templates',
    label: DESIGN_TEMPLATE_COPY.page.title,
    href: ADMIN_DESIGN_TEMPLATES_ROUTE,
  },
  {
    id: 'custom-requests',
    label: CUSTOM_REQUEST_QUEUE_COPY.page.title,
    href: ADMIN_REQUESTS_ROUTE,
  },
  { id: 'orders', label: ORDER_QUEUE_COPY.page.title, href: ADMIN_ORDERS_ROUTE },
  {
    id: 'production',
    label: PRODUCTION_QUEUE_COPY.page.navLabel,
    href: ADMIN_PRODUCTION_ROUTE,
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
