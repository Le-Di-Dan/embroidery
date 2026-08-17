/**
 * Every operator-facing string on the Admin custom-request queue (`APP5-A01`).
 *
 * One catalog, so no component hard-codes a sentence (CLAUDE.md §5) and the
 * approved copy from `662:3` / `662:112` / `662:182` / `662:243` / `662:306`
 * has exactly one spelling.
 *
 * The failure copy is bounded on purpose: the queue reads a private Admin
 * endpoint, and a server `message`, `code`, SQL fragment or stack would be a
 * disclosure with no operator value. The classification alone picks the string.
 */
export const CUSTOM_REQUEST_QUEUE_COPY = {
  page: {
    title: 'Yêu cầu thêu riêng',
    subtitle: 'Hàng đợi xử lý các yêu cầu khách đã gửi.',
    tableLabel: 'Danh sách yêu cầu thêu riêng',
  },
  scope: {
    /** Never "tất cả yêu cầu": the server states which statuses it applied. */
    applied: (statuses: string) => `Đang hiển thị trạng thái: ${statuses}.`,
    note: 'Hàng đợi chỉ hiển thị các trạng thái nêu trên, không phải toàn bộ yêu cầu.',
  },
  columns: {
    code: 'Mã yêu cầu',
    status: 'Trạng thái',
    subject: 'Đối tượng thêu',
    customer: 'Khách hàng',
    submitted: 'Thời điểm gửi',
    quantity: 'Số lượng',
    actions: 'Chi tiết',
  },
  filters: {
    statusLabel: 'Trạng thái',
    statusTriage: 'Cần xử lý (mặc định)',
    subjectLabel: 'Đối tượng thêu',
    subjectAll: 'Tất cả',
    reset: 'Xoá bộ lọc',
  },
  status: {
    new: 'Mới',
    underReview: 'Đang xem xét',
    needsClarification: 'Cần làm rõ',
    quoted: 'Đã báo giá',
    quoteAccepted: 'Đã nhận báo giá',
    digitizing: 'Đang số hoá',
    designReview: 'Duyệt thiết kế',
    approved: 'Đã duyệt',
    rejected: 'Đã từ chối',
    cancelled: 'Đã huỷ',
    unknown: 'Không xác định',
  },
  subject: {
    catalog: 'Sản phẩm cửa hàng',
    customerOwned: 'Đồ khách tự có',
    unknown: 'Không xác định',
    /** The server reports a missing subject name rather than inventing one. */
    missingSummary: 'Không còn thông tin sản phẩm',
  },
  customer: {
    /** `customerDisplayName` is absent when the customer gave no name. */
    unnamed: 'Khách chưa đặt tên hiển thị',
  },
  states: {
    loading: 'Đang tải hàng đợi yêu cầu…',
    emptyTitle: 'Chưa có yêu cầu nào cần xử lý',
    emptyBody: 'Khi khách gửi một yêu cầu thêu riêng, yêu cầu đó sẽ xuất hiện ở đây.',
    filteredEmptyTitle: 'Không có yêu cầu nào khớp bộ lọc',
    filteredEmptyBody: 'Hãy nới bộ lọc hoặc xoá bộ lọc để quay lại hàng đợi mặc định.',
    errorTitle: 'Không tải được hàng đợi yêu cầu',
    errorBody: 'Chưa rõ hàng đợi đang có gì. Hãy thử tải lại.',
    cursorErrorTitle: 'Trang tiếp theo không còn hợp lệ',
    cursorErrorBody: 'Hãy tải lại hàng đợi từ trang đầu.',
    loadMoreFailed: 'Không tải được trang tiếp theo.',
    appended: 'Đã tải thêm một trang yêu cầu.',
  },
  actions: {
    open: 'Xem chi tiết',
    retry: 'Thử lại',
    loadMore: 'Trang sau',
    loadingMore: 'Đang tải…',
  },
} as const;
