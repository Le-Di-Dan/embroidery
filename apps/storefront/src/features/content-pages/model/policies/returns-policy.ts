import {
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  STOREFRONT_STORE_ROUTE,
  buildStorefrontPolicyPath,
} from '../../../storefront-shell/model/storefront-navigation';
import type { ContentPage } from '../content-page';
import { POLICY_SLUG } from './policy-slugs';

/**
 * `/chinh-sach/doi-tra` — the returns policy (`APP11-S05`).
 *
 * ## The hardest page in S05, and why it is the shortest on numbers
 *
 * `docs/01-PRODUCT-REQUIREMENTS.md` §2.1 requires a `Chính sách đổi trả` page.
 * It, `docs/02`, `docs/04-BUSINESS-RULES.md` and `docs/06` then say **nothing**
 * about a return window, a refund deadline, a restocking rule, an exchange
 * entitlement or a cancellation right. The audit that established this is
 * recorded in the S05 completion report §E.
 *
 * So there is no authority for `7 ngày đổi trả`, `hoàn tiền trong 30 ngày`,
 * `miễn phí đổi trả`, `hoàn tiền tự động` or `đổi trả vô điều kiện`, and every
 * one of them is absent. A return window is not a detail an implementation
 * checkpoint may pick: it is a commercial and consumer-law commitment, it is the
 * single most quoted line of any returns policy, and a number invented here
 * would silently become the store's published position — enforceable against the
 * Product Owner, who never chose it.
 *
 * ## What a truthful page can still say
 *
 * A process, not a promise: personalised work is made to one customer's
 * specification and cannot be resold, which is the honest reason a blanket
 * change-of-mind return is not offered; the approved design is the reference
 * against which a complaint is judged, which is precisely why the approval step
 * exists; and a defect is reviewed case by case against that approved design and
 * applicable consumer obligations.
 *
 * The last clause is deliberately a *reference* to statutory obligations rather
 * than a statement of what they are. Naming a specific Vietnamese consumer-law
 * entitlement would be a legal claim beyond repository authority; acknowledging
 * that such obligations apply and are not displaced by this page is the
 * conservative direction to be wrong in, and it costs the customer nothing.
 */
export const RETURNS_POLICY: ContentPage = {
  id: 'policy-returns',
  path: buildStorefrontPolicyPath(POLICY_SLUG.returns),
  eyebrow: 'Chính sách',
  heading: 'Chính sách đổi trả',
  lead: 'Sản phẩm thêu theo yêu cầu được làm riêng cho bạn. Trang này giải thích cách Nét Thêu xử lý khi thành phẩm có vấn đề.',
  metaTitle: 'Chính sách đổi trả — Nét Thêu',
  metaDescription:
    'Cách Nét Thêu xử lý khiếu nại về thành phẩm thêu theo yêu cầu: liên hệ sớm, xưởng đối chiếu với bản thiết kế bạn đã duyệt và xử lý theo từng trường hợp.',
  trail: { parentLabel: 'Chính sách' },
  sections: [
    {
      kind: 'prose',
      id: 'nature',
      heading: 'Vì sao sản phẩm thêu theo yêu cầu khác hàng có sẵn',
      paragraphs: [
        'Mỗi bản thêu tại Nét Thêu được dựng theo nội dung, kích thước và sản phẩm của riêng một khách hàng. Thành phẩm mang dấu riêng của bạn và không thể bán lại cho người khác.',
        'Vì vậy xưởng không nhận đổi trả vì lý do đổi ý sau khi thành phẩm đã thêu xong. Đổi lại, xưởng đặt bước duyệt thiết kế trước khi sản xuất, để bạn thấy chính xác bản thêu sẽ ra sao trước khi xưởng bắt đầu.',
      ],
    },
    {
      kind: 'prose',
      id: 'before-production',
      heading: 'Trước khi vào sản xuất',
      paragraphs: [
        'Ở giai đoạn trao đổi và duyệt thiết kế, bạn có thể yêu cầu chỉnh sửa nhiều lần, hoặc dừng lại nếu bản thêu chưa đúng ý. Đây là thời điểm dễ điều chỉnh nhất và không tốn thêm chi phí thêu lại.',
        'Xưởng chỉ vào sản xuất sau khi bạn duyệt. Bản thiết kế bạn duyệt là bản mà xưởng thêu và cũng là bản mà hai bên đối chiếu về sau.',
      ],
    },
    {
      kind: 'prose',
      id: 'if-something-is-wrong',
      heading: 'Nếu thành phẩm có vấn đề',
      paragraphs: [
        'Hãy liên hệ Nét Thêu sớm nhất có thể sau khi nhận hàng, kèm hình ảnh thành phẩm và thông tin đơn hàng của bạn.',
        'Xưởng xem xét từng trường hợp, đối chiếu thành phẩm với bản thiết kế bạn đã duyệt và với đơn hàng đã thống nhất.',
      ],
      bullets: [
        'Nếu thành phẩm khác với bản thiết kế bạn đã duyệt, hoặc có lỗi do quá trình thêu, xưởng chịu trách nhiệm khắc phục.',
        'Cách khắc phục — sửa lại, thêu lại, hay phương án khác — được xưởng trao đổi và thống nhất với bạn theo từng trường hợp cụ thể.',
        'Nếu vấn đề nằm ở nội dung mà bạn đã duyệt, xưởng vẫn sẵn sàng cùng bạn tìm phương án, và sẽ báo trước nếu phát sinh chi phí.',
      ],
    },
    {
      kind: 'prose',
      id: 'statutory',
      heading: 'Quyền của bạn theo quy định pháp luật',
      paragraphs: [
        'Chính sách này mô tả cách Nét Thêu làm việc trên thực tế. Nó không thay thế và không hạn chế các quyền mà pháp luật bảo vệ người tiêu dùng dành cho bạn.',
      ],
    },
    {
      kind: 'links',
      id: 'returns-related',
      heading: 'Liên quan',
      links: [
        { id: 'service', label: 'Dịch vụ và quy trình', href: STOREFRONT_SERVICE_ROUTE },
        {
          id: 'policy-shipping',
          label: 'Chính sách giao hàng',
          href: buildStorefrontPolicyPath(POLICY_SLUG.shipping),
        },
        {
          id: 'policy-payment',
          label: 'Chính sách thanh toán',
          href: buildStorefrontPolicyPath(POLICY_SLUG.payment),
        },
        { id: 'faq', label: 'Câu hỏi thường gặp', href: STOREFRONT_FAQ_ROUTE },
        { id: 'store', label: 'Ghé xưởng', href: STOREFRONT_STORE_ROUTE },
      ],
    },
  ],
};
