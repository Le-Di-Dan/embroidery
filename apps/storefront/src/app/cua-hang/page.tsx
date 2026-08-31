import type { Metadata } from 'next';

import { ContentPageScreen, LOCAL_PAGE, contentPageMetadata } from '../../features/content-pages';

/**
 * `/cua-hang` — the Local/store page (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-LOCAL-DESKTOP` `864:881` on the shared
 * template.
 *
 * Singular by route authority: one physical store (`docs/02` §2 puts
 * multi-branch out of scope), so there is no `[storeId]` segment and no list.
 *
 * The address and opening-hours rows this page was drawn around are absent
 * today — `resolveStoreFacts()` returns nothing, and the store-information block
 * renders its truthful fallback rather than a placeholder. That is a content
 * state, not a route state, so the page is complete and indexable as it stands.
 */
export function generateMetadata(): Metadata {
  return contentPageMetadata(LOCAL_PAGE);
}

export default function LocalStorePage() {
  return <ContentPageScreen page={LOCAL_PAGE} />;
}
