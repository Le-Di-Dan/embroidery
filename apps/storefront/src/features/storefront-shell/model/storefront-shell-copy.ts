/**
 * Vietnamese copy catalog for the shared Storefront shell (APP1-S01A). All
 * user-facing strings live here (FRONTEND_CONVENTIONS §14); copy is taken from
 * the approved Figma shell nodes (FIG-STOREFRONT-SHELL-* — see the APP1-S01A
 * report). No business data (address, phone, email, social, policy) is invented
 * here; footer content is limited to approved generic brand copy until canonical
 * company values exist (see the report's follow-ups).
 */
export const STOREFRONT_SHELL_COPY = {
  brand: {
    /** Text wordmark; the storefront ships no logo asset, so the brand is type. */
    wordmark: 'Xưởng Thêu',
    /** Accessible name for the brand home link. */
    homeLabel: 'Xưởng Thêu — về trang chủ',
  },
  skipToContent: 'Bỏ qua tới nội dung chính',
  nav: {
    primaryLabel: 'Điều hướng chính',
    drawerLabel: 'Điều hướng',
    openMenu: 'Mở menu điều hướng',
    closeMenu: 'Đóng menu điều hướng',
    /** Small visible tag on nav items whose routes are not built yet. */
    unavailableTag: 'Sắp ra mắt',
    /** Screen-reader suffix marking a nav item as not yet available. */
    unavailableAria: 'chưa khả dụng',
    /** Truthful once Discover shipped: it names the areas still to come. */
    future: 'Các khu vực còn lại sẽ sớm ra mắt.',
  },
  search: {
    label: 'Tìm kiếm',
    hint: 'Tìm kiếm tác phẩm thêu…',
    /** Announced state: the affordance is presentational, not functional yet. */
    unavailable: 'Tìm kiếm sẽ sớm ra mắt.',
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
    title: 'Kết nối',
    /**
     * Carried inside every CTA, so the accessible name reads
     * "Zalo — Mở ứng dụng bên ngoài". On the circular dock it lives in the
     * visually-hidden name span rather than as on-screen caption text: the link
     * still states both the channel and the handoff, and no `aria-label`
     * overrides visible text, because a circle has none to override.
     */
    externalCaption: 'Mở ứng dụng bên ngoài',
    /** Provider names as plain type: the design system holds no licensed provider artwork. */
    channels: {
      zalo: 'Zalo',
      messenger: 'Messenger',
    },
    /**
     * The visible mark inside each circle, and the reason it is a letter rather
     * than a logo: the design system holds no licensed provider artwork, and an
     * invented approximation of a trademark is worse than an initial. Each is
     * `aria-hidden` — the adjacent name span carries the meaning — so no CTA is
     * ever announced as a single character.
     */
    marks: {
      zalo: 'Z',
      messenger: 'M',
    },
  },
  footer: {
    tagline: 'Studio thêu thủ công theo yêu cầu.',
    /** Rights line without a hard-coded year (no stale/invented business value). */
    rights: '© Xưởng Thêu · Studio thêu theo yêu cầu.',
  },
} as const;
