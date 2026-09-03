/**
 * Every operator-facing string on the order queue (`732:3`, `732:110`).
 *
 * One catalog, so no component hard-codes copy (CLAUDE.md §5) and the queue's
 * vocabulary can be reviewed as a whole. The **status** labels are not here —
 * they belong to `shared/presentation/order-status.ts`, because an order must
 * not be named one thing in the list and another on the screen it opens.
 *
 * The error sentences are chosen by failure *classification* alone. A server
 * `message`, `code` or `requestId` is never rendered.
 */
export const ORDER_QUEUE_COPY = {
  page: {
    breadcrumb: 'Quản trị / Đơn hàng',
    title: 'Đơn hàng',
    subtitle: 'Đơn hàng đã tạo từ thiết kế được duyệt, mới nhất trước.',
    tableLabel: 'Danh sách đơn hàng',
  },
  columns: {
    code: 'Mã đơn hàng',
    origin: 'Nguồn',
    status: 'Trạng thái',
    total: 'Tổng tiền',
    currency: 'Tiền tệ',
    createdAt: 'Ngày tạo',
    request: 'Yêu cầu',
    customer: 'Khách hàng',
  },
  filters: {
    legend: 'Trạng thái',
    originLegend: 'Nguồn đơn',
    all: 'Tất cả',
    selected: (count: number) => `${String(count)} đã chọn`,
    reset: 'Bỏ lọc',
    scope:
      'Bộ lọc khả dụng: trạng thái và nguồn đơn. Không có tìm kiếm, khoảng ngày hay bộ lọc bằng chứng.',
  },
  actions: {
    openOrder: 'Mở đơn hàng',
    openRequest: 'Mở yêu cầu',
    /** A Ready-Made order has no custom request behind it (`BR-031`). */
    noRequest: '—',
    loadMore: 'Tải thêm đơn hàng',
    loadingMore: 'Đang tải…',
    retry: 'Thử lại',
  },
  states: {
    loading: 'Đang tải danh sách đơn hàng…',
    appended: 'Đã tải thêm đơn hàng.',
    emptyTitle: 'Chưa có đơn hàng nào',
    emptyBody: 'Đơn hàng xuất hiện ở đây sau khi khách duyệt thiết kế và báo giá được chấp nhận.',
    filteredEmptyTitle: 'Không có đơn hàng nào khớp bộ lọc',
    filteredEmptyBody: 'Thử bỏ bớt trạng thái hoặc nguồn đơn đã chọn.',
    errorTitle: 'Không tải được danh sách đơn hàng',
    errorBody: 'Kết nối tới máy chủ đang gặp sự cố. Thử lại sau ít phút.',
    cursorErrorTitle: 'Không tải tiếp được trang này',
    cursorErrorBody: 'Danh sách cần được tải lại từ đầu.',
    loadMoreFailed: 'Không tải thêm được. Các đơn hàng đã tải vẫn còn nguyên.',
    pagination: 'Phân trang bằng con trỏ — không có số trang và không có tổng số bản ghi.',
  },
} as const;
