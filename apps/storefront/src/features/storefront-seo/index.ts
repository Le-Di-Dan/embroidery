// Public surface of the storefront-seo feature (`APP11-S04`). The two framework
// metadata routes and the public page segments import from here only; the
// composition model and the inventory service stay encapsulated behind it.
//
// This feature owns the technical SEO surface — canonical URLs, Open Graph,
// `robots.txt`, `sitemap.xml` and BreadcrumbList structured data — and nothing
// visual. It renders no page chrome and ships no stylesheet.

// The public-only canonical + Open Graph builder. Exported because the inverted
// composition is the whole safety property: a public page *requests* its OG
// block, so a private route inherits none (see `public-page-metadata.ts`).
export {
  publicPageMetadata,
  publicPageTitle,
  PUBLIC_BRAND_NAME,
  PUBLIC_OG_LOCALE,
} from './model/public-page-metadata';
export type { PublicPageMetadataInput } from './model/public-page-metadata';

// The BreadcrumbList emitter for the two detail pages that draw a visible trail.
export { BreadcrumbJsonLd } from './components/breadcrumb-json-ld';
export type { BreadcrumbItem } from './model/breadcrumb-json-ld';

// The Product emitter and the offer projection that feeds it (`APP12-H06`). The
// builder is exported alongside the component so the focused structured-data
// tests can assert the document itself rather than parse it back out of markup.
export { ProductJsonLd } from './components/product-json-ld';
export { buildProductJsonLd } from './model/product-json-ld';
export type { OfferableSku, ProductJsonLdInput } from './model/product-json-ld';
export { toOfferableSkus } from './model/product-offer-projection';

// The one JSON-LD serializer, shared by both documents.
export { serializeJsonLd } from './model/json-ld-serialization';
export type { JsonLdDocument } from './model/json-ld-serialization';

// The static public route inventory — the seam `APP11-S05` extends with its four
// content pages instead of rewriting `sitemap.ts`.
export { PUBLIC_STATIC_ROUTES } from './model/public-static-routes';
export type { PublicStaticRoute } from './model/public-static-routes';

// Sitemap composition and the crawl boundary, consumed by `app/sitemap.ts` and
// `app/robots.ts` respectively.
export {
  composeSitemap,
  SITEMAP_MAX_URLS,
  SitemapCapacityExceededError,
} from './model/sitemap-composition';
export type { SitemapUrl } from './model/sitemap-composition';
export {
  ROBOTS_USER_AGENT,
  ROBOTS_ALLOW,
  ROBOTS_DISALLOW,
  ROBOTS_STUDIO_PATTERN,
  ROBOTS_SECURE_ACCESS_PREFIX,
  ROBOTS_VERIFICATION_PREFIX,
  ROBOTS_REQUEST_PREFIX,
  SITEMAP_PATH,
} from './model/robots-policy';

// `services/sitemap-inventory.server` is deliberately NOT re-exported here. It
// reaches for the server API client, which is server-only; routing it through
// the barrel would let a client component import it transitively and pull an
// internal base URL toward the browser bundle. `app/sitemap.ts` imports it by
// path, exactly as the route segments import their own server loaders.
