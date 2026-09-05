/**
 * Vietnamese copy catalog for the shared Storefront shell (APP1-S01A). All
 * user-facing strings live here (FRONTEND_CONVENTIONS §14); copy is taken from
 * the approved Figma shell nodes (FIG-STOREFRONT-SHELL-* — see the APP1-S01A
 * report). No business data (address, phone, email, social, policy) is invented
 * here; footer content is limited to approved generic brand copy until canonical
 * company values exist (see the report's follow-ups).
 */
import { VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';
import { BRAND_NAME } from '@embroidery/ui';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/storefront.json`, under `shell`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const shellMessage = messageView(
  hydrateMessages(VI_MESSAGES.storefront, { brand: BRAND_NAME }),
  'shell',
);

export const STOREFRONT_SHELL_COPY = {
  brand: {
    /**
     * The brand name, rendered as live text beside the approved vector symbol.
     *
     * `Xưởng Thêu` until the Product Owner brand-system directive: that string
     * was the placeholder wordmark `BRD0-F02` locked `Nét Thêu` to replace, and
     * it had survived here while the metadata brand had already moved, which
     * `APP12-H06` reported as a visible inconsistency (`FU-APP12-H06-01`).
     *
     * Imported rather than written, so the shell and the mark cannot disagree
     * about the store's name.
     */
    wordmark: BRAND_NAME,
    /** Accessible name for the brand home link. */
    homeLabel: shellMessage.text('brand.homeLabel'),
  },
  skipToContent: shellMessage.text('skipToContent'),
  nav: {
    primaryLabel: shellMessage.text('nav.primaryLabel'),
    drawerLabel: shellMessage.text('nav.drawerLabel'),
    openMenu: shellMessage.text('nav.openMenu'),
    closeMenu: shellMessage.text('nav.closeMenu'),
    /** Small visible tag on nav items whose routes are not built yet. */
    unavailableTag: shellMessage.text('nav.unavailableTag'),
    /** Screen-reader suffix marking a nav item as not yet available. */
    unavailableAria: shellMessage.text('nav.unavailableAria'),
    /** Truthful once Discover shipped: it names the areas still to come. */
    future: shellMessage.text('nav.future'),
  },
  search: {
    label: shellMessage.text('search.label'),
    hint: shellMessage.text('search.hint'),
    /** Announced state: the affordance is presentational, not functional yet. */
    unavailable: shellMessage.text('search.unavailable'),
  },
  /**
   * APP10-I01 external contact handoff, relocated from the footer to a floating
   * bottom-right dock by PO direction at `APP10-E01`. The four I01 frames
   * (`FIG-APP10-I01-FOOTER-DESKTOP` 842:3, `-FOOTER-MOBILE` 842:48,
   * `-CTA-STATES` 843:3, `-HANDOFF-SPEC` 843:44) still draw the footer
   * rectangles and are stale against it — redraw tracked as `FU-APP10-E01-01`.
   * No company contact block, address or phone number is invented here: the
   * handoff is two configured external links and nothing else.
   */
  contactHandoff: {
    /**
     * Names the dock landmark. Visually hidden: a floating pair of circles has
     * no room for a heading, and a landmark still needs a name to be findable.
     */
    title: shellMessage.text('contactHandoff.title'),
    /**
     * Carried inside every CTA, so the accessible name reads
     * "Zalo — Mở ứng dụng bên ngoài". On the circular dock it lives in the
     * visually-hidden name span rather than as on-screen caption text: the link
     * still states both the channel and the handoff, and no `aria-label`
     * overrides visible text, because a circle has none to override.
     */
    externalCaption: shellMessage.text('contactHandoff.externalCaption'),
    /** Provider names as plain type: the design system holds no licensed provider artwork. */
    channels: {
      zalo: shellMessage.text('contactHandoff.channels.zalo'),
      messenger: shellMessage.text('contactHandoff.channels.messenger'),
    },
    /**
     * The visible mark inside each circle, and the reason it is a letter rather
     * than a logo: the design system holds no licensed provider artwork, and an
     * invented approximation of a trademark is worse than an initial. Each is
     * `aria-hidden` — the adjacent name span carries the meaning — so no CTA is
     * ever announced as a single character.
     */
    marks: {
      zalo: shellMessage.text('contactHandoff.marks.zalo'),
      messenger: shellMessage.text('contactHandoff.marks.messenger'),
    },
  },
  footer: {
    tagline: shellMessage.text('footer.tagline'),
    /** Rights line without a hard-coded year (no stale/invented business value). */
    rights: shellMessage.text('footer.rights'),
  },
} as const;
