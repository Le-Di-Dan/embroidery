import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_GALLERY_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  STOREFRONT_STORE_ROUTE,
  buildStorefrontPolicyPath,
} from '../../storefront-shell/model/storefront-navigation';
import { POLICY_IDS, POLICY_SLUG } from '../../content-pages';

/**
 * The footer store-presentation block's content (`APP11-S05`, closing
 * `FU-APP10-D01-05`).
 *
 * Design authority: `FIG-APP11-FOOTER-STORE-SUPPLEMENT` `872:1029` (Desktop
 * 1440), `-TABLET` `888:1006` (1024), `-MOBILE` `888:1058` (390) and the
 * responsive-authority annotation `889:1030`.
 *
 * ## Four columns, in one order, at every width
 *
 * `889:1030` §D.1 fixes the order as store identity → contact → service &
 * support → policies, identical at all three widths, and requires that source
 * order equal visual order so keyboard order needs no correction. That is why
 * the columns are an ordered array here and the stylesheet reflows them with
 * grid track counts alone — never with CSS `order`, which would leave a keyboard
 * user tabbing through the footer in an order nobody can see.
 *
 * ## Column 4 is generated, not transcribed
 *
 * The policy links come from `POLICY_IDS` through `buildStorefrontPolicyPath`,
 * so the footer advertises exactly the four policies that resolve — a fifth
 * policy would appear here automatically, and a hand-typed slug that no longer
 * resolves cannot. `889:1030` also requires the four to stay in one column at
 * every width, which is why they are one column's `links` rather than a flat
 * list the layout could wrap across two.
 *
 * ## No Zalo or Messenger link
 *
 * `889:1030` is explicit that external contact is **not** a footer column at any
 * width — it lives only in the floating dock (`APP10-E01`). Publishing the same
 * two URLs twice on every page is exactly what moving them to the dock was
 * meant to stop, so column 2 names the channels in prose and links to none.
 *
 * ## No store facts here
 *
 * Address, opening hours, phone and e-mail are resolved from
 * `resolveStoreFacts()` at render time, not written here, so the footer and the
 * Local page publish the same values under the same rule. None is canonical
 * today, so none is rendered — and no placeholder replaces them.
 */
export const STORE_PRESENTATION_COPY = {
  /** Names the region. The block is a `<section>`, not a second `<footer>`. */
  regionLabel: 'Thông tin cửa hàng',
  identity: {
    heading: 'Nét Thêu',
    descriptor: 'Xưởng thêu cá nhân hóa',
    /** Rendered only when no store fact is canonical, so the column is never bare. */
    fallback: 'Thông tin địa chỉ và giờ mở cửa sẽ được cập nhật.',
    action: 'Ghé xưởng',
    actionHref: STOREFRONT_STORE_ROUTE,
  },
  contact: {
    heading: 'Liên hệ',
    /**
     * Shown when no phone or e-mail is canonical. It routes the visitor to
     * channels that genuinely exist rather than apologising for the gap, and it
     * describes the dock without duplicating its links.
     */
    fallback:
      'Gửi yêu cầu trực tuyến để xưởng báo giá, hoặc nhắn cho xưởng qua các kênh ở góc màn hình.',
    action: 'Gửi yêu cầu thêu',
    actionHref: STOREFRONT_CUSTOM_REQUEST_ROUTE,
  },
  service: {
    heading: 'Dịch vụ & hỗ trợ',
    links: [
      { id: 'service', label: 'Dịch vụ thêu', href: STOREFRONT_SERVICE_ROUTE },
      { id: 'faq', label: 'Câu hỏi thường gặp', href: STOREFRONT_FAQ_ROUTE },
      { id: 'gallery', label: 'Bộ sưu tập', href: STOREFRONT_GALLERY_ROUTE },
    ],
  },
  policies: {
    heading: 'Chính sách',
    /** Labels for the four canonical policies, keyed by id. */
    labels: {
      shipping: 'Chính sách giao hàng',
      payment: 'Chính sách thanh toán',
      returns: 'Chính sách đổi trả',
      privacy: 'Chính sách bảo mật',
    },
  },
} as const;

/** One footer link. */
export interface StorePresentationLink {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

/**
 * The policy column, composed from the canonical set rather than transcribed.
 * Order is `POLICY_IDS`, which is the approved footer and sitemap order.
 */
export const STORE_PRESENTATION_POLICY_LINKS: readonly StorePresentationLink[] = POLICY_IDS.map(
  (id) => ({
    id: `policy-${id}`,
    label: STORE_PRESENTATION_COPY.policies.labels[id],
    href: buildStorefrontPolicyPath(POLICY_SLUG[id]),
  }),
);
