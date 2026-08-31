import {
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  STOREFRONT_STORE_ROUTE,
  buildStorefrontPolicyPath,
} from '../../../storefront-shell/model/storefront-navigation';
import type { ContentPage } from '../content-page';
import { POLICY_SLUG } from './policy-slugs';

/**
 * `/chinh-sach/bao-mat` — the privacy policy (`APP11-S05`).
 *
 * ## Only the categories the delivered flows visibly collect
 *
 * ```text
 * contact details        docs/01 §4  (e-mail or phone, verified before a
 *                                     secure link is issued)
 * request details        docs/01 §5  (product, variant, quantity, area, size,
 *                                     colours, notes)
 * uploaded files         docs/01 §5  (design artwork; APP7 transfer evidence)
 * order and payment      docs/01 §6, §8
 * operational messages   docs/01 §4  (notifications carrying the secure link)
 * ```
 *
 * Each is something the customer themselves typed, uploaded or received, so the
 * page tells them nothing about the system they could not already observe.
 *
 * ## The claims this page will not make
 *
 * No retention period, no zero-retention claim, no data-residency statement, no
 * encryption or certification claim, no third-party sharing schedule and no
 * cookie policy. None of them is fixed by an approved document, each is the kind
 * of assertion a regulator or a customer would hold the store to, and
 * `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` is an internal control document
 * rather than a published privacy commitment.
 *
 * It also describes **no security implementation detail** — no token lifetime,
 * no storage topology, no control name. A privacy page exists to tell a customer
 * what is collected and why; the mechanism is not theirs to audit and publishing
 * it only helps someone attacking it.
 *
 * The one operational statement made is the one the customer is already relying
 * on and must understand: the link they were sent is private to them, is
 * time-limited, and can be revoked (`docs/01` §4).
 */
export const PRIVACY_POLICY: ContentPage = {
  id: 'policy-privacy',
  path: buildStorefrontPolicyPath(POLICY_SLUG.privacy),
  eyebrow: 'Chính sách',
  heading: 'Chính sách bảo mật',
  lead: 'Nét Thêu thu thập những thông tin nào của bạn, dùng vào việc gì, và bạn kiểm soát chúng ra sao.',
  metaTitle: 'Chính sách bảo mật — Nét Thêu',
  metaDescription:
    'Thông tin Nét Thêu thu thập khi bạn gửi yêu cầu thêu, mục đích sử dụng, và cách đường liên kết riêng của bạn được bảo vệ.',
  trail: { parentLabel: 'Chính sách' },
  sections: [
    {
      kind: 'prose',
      id: 'what',
      heading: 'Thông tin Nét Thêu thu thập',
      paragraphs: [
        'Xưởng chỉ thu thập những thông tin cần để xử lý yêu cầu của bạn. Tất cả đều do bạn cung cấp trong quá trình đặt thêu.',
      ],
      bullets: [
        'Thông tin liên hệ: email hoặc số điện thoại bạn dùng để xác minh và nhận thông báo, cùng tên bạn cung cấp.',
        'Nội dung yêu cầu: sản phẩm, biến thể, số lượng, vùng thêu, kích thước, màu sắc mong muốn và ghi chú của bạn.',
        'Tệp bạn tải lên: hình ảnh thiết kế bạn gửi, và ảnh biên lai chuyển khoản nếu bạn chọn gửi kèm.',
        'Thông tin đơn hàng: báo giá, các phiên bản thiết kế, khoản thanh toán và thông tin nhận hàng.',
        'Trao đổi giữa bạn và xưởng trong quá trình xử lý đơn hàng.',
      ],
    },
    {
      kind: 'prose',
      id: 'why',
      heading: 'Mục đích sử dụng',
      paragraphs: [
        'Thông tin của bạn được dùng để thực hiện chính đơn hàng của bạn, và để xưởng liên lạc với bạn về đơn hàng đó.',
      ],
      bullets: [
        'Xác minh rằng người nhận báo giá và bản thiết kế đúng là bạn.',
        'Dựng bản thêu, báo giá và sản xuất theo đúng yêu cầu bạn gửi.',
        'Gửi thông báo về các bước trong đơn hàng của bạn.',
        'Ghi nhận và đối chiếu thanh toán.',
        'Bàn giao thành phẩm cho bạn.',
      ],
    },
    {
      kind: 'prose',
      id: 'secure-link',
      heading: 'Đường liên kết riêng của bạn',
      paragraphs: [
        'Sau khi bạn xác minh email hoặc số điện thoại, xưởng gửi cho bạn một đường liên kết riêng để xem yêu cầu, báo giá, các phiên bản thiết kế và thực hiện thanh toán.',
        'Đường liên kết này dành riêng cho bạn, có thời hạn và có thể được thu hồi. Bạn không nên chia sẻ nó cho người khác, vì ai có đường liên kết cũng xem được nội dung đơn hàng của bạn.',
      ],
    },
    {
      kind: 'prose',
      id: 'design-files',
      heading: 'Thiết kế bạn gửi lên',
      paragraphs: [
        'Hình ảnh thiết kế bạn tải lên được dùng để thực hiện đơn hàng của bạn. Nét Thêu không đăng công khai thiết kế của khách lên website.',
        'Những tác phẩm xuất hiện trong bộ sưu tập công khai là do xưởng chủ động chọn và đưa lên; đây là một bước riêng do xưởng thực hiện, không phải hệ quả tự động của việc bạn đặt hàng.',
      ],
    },
    {
      kind: 'prose',
      id: 'contact',
      heading: 'Liên hệ về thông tin của bạn',
      paragraphs: [
        'Nếu bạn muốn hỏi, chỉnh sửa hoặc trao đổi về thông tin cá nhân của mình, hãy liên hệ Nét Thêu qua các kênh trên website kèm thông tin đơn hàng của bạn, để xưởng xác định đúng yêu cầu cần xử lý.',
      ],
    },
    {
      kind: 'links',
      id: 'privacy-related',
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
        { id: 'service', label: 'Dịch vụ và quy trình', href: STOREFRONT_SERVICE_ROUTE },
        { id: 'faq', label: 'Câu hỏi thường gặp', href: STOREFRONT_FAQ_ROUTE },
        { id: 'store', label: 'Ghé xưởng', href: STOREFRONT_STORE_ROUTE },
      ],
    },
  ],
};
