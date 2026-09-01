/**
 * Vietnamese copy catalog for the Discover feed (`APP2-S01`).
 *
 * All user-facing strings live here (FRONTEND_CONVENTIONS §14). Nothing in this
 * catalog promises a capability the backend does not have: there is no search
 * copy, no collection copy, no result count and no commission call to action,
 * because `APP2-B04` exposes only an unfiltered/category-filtered listing with
 * keyset continuation.
 */
export const DISCOVER_COPY = {
  /** The page's single `<h1>`. */
  heading: 'Khám phá',
  intro: 'Những tác phẩm, chất liệu và câu chuyện để bạn tìm thấy ý tưởng của riêng mình.',
  /** Accessible name for the category chip navigation. */
  categoryNavLabel: 'Lọc theo danh mục',
  /**
   * The unfiltered chip. UI state, not a category: it means "send no
   * `category` parameter". It lives in the copy catalog rather than beside the
   * category model because it is the one label on that row that is *not* data
   * (`APP12-C01-C1`).
   */
  categoryAllLabel: 'Tất cả',
  /** Shown in place of the chip row when the category inventory cannot be read. */
  categoryUnavailable: 'Chưa thể tải danh mục.',
  /** Accessible name for the feed collection. */
  feedLabel: 'Tác phẩm đã xuất bản',
  initialLoading: 'Đang tải tác phẩm…',
  emptyUnfiltered: {
    heading: 'Chưa có tác phẩm được xuất bản',
    body: 'Các tác phẩm mới sẽ xuất hiện tại đây sau khi được xưởng hoàn thiện.',
  },
  emptyFiltered: {
    heading: 'Chưa có tác phẩm trong danh mục này',
    body: 'Hãy thử một danh mục khác để tiếp tục khám phá.',
    action: 'Xem tất cả',
  },
  initialError: {
    heading: 'Chưa thể tải các tác phẩm',
    body: 'Vui lòng thử lại sau.',
    action: 'Thử lại',
  },
  continuation: {
    loading: 'Đang tải thêm tác phẩm…',
    error: 'Không thể tải thêm tác phẩm.',
    retry: 'Thử lại',
    end: 'Bạn đã xem hết các tác phẩm hiện có.',
    /** Visible fallback when IntersectionObserver is unavailable. */
    loadMore: 'Tải thêm tác phẩm',
  },
  card: {
    /**
     * Screen-reader text for a product with no deliverable thumbnail. The card
     * shows a neutral placeholder — never a fabricated URL and never the
     * catalog-preview rendition, which is a detail-page derivative.
     */
    imageMissing: 'Chưa có ảnh cho tác phẩm này.',
  },
} as const;

/** Alt text for a product thumbnail, derived from the product name only. */
export function thumbnailAlt(productName: string): string {
  return productName;
}
