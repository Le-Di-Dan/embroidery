import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import { BRAND_NAME } from '@embroidery/ui';

import type { Metadata } from 'next';

import { toAbsolutePublicUrl } from '../../../config/public-origin';

/**
 * The one builder for a **public** page's canonical URL and Open Graph block
 * (`APP11-S04`).
 *
 * ## Why this is a helper and not a root-layout default
 *
 * `APP11-G01` warned that adding global SEO infrastructure is exactly how a
 * secure route quietly acquires a public identity. Next's metadata merges
 * *field by field* down the segment tree: an `openGraph` object declared in the
 * root layout is inherited by every route that does not replace it, and
 * `/truy-cap/thanh-toan` would then publish an `og:url` for a page nobody may
 * link to. A route that forgets to opt out of an inherited default looks
 * identical, in source, to one that never needed to.
 *
 * So the composition is inverted. The root layout carries only `metadataBase` —
 * URL-resolution infrastructure, which resolves relative values and emits no tag
 * of its own — and every public Open Graph payload is *requested* by the page
 * that wants one, through this function. A private route inherits nothing
 * because there is nothing to inherit, which is a structural guarantee rather
 * than a convention someone has to remember while adding a route.
 *
 * ## What it emits, and what it will not invent
 *
 * `type`, `url`, `title`, `description`, `locale`, and images only when the
 * caller has a genuinely public image path from its own contract.
 *
 * `siteName` is now emitted, and the reason it was not is worth keeping.
 * `APP11-S04` omitted it because the page titles said `Xưởng Thêu` and the
 * secure-route titles said `Nét Thêu`, and `og:site_name` is precisely the
 * field that would have settled an open Product Owner copy question by accident,
 * in published markup, without anybody deciding. It is no longer open:
 * `BRD0-F02` locked the brand name `Nét Thêu` — "locked and now replace the
 * placeholder wordmark" — and `APP12-H06` §7 makes it the canonical metadata
 * brand. So the field is filled from the decision rather than from a guess.
 *
 * There is no `article:*` metadata, no author and no published date: none of
 * those facts exists in any contract this app reads. No `twitter` block is
 * written either; Next derives `twitter:card`/`title`/`description` from the
 * Open Graph block above, which restates the same facts rather than adding one.
 *
 * ## An absent description is published as absent, not inherited
 *
 * The same field-by-field merge that makes a root `openGraph` dangerous applies
 * to `description`, and the root layout carries one as the app-wide fallback.
 * A Product with no description of its own therefore used to publish the store's
 * blurb — "Cửa hàng thêu — sản phẩm nền và dịch vụ thêu theo yêu cầu." — as
 * `<meta name="description">` *and*, because Open Graph falls back to it, as
 * `og:description`. Measured on the running stack: every description-less
 * Product served the identical sentence (`APP12-H06`).
 *
 * That is a claim the page cannot support. The sentence describes the store, not
 * the artwork, and repeating it on every such Product is the duplicate-meta
 * pattern a crawler discounts anyway. So the field is set to `null` — Next's
 * explicit "no value, do not inherit" — rather than left absent. A search engine
 * then writes its snippet from the page's own visible copy, which is true, while
 * an operator who authors a description still has it published verbatim.
 */

/**
 * The static browser/metadata copy, from the canonical Vietnamese message
 * repository (`packages/i18n/messages/vi/seo.json`, `APP12-V02` §5A.3).
 */
const seoMessage = messageView(VI_MESSAGES.seo);

/** `vi`, matching `<html lang="vi">`. Open Graph wants the underscored form. */
export const PUBLIC_OG_LOCALE = 'vi_VN';

/**
 * The canonical customer-facing brand (`BRD0-F02`, `APP12-H06` §7).
 *
 * Written once. The three feed and landing routes each carried their own
 * `— Xưởng Thêu` literal, which is how one store came to publish two names: a
 * brand repeated in three template strings is three places for a rename to miss.
 *
 * `APP12-V02` §5A finished the job: it is no longer a literal here either, but
 * the identity constant `@embroidery/ui` owns for the approved symbol and
 * lockup. The store's name is not translatable copy, so it does not live in the
 * message repository; the *sentence pattern* around it does.
 */
export const PUBLIC_BRAND_NAME = BRAND_NAME;

/**
 * A public page's title: its own subject, then the brand.
 *
 * Used by the routes whose title is app-authored copy. The two entity detail
 * routes deliberately do **not** call it: their title is
 * `seo.title ?? name` — an operator's own words — and appending a brand to a
 * title the operator wrote would overrule a decision this app does not own.
 * Those pages carry the brand through `og:site_name` instead, which is the
 * field for exactly that.
 */
export function publicPageTitle(subject: string): string {
  return brandedPageTitle(subject);
}

/**
 * The same composition, for the routes that are deliberately **not** public.
 *
 * `/truy-cap/*`, `/xac-minh-lien-he` and `/mua-hang/[slug]` are `noindex` and
 * publish no canonical and no Open Graph — but they still put a title in a
 * browser tab, and that title had the brand appended by a literal in each of
 * the nine route files. One sentence pattern, one place: the private routes
 * call this and the public ones call `publicPageTitle`, and both read the same
 * message (`APP12-V02` §5A).
 */
export function brandedPageTitle(subject: string): string {
  return seoMessage.text('storefront.brandedTitle', { title: subject, brand: PUBLIC_BRAND_NAME });
}

/** Every public surface here is a page rather than an article or a product. */
const PUBLIC_OG_TYPE = 'website';

export interface PublicPageMetadataInput {
  /** Root-relative canonical path from a route builder — never a literal. */
  readonly path: string;
  readonly title: string;
  /** Omitted from both the description tag and `og:description` when absent. */
  readonly description?: string;
  /**
   * A root-relative, already-public media path the caller's own contract
   * returned (`APP2-T01` / `APP11-B03` delivery routes). Absent is a valid and
   * common answer: no canonical social image exists for the feeds or the
   * Homepage, and picking a representative Product photo here would silently
   * become the store's social-image policy.
   */
  readonly imagePath?: string;
}

/**
 * Canonical + Open Graph for one public page.
 *
 * The canonical is emitted **absolute** rather than relative. `metadataBase`
 * would resolve a relative one identically, but a `sitemap.xml` entry, an
 * `og:url` and a `<link rel="canonical">` for the same page are then built by
 * one function from one origin, so they cannot disagree about the store's
 * address. It also fails loudly when the origin is unconfigured, at the page
 * that would otherwise have published a guessed host.
 */
export function publicPageMetadata(input: PublicPageMetadataInput): Metadata {
  const url = toAbsolutePublicUrl(input.path);
  const description = input.description?.trim();
  const hasDescription = description !== undefined && description !== '';

  return {
    title: input.title,
    // `null`, never omitted: an omitted key inherits the root layout's fallback,
    // and this function exists to stop a page publishing a fact it does not have.
    description: hasDescription ? description : null,
    alternates: { canonical: url },
    openGraph: {
      type: PUBLIC_OG_TYPE,
      url,
      siteName: PUBLIC_BRAND_NAME,
      title: input.title,
      ...(hasDescription ? { description } : {}),
      locale: PUBLIC_OG_LOCALE,
      ...(input.imagePath === undefined
        ? {}
        : { images: [{ url: toAbsolutePublicUrl(input.imagePath) }] }),
    },
  };
}
