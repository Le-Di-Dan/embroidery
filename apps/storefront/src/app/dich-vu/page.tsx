import type { Metadata } from 'next';

import { ContentPageScreen, SERVICE_PAGE, contentPageMetadata } from '../../features/content-pages';

/**
 * `/dich-vu` — the Service page (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-SERVICE-DESKTOP` `864:677` on the shared
 * template `863:677` / `864:1085` / `864:1253`.
 *
 * The segment is four lines because it has nothing to decide: it binds one named
 * static definition to one route. There is no data fetch, no `searchParams`, no
 * cache directive and no error state, because there is no runtime input that
 * could fail — the page is source, so a build that compiles is a page that
 * renders.
 *
 * Statically rendered on purpose. The gallery and Product segments are
 * `force-dynamic` because publication and eligibility are re-read per request;
 * a static content page has no equivalent to go stale against, and rendering it
 * per request would buy nothing.
 */
export function generateMetadata(): Metadata {
  return contentPageMetadata(SERVICE_PAGE);
}

export default function ServicePage() {
  return <ContentPageScreen page={SERVICE_PAGE} />;
}
