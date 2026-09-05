/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/storefront.json`), not in this file
 * (`APP12-V02` §5A).
 */
const navMessage = messageView(VI_MESSAGES.storefront, 'shell.navItems');
/**
 * Storefront primary navigation model (APP1-S01A; Discover activated by
 * `APP2-S01`).
 *
 * The approved shell header (FIG-STOREFRONT-SHELL-*) presents a primary
 * navigation across the storefront's top-level discovery areas. An item is
 * rendered as a real link once — and only once — its route exists; the rest stay
 * **non-interactive** presentation with an explicit "unavailable" affordance
 * (see `storefront-primary-nav.tsx`). This preserves the approved visual language
 * without introducing a single dead anchor or an invented route path
 * (CLAUDE.md §5; APP1-S01A prompt §9). Real routes and `href`s are added by the
 * phases that own each area.
 */

/** The canonical Storefront home route; the brand link targets it. */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
export const STOREFRONT_HOME_ROUTE = '/';

/**
 * The canonical Discover route (IMP-D038, `APP2-S01-G01`). Product Owner
 * authority, not a Figma label: `/` stays Homepage-owned and `/discover`,
 * `/catalog`, `/products` and `/san-pham` are rejected, with no alias and no
 * redirect approved. Routes are shell IA, so this is the single place the path
 * is written; the discovery feature composes its category URLs from here.
 */
export const STOREFRONT_DISCOVER_ROUTE = '/kham-pha';

/**
 * The canonical Product Detail route base (IMP-D039, `APP2-S02-G01`).
 *
 * `/product/*`, `/products/*`, `/catalog/*`, `/tac-pham/*` and `/kham-pha/*` are
 * rejected as detail aliases and no redirect is approved. IMP-D038 had left this
 * path a Figma proposal; the Product Owner locked it only after the UI03
 * reconciliation, which is why it appears here and not in `APP2-S01`.
 */
export const STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE = '/san-pham';

/**
 * The one place a Product Detail URL is built.
 *
 * Both the Discover card link and the detail page's own canonical/share URL go
 * through this, so a change to the address cannot land in one and be missed in
 * the other. The slug is server-owned and already restricted to `[a-z0-9-]` by
 * `isPublicProductSlug`; encoding it anyway is a second barrier rather than the
 * only one, and it keeps a caller that skipped validation from writing a raw
 * `?`, `#` or `/` into the path.
 */
export function buildStorefrontProductDetailPath(slug: string): string {
  return `${STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE}/${encodeURIComponent(slug)}`;
}

/**
 * The canonical Studio segment, appended to one Product Detail path
 * (`APP3-S01`).
 *
 * The Studio is entered **through a Product**, because a design session is
 * opened on one exact `product → side → area` placement and nothing in the
 * public contract addresses a session without one. That is why `/studio`,
 * `/editor`, `/thiet-ke/[id]` and `/design-session/[sessionId]` are rejected:
 * each of them implies a Studio that exists apart from a Product, and none of
 * them can name the placement the API requires.
 *
 * Side and Area are **not** path authority. They are chosen inside the route
 * from the public placement manifest, deterministically when there is only one
 * of each, so a shared link can never pin a Side that has since been retired.
 */
export const STOREFRONT_STUDIO_ROUTE_SEGMENT = 'thiet-ke';

/**
 * The one place a Studio URL is built — the Product Detail path plus the Studio
 * segment, so the two addresses cannot drift apart.
 */
export function buildStorefrontStudioPath(slug: string): string {
  return `${buildStorefrontProductDetailPath(slug)}/${STOREFRONT_STUDIO_ROUTE_SEGMENT}`;
}

/**
 * The canonical Ready-Made checkout route base (`APP12-D01` §H locks the path).
 *
 * Declared here, with every other Storefront path, at `APP12-S01` — the
 * checkpoint that first *links* to it. The route itself is `APP12-S02`'s
 * deliverable and does not exist yet, which is a deliberate and bounded
 * exception to the model at the top of this file: that rule keeps a **primary
 * navigation item** from becoming a dead anchor in the shell header, and this is
 * not a nav item. The Product Detail purchase panel has to compose one exact
 * `href` and assert it (`APP12-S01` §18, §34), and writing that path as a
 * literal in the panel is how the address the panel promises and the address
 * `APP12-S02` mounts start to disagree.
 *
 * `/checkout`, `/thanh-toan` and `/dat-hang` are rejected: `/thanh-toan` is
 * already the custom deposit surface beneath `/truy-cap`, and reusing it for an
 * anonymous Ready-Made purchase would put a released Wave-1 page inside the
 * Wave-2 secure-access family the release gate withholds by name.
 */
export const STOREFRONT_CHECKOUT_ROUTE_BASE = '/mua-hang';

/**
 * The one place a Ready-Made checkout URL is built.
 *
 * Slug-addressed, exactly like Product Detail, so `/san-pham/<slug>` continues
 * to `/mua-hang/<slug>` and the Product keeps one public identity across the
 * two pages. The raw Product UUID is never in a customer URL (`APP12-S01` §20),
 * and the selection hints the panel appends are query parameters composed by
 * the feature — this builder owns the path and nothing else.
 */
export function buildStorefrontCheckoutPath(slug: string): string {
  return `${STOREFRONT_CHECKOUT_ROUTE_BASE}/${encodeURIComponent(slug)}`;
}

/**
 * The canonical custom-request creation route (`APP5-D01` locks the path;
 * `APP5-S01` built it).
 *
 * The approved header already carries the *Đặt thêu* IA item, and the model
 * above states that the owning phase supplies its `href` once the area exists.
 * APP5 owns that area, so the item is routed here rather than by inventing a
 * new call to action on a frame that draws none. A visit with no query string
 * is the customer-owned-product branch, which is complete on its own; the
 * catalog branch is still entered from a Studio placement
 * (`FU-APP5-S01-STUDIO-ENTRY-01`), which this constant does not claim to solve.
 */
export const STOREFRONT_CUSTOM_REQUEST_ROUTE = '/yeu-cau/moi';

/**
 * The canonical public gallery route (`APP11-D01`, `APP11-G01-C1`; built by
 * `APP11-S02`).
 *
 * The path is design and Product Owner authority: the approved UI05 Collections
 * Index already carries `Bộ sưu tập` as its H1 and as the active header item,
 * and the registry rows for the feed record `/bo-suu-tap` as the route. UI05's
 * own provisional `/collections` strings are superseded, and `/thu-vien` and
 * `/gallery` are rejected — no alias and no redirect is approved, so this is
 * the single place the path is written. The Homepage Collections section, the
 * header IA item and the feed's own route segment all read it from here.
 *
 * `APP11-S03` extends this family with `/bo-suu-tap/[slug]`; it does not
 * replace the constant, which is why the active-state matcher below is written
 * in terms of a section rather than an exact path.
 */
export const STOREFRONT_GALLERY_ROUTE = '/bo-suu-tap';

/**
 * The one place a gallery entry URL is built (`APP11-S03`).
 *
 * The feed card's detail action and the entry page's own canonical both go
 * through this, so the address a card promises and the address the page claims
 * for itself cannot drift apart — the same reason
 * `buildStorefrontProductDetailPath` exists.
 *
 * The entry sits directly beneath the feed because the gallery model is flat.
 * There is no parent collection to name, so `/bo-suu-tap/[collection]/[work]`,
 * `/works/[slug]` and `/tac-pham/[slug]` are all rejected, and no redirect is
 * approved.
 *
 * The slug is server-owned and derived against the same charset
 * `isPublicGalleryEntrySlug` gates, so `encodeURIComponent` can never alter a
 * legitimate one. It is a second barrier rather than the only one: a caller
 * that skipped the syntax gate must still not be able to write a raw `?`, `#`
 * or `/` into the path.
 */
export function buildStorefrontGalleryDetailPath(slug: string): string {
  return `${STOREFRONT_GALLERY_ROUTE}/${encodeURIComponent(slug)}`;
}

/**
 * Whether `pathname` is inside the area a routed navigation item names.
 *
 * The header used to compare the pathname to the route with `===`, which is
 * correct for every area that is exactly one page and wrong for the first one
 * that is not. `APP11-S03` adds `/bo-suu-tap/[slug]`, and a visitor reading one
 * gallery entry is still inside Bộ sưu tập; an exact match would silently
 * un-mark the section the moment that route lands.
 *
 * A descendant matches only on a full segment boundary, so `/bo-suu-tap-cu`
 * would not mark `/bo-suu-tap` active. The home route is exact-only for the
 * obvious reason: every path descends from `/`.
 *
 * `pathname` is nullable because `usePathname` genuinely resolves to `null`
 * outside an App Router context — which is exactly what a rendered component
 * test sees. The previous `===` comparison tolerated that by accident; a prefix
 * check would have thrown, so the null is handled rather than assumed away.
 * No pathname means no current area, which is `false` for every item.
 */
export function isStorefrontNavRouteActive(pathname: string | null, route: string): boolean {
  if (pathname === null) return false;
  if (pathname === route) return true;
  if (route === STOREFRONT_HOME_ROUTE) return false;
  return pathname.startsWith(`${route}/`);
}

/** A primary-navigation entry. `route` stays `null` until the area ships. */
export interface StorefrontNavItem {
  readonly id: string;
  readonly label: string;
  /** Reserved for the owning phase; `null` renders the item non-interactively. */
  readonly route: string | null;
}

/**
 * The approved-header primary navigation (canonical IA labels). Three areas are
 * routed: `discover` (`APP2-S01`), `commission` (`APP5-S01`) and `collections`
 * (`APP11-S02`). The other two are not built, so their items stay presentation
 * only. Do not add an `href` here for a route that does not yet exist.
 *
 * `collections` was `route: null` from `APP1-S01A` until the gallery feed
 * existed; this is the "phase that owns the area" the model above describes,
 * and the item becomes a real link in the same change that creates the route.
 * `journal` stays unrouted permanently as far as APP11 is concerned — the
 * approved Homepage deleted the Journal section outright.
 *
 * `studio` stays `route: null` after `APP3-S01`, and that is the correct
 * outcome rather than an oversight. S01 built a Studio *per Product*; there is
 * no Studio landing page, so any `href` here would have to invent one.
 */
export const STOREFRONT_PRIMARY_NAV: readonly StorefrontNavItem[] = [
  {
    id: 'discover',
    label: navMessage.text('storefrontPrimaryNav.label'),
    route: STOREFRONT_DISCOVER_ROUTE,
  },
  {
    id: 'collections',
    label: navMessage.text('storefrontPrimaryNav.label2'),
    route: STOREFRONT_GALLERY_ROUTE,
  },
  { id: 'studio', label: 'Studio', route: null },
  {
    id: 'commission',
    label: navMessage.text('storefrontPrimaryNav.label3'),
    route: STOREFRONT_CUSTOM_REQUEST_ROUTE,
  },
  { id: 'journal', label: navMessage.text('storefrontPrimaryNav.label4'), route: null },
];

/**
 * The three singular public content routes and the policy family
 * (`APP11-G01-C1` route lock; built by `APP11-S05`).
 *
 * They live here for the reason every other Storefront path does: routes are
 * shell IA, and a path that exists as a literal in two files is a path that can
 * drift. The footer store-presentation block, the content pages' own canonicals
 * and the S04 static sitemap inventory all read these four names, so the URL a
 * footer link promises, the URL a page claims for itself and the URL the sitemap
 * advertises are composed from one source.
 *
 * Each is deliberately singular. There is one physical store (`docs/02` lists
 * multi-branch as out of scope) and one Service page, so `/cua-hang/[slug]` and
 * `/dich-vu/[slug]` describe a product that does not exist. `/faq`, `/lien-he`,
 * `/store` and `/policy` are rejected aliases; no redirect is approved.
 */
export const STOREFRONT_SERVICE_ROUTE = '/dich-vu';

/** The FAQ page. `/faq` is a rejected alias. */
export const STOREFRONT_FAQ_ROUTE = '/cau-hoi-thuong-gap';

/** The single local/store page. `/store` and `/lien-he` are rejected aliases. */
export const STOREFRONT_STORE_ROUTE = '/cua-hang';

/**
 * The policy family's parent segment.
 *
 * `/chinh-sach` is a **framework parent directory only** — it has no `page.tsx`
 * and is never advertised, linked or put in the sitemap. Policies legitimately
 * have several subjects, so the family is the one dynamic route in S05; the
 * parent index would be a page with nothing on it but a list of four links the
 * footer already carries.
 */
export const STOREFRONT_POLICY_ROUTE_BASE = '/chinh-sach';

/**
 * The one place a policy URL is built.
 *
 * The footer column, each policy page's own canonical and the sitemap's four
 * concrete policy URLs all go through this, so they cannot disagree. The slug
 * comes from the closed four-value policy set rather than from user input —
 * `encodeURIComponent` is a second barrier, not the only one, exactly as on the
 * Product and gallery builders above.
 */
export function buildStorefrontPolicyPath(slug: string): string {
  return `${STOREFRONT_POLICY_ROUTE_BASE}/${encodeURIComponent(slug)}`;
}

/*
 * ## Why sibling features import this module by path, not through the barrel
 *
 * `APP11-S05` composes `StorePresentationBlock` inside `StorefrontShell`, and
 * that block reads the canonical policy set and the store-fact boundary from
 * `content-pages` — which in turn needs the route constants above. Importing
 * them through `../../storefront-shell` would load the barrel, which loads the
 * shell component, which loads the footer block, which loads `content-pages`
 * again: a genuine module cycle that fails at load with
 * `Cannot access '_storefrontnavigation' before initialization`.
 *
 * This file is a leaf — it imports nothing — so the four S05 content models, the
 * footer block's copy model and the S04 static-route inventory import it
 * directly and the cycle cannot form. The barrel stays the entry point for
 * everything else, including every component; this is the narrow, documented
 * exception rather than a general licence to reach past it.
 */
