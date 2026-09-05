/**
 * The shared static content-page contract (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-TEMPLATE-DESKTOP` `863:677`, `-TABLET`
 * `864:1085` and `-MOBILE` `864:1253`, with the four approved instances
 * `864:677` (Service), `864:779` (FAQ), `864:881` (Local) and `864:983`
 * (Policy) — all `APPROVED_FOR_IMPLEMENTATION` under
 * `FIG-APPROVAL-APP11-D01-PO-001`.
 *
 * ## One system, four pages — and deliberately not a CMS
 *
 * The template is a *closed union of four section kinds*, not an extensible
 * block registry. That distinction is the whole point of the file. A generic
 * block model — `{ type: string; props: unknown }`, a renderer keyed by a
 * lookup table, an authoring schema — is a page builder, and APP11 has no
 * content backend, no Admin content editor and no `content_pages` runtime API
 * to feed one. Building the renderer half of a CMS with no authoring half would
 * be an abstraction for hypothetical reuse (CLAUDE.md §5) that later has to be
 * torn out before a real one can be designed.
 *
 * So a section may be exactly one of four things, every one of which an
 * approved D01 block draws, and adding a fifth is a source change that a
 * reviewer sees rather than a data change that slips past one.
 *
 * ## The media block is not instantiated
 *
 * D01 marks a media block `[OPTIONAL]` on the Service and Local instances and
 * requires real alt text on it. No canonical content-page imagery exists
 * anywhere in this repository, and picking a Product or gallery photograph here
 * would quietly make that image the store's Service illustration — the same
 * fabrication `publicPageMetadata` refuses to make for `og:image`. An optional
 * block that nothing may legitimately fill is therefore left uninstantiated
 * rather than shipped empty or filled with a stand-in.
 *
 * ## Copy lives in the definition, not in the component
 *
 * Every user-facing string on these pages is a value in one of the four page
 * definitions (`FRONTEND_CONVENTIONS` §14). The components below take a
 * definition and render it; none of them contains a Vietnamese sentence, so
 * "what does this page say" is answered by reading one data file rather than
 * six components.
 */

import type { ContentRelease } from './content-page-release';

/** One internal link out of a content page. External links are never modelled. */
export interface ContentLink {
  readonly id: string;
  readonly label: string;
  /** A root-relative path from a canonical route builder — never a literal. */
  readonly href: string;
  /** Optional one-line description rendered beneath the link label. */
  readonly hint?: string;
  /**
   * The release this link belongs to; absent means both (`APP12-V02` §7.1).
   *
   * A link to a withheld route is a dead anchor, and `content-page-release.ts`
   * is what removes it. See that file for why the Wave-2 content is marked
   * rather than deleted.
   */
  readonly release?: ContentRelease;
}

/** One question and its answer. The answer stays in the DOM at all times. */
export interface ContentFaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: readonly string[];
}

/**
 * Long-form prose: a heading, paragraphs, and an optional list. This is the
 * body of every page and the entirety of a policy.
 */
export interface ContentProseSection {
  readonly kind: 'prose';
  readonly id: string;
  /** The release this section belongs to; absent means both. */
  readonly release?: ContentRelease;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly bullets?: readonly string[];
}

/** The FAQ disclosure block. Only `/cau-hoi-thuong-gap` instantiates it. */
export interface ContentFaqSection {
  readonly kind: 'faq';
  readonly id: string;
  /** The release this section belongs to; absent means both. */
  readonly release?: ContentRelease;
  readonly heading: string;
  readonly items: readonly ContentFaqItem[];
}

/**
 * The store-information block. Only `/cua-hang` instantiates it, and it carries
 * no values of its own: it renders whatever `resolveStoreFacts` finds canonical,
 * which today is nothing (see `store-facts.ts`) — in which case the block is not
 * rendered at all (`V01-UX-027`, `APP12-V02` §11). It once carried a fallback
 * sentence for that case; publishing "the address will be updated" is exactly
 * what §11 forbids.
 */
export interface ContentStoreInfoSection {
  readonly kind: 'store-info';
  readonly id: string;
  /** The release this section belongs to; absent means both. */
  readonly release?: ContentRelease;
  readonly heading: string;
}

/** Related internal navigation. Every page instantiates exactly one. */
export interface ContentLinksSection {
  readonly kind: 'links';
  readonly id: string;
  /** The release this section belongs to; absent means both. */
  readonly release?: ContentRelease;
  readonly heading: string;
  readonly links: readonly ContentLink[];
}

/** The closed section union. Four kinds, matching the four approved blocks. */
export type ContentSection =
  ContentProseSection | ContentFaqSection | ContentStoreInfoSection | ContentLinksSection;

/**
 * A non-linked hierarchy label above the H1.
 *
 * `path` is deliberately absent on the policy parent: `/chinh-sach` has no
 * `page.tsx` and none is being created, so a linked `Chính sách` crumb would be
 * a dead anchor. D01 permits a plain-text hierarchy label, which is what this
 * models — the trail is presentation, and no `BreadcrumbList` JSON-LD is emitted
 * for a content page because none of them draws a linked trail.
 */
export interface ContentPageTrail {
  readonly parentLabel: string;
}

/** One complete static content page. */
export interface ContentPage {
  /** Stable id, used by the sitemap inventory and by tests. */
  readonly id: string;
  /** Root-relative canonical path, from a shell route constant or builder. */
  readonly path: string;
  /** Small type label above the H1 (`Dịch vụ`, `Chính sách`, …). */
  readonly eyebrow: string;
  /** The page's single `<h1>`. */
  readonly heading: string;
  /** The lead paragraph directly beneath the H1. */
  readonly lead: string;
  /** `<title>`. Held in the definition so the tab and the H1 cannot drift. */
  readonly metaTitle: string;
  /** `<meta name="description">` and `og:description`. */
  readonly metaDescription: string;
  /** Non-linked hierarchy label; only the policy family carries one. */
  readonly trail?: ContentPageTrail;
  readonly sections: readonly ContentSection[];
}
