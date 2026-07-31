/**
 * Vietnamese copy catalog for the Admin product list (FRONTEND_CONVENTIONS §14
 * — no user-facing string is written at a call site).
 *
 * Every string that appears in an approved Figma node is reproduced verbatim
 * from `FIG-ADMIN-CATALOG-*` (`439:100`, `440:102`, `440:191`) and the
 * normative handoff node `498:272`
 * (`FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`). The few strings the frames do not
 * enumerate — the first-page failure state and the accessible names of the
 * collection and the media placeholder — are written in the same register and
 * never expose a technical detail.
 *
 * Deliberately absent: any price, slug, timestamp, search or action label.
 * `APP2-A02` is a read-only list; `Tạo sản phẩm`, `Chỉnh sửa`, `Xuất bản`,
 * `Gỡ xuất bản`, `Lưu trữ` and `Xoá` belong to `APP2-A03`/`APP2-A04` and must
 * not exist as copy before the capability behind them exists.
 */
export const PRODUCT_COPY = {
  page: {
    /** The screen's single `<h1>`, and the navigation label for `/products`. */
    title: 'Sản phẩm',
    /** Desktop subtitle (`439:183`). */
    subtitleWide: 'Quản lý bản nháp và sản phẩm đã xuất bản của xưởng.',
    /** Mobile subtitle (`440:232`) — the approved shorter line at 390. */
    subtitleNarrow: 'Bản nháp và sản phẩm đã xuất bản.',
    /** Accessible name of the desktop table. */
    tableLabel: 'Danh sách sản phẩm',
    /** Accessible name of the mobile card collection. */
    collectionLabel: 'Danh sách sản phẩm',
  },

  columns: {
    product: 'Sản phẩm',
    category: 'Danh mục',
    status: 'Trạng thái',
  },

  filters: {
    statusLabel: 'Trạng thái',
    categoryLabel: 'Danh mục',
    statusAll: 'Tất cả trạng thái',
    categoryAll: 'Tất cả danh mục',
  },

  /** Status language from the approved handoff (`498:272` — Bộ lọc trạng thái). */
  status: {
    draft: 'Bản nháp',
    published: 'Đã xuất bản',
    archived: 'Đã lưu trữ',
    unknown: 'Chưa xác định',
  },

  /** The fixed IMP-D032 taxonomy (`498:272` — Bộ lọc danh mục). */
  category: {
    thuBong: 'Thú bông',
    khan: 'Khăn',
    quanAo: 'Quần áo',
    khac: 'Khác',
    unknown: 'Chưa xác định',
  },

  media: {
    /**
     * Accessible description of the placeholder tile. APP2 exposes no media
     * delivery operation, so there is no image and no URL to render — only an
     * honest statement that a preview does not exist yet.
     */
    placeholder: 'Chưa có ảnh xem trước',
  },

  list: {
    loading: 'Đang tải danh sách sản phẩm…',
    unavailableTitle: 'Không thể tải danh sách sản phẩm',
    unavailableDescription: 'Danh sách sản phẩm hiện chưa tải được. Hãy thử lại sau giây lát.',
    unavailableRetry: 'Thử lại',
    /** Shown only when no filter is active (`440:187` / `440:188`). */
    emptyTitle: 'Chưa có sản phẩm',
    emptyDescription: 'Các sản phẩm sẽ xuất hiện tại đây sau khi bản nháp đầu tiên được tạo.',
    /** Shown when a filter is active (`498:272` — Hành vi bộ lọc). */
    filteredEmptyTitle: 'Không có sản phẩm phù hợp',
    filteredEmptyDescription: 'Hãy thử chọn trạng thái hoặc danh mục khác.',
  },

  continuation: {
    action: 'Tải thêm sản phẩm',
    loading: 'Đang tải thêm…',
    loaded: 'Đã tải thêm sản phẩm.',
    errorMessage: 'Không thể tải thêm sản phẩm.',
    retry: 'Thử lại',
  },
} as const;
