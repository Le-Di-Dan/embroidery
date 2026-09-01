// Imported from the route model rather than from the `storefront-shell` barrel,
// deliberately. The shell's primary navigation consults this policy (`APP12-G02`
// §9), so a barrel import would close a cycle — nav component → release-isolation
// → shell barrel → shell component tree → nav component — and Node resolves the
// route constants to `undefined` partway through it. The barrel re-exports these
// three names from exactly this file, so nothing about the authority changes:
// routes are still declared in one place, and this reads that place directly.
import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE,
  STOREFRONT_STUDIO_ROUTE_SEGMENT,
} from '../../storefront-shell/model/storefront-navigation';

/**
 * The Wave-2 Storefront route matrix (`APP12-G02`).
 *
 * The runtime transcription of `APP12-RELEASE-WAVE-AUTHORITY.md` §2 and §7:
 * **seven** delivered customer routes are withheld while the custom embroidery
 * capability is unreleased, and every other route on this host stays reachable.
 *
 * ## Why matching is exact, not by prefix
 *
 * Two of the three route families here are traps, and both are named in the
 * authority document as the places a prefix rule breaks a release.
 *
 * `/truy-cap` (§2.2) is the secure-access landing. It resolves a link and
 * forwards to whatever surface that link's grant names, so it serves **both**
 * waves by scope rather than by path. Disallowing the `/truy-cap` prefix would
 * take `/truy-cap/don-hang` — the Wave-1 Ready-Made order surface `APP12-S03`
 * adds — down with the four custom sub-routes, and it would do so silently,
 * months later, in a checkpoint that never touched this file. So the landing
 * itself stays allowed and the four custom children are each named.
 *
 * `/san-pham/[slug]` (§2.1) is the Product Detail page and the Wave-1
 * Ready-Made entry point. Only the `/thiet-ke` child beneath it — the Design
 * Studio — is custom. Blocking the product family would block the shop.
 *
 * ## What this policy is not
 *
 * It is not a navigation rule and not an SEO rule. §6 is explicit that
 * `noindex`, a `robots.txt` `Disallow`, absence from `sitemap.xml` and absence
 * from the menu are information-architecture facts about crawlers and menus,
 * and none of them has ever withheld anything: every route below carries
 * `noindex` today and every one of them serves a customer who types the URL.
 * The denial this policy feeds is a server refusal that does not depend on
 * JavaScript, on navigation, or on the visitor's cooperation.
 */

/** The custom-request family root, derived so it cannot drift from the route. */
const CUSTOM_REQUEST_ROUTE_BASE = STOREFRONT_CUSTOM_REQUEST_ROUTE.slice(
  0,
  STOREFRONT_CUSTOM_REQUEST_ROUTE.indexOf('/', 1),
);

/**
 * The custom-request confirmation route (`APP5-S02`).
 *
 * Named here rather than imported because the delivered screen holds it as a
 * module-private constant; deriving it from the family root keeps the two
 * halves of `/yeu-cau` written in one place.
 */
const CUSTOM_REQUEST_CONFIRMATION_ROUTE = `${CUSTOM_REQUEST_ROUTE_BASE}/da-gui`;

/** The secure-access landing. Allowed — it is `PRIVATE_SHARED`, not custom (§2.2). */
export const SECURE_ACCESS_LANDING_ROUTE = '/truy-cap';

/**
 * The four custom secure-access surfaces, as delivered by APP6, APP7 and APP9.
 *
 * Written as the segments beneath the landing rather than as whole paths, so
 * that adding `/truy-cap/don-hang` at `APP12-S03` is a matter of *not* listing
 * it — the default for anything under this prefix is allowed.
 */
const WITHHELD_SECURE_ACCESS_SEGMENTS: readonly string[] = [
  'bao-gia', // APP6-S01 — the customer quotation surface
  'duyet-thiet-ke', // APP6-S01 — design review and approval
  'thanh-toan', // APP7-S01 — the custom DEPOSIT payment surface
  'thanh-toan-con-lai', // APP9-S01 — the custom REMAINING payment surface
];

/**
 * The exact seven withheld routes, in the order §7 lists them.
 *
 * `/san-pham/[slug]/thiet-ke` is a dynamic route and therefore matched by shape
 * rather than by literal — it is the one entry that cannot be a string compare,
 * and it is handled by `isWithheldWave2Route` below.
 */
export const WITHHELD_WAVE2_ROUTES: readonly string[] = [
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  CUSTOM_REQUEST_CONFIRMATION_ROUTE,
  ...WITHHELD_SECURE_ACCESS_SEGMENTS.map((segment) => `${SECURE_ACCESS_LANDING_ROUTE}/${segment}`),
];

/** The count §7 fixes, asserted by the suite so a silent addition cannot pass. */
export const WITHHELD_WAVE2_ROUTE_COUNT = 7;

/**
 * Normalizes a request pathname for comparison.
 *
 * A trailing slash and a case difference are the same address to a customer and
 * to the router, so they must be the same address to the gate. `/` itself is
 * left alone rather than reduced to the empty string.
 */
function normalize(pathname: string): string {
  const lowered = pathname.toLowerCase();
  if (lowered.length > 1 && lowered.endsWith('/')) {
    return lowered.slice(0, -1);
  }
  return lowered;
}

/**
 * Whether a pathname is the Design Studio beneath some Product.
 *
 * Shape-matched — `/san-pham/<slug>/thiet-ke`, exactly three segments — because
 * the slug is the customer's, not ours. The segment count matters: without it
 * the check would also claim a deeper path that a later checkpoint might mount
 * under a Studio route, and claiming a route that does not exist is how a gate
 * starts denying something nobody meant to withhold.
 */
function isStudioRoute(pathname: string): boolean {
  const segments = pathname.split('/').filter((segment) => segment !== '');
  return (
    segments.length === 3 &&
    `/${segments[0] ?? ''}` === STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE &&
    segments[1] !== '' &&
    segments[2] === STOREFRONT_STUDIO_ROUTE_SEGMENT
  );
}

/**
 * The single question the gate asks of a pathname.
 *
 * Returns `true` for exactly the seven §7 routes and for nothing else. In
 * particular it returns `false` for `/truy-cap` itself, for `/xac-minh-lien-he`,
 * for `/san-pham/<slug>` and for every Wave-1 public page — each of which is a
 * released surface whose false denial would be a `G02` blocker.
 */
export function isWithheldWave2Route(pathname: string): boolean {
  const normalized = normalize(pathname);
  return WITHHELD_WAVE2_ROUTES.includes(normalized) || isStudioRoute(normalized);
}
