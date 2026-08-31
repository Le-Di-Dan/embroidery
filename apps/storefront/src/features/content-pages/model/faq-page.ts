import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_GALLERY_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  STOREFRONT_STORE_ROUTE,
  buildStorefrontPolicyPath,
} from '../../storefront-shell/model/storefront-navigation';
import type { ContentPage } from './content-page';
import { POLICY_SLUG } from './policies/policy-slugs';

/**
 * `/cau-hoi-thuong-gap` — the FAQ page (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-FAQ-DESKTOP` `864:779`, the template
 * instance that keeps the `[OPTIONAL]` FAQ accordion and drops media and store
 * information.
 *
 * ## The questions are the product's, not a keyword list
 *
 * Each one is a question the delivered flows actually raise — how a request
 * starts, what to prepare, how review works, when money moves, how the item is
 * handed over, where past work lives. `docs/08` §7 forbids mass-generated
 * low-value content, and a FAQ padded with questions nobody asks to catch search
 * traffic is precisely that.
 *
 * Every answer is bounded by the same authority the Service page and the
 * policies use. In particular there is **no** turnaround time, no return window,
 * no refund deadline and no shipping guarantee, because no canonical document
 * states one. Where a subject has a policy page, the answer summarises and links
 * rather than restating — one wording, one place to correct it.
 *
 * ## Answers stay in the DOM
 *
 * `ContentFaqSection` carries full answer text, and the disclosure component
 * renders every answer into the markup whether or not it is expanded. A crawler
 * and a visitor whose JavaScript has not arrived both read the whole page
 * (`docs/08` §5: never render critical SEO text only behind client code).
 */
export const FAQ_PAGE: ContentPage = {
  id: 'faq',
  path: STOREFRONT_FAQ_ROUTE,
  eyebrow: 'Hỗ trợ',
  heading: 'Câu hỏi thường gặp',
  lead: 'Những câu hỏi khách hàng hay đặt ra trước khi bắt đầu một đơn thêu theo yêu cầu tại Nét Thêu.',
  metaTitle: 'Câu hỏi thường gặp — Nét Thêu',
  metaDescription:
    'Giải đáp về cách gửi yêu cầu thêu, chuẩn bị thiết kế, duyệt bản thêu, đặt cọc, thanh toán và nhận hàng tại Nét Thêu.',
  sections: [
    {
      kind: 'faq',
      id: 'faq-list',
      heading: 'Giải đáp',
      items: [
        {
          id: 'how-to-start',
          question: 'Tôi bắt đầu một đơn thêu theo yêu cầu như thế nào?',
          answer: [
            'Bạn gửi yêu cầu trực tuyến, mô tả sản phẩm muốn thêu, nội dung cần thêu, vùng thêu và kích thước mong muốn, kèm hình ảnh thiết kế của bạn.',
            'Để xưởng gửi lại báo giá và bản thiết kế cho đúng người, bạn cần xác minh email hoặc số điện thoại. Sau đó xưởng gửi bạn một đường liên kết riêng để theo dõi yêu cầu.',
          ],
        },
        {
          id: 'what-to-prepare',
          question: 'Tôi cần chuẩn bị gì trước khi gửi yêu cầu?',
          answer: [
            'Nội dung cần thêu ở chất lượng hình ảnh tốt nhất bạn có, sản phẩm bạn muốn thêu lên, vùng thêu, kích thước mong muốn và số lượng.',
            'Bạn không cần chuẩn bị file kỹ thuật cho máy thêu. Xưởng dựng bản thêu từ thiết kế bạn gửi.',
          ],
        },
        {
          id: 'own-product',
          question: 'Tôi mang sản phẩm của mình tới thêu được không?',
          answer: [
            'Được. Khi gửi yêu cầu, bạn chọn hướng sản phẩm do bạn cung cấp, mô tả sản phẩm và gửi kèm hình ảnh cùng kích thước.',
            'Xưởng sẽ xem sản phẩm và cho bạn biết vùng thêu nào khả thi trước khi báo giá.',
          ],
        },
        {
          id: 'design-review',
          question: 'Tôi được xem bản thêu trước khi xưởng làm chứ?',
          answer: [
            'Có. Xưởng dựng bản thêu và gửi bạn duyệt qua đường liên kết riêng. Xưởng chỉ vào sản xuất sau khi bạn duyệt.',
            'Bạn có thể yêu cầu chỉnh sửa. Mỗi lần chỉnh sửa tạo một phiên bản mới, nên bạn luôn đối chiếu được với bản trước đó.',
          ],
        },
        {
          id: 'quotation',
          question: 'Báo giá được tính như thế nào?',
          answer: [
            'Xưởng báo giá thủ công theo kích thước bản thêu, số màu chỉ, độ phức tạp, số lượng, giá sản phẩm nền nếu bạn mua của xưởng, và phí giao hàng nếu có.',
            'Báo giá có bảng chi tiết và thời hạn hiệu lực. Mức giá đã báo cho bạn không thay đổi theo bảng giá về sau.',
          ],
        },
        {
          id: 'payment',
          question: 'Tôi thanh toán vào lúc nào?',
          answer: [
            'Sau khi bạn duyệt thiết kế, bạn đặt cọc 40% để xưởng vào sản xuất. Phần 60% còn lại thanh toán trước khi nhận hàng.',
            'Xưởng nhận chuyển khoản ngân hàng. Chi tiết ở trang chính sách thanh toán.',
          ],
        },
        {
          id: 'delivery',
          question: 'Tôi nhận hàng bằng cách nào?',
          answer: [
            'Bạn có thể nhận trực tiếp tại xưởng, hoặc để xưởng gửi tới địa chỉ của bạn. Phí giao hàng, nếu có, nằm trong báo giá bạn đã xem.',
            'Chi tiết ở trang chính sách giao hàng.',
          ],
        },
        {
          id: 'revisions',
          question: 'Tôi được sửa thiết kế bao nhiêu lần?',
          answer: [
            'Không có giới hạn cứng về số vòng chỉnh sửa. Xưởng làm việc cùng bạn tới khi bản thêu đúng ý.',
            'Nếu một thay đổi làm khác đi phạm vi đã báo giá — chẳng hạn đổi kích thước hay tăng số màu — xưởng sẽ báo lại giá trước khi làm tiếp.',
          ],
        },
        {
          id: 'see-examples',
          question: 'Tôi xem tác phẩm xưởng đã làm ở đâu?',
          answer: [
            'Bộ sưu tập tập hợp những tác phẩm xưởng đã hoàn thiện, kèm mô tả chất liệu và kỹ thuật.',
          ],
        },
      ],
    },
    {
      kind: 'links',
      id: 'faq-next',
      heading: 'Xem thêm',
      links: [
        {
          id: 'service',
          label: 'Dịch vụ và quy trình',
          href: STOREFRONT_SERVICE_ROUTE,
          hint: 'Toàn bộ các bước từ yêu cầu tới thành phẩm.',
        },
        {
          id: 'gallery',
          label: 'Bộ sưu tập',
          href: STOREFRONT_GALLERY_ROUTE,
          hint: 'Tác phẩm xưởng đã hoàn thiện.',
        },
        {
          id: 'commission',
          label: 'Gửi yêu cầu thêu',
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
        },
        {
          id: 'policy-payment',
          label: 'Chính sách thanh toán',
          href: buildStorefrontPolicyPath(POLICY_SLUG.payment),
        },
        {
          id: 'policy-shipping',
          label: 'Chính sách giao hàng',
          href: buildStorefrontPolicyPath(POLICY_SLUG.shipping),
        },
        {
          id: 'store',
          label: 'Ghé xưởng',
          href: STOREFRONT_STORE_ROUTE,
        },
      ],
    },
  ],
};
