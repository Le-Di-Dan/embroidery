/**
 * Every operator-facing string on the production queue (`780:3`, `780:105`,
 * `782:3`, `782:44`, `782:89`, `782:206`, `789:85`).
 *
 * One catalog, so no component hard-codes copy (CLAUDE.md §5) and the queue's
 * vocabulary can be reviewed as a whole. The **status** labels are not here —
 * they belong to `production-status.ts`, because a job must not be named one
 * thing in the filter and another in its row.
 *
 * The error sentences are chosen by failure *classification* alone. A server
 * `message` is never rendered; the published business code rides inside the
 * body as an engineer-facing annotation, exactly as `782:243` draws it and as
 * the refusal catalog (`787:3`) requires.
 */
export const PRODUCTION_QUEUE_COPY = {
  page: {
    breadcrumb: 'Quản trị / Sản xuất',
    title: 'Hàng đợi sản xuất',
    /** The sidenav entry (`780:22`) — shorter than the page title, as drawn. */
    navLabel: 'Sản xuất',
    tableLabel: 'Danh sách lệnh sản xuất',
    /**
     * `780:29`. States what the queue publishes *and* what it does not, so an
     * operator who expects an `ORD-…` code or a product name learns where those
     * live instead of hunting for a column that was never designed.
     */
    source:
      'Nguồn: GET /api/admin/production-jobs. Hàng đợi công bố định danh lệnh/đơn/bản duyệt, ' +
      'trạng thái và mốc thời gian — KHÔNG có mã đơn dạng ORD-… và KHÔNG có đặc tả sản xuất. ' +
      'Hai thứ đó chỉ có ở màn chi tiết.',
    ordering:
      'Thứ tự xác định: mới nhất trước theo (createdAt, id) — cùng khoá mà con trỏ keyset dùng, ' +
      'nên tải thêm không bỏ sót và không lặp bản ghi.',
  },
  columns: {
    jobId: 'Mã lệnh (jobId)',
    orderId: 'Đơn hàng (orderId)',
    approvalSnapshotId: 'Bản duyệt (approvalSnapshotId)',
    status: 'Trạng thái',
    createdAt: 'Tạo lúc',
    milestone: 'Mốc gần nhất',
    open: 'Mở lệnh',
  },
  milestones: {
    /** `780:57` renders an absent milestone as an em dash, never as "chưa rõ". */
    none: '—',
    started: 'bắt đầu',
    completed: 'xong',
    cancelled: 'huỷ',
  },
  filters: {
    statusLegend: 'Trạng thái',
    statusDropdownTitle: 'Lọc theo trạng thái',
    all: 'Tất cả',
    selected: (count: number) => `${String(count)} đã chọn`,
    vocabulary:
      'Bốn giá trị này là toàn bộ từ vựng trạng thái LC-18. Không có giá trị thứ năm, ' +
      'và “tất cả” không phải một giá trị gửi lên — bỏ trống nghĩa là không lọc.',
    orderLabel: 'Đơn hàng',
    orderPlaceholder: 'lọc theo orderId (UUID)',
    orderHelp: 'Lọc theo orderId. Đây không phải mã đơn ORD-… — hàng đợi không nhận mã đơn.',
    orderInvalid: 'orderId phải là một UUID. Chưa gửi bộ lọc nào.',
    scope: 'Chỉ hai bộ lọc: status[] và orderId. Không ưu tiên, không SLA, không thợ, không máy.',
    clearStatus: 'Xoá bộ lọc trạng thái',
    clearOrder: 'Xoá bộ lọc đơn hàng',
    clearAll: 'Xoá tất cả bộ lọc',
  },
  actions: {
    open: 'Mở →',
    loadMore: 'Tải thêm lệnh sản xuất',
    loadingMore: 'Đang tải…',
    retry: 'Thử lại',
    backToFirstPage: 'Về trang đầu',
    signIn: 'Đăng nhập lại',
    openOrders: 'Mở danh sách đơn hàng',
  },
  states: {
    loading: 'Đang tải hàng đợi sản xuất…',
    loadingNote:
      'Không hiển thị dòng “0 kết quả” trong lúc tải — trạng thái rỗng chỉ được kết luận ' +
      'sau khi máy chủ trả lời.',
    appended: 'Đã tải thêm lệnh sản xuất.',
    emptyTitle: 'Chưa có lệnh sản xuất nào',
    emptyBody:
      'Lệnh sản xuất được tạo từ một đơn hàng đã thanh toán cọc và đã có bản duyệt, ở màn ' +
      'chi tiết đơn hàng. Hàng đợi này không tự tạo lệnh và không có nút “tạo lệnh” đứng ' +
      'một mình — vì API tạo lệnh cần một orderId cụ thể.',
    filteredEmptyTitle: 'Không có lệnh nào khớp bộ lọc',
    filteredEmptyBody:
      'Bỏ bớt điều kiện để xem thêm. Trạng thái rỗng vì bộ lọc khác hẳn trạng thái rỗng vì ' +
      'chưa có dữ liệu — hai màn này không được dùng chung một câu chữ.',
    /** `782:81` names the active conditions back to the operator. */
    filteredEmptyActive: (conditions: string) => `Đang lọc: ${conditions}.`,
    filteredEmptyStatuses: (labels: string) => `trạng thái ${labels}`,
    filteredEmptyOrder: (shortId: string) => `đơn hàng ${shortId}`,
    cursorErrorTitle: 'Trang không hợp lệ',
    cursorErrorBody:
      'PRODUCTION_CURSOR_INVALID · 400. Con trỏ phân trang đã cũ hoặc bị sửa. ' +
      'Quay về trang đầu để đọc lại từ bản ghi mới nhất.',
    errorTitle: 'Không tải được hàng đợi',
    errorBody:
      'Lỗi máy chủ · 500. Chưa lấy được danh sách lệnh sản xuất. Không có lệnh nào bị thay đổi.',
    unauthenticatedTitle: 'Phiên đăng nhập đã hết hạn',
    unauthenticatedBody: '401. Đăng nhập lại để tiếp tục.',
    loadMoreFailed: 'Không tải thêm được. Các lệnh đã tải vẫn còn nguyên.',
    pagination: 'Phân trang keyset (hasNext / nextCursor) — không số trang, không tổng số bản ghi.',
    exhausted: 'hasNext = false · đã ở cuối danh sách.',
  },
  responsive: {
    /** `789:158` — the single reduction the approved narrow frame makes. */
    narrowNote:
      'Ở bề ngang hẹp, cột “Bản duyệt (approvalSnapshotId)” được ẩn; mã bản duyệt luôn hiển thị đầy đủ ở màn chi tiết.',
  },
} as const;
