/**
 * Vietnamese copy catalog for the authenticated Admin shell (APP1-A02). All
 * user-facing strings live here (FRONTEND_CONVENTIONS §14); copy is taken from
 * the approved Figma shell nodes (FIG-ADMIN-SHELL-* — see the APP1-A02 report).
 *
 * `actor` is a static product label for the single Admin operator, not a role
 * returned by the API. The shell never renders API-supplied roles or
 * permissions (there is exactly one Admin actor — REQ-IDN-001).
 */
import { BRAND_NAME, VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `shell`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const homeMessage = messageView(VI_MESSAGES.admin, 'home');

const shellMessage = messageView(VI_MESSAGES.admin, 'shell');

export const ADMIN_SHELL_COPY = {
  brand: {
    eyebrow: shellMessage.text('brand.eyebrow'),
    /**
     * The brand name, imported rather than written. It was `Xưởng Thêu` — the
     * placeholder wordmark `BRD0-F02` locked `Nét Thêu` to replace — and the
     * Admin shell was one of the surfaces still publishing it.
     */
    title: BRAND_NAME,
  },
  /** Static label for the single Admin actor; never an API-supplied role. */
  actor: shellMessage.text('actor'),
  skipToContent: shellMessage.text('skipToContent'),
  nav: {
    sidebarLabel: shellMessage.text('nav.sidebarLabel'),
    drawerLabel: shellMessage.text('nav.drawerLabel'),
    future: shellMessage.text('nav.future'),
    openMenu: shellMessage.text('nav.openMenu'),
    closeMenu: shellMessage.text('nav.closeMenu'),
  },
  logout: {
    action: shellMessage.text('logout.action'),
    pending: shellMessage.text('logout.pending'),
    error: shellMessage.text('logout.error'),
    retry: shellMessage.text('logout.retry'),
  },
  loading: {
    status: shellMessage.text('loading.status'),
  },
  reconnect: {
    status: shellMessage.text('reconnect.status'),
  },
  sessionExpired: {
    title: shellMessage.text('sessionExpired.title'),
    description: shellMessage.text('sessionExpired.description'),
    action: shellMessage.text('sessionExpired.action'),
  },
  /**
   * The operator's landing screen (`V01-UX-015`, `APP12-V02` §19).
   *
   * It replaced a placeholder whose body told an operator that products,
   * orders, designs and requests "sẽ xuất hiện trong các giai đoạn tiếp theo" —
   * true when `APP1-A02` wrote it, and eleven phases out of date by the time
   * V01 photographed it. The destination hints live in the message repository
   * under `home.hints` and are read by `admin-home-destinations.ts`.
   */
  home: {
    heading: homeMessage.text('heading'),
    lead: homeMessage.text('lead'),
  },
} as const;
