import type { Metadata } from 'next';

import { ContentPageScreen, FAQ_PAGE, contentPageMetadata } from '../../features/content-pages';

/**
 * `/cau-hoi-thuong-gap` — the FAQ page (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-FAQ-DESKTOP` `864:779` on the shared
 * template.
 *
 * Bound to the canonical route, not to `/faq`: `APP11-G01-C1` locks the
 * Vietnamese path and approves no alias and no redirect.
 *
 * The page stays a Server Component with no client island even though it has the
 * one interactive block in S05 — the disclosure is a native `<details>`, so the
 * whole FAQ works with no JavaScript delivered at all.
 */
export function generateMetadata(): Metadata {
  return contentPageMetadata(FAQ_PAGE);
}

export default function FaqPage() {
  return <ContentPageScreen page={FAQ_PAGE} />;
}
