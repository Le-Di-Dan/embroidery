import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  buildStorefrontPolicyPath,
} from '../../../storefront-shell/model/storefront-navigation';
import type { ContentPage } from '../content-page';
import { POLICY_SLUG } from './policy-slugs';

/**
 * `/chinh-sach/thanh-toan` — the payment policy (`APP11-S05`).
 *
 * ## Every number here is quoted, not chosen
 *
 * ```text
 * 40% deposit after design approval    docs/01 §8, docs/04 BR-005
 * 60% remainder before hand-over       docs/01 §8
 * quotation is versioned, has a validity period, has a breakdown,
 *   and is not changed by a later price list      docs/01 §6
 * manual Admin reconciliation                     docs/01 §8
 * never treat a payment as successful on a
 *   client redirect alone                         docs/01 §8, CLAUDE.md §9
 * ```
 *
 * ## Bank transfer only, because that is what is delivered
 *
 * `docs/01` §8 lists MoMo and ZaloPay as *desired* methods alongside bank
 * transfer. APP7 and APP9 delivered the bank-transfer path — a QR for the exact
 * quoted amount, optional transfer evidence, and operator verification. A policy
 * page listing two wallets a customer cannot actually pay with would be a
 * published promise the checkout cannot keep, so this page describes the
 * delivered method and does not enumerate the roadmap.
 *
 * ## Verification is described as manual, because it is
 *
 * The page states plainly that the workshop confirms each transfer. Saying a
 * bank or provider webhook confirms it automatically would be false *and* would
 * contradict the rule that a redirect alone never means success. Nothing here
 * exposes an internal transfer reference beyond what the customer already sees
 * in their own payment screen.
 */
export const PAYMENT_POLICY: ContentPage = {
  id: 'policy-payment',
  path: buildStorefrontPolicyPath(POLICY_SLUG.payment),
  eyebrow: 'Chính sách',
  heading: 'Chính sách thanh toán',
  lead: 'Bạn thanh toán khi nào, bằng cách nào, và Nét Thêu xác nhận khoản thanh toán của bạn ra sao.',
  metaTitle: 'Chính sách thanh toán — Nét Thêu',
  metaDescription:
    'Thanh toán tại Nét Thêu: đặt cọc 40% sau khi duyệt thiết kế, 60% còn lại trước khi nhận hàng, chuyển khoản ngân hàng theo đúng số tiền trên báo giá.',
  trail: { parentLabel: 'Chính sách' },
  sections: [
    {
      kind: 'prose',
      id: 'when',
      heading: 'Hai mốc thanh toán',
      paragraphs: [
        'Bạn không phải trả tiền để nhận báo giá, và không phải trả trước khi duyệt thiết kế.',
      ],
      bullets: [
        'Đặt cọc 40% giá trị đơn hàng, sau khi bạn đã duyệt bản thêu. Đây là mốc để xưởng vào sản xuất.',
        'Thanh toán 60% còn lại trước khi xưởng bàn giao thành phẩm.',
      ],
    },
    {
      kind: 'prose',
      id: 'quotation',
      heading: 'Số tiền bạn thanh toán',
      paragraphs: [
        'Mỗi báo giá có bảng chi tiết, tổng tiền, số tiền đặt cọc, số tiền còn lại và thời hạn hiệu lực. Bạn xem toàn bộ trước khi quyết định.',
        'Mức giá đã báo cho bạn được giữ nguyên; bảng giá thay đổi về sau không làm thay đổi báo giá bạn đang có. Nếu bạn yêu cầu thay đổi làm khác đi phạm vi đã báo giá, xưởng báo lại giá và chờ bạn xác nhận.',
      ],
    },
    {
      kind: 'prose',
      id: 'method',
      heading: 'Hình thức thanh toán',
      paragraphs: [
        'Nét Thêu nhận chuyển khoản ngân hàng. Ở bước thanh toán, xưởng hiển thị mã QR chuyển khoản kèm đúng số tiền của đơn hàng, để bạn không phải tự nhập lại.',
        'Bạn có thể gửi kèm ảnh chụp biên lai chuyển khoản để xưởng đối chiếu nhanh hơn. Đây là tùy chọn hỗ trợ, không bắt buộc.',
      ],
    },
    {
      kind: 'prose',
      id: 'verification',
      heading: 'Xác nhận thanh toán',
      paragraphs: [
        'Nét Thêu đối chiếu và xác nhận từng khoản thanh toán thủ công. Đơn hàng chỉ được ghi nhận là đã thanh toán sau khi xưởng xác nhận, chứ không phải ngay khi trình duyệt của bạn quay về trang kết quả.',
        'Vì vậy, giữa lúc bạn chuyển khoản và lúc trạng thái đơn hàng cập nhật có thể có một khoảng chờ. Nếu bạn đã chuyển khoản mà trạng thái chưa đổi sau một thời gian hợp lý, hãy liên hệ xưởng kèm thông tin đơn hàng của bạn.',
      ],
    },
    {
      kind: 'prose',
      id: 'security',
      heading: 'An toàn khi thanh toán',
      paragraphs: [
        'Nét Thêu không yêu cầu bạn cung cấp mật khẩu, mã OTP ngân hàng hay thông tin đăng nhập tài khoản ngân hàng — không qua điện thoại, tin nhắn hay bất kỳ kênh nào.',
        'Bạn chỉ thanh toán theo thông tin hiển thị trong trang thanh toán của chính đơn hàng bạn, mở từ đường liên kết riêng xưởng đã gửi cho bạn.',
      ],
    },
    {
      kind: 'links',
      id: 'payment-related',
      heading: 'Liên quan',
      links: [
        {
          id: 'policy-shipping',
          label: 'Chính sách giao hàng',
          href: buildStorefrontPolicyPath(POLICY_SLUG.shipping),
        },
        {
          id: 'policy-returns',
          label: 'Chính sách đổi trả',
          href: buildStorefrontPolicyPath(POLICY_SLUG.returns),
        },
        { id: 'service', label: 'Dịch vụ và quy trình', href: STOREFRONT_SERVICE_ROUTE },
        { id: 'faq', label: 'Câu hỏi thường gặp', href: STOREFRONT_FAQ_ROUTE },
        {
          id: 'commission',
          label: 'Gửi yêu cầu thêu',
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
        },
      ],
    },
  ],
};
