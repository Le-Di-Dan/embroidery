// Public surface of the content-pages feature (`APP11-S05`) — the four static,
// Storefront-owned content pages: Service, FAQ, Local/store and the policy
// family, all rendered by one shared template.
//
// This feature reads **no API**. There is no content backend, no Admin content
// CMS and no `content_pages` runtime operation in APP11, so the copy is typed
// static source reviewed in a diff (see `model/content-page.ts`). Nothing here
// imports the generated client.

// The shared template every S05 route renders through.
export { ContentPageScreen } from './components/content-page-screen';

// The four page definitions. Each singular route binds to exactly one, by name.
export { SERVICE_PAGE } from './model/service-page';
export { FAQ_PAGE } from './model/faq-page';
export { LOCAL_PAGE } from './model/local-page';

// The policy family: the resolver `/chinh-sach/[slug]` calls, and the ordered
// set the footer column and the S04 sitemap inventory advertise. Nothing else
// may enumerate policies, so the four that resolve are the four that are linked.
export { getStorefrontPolicy, STOREFRONT_POLICY_PAGES } from './model/policies/policy-resolver';
export { POLICY_IDS, POLICY_SLUG } from './model/policies/policy-slugs';
export type { PolicyId, PolicySlug } from './model/policies/policy-slugs';

// The shared page contract, and the S04 metadata adapter the route segments use.
export type { ContentPage } from './model/content-page';
export { contentPageMetadata } from './model/content-page-metadata';

// The canonical store-fact boundary. Exported because the Local page and the
// footer store-presentation block must resolve the same facts by the same rule —
// "no canonical value, no published fact" has to hold on both surfaces at once.
export { resolveStoreFacts, hasCanonicalStoreFacts } from './model/store-facts';
export type { StoreFact, StoreFactId } from './model/store-facts';
