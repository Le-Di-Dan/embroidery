import { STOREFRONT_CUSTOM_REQUEST_ROUTE, STOREFRONT_DISCOVER_ROUTE } from '../../storefront-shell';

/**
 * Every route the Homepage is allowed to link to, and the one it deliberately
 * does not (`APP11-S01` §7).
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
 *
 * **Staged** — drawn by the approved Homepage, not linkable yet:
 *   Collections → `/bo-suu-tap`, owned by `APP11-S02`.
 *
 * The staged action has no constant below, and that is the point: a path that
 * exists as a string is a path something can eventually href. `APP11-S02`
 * introduces `/bo-suu-tap` on the shell where the other routes live, and only
 * then does the Collections section gain a link. Until then the section renders
 * its heading and editorial copy — the approved composition minus one anchor —
 * rather than a placeholder route, a disabled-looking control, or a note
 * explaining that something is on the way.
 */

/** Featured Works and the Discover preview both continue into the feed. */
export const HOMEPAGE_DISCOVER_ROUTE = STOREFRONT_DISCOVER_ROUTE;

/**
 * The commission call to action. The **existing** request flow — no `/cart`,
 * no `/checkout`, no second intake form, and nothing invented for the Homepage.
 */
export const HOMEPAGE_COMMISSION_ROUTE = STOREFRONT_CUSTOM_REQUEST_ROUTE;
