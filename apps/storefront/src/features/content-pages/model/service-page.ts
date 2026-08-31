import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_DISCOVER_ROUTE,
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_GALLERY_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  STOREFRONT_STORE_ROUTE,
} from '../../storefront-shell/model/storefront-navigation';
import type { ContentPage } from './content-page';

/**
 * `/dich-vu` — the Service page (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-SERVICE-DESKTOP` `864:677`, an instance
 * of the shared template `863:677` keeping hero, body and internal links.
 *
 * ## Every sentence here is traceable
 *
 * The journey below is the delivered APP5→APP9 product, described in the
 * customer's words:
 *
 * ```text
 * gửi yêu cầu           docs/01 §5   (APP5 custom request intake)
 * báo giá thủ công      docs/01 §6   (manual quotation: breakdown, validity,
 *                                     40% deposit / 60% remainder, price frozen)
 * duyệt thiết kế        docs/01 §7   (manual digitizing, unlimited revisions,
 *                                     each revision is a new version, approval
 *                                     through the secure link)
 * đặt cọc 40%           docs/01 §8, docs/04 BR-005 (after approval)
 * sản xuất              docs/01 §9, docs/06 (production states)
 * thanh toán 60%        docs/01 §8   (before delivery)
 * giao / nhận           docs/01 §10  (Admin-entered fee and carrier name only)
 * ```
 *
 * ## What is deliberately absent
 *
 * No delivery-day guarantee, capacity figure, turnaround time, price, minimum
 * order, certification, years in business or order count: none of them is
 * canonical anywhere in this repository, and a Service page is exactly where an
 * invented one would read as a commitment. No internal lifecycle or status name
 * appears — `docs/06`'s state machine is operator vocabulary, and a customer
 * reading `PRODUCTION_COMPLETED` learns nothing.
 *
 * Nothing here starts a second intake flow. Every outbound link is a delivered
 * public route, composed from the shell's constants.
 */
export const SERVICE_PAGE: ContentPage = {
  id: 'service',
  path: STOREFRONT_SERVICE_ROUTE,
  eyebrow: 'Dịch vụ',
  heading: 'Dịch vụ thêu theo yêu cầu',
  lead: 'Nét Thêu là xưởng thêu cá nhân hóa: mỗi bản thêu được dựng riêng theo ý tưởng của bạn, trên sản phẩm của xưởng hoặc trên sản phẩm bạn tự mang tới.',
  metaTitle: 'Dịch vụ thêu theo yêu cầu — Nét Thêu',
  metaDescription:
    'Thêu cá nhân hóa theo yêu cầu tại Nét Thêu: gửi yêu cầu, nhận báo giá, duyệt thiết kế, đặt cọc và nhận thành phẩm. Xem quy trình và những gì xưởng nhận làm.',
  sections: [
    {
      kind: 'prose',
      id: 'what-we-do',
      heading: 'Xưởng nhận làm gì',
      paragraphs: [
        'Nét Thêu thêu tên, chữ, hình và logo lên sản phẩm cá nhân hóa. Bạn có thể chọn một sản phẩm nền có sẵn của xưởng, hoặc gửi tới sản phẩm của riêng bạn để xưởng thêu lên.',
        'Mỗi bản thêu được dựng thủ công. Xưởng làm việc theo từng yêu cầu riêng, kể cả với số lượng nhỏ.',
      ],
      bullets: [
        'Thêu tên và chữ theo phông chữ, kích thước và màu chỉ bạn chọn.',
        'Thêu hình hoặc logo do bạn cung cấp, được dựng lại thành bản thêu.',
        'Thêu lên sản phẩm nền của xưởng, hoặc lên sản phẩm bạn tự mang tới.',
        'Nhận cả đơn lẻ và đơn số lượng ít.',
      ],
    },
    {
      kind: 'prose',
      id: 'journey',
      heading: 'Quy trình làm việc',
      paragraphs: [
        'Từ lúc bạn gửi yêu cầu tới lúc nhận thành phẩm, mọi bước đều có xác nhận của bạn trước khi xưởng đi tiếp. Bạn theo dõi toàn bộ tiến trình qua đường liên kết riêng mà xưởng gửi sau khi bạn xác minh email hoặc số điện thoại.',
      ],
      bullets: [
        'Gửi yêu cầu: bạn mô tả sản phẩm, vùng thêu, kích thước mong muốn và gửi kèm hình ảnh thiết kế.',
        'Báo giá: xưởng báo giá thủ công theo kích thước, số màu, số lượng và các chi phí liên quan, kèm bảng chi tiết và thời hạn hiệu lực.',
        'Duyệt thiết kế: xưởng dựng bản thêu và gửi bạn xem. Bạn có thể yêu cầu chỉnh sửa; mỗi lần chỉnh sửa tạo một phiên bản mới để bạn đối chiếu.',
        'Đặt cọc: sau khi bạn duyệt thiết kế, xưởng nhận đặt cọc 40% giá trị đơn hàng để vào sản xuất.',
        'Sản xuất: xưởng thêu theo đúng bản thiết kế bạn đã duyệt.',
        'Hoàn tất: bạn thanh toán 60% còn lại trước khi nhận hàng, rồi nhận thành phẩm.',
      ],
    },
    {
      kind: 'prose',
      id: 'before-you-start',
      heading: 'Chuẩn bị trước khi gửi yêu cầu',
      paragraphs: [
        'Yêu cầu càng rõ thì báo giá càng sát và số vòng chỉnh sửa càng ít. Bạn không cần chuẩn bị file kỹ thuật — xưởng lo phần dựng bản thêu.',
      ],
      bullets: [
        'Sản phẩm bạn muốn thêu lên: chọn từ sản phẩm nền của xưởng, hoặc mô tả sản phẩm của bạn kèm kích thước.',
        'Nội dung cần thêu: tên, chữ, hình hoặc logo, ở chất lượng hình ảnh tốt nhất bạn có.',
        'Vùng thêu và kích thước mong muốn trên sản phẩm.',
        'Số lượng, và bất kỳ ghi chú nào về màu chỉ hay thời điểm bạn cần dùng.',
      ],
    },
    {
      kind: 'links',
      id: 'service-next',
      heading: 'Bắt đầu từ đâu',
      links: [
        {
          id: 'discover',
          label: 'Khám phá sản phẩm nền',
          href: STOREFRONT_DISCOVER_ROUTE,
          hint: 'Xem các sản phẩm xưởng có sẵn để thêu lên.',
        },
        {
          id: 'gallery',
          label: 'Xem bộ sưu tập',
          href: STOREFRONT_GALLERY_ROUTE,
          hint: 'Những tác phẩm xưởng đã hoàn thiện.',
        },
        {
          id: 'commission',
          label: 'Gửi yêu cầu thêu',
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
          hint: 'Mô tả ý tưởng của bạn để xưởng báo giá.',
        },
        {
          id: 'faq',
          label: 'Câu hỏi thường gặp',
          href: STOREFRONT_FAQ_ROUTE,
          hint: 'Giải đáp về quy trình, thanh toán và nhận hàng.',
        },
        {
          id: 'store',
          label: 'Ghé xưởng',
          href: STOREFRONT_STORE_ROUTE,
          hint: 'Thông tin liên hệ và cách tới xưởng.',
        },
      ],
    },
  ],
};
