import { brandedPageTitle } from '../../../features/storefront-seo';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  CHECKOUT_QUANTITY_PARAM,
  CHECKOUT_SKU_PARAM,
  CheckoutQueryProvider,
  READY_MADE_CHECKOUT_COPY,
  readQueryHint,
  resolveCheckoutSelection,
  type ReadyMadeCheckoutView,
} from '../../../features/ready-made-checkout';
import { loadProductDetail } from '../../../features/product-detail/services/product-detail.server';
import { loadReadyMadePurchase } from '../../../features/ready-made-purchase/services/ready-made-purchase.server';

/**
 * `force-dynamic`, and here it is not merely correctness about publication but
 * about **inventory**.
 *
 * The summary states a live unit price and is bounded by a live availability, so
 * a cached copy of this page would offer stock that has since been reserved and
 * a price an operator has since changed. The segment therefore renders per
 * request, with no `revalidate` and no `generateStaticParams` — the same
 * position `/san-pham/[slug]` takes, for a stricter reason.
 */
export const dynamic = 'force-dynamic';

interface CheckoutPageProps {
  readonly params: Promise<{ readonly slug: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Checkout is transactional, not discoverable (`APP12-S02` §33).
 *
 * The canonical private-route pattern, verbatim: `robots: { index: false,
 * follow: false }`, **no** `alternates.canonical` and **no** `openGraph`. The
 * Storefront root layout carries only `metadataBase`, so a route that requests
 * no public block inherits none — which is what `seo-private-metadata.test.ts`
 * asserts for the nine delivered private routes and now asserts for this one.
 *
 * Nothing derived from the visitor reaches the title. Not the SKU, not the
 * quantity, not the Product — a checkout address is per-customer state, and a
 * document title is the one place it would end up in a browser history, a shared
 * screenshot and a referrer-adjacent surface without anybody deciding to put it
 * there.
 *
 * There is no sitemap entry either, and none had to be removed: the sitemap is
 * composed from `PUBLIC_STATIC_ROUTES` plus the API's live indexable entity
 * inventory, and this route is in neither. Its absence is structural.
 */
export const metadata: Metadata = {
  title: brandedPageTitle(READY_MADE_CHECKOUT_COPY.pageTitle),
  robots: { index: false, follow: false },
};

/**
 * `/mua-hang/[slug]` — Ready-Made checkout (`APP12-D01` §H locks the path).
 *
 * ## The server decides what may be bought; the island only collects
 *
 * Both reads happen here, in one request: the Product, and the current
 * `publicProductVariant_list` purchase projection. The `?sku=` and `?quantity=`
 * hints `APP12-S01` composed are then resolved **against that projection** — a
 * SKU that is unknown here, that belongs to another Product, or that sits under
 * a variant the projection could not resolve produces a refusal, never a
 * substitute (§9, §10, §11). The client island receives the outcome and has no
 * catalog client of its own, so it cannot re-decide it.
 *
 * ## Wave 1, with the custom capability off
 *
 * This route is Ready-Made, and Ready-Made *is* Wave 1. It is not in
 * `isWithheldWave2Route`'s family and the proxy never sees it, so it works with
 * `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false` (§8). No second release flag is
 * introduced, and nothing on the page offers a custom-request or Studio path.
 *
 * ## The not-found decision
 *
 * Taken from the Product read alone, exactly as `/san-pham/[slug]` takes it: an
 * unknown slug, a `DRAFT`, an `ARCHIVED` and a non-public category all arrive as
 * one indistinguishable `not-found`. A Product that exists but has nothing to
 * sell is **not** a 404 — it is a real, published Product whose checkout address
 * names nothing buyable, and the page says so with the approved card.
 */
export default async function ReadyMadeCheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const result = await loadProductDetail(slug);

  if (result.kind === 'not-found') notFound();
  if (result.kind === 'error') {
    throw new Error('The product read for checkout failed.');
  }

  // Read after the not-found decision, never in parallel with it: a purchase
  // read for a slug this route has already decided the visitor may not see
  // would be a request about a Product they are not allowed to know exists.
  const purchase = await loadReadyMadePurchase(slug);

  const view: ReadyMadeCheckoutView = {
    slug: result.product.slug,
    name: result.product.name,
    ...(result.product.media[0] === undefined ? {} : { thumbnailUrl: result.product.media[0].url }),
    selection: resolveCheckoutSelection({
      view: purchase.kind === 'ready' ? purchase.view : undefined,
      skuHint: readQueryHint(query[CHECKOUT_SKU_PARAM]),
      quantityHint: readQueryHint(query[CHECKOUT_QUANTITY_PARAM]),
    }),
  };

  return <CheckoutQueryProvider view={view} />;
}
