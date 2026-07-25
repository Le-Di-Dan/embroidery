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
    future: 'Các khu vực khám phá sẽ sớm ra mắt.',
  },
  search: {
    label: 'Tìm kiếm',
    hint: 'Tìm kiếm tác phẩm thêu…',
    /** Announced state: the affordance is presentational, not functional yet. */
    unavailable: 'Tìm kiếm sẽ sớm ra mắt.',
  },
  footer: {
    tagline: 'Studio thêu thủ công theo yêu cầu.',
    /** Rights line without a hard-coded year (no stale/invented business value). */
    rights: '© Xưởng Thêu · Studio thêu theo yêu cầu.',
  },
} as const;
