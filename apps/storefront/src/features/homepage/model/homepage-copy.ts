/**
 * Vietnamese copy catalog for the Homepage / store introduction (`APP11-S01`).
 *
 * All user-facing strings live here (FRONTEND_CONVENTIONS §14). Two rules bound
 * what may be written in this file:
 *
 * 1. **No fabricated operational facts.** No address, opening hours, phone,
 *    years in business, customer or order counts, capacity, certification or
 *    guarantee appears here, because none of them is canonical anywhere in the
 *    repository. The one concrete number below — the 40% deposit — is
 *    `docs/04-BUSINESS-RULES.md` BR-005, quoted rather than invented, and it is
 *    stated with its precondition (approval first) so it cannot read as a
 *    pay-up-front demand, which BR-005 explicitly forbids.
 * 2. **No promise of a route that does not exist.** The Collections section
 *    carried editorial framing only while `/bo-suu-tap` was unbuilt, so that a
 *    "view collections" call to action could not become a dead anchor.
 *    `APP11-S02` built the route, and `collections.action` was added in that
 *    same change — the rule is unchanged, its precondition is simply now met.
 *
 * Editorial direction is `docs/design/DESIGN_VISION.md` §8–§10 (the Homepage is
 * a gallery, the hero introduces briefly, the works arrive within seconds) and
 * `docs/design/USER_FLOW_ARCHITECTURE.md` §6.3 (the commission ask comes after
 * appreciation, and is never presented in isolation).
 */
import { VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';
import { BRAND_NAME } from '@embroidery/ui';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/storefront.json`, under `homepage`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const homepageMessage = messageView(
  hydrateMessages(VI_MESSAGES.storefront, { brand: BRAND_NAME }),
  'homepage',
);

export const HOMEPAGE_COPY = {
  /** Section 1 — Hero. Owns the page's single `<h1>`. */
  hero: {
    heading: homepageMessage.text('hero.heading'),
    lead: homepageMessage.text('hero.lead'),
    /** The lower-commitment move, deliberately first (USER_FLOW §6.3). */
    exploreAction: homepageMessage.text('hero.exploreAction'),
    commissionAction: homepageMessage.text('hero.commissionAction'),
  },

  /** Section 2 — Featured Works. */
  featured: {
    heading: homepageMessage.text('featured.heading'),
    intro: homepageMessage.text('featured.intro'),
    action: homepageMessage.text('featured.action'),
  },

  /** Section 3 — Discover Feed preview. */
  discover: {
    heading: homepageMessage.text('discover.heading'),
    intro: homepageMessage.text('discover.intro'),
    action: homepageMessage.text('discover.action'),
  },

  /**
   * Section 4 — Collections. Heading and editorial framing only: no cards, no
   * slugs, no link. `APP11-S02` supplies the feed this section will point at.
   */
  collections: {
    heading: homepageMessage.text('collections.heading'),
    intro: homepageMessage.text('collections.intro'),
    /**
     * The continuation into the gallery feed (`APP11-S02`). It names the
     * destination rather than the mechanism — no "xem thêm", no count, and
     * nothing about a checkpoint.
     */
    action: homepageMessage.text('collections.action'),
  },

  /** Section 5 — Studio Story. */
  story: {
    heading: homepageMessage.text('story.heading'),
    paragraphs: homepageMessage.list('story.paragraphs'),
  },

  /** Section 6 — Commission CTA. */
  commission: {
    heading: homepageMessage.text('commission.heading'),
    lead: homepageMessage.text('commission.lead'),
    /** Process transparency, from `docs/04-BUSINESS-RULES.md` BR-005. */
    stepsLabel: homepageMessage.text('commission.stepsLabel'),
    steps: [
      {
        id: 'request',
        title: homepageMessage.text('commission.steps.0.title'),
        body: homepageMessage.text('commission.steps.0.body'),
      },
      {
        id: 'review',
        title: homepageMessage.text('commission.steps.1.title'),
        body: homepageMessage.text('commission.steps.1.body'),
      },
      {
        id: 'deposit',
        title: homepageMessage.text('commission.steps.2.title'),
        body: homepageMessage.text('commission.steps.2.body'),
      },
    ],
    action: homepageMessage.text('commission.action'),
  },

  /** Shared states for the two product-backed sections. */
  works: {
    loading: homepageMessage.text('works.loading'),
    empty: homepageMessage.text('works.empty'),
    error: homepageMessage.text('works.error'),
    /** Screen-reader text for a work with no deliverable thumbnail. */
    imageMissing: homepageMessage.text('works.imageMissing'),
  },
} as const;
