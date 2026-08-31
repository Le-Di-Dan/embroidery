/**
 * Vietnamese copy catalog for the Homepage / store introduction (`APP11-S01`).
 *
 * All user-facing strings live here (FRONTEND_CONVENTIONS §14). Two rules bound
 * what may be written in this file:
 *
 * 1. **No fabricated operational facts.** No address, opening hours, phone,
 *    years in business, customer or order counts, capacity, certification or
 *    guarantee appears here, because none of them is canonical anywhere in the
 *    repository. The one concrete number below — the 40% deposit — is
 *    `docs/04-BUSINESS-RULES.md` BR-005, quoted rather than invented, and it is
 *    stated with its precondition (approval first) so it cannot read as a
 *    pay-up-front demand, which BR-005 explicitly forbids.
 * 2. **No promise of a route that does not exist.** The Collections section
 *    carries editorial framing only. `/bo-suu-tap` is `APP11-S02`'s to build;
 *    until it does, a "view collections" call to action here would be a dead
 *    anchor, so there is no such string to accidentally render.
 *
 * Editorial direction is `docs/design/DESIGN_VISION.md` §8–§10 (the Homepage is
 * a gallery, the hero introduces briefly, the works arrive within seconds) and
 * `docs/design/USER_FLOW_ARCHITECTURE.md` §6.3 (the commission ask comes after
 * appreciation, and is never presented in isolation).
 */
export const HOMEPAGE_COPY = {
  /** Section 1 — Hero. Owns the page's single `<h1>`. */
  hero: {
    heading: 'Xưởng thêu thủ công theo yêu cầu',
    lead: 'Mỗi tác phẩm được thêu tay theo câu chuyện riêng của bạn — từ ý tưởng đầu tiên đến bản thêu hoàn chỉnh.',
    /** The lower-commitment move, deliberately first (USER_FLOW §6.3). */
    exploreAction: 'Khám phá tác phẩm',
    commissionAction: 'Đặt thêu theo yêu cầu',
  },

  /** Section 2 — Featured Works. */
  featured: {
    heading: 'Tác phẩm nổi bật',
    intro: 'Một vài tác phẩm đã hoàn thiện tại xưởng.',
    action: 'Xem tất cả tác phẩm',
  },

  /** Section 3 — Discover Feed preview. */
  discover: {
    heading: 'Khám phá',
    intro: 'Chất liệu, kỹ thuật và câu chuyện phía sau từng đường thêu.',
    action: 'Vào trang khám phá',
  },

  /**
   * Section 4 — Collections. Heading and editorial framing only: no cards, no
   * slugs, no link. `APP11-S02` supplies the feed this section will point at.
   */
  collections: {
    heading: 'Bộ sưu tập',
    intro:
      'Các tác phẩm được nhóm theo chủ đề và kỹ thuật, để bạn thấy được chiều sâu và phạm vi của xưởng.',
  },

  /** Section 5 — Studio Story. */
  story: {
    heading: 'Câu chuyện của xưởng',
    paragraphs: [
      'Xưởng Thêu làm việc trực tiếp với từng khách hàng, trên từng tác phẩm một.',
      'Chúng tôi bắt đầu từ ý tưởng của bạn, dựng bản thiết kế, rồi cùng bạn chỉnh sửa cho đến khi bản thiết kế đúng với điều bạn hình dung.',
      'Chỉ khi đó khung thêu mới bắt đầu chạy. Không có sản phẩm hàng loạt — mỗi đơn hàng là một lần hợp tác.',
    ],
  },

  /** Section 6 — Commission CTA. */
  commission: {
    heading: 'Đặt thêu theo yêu cầu',
    lead: 'Bạn duyệt bản thiết kế trước, rồi mới thanh toán.',
    /** Process transparency, from `docs/04-BUSINESS-RULES.md` BR-005. */
    stepsLabel: 'Các bước đặt thêu',
    steps: [
      {
        id: 'request',
        title: 'Gửi yêu cầu',
        body: 'Mô tả ý tưởng, kích thước và số lượng bạn cần.',
      },
      {
        id: 'review',
        title: 'Duyệt thiết kế',
        body: 'Xưởng gửi báo giá và bản thiết kế để bạn xem và yêu cầu chỉnh sửa.',
      },
      {
        id: 'deposit',
        title: 'Đặt cọc và sản xuất',
        body: 'Sau khi bạn duyệt thiết kế, đơn hàng được đặt cọc 40% và bắt đầu thêu.',
      },
    ],
    action: 'Bắt đầu yêu cầu',
  },

  /** Shared states for the two product-backed sections. */
  works: {
    loading: 'Đang tải tác phẩm…',
    empty: 'Các tác phẩm sẽ xuất hiện tại đây sau khi được xưởng hoàn thiện.',
    error: 'Chưa thể tải các tác phẩm. Bạn vẫn có thể khám phá hoặc gửi yêu cầu thêu.',
    /** Screen-reader text for a work with no deliverable thumbnail. */
    imageMissing: 'Chưa có ảnh cho tác phẩm này.',
  },
} as const;
