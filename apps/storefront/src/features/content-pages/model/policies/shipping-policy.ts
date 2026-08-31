import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_STORE_ROUTE,
  buildStorefrontPolicyPath,
} from '../../../storefront-shell/model/storefront-navigation';
import type { ContentPage } from '../content-page';
import { POLICY_SLUG } from './policy-slugs';

/**
 * `/chinh-sach/giao-hang` — the shipping policy (`APP11-S05`).
 *
 * ## Bounded by what shipping actually is in this product
 *
 * `docs/01-PRODUCT-REQUIREMENTS.md` §10 is unusually explicit about the limits,
 * and they are the substance of this page:
 *
 * ```text
 * in scope   Admin enters the shipping fee
 *            Admin may record a carrier name and an internal waybill code
 * excluded   carrier API integration
 *            third-party fee calculation
 *            customer-facing journey tracking
 *            any shipping adapter
 * ```
 *
 * `docs/02` §2 repeats "Shipping provider API" and "Shipping tracking" as
 * explicitly out of scope. So this policy promises no carrier, no delivery
 * window, no nationwide coverage, no tracking page and no free shipping — not
 * as caution, but because each of those would describe a capability the product
 * deliberately does not have.
 *
 * What it can say truthfully: the fee is quoted before you pay, hand-over
 * happens once the order is complete, collection at the workshop is available,
 * and the remaining balance is settled before the item leaves.
 */
export const SHIPPING_POLICY: ContentPage = {
  id: 'policy-shipping',
  path: buildStorefrontPolicyPath(POLICY_SLUG.shipping),
  eyebrow: 'Chính sách',
  heading: 'Chính sách giao hàng',
  lead: 'Cách Nét Thêu bàn giao thành phẩm cho bạn, và những gì được thống nhất trước khi hàng rời xưởng.',
  metaTitle: 'Chính sách giao hàng — Nét Thêu',
  metaDescription:
    'Cách Nét Thêu bàn giao thành phẩm: nhận tại xưởng hoặc gửi tới địa chỉ của bạn, phí giao hàng báo trước trong báo giá.',
  trail: { parentLabel: 'Chính sách' },
  sections: [
    {
      kind: 'prose',
      id: 'handover',
      heading: 'Hai cách nhận hàng',
      paragraphs: [
        'Sau khi thêu xong và bạn đã thanh toán đủ, xưởng bàn giao thành phẩm theo cách bạn chọn khi đặt hàng.',
      ],
      bullets: ['Nhận trực tiếp tại xưởng.', 'Xưởng gửi tới địa chỉ bạn cung cấp.'],
    },
    {
      kind: 'prose',
      id: 'fee',
      heading: 'Phí giao hàng',
      paragraphs: [
        'Nếu đơn hàng của bạn cần giao tới địa chỉ, phí giao hàng được xưởng ghi rõ trong báo giá trước khi bạn đặt cọc. Bạn xem được khoản này trong bảng chi tiết báo giá.',
        'Xưởng không tự động tính phí từ bên thứ ba. Nếu chi phí giao hàng thay đổi so với báo giá ban đầu, xưởng báo lại và chờ bạn xác nhận trước khi tiếp tục.',
      ],
    },
    {
      kind: 'prose',
      id: 'timing',
      heading: 'Thời điểm bàn giao',
      paragraphs: [
        'Xưởng chỉ bàn giao sau khi bản thêu hoàn tất và phần thanh toán còn lại đã được ghi nhận.',
        'Nét Thêu thêu thủ công theo từng yêu cầu riêng, nên thời gian hoàn thiện phụ thuộc vào độ phức tạp và số lượng của đơn hàng. Xưởng trao đổi mốc thời gian dự kiến với bạn trong quá trình báo giá, thay vì áp một mốc cố định cho mọi đơn.',
      ],
    },
    {
      kind: 'prose',
      id: 'tracking',
      heading: 'Theo dõi đơn hàng',
      paragraphs: [
        'Bạn theo dõi tiến trình đơn hàng qua đường liên kết riêng mà xưởng gửi cho bạn, và xưởng chủ động báo khi có bước mới.',
        'Website của Nét Thêu không tích hợp hệ thống tra cứu hành trình của đơn vị vận chuyển. Nếu đơn hàng của bạn được gửi qua một đơn vị vận chuyển, xưởng cung cấp thông tin xưởng có khi bạn hỏi.',
      ],
    },
    {
      kind: 'prose',
      id: 'on-arrival',
      heading: 'Khi nhận hàng',
      paragraphs: [
        'Bạn nên kiểm tra thành phẩm ngay khi nhận. Nếu có vấn đề, liên hệ Nét Thêu sớm nhất có thể để xưởng xem xét cùng bạn.',
      ],
    },
    {
      kind: 'links',
      id: 'shipping-related',
      heading: 'Liên quan',
      links: [
        {
          id: 'policy-payment',
          label: 'Chính sách thanh toán',
          href: buildStorefrontPolicyPath(POLICY_SLUG.payment),
        },
        {
          id: 'policy-returns',
          label: 'Chính sách đổi trả',
          href: buildStorefrontPolicyPath(POLICY_SLUG.returns),
        },
        { id: 'faq', label: 'Câu hỏi thường gặp', href: STOREFRONT_FAQ_ROUTE },
        { id: 'store', label: 'Ghé xưởng', href: STOREFRONT_STORE_ROUTE },
        {
          id: 'commission',
          label: 'Gửi yêu cầu thêu',
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
        },
      ],
    },
  ],
};
