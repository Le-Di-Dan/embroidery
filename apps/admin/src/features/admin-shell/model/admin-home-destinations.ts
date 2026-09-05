import { VI_MESSAGES, messageView } from '@embroidery/i18n';

import { ADMIN_ASSETS_ROUTE, ASSET_COPY } from '../../assets';
import { ADMIN_CATEGORIES_ROUTE, CATEGORY_COPY } from '../../categories';
import { ADMIN_CUSTOMER_ACCESS_ROUTE, CUSTOMER_ACCESS_COPY } from '../../customer-access-support';
import { ADMIN_GALLERY_ROUTE, GALLERY_LIST_COPY } from '../../gallery-list';
import { ADMIN_ORDERS_ROUTE, ORDER_QUEUE_COPY } from '../../order-queue';
import { ADMIN_PRODUCTS_ROUTE, PRODUCT_COPY } from '../../products';

/**
 * The hints below live in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `home.hints`), not in this
 * file (`APP12-V02` §5A).
 */
const homeMessage = messageView(VI_MESSAGES.admin, 'home');

/** One destination on the operator's landing screen. */
export interface AdminHomeDestination {
  readonly id: string;
  /** Taken from the owning feature, so it matches the sidebar exactly. */
  readonly label: string;
  /** A route constant, never a literal. */
  readonly href: string;
  /** One line saying what the operator does there. */
  readonly hint: string;
}

/**
 * The Wave-1 operator destinations, in the order an operator needs them
 * (`APP12-V02` §19).
 *
 * ## Why this list and not the sidebar's
 *
 * The sidebar is the full information architecture and includes the Wave-2
 * queues — custom requests, design templates, production — which have no
 * subject that can exist while the capability is withheld (`APP12-G02` §G).
 * Putting them on the landing screen would be the same defect this screen is
 * replacing: a promise of work that is not there.
 *
 * Orders lead because that is where an operator's day starts and where the
 * work that moves money happens. Assets and the gallery come last: they are
 * merchandising, not operations.
 *
 * ## Why there is no inventory entry
 *
 * `APP8-B01` publishes stock by SKU only, so there is no parameterless `/kho`
 * route to point at — the same reason `admin-shell-nav.ts` refuses the sidebar
 * entry the approved frame draws. §19 names inventory as a recommended card;
 * offering it would mean inventing a destination, which §43 forbids more
 * strongly than §19 recommends. Stock is reached from a product's SKU, where
 * the contract can actually serve it. `FU-APP8-A01-04` stays open.
 */
export const ADMIN_HOME_DESTINATIONS: readonly AdminHomeDestination[] = [
  {
    id: 'orders',
    label: ORDER_QUEUE_COPY.page.title,
    href: ADMIN_ORDERS_ROUTE,
    hint: homeMessage.text('hints.orders'),
  },
  {
    id: 'products',
    label: PRODUCT_COPY.page.title,
    href: ADMIN_PRODUCTS_ROUTE,
    hint: homeMessage.text('hints.products'),
  },
  {
    id: 'categories',
    label: CATEGORY_COPY.page.title,
    href: ADMIN_CATEGORIES_ROUTE,
    hint: homeMessage.text('hints.categories'),
  },
  {
    id: 'gallery',
    label: GALLERY_LIST_COPY.page.navLabel,
    href: ADMIN_GALLERY_ROUTE,
    hint: homeMessage.text('hints.gallery'),
  },
  {
    id: 'assets',
    label: ASSET_COPY.page.title,
    href: ADMIN_ASSETS_ROUTE,
    hint: homeMessage.text('hints.assets'),
  },
  {
    id: 'customer-access-support',
    label: CUSTOMER_ACCESS_COPY.page.title,
    href: ADMIN_CUSTOMER_ACCESS_ROUTE,
    hint: homeMessage.text('hints.customerSupport'),
  },
];
