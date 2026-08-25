/**
 * Every operator-facing string on the production job detail screen (`784:3`,
 * `784:129`, `785:3`, `785:134`, `785:270`, `789:160`).
 *
 * One catalog, so no component hard-codes copy (CLAUDE.md §5) and the screen's
 * vocabulary can be reviewed as a whole. The **status** labels are not here —
 * they belong to `src/shared/presentation/production-status.ts`, so a job is
 * named the same thing in the queue row, in the detail pill and in a history
 * line.
 *
 * The transition dialogs have their own catalog (`production-transition-copy`),
 * because they are a different surface with a different authority: a dialog
 * states what a *write* will do, and mixing that prose in here is how a screen
 * ends up promising an effect on a page that performs none.
 */
export const PRODUCTION_JOB_COPY = {
  page: {
    breadcrumbRoot: 'Quản trị / Sản xuất',
    /** `784:27` — the trail names the job by its shortened id. */
    breadcrumb: (shortJobId: string) => `Quản trị / Sản xuất / Lệnh ${shortJobId}`,
    backToQueue: '← Hàng đợi sản xuất',
    title: 'Chi tiết lệnh sản xuất',
  },
  header: {
    jobLabel: 'Lệnh sản xuất',
    openOrder: 'Mở đơn hàng →',
    /** `784:36`. The uniqueness `uq_production_jobs__order_approval_snapshot` enforces. */
    approval: (shortApprovalId: string) =>
      `Bản duyệt ${shortApprovalId} · một lệnh cho mỗi (đơn hàng, bản duyệt)`,
    createdAt: (at: string) => `Tạo lúc ${at}`,
    startedAt: (at: string) => `Bắt đầu ${at}`,
    completedAt: (at: string) => `Hoàn tất ${at}`,
    cancelledAt: (at: string) => `Huỷ lúc ${at}`,
    updatedAt: (at: string) => `Cập nhật ${at}`,
    /** `784:43` — a PLANNED job has no `startedAt` at all, and says so. */
    notStarted: 'Chưa bắt đầu',
    /** REL-092: a redo is a new job, never a mutated one. */
    reworkedFrom: (shortJobId: string) => `Làm lại từ lệnh ${shortJobId} · lệnh này là lệnh mới`,
  },
  cancellation: {
    title: 'Lệnh sản xuất đã huỷ',
    source: 'Nguồn: cancelledReason — bằng chứng bắt buộc trên một lệnh đã huỷ.',
    reasonLabel: 'Lý do huỷ',
    boundaryTitle: 'Đây là huỷ LỆNH SẢN XUẤT, không phải huỷ đơn hàng',
    boundaryBody:
      'Trạng thái thương mại của đơn hàng KHÔNG đổi vì thao tác này: không chuyển sang ' +
      '“đang huỷ”, không hoàn tiền, không phát sinh phiếu chi. Huỷ đơn và hoàn tiền là một ' +
      'quy trình riêng nằm ngoài APP8.',
  },
  specification: {
    title: 'Đặc tả sản xuất đã đóng băng',
    source: 'Nguồn: production_specifications — bản sao đóng băng, không phải danh mục đang sống.',
    frozenTitle: 'Đặc tả bất biến — chỉ đọc',
    frozenBody:
      'Sao chép từ đúng bản duyệt tại thời điểm tạo lệnh và không bao giờ đọc lại từ danh mục ' +
      'đang sống. Đổi tên sản phẩm sau đó KHÔNG làm đổi những giá trị dưới đây. Đây không phải ' +
      'biểu mẫu sửa được.',
    productName: 'Tên sản phẩm (đóng băng)',
    variantLabel: 'Nhãn biến thể',
    sideName: 'Mặt',
    areaName: 'Vùng thêu',
    dimensions: 'Kích thước vật lý',
    quantityTotal: 'Số lượng đã duyệt',
    documentHash: 'Mã băm tài liệu đã duyệt (documentHash)',
    documentHashNote:
      'Nguồn gốc của tệp máy. Chỉ hiển thị dạng an toàn cho vận hành — không có đường tải, ' +
      'không có khoá lưu trữ, không có tệp gốc.',
    productionParameters: 'Tham số sản xuất (productionParameters)',
    /** `785:330` — INV-13 makes this always absent for a customer-owned product. */
    variantAbsent: '— (khách tự mang: luôn vắng)',
    /** `785:350` — a job created with no machine parameters recorded. */
    parametersAbsent: '— (không ghi tham số khi tạo lệnh)',
    /** The `specification` field is optional only as an unreachable-state fallback. */
    missingTitle: 'Không đọc được đặc tả đã đóng băng',
    missingBody:
      'Máy chủ trả về lệnh này không kèm đặc tả. Không có giá trị nào được dựng lại từ danh ' +
      'mục đang sống để lấp chỗ trống — con số sai còn tệ hơn ô trống.',
  },
  reservation: {
    title: 'Giữ kho (chỉ đọc)',
    source: 'Nguồn: reservationSummary — ngữ cảnh hiển thị.',
    catalogItems: 'Dòng hàng Catalog',
    customerOwnedItems: 'Dòng hàng COP',
    skuLabel: 'SKU',
    stockLabel: 'skuStockId',
    quantity: (value: number) => `× ${String(value)}`,
    /** `785:368` — the COP-only state is ordinary and valid, never a warning. */
    copTitle: 'Đơn này không cần giữ kho',
    copBody:
      'Toàn bộ dòng hàng là sản phẩm khách tự mang (COP). Không có SKU nào để giữ, nên việc ' +
      'KHÔNG có giữ kho là đúng thiết kế — trạng thái hợp lệ, không phải cảnh báo và không ' +
      'phải lỗi.',
    copNote:
      'required = false. Bắt đầu sản xuất vẫn hoạt động bình thường và sẽ tiêu thụ 0 giữ kho — ' +
      'danh sách giữ kho trả về rỗng, không phải thiếu dữ liệu.',
    /** `784:246` — a mixed order shows its Catalog rows and never a fabricated COP row. */
    mixedTitle: 'Đơn hỗn hợp',
    mixedBody:
      'Chỉ phần Catalog có giữ kho. Phần COP không có và sẽ không bao giờ có — không tạo dòng ' +
      'giữ kho giả cho nó.',
    /** `785:260` — a terminal row is still shown, so "released" ≠ "never existed". */
    terminalNote:
      'Bản ghi giữ kho vẫn hiển thị ở trạng thái cuối — nhờ vậy “đã từng giữ rồi giải phóng” ' +
      'phân biệt được với “chưa từng có giữ kho”.',
    /** `785:124` — consumption is one-way. */
    consumedNote:
      'Tồn kho đã được tiêu thụ khi bắt đầu sản xuất. CONSUMED là trạng thái cuối — không ' +
      'quay lại RESERVED.',
    /** `784:119` — the binding sentence: this section is context, never the gate. */
    notGate:
      'Đây là ngữ cảnh, KHÔNG phải cổng chặn. Máy chủ quyết định dưới khoá dòng tồn kho, đọc ' +
      'lại tại thời điểm đó — không dựa vào bảng này.',
    /** Catalog lines exist but the server returned no reservation row for them. */
    noneYetTitle: 'Chưa có bản ghi giữ kho nào',
    noneYetBody:
      'Đơn có dòng hàng Catalog nhưng máy chủ chưa trả về bản ghi giữ kho nào. Màn này không ' +
      'suy ra vì sao — bắt đầu sản xuất vẫn do máy chủ quyết định dưới khoá dòng.',
    missingTitle: 'Không đọc được tóm tắt giữ kho',
    missingBody:
      'Máy chủ trả về lệnh này không kèm tóm tắt giữ kho. Không có dòng nào được dựng ra để ' +
      'lấp chỗ trống.',
  },
  reservationStatus: {
    RESERVED: 'Đang giữ',
    CONSUMED: 'Đã tiêu thụ',
    RELEASED: 'Đã giải phóng',
    EXPIRED: 'Đã hết hạn',
    unknown: 'Không xác định',
  },
  history: {
    title: 'Lịch sử chuyển trạng thái',
    source: 'Nguồn: transitions — chỉ ghi thêm, theo đúng thứ tự đã ghi.',
    columnTransition: 'Chuyển trạng thái',
    columnActor: 'Người thực hiện',
    columnAt: 'Thời điểm',
    columnReason: 'Lý do',
    /** `784:95` — a fresh PLANNED job renders an empty history, never a fake row. */
    emptyTitle: 'Chưa có chuyển trạng thái nào',
    emptyBody:
      'Một lệnh vừa tạo có lịch sử rỗng. Việc tạo lệnh KHÔNG được ghi như một dòng chuyển ' +
      'trạng thái, nên ở đây không có dòng “tạo lệnh” — bịa ra nó là bịa ra một bản ghi không ' +
      'tồn tại.',
    noCreationRow:
      'Không có dòng “tạo lệnh”: việc tạo lệnh không được ghi như một chuyển trạng thái, nên ' +
      'lịch sử bắt đầu từ nước đi thật đầu tiên.',
    actorNote:
      'Danh tính người thực hiện hiển thị ở dạng an toàn: vai trò và mã quản trị viên rút ' +
      'gọn. Khách hàng không bao giờ xuất hiện ở đây.',
    /** No reason was recorded — only a cancellation carries one. */
    noReason: '—',
  },
  actions: {
    title: 'Hành động',
    start: 'Bắt đầu sản xuất',
    complete: 'Hoàn tất sản xuất',
    cancel: 'Huỷ lệnh sản xuất',
    /** `784:127`. */
    plannedNote:
      'Bắt đầu sẽ tiêu thụ tồn kho Catalog đang giữ và chuyển đơn sang “đang sản xuất”. Máy ' +
      'chủ có thể từ chối nếu trạng thái cọc, đơn hàng hoặc giữ kho đã thay đổi.',
    /** `785:387` — a COP-only order starts normally and consumes nothing. */
    plannedCopNote:
      'Đơn chỉ có sản phẩm khách tự mang: bắt đầu sản xuất không tiêu thụ tồn kho nào.',
    /** `784:258`. */
    startedNote:
      'Hoàn tất chuyển đơn sang “đã sản xuất xong”. Huỷ một lệnh ĐANG SẢN XUẤT không hoàn lại ' +
      'tồn kho đã tiêu thụ.',
    /** `785:131` — APP8 stops here; no remaining-payment or shipping control exists. */
    completedNote:
      'Lệnh đã hoàn tất. APP8 không còn thao tác nào trên lệnh này: không bắt đầu lại, không ' +
      'huỷ. Thanh toán phần còn lại, giao hàng và quyết toán thuộc pha sau.',
    completedOrderNote: 'Đơn hàng đã ở trạng thái “đã sản xuất xong”. APP8 dừng đúng tại đây.',
    /** `785:267` — a cancelled job cannot be restarted; a redo would be a new job. */
    cancelledNote:
      'Lệnh đã huỷ và không thể chạy lại. Làm lại là một LỆNH MỚI có mã riêng, không phải ' +
      'khôi phục lệnh này — và APP8 không giao hàng khả năng đó.',
    cancelledStockNote:
      'Huỷ từ PLANNED đã giải phóng giữ kho. Nếu huỷ khi đang STARTED thì tồn đã tiêu thụ ' +
      'KHÔNG được hoàn lại.',
    /** `784:128` — the binding sentence under every action set. */
    serverOwnsLegality:
      'Tính hợp lệ do máy chủ sở hữu. Nút hiển thị theo trạng thái đang đọc được, nhưng bấm ' +
      'được không có nghĩa là chắc chắn thành công.',
    /** `789:203` — at 1280 the aside collapses and the actions move above the fold. */
    narrowNote: 'Ở bề ngang hẹp, cột phụ xuống dưới và khối hành động lên trên.',
  },
  states: {
    loading: 'Đang tải chi tiết lệnh sản xuất…',
    loadingNote:
      'Không hiển thị hành động nào trong lúc tải — bộ nút chỉ được dựng sau khi máy chủ trả ' +
      'về trạng thái thật.',
    notFoundTitle: 'Không tìm thấy lệnh sản xuất',
    notFoundBody:
      'PRODUCTION_JOB_NOT_FOUND · 404. Lệnh không tồn tại hoặc đã bị xoá khỏi đường dẫn. ' +
      'Quay về hàng đợi.',
    forbiddenTitle: 'Yêu cầu bị từ chối',
    forbiddenBody:
      '403. Yêu cầu đến từ nguồn máy chủ không chấp nhận. Lặp lại y hệt cũng bị từ chối.',
    unauthenticatedTitle: 'Phiên đăng nhập đã hết hạn',
    unauthenticatedBody: '401. Đăng nhập lại để tiếp tục.',
    errorTitle: 'Không tải được chi tiết lệnh',
    errorBody: 'Lỗi máy chủ · 500. Chưa đọc được lệnh sản xuất này. Không có lệnh nào bị thay đổi.',
    retry: 'Thử lại',
    signIn: 'Đăng nhập lại',
    backToQueue: 'Về hàng đợi sản xuất',
    /** Announced after a transition commits and the authoritative re-read lands. */
    refreshed: (label: string) => `Đã cập nhật. Lệnh hiện ở trạng thái ${label}.`,
  },
} as const;
