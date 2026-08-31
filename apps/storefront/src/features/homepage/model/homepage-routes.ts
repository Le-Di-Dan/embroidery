import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_DISCOVER_ROUTE,
  STOREFRONT_GALLERY_ROUTE,
} from '../../storefront-shell';

/**
 * Every route the Homepage is allowed to link to (`APP11-S01` §7; Collections
 * activated by `APP11-S02`).
 *
 * The Homepage is the Storefront's densest set of outbound links, which makes it
 * the easiest place to ship a dead anchor. Collecting the decisions here means
 * the answer to "may this section link somewhere?" is written down once, next to
 * the reason, instead of being re-decided inside six components.
 *
 * **Active** — the route exists today:
 *   Featured Works / Discover preview → `/kham-pha`      (`APP2-S01`)
 *   A work card                       → `/san-pham/[slug]` (`APP2-S02`,
 *                                        built by the shell's path builder)
 *   Commission CTA                    → `/yeu-cau/moi`   (`APP5-S01`)
 *   Collections                       → `/bo-suu-tap`    (`APP11-S02`)
 *
 * Nothing is staged any more. `APP11-S01` left Collections deliberately
 * without a constant — "a path that exists as a string is a path something can
 * eventually href" — precisely so the link and the route would land together.
 * `APP11-S02` created the route on the shell, where every other Storefront path
 * lives, and the section gains its anchor in the same change. There is still no
 * literal here: the constant is re-exported from the shell, so the header IA
 * item and this section can never disagree about the address.
 *
 * The Homepage links to the **feed**, never to one gallery entry:
 * `/bo-suu-tap/[slug]` is `APP11-S03`'s route and does not exist.
 */

/** Featured Works and the Discover preview both continue into the feed. */
export const HOMEPAGE_DISCOVER_ROUTE = STOREFRONT_DISCOVER_ROUTE;

/**
 * The commission call to action. The **existing** request flow — no `/cart`,
 * no `/checkout`, no second intake form, and nothing invented for the Homepage.
 */
export const HOMEPAGE_COMMISSION_ROUTE = STOREFRONT_CUSTOM_REQUEST_ROUTE;

/** The Collections section continues into the public gallery feed. */
export const HOMEPAGE_GALLERY_ROUTE = STOREFRONT_GALLERY_ROUTE;
