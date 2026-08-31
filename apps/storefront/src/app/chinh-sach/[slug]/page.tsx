import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  ContentPageScreen,
  contentPageMetadata,
  getStorefrontPolicy,
  POLICY_IDS,
  POLICY_SLUG,
} from '../../../features/content-pages';

/**
 * `/chinh-sach/[slug]` — the policy family (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-POLICY-DESKTOP` `864:983` on the shared
 * template `863:677` / `864:1085` / `864:1253`.
 *
 * ## One route file, four pages, and no fifth
 *
 * `/chinh-sach` itself has **no `page.tsx`** — it is a framework parent
 * directory only. It is not linked, not advertised in the sitemap and not
 * created to give the policy breadcrumb something to point at; the trail's
 * `Chính sách` label is plain text for exactly that reason.
 *
 * `getStorefrontPolicy` resolves four literal slugs and nothing else. An unknown
 * or malformed slug is a **safe not-found**: no redirect to a policy index, no
 * reflected slug in the response, and no hint that the address space is larger
 * than four. It is indistinguishable from the 404 an unknown Product or gallery
 * slug produces, which is the property `APP11-G01`'s exit gate asks for.
 *
 * ## Metadata follows the same branch
 *
 * `generateMetadata` resolves the same way `default` does, and calls
 * `notFound()` on the same input. A known policy gets its canonical, its
 * `index, follow` state and its public Open Graph block from the S04 helper; an
 * unknown one never reaches the builder, so it publishes no canonical, no
 * `og:*` and no indexable state — it cannot, because nothing was built for it.
 */

/**
 * The four concrete policy URLs, so Next renders them at build time and treats
 * everything else as the miss it is.
 *
 * `dynamicParams = false` is the router-level half of the same guarantee the
 * resolver makes: an unlisted slug is refused by the framework before the
 * segment runs, rather than relying only on the `notFound()` below. Two
 * independent barriers, both derived from one four-element set.
 */
export function generateStaticParams(): { slug: string }[] {
  return POLICY_IDS.map((id) => ({ slug: POLICY_SLUG[id] }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const policy = getStorefrontPolicy(slug);

  if (policy === undefined) {
    notFound();
  }

  return contentPageMetadata(policy);
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = getStorefrontPolicy(slug);

  if (policy === undefined) {
    notFound();
  }

  return <ContentPageScreen page={policy} />;
}
