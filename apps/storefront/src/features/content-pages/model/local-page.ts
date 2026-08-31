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
 * `/cua-hang` — the Local/store page (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-LOCAL-DESKTOP` `864:881`, the template
 * instance that keeps the `[OPTIONAL]` store-information block.
 *
 * ## Singular, because there is one store
 *
 * `docs/02-SCOPE-AND-BOUNDARIES.md` §2 lists multi-branch as explicitly out of
 * scope. There is therefore no store id, no store list, no branch selector and
 * no `/cua-hang/[slug]`, and no map provider is loaded — a map is a third-party
 * dependency and an embedded frame in exchange for a pin the page has no
 * canonical coordinates for anyway.
 *
 * ## The page ships without the four facts it was drawn around
 *
 * `resolveStoreFacts()` returns nothing today (see `store-facts.ts` for the
 * audit). The store-information block therefore renders its `fallback` sentence
 * instead of an address and opening-hours grid, and **no row is drawn for a
 * fact that has no canonical value** — not a placeholder, not `TBD`, not a
 * plausible-looking invention.
 *
 * That is why the copy below never depends on those values. It says what is
 * genuinely true and useful without them — that this is one workshop, that work
 * is by appointment through the request flow, and where to go next — so a
 * visitor is routed to a channel that works rather than left at a page that
 * says only that it cannot tell them anything. When the Product Owner supplies
 * the values, they appear here and in the footer with no change to this file.
 */
export const LOCAL_PAGE: ContentPage = {
  id: 'local',
  path: STOREFRONT_STORE_ROUTE,
  eyebrow: 'Ghé xưởng',
  heading: 'Xưởng thêu Nét Thêu',
  lead: 'Nét Thêu là một xưởng thêu cá nhân hóa. Mọi đơn thêu đều đi qua cùng một xưởng, cùng những người thợ đã dựng nên bản thêu của bạn.',
  metaTitle: 'Ghé xưởng — Nét Thêu',
  metaDescription:
    'Thông tin về xưởng thêu Nét Thêu và cách liên hệ để đặt thêu theo yêu cầu, nhận tư vấn hoặc nhận hàng trực tiếp.',
  sections: [
    {
      kind: 'store-info',
      id: 'store-facts',
      heading: 'Thông tin xưởng',
      fallback:
        'Thông tin địa chỉ và giờ mở cửa của xưởng sẽ được cập nhật tại đây. Trong lúc này, bạn liên hệ với Nét Thêu qua biểu mẫu gửi yêu cầu hoặc các kênh nhắn tin trên website — xưởng sẽ trao đổi trực tiếp với bạn về việc tới xưởng.',
    },
    {
      kind: 'prose',
      id: 'visiting',
      heading: 'Tới xưởng',
      paragraphs: [
        'Nét Thêu làm việc theo từng đơn hàng riêng, nên xưởng hẹn trước với bạn thay vì tiếp khách vãng lai. Cách nhanh nhất để sắp xếp một buổi tới xưởng là gửi yêu cầu hoặc nhắn cho xưởng qua các kênh trên website.',
        'Bạn có thể tới xưởng để xem chất liệu và màu chỉ trước khi chốt thiết kế, hoặc để nhận thành phẩm trực tiếp thay vì gửi chuyển phát.',
      ],
    },
    {
      kind: 'prose',
      id: 'contact-channels',
      heading: 'Liên hệ với xưởng',
      paragraphs: [
        'Nếu yêu cầu của bạn đã có sẵn nội dung và sản phẩm cụ thể, gửi yêu cầu trực tuyến là cách nhanh nhất để nhận báo giá — bạn mô tả một lần và xưởng có đủ thông tin để trả lời.',
        'Nếu bạn mới đang cân nhắc và muốn hỏi trước, các kênh nhắn tin ở góc màn hình luôn sẵn sàng khi xưởng đã bật.',
      ],
    },
    {
      kind: 'links',
      id: 'local-next',
      heading: 'Trước khi ghé',
      links: [
        {
          id: 'commission',
          label: 'Gửi yêu cầu thêu',
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
          hint: 'Cách nhanh nhất để xưởng nắm được yêu cầu của bạn.',
        },
        {
          id: 'service',
          label: 'Dịch vụ và quy trình',
          href: STOREFRONT_SERVICE_ROUTE,
          hint: 'Những gì xưởng nhận làm, và các bước làm việc.',
        },
        {
          id: 'gallery',
          label: 'Bộ sưu tập',
          href: STOREFRONT_GALLERY_ROUTE,
          hint: 'Tác phẩm xưởng đã hoàn thiện.',
        },
        {
          id: 'discover',
          label: 'Sản phẩm nền',
          href: STOREFRONT_DISCOVER_ROUTE,
          hint: 'Các sản phẩm có sẵn của xưởng.',
        },
        {
          id: 'faq',
          label: 'Câu hỏi thường gặp',
          href: STOREFRONT_FAQ_ROUTE,
        },
      ],
    },
  ],
};
