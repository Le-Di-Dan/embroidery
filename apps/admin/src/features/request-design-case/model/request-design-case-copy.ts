/**
 * Every operator-facing string on the Admin design-case workbench (`APP6-A02`).
 *
 * One catalog, so no component hard-codes a sentence (`CLAUDE.md` §5) and the
 * approved copy from `692:3`, `694:3`, `694:111`, `695:3`, `695:138`, `695:266`,
 * `696:3`, `696:113`, `697:3`, `698:3`, `698:63`, `698:97` and `698:143` has
 * exactly one spelling.
 *
 * ### The failure copy never interpolates a server value
 *
 * Every operation behind this screen is a private Admin endpoint. A server
 * `message`, business `code`, SQL fragment, constraint name, request id or
 * provider string has no operator value and is a disclosure, so the
 * *classification* alone picks the sentence. Nothing in this catalog takes a
 * string that came from an error.
 *
 * ### The wording never claims an authority this screen lacks
 *
 * The Admin sends a design version for the customer to review. `APP6-B09` may
 * project the request to `DESIGN_REVIEW` as a consequence, but that is the
 * server's move, and no sentence here tells the operator they are setting a
 * request status. Nothing offers to approve a design or to request a revision
 * either: those are the customer's decisions, through `APP6-B11`.
 *
 * ### "Số hoá" here means authoring the formal Design Document
 *
 * It does not mean machine stitch digitizing. No sentence in this catalog
 * mentions a DST or PES file, a stitch count, a production job or a machine —
 * `APP6` produces none of them, and copy that implied otherwise would promise a
 * capability the system does not have.
 */
export const REQUEST_DESIGN_CASE_COPY = {
  page: {
    /** Interpolates the request *code*, which is display-only and authorizes nothing. */
    title: (code: string) => `Thiết kế cho yêu cầu ${code}`,
    subtitle: 'Số hoá bản thiết kế và gửi khách hàng duyệt.',
    backToRequest: 'Quay lại chi tiết yêu cầu',
  },
  sections: {
    source: 'Nguồn số hoá',
    versions: 'Các phiên bản thiết kế',
    selected: 'Phiên bản đang xem',
    reviews: 'Phản hồi của khách hàng',
    approval: 'Bằng chứng duyệt',
    context: 'Thông tin yêu cầu',
  },
  context: {
    status: 'Trạng thái yêu cầu',
    customer: 'Khách hàng',
    quantity: 'Tổng số lượng',
    branch: 'Loại yêu cầu',
    branchCatalog: 'Sản phẩm trong cửa hàng',
    branchCustomerOwned: 'Sản phẩm khách tự có',
    unknown: 'Không xác định',
  },
  /** `692:3` and `694:3` — the Catalog submitted Design Session. */
  source: {
    catalogTitle: 'Bản khách đã gửi',
    catalogHint:
      'Bản thiết kế khách hàng gửi kèm yêu cầu. Đây là nguồn để số hoá, không phải phiên bản chính thức.',
    loading: 'Đang tải bản khách đã gửi…',
    /** `694:3`. An honest absence, never reported as a network error. */
    absentTitle: 'Không có bản thiết kế gửi kèm',
    absentBody:
      'Yêu cầu này không còn phiên làm việc thiết kế nào để đọc. Hãy số hoá từ chính tài liệu yêu cầu; hệ thống không dựng một bản trắng thay thế.',
    /** `694:111` — the customer-owned branch. */
    copTitle: 'Ảnh khách hàng cung cấp',
    copBody:
      'Yêu cầu sản phẩm khách tự có không có phiên làm việc thiết kế. Nguồn số hoá là tài liệu và ảnh khách gửi kèm yêu cầu.',
    copEmpty: 'Yêu cầu này chưa có ảnh nào để xem.',
    evidenceLoading: 'Đang tải ảnh…',
    evidenceFailed: 'Không tải được ảnh này.',
    evidenceRetry: 'Thử lại',
    evidenceAlt: (index: number) => `Ảnh khách hàng cung cấp số ${String(index)}`,
    previewLabel: 'Xem trước bản thiết kế',
    previewEmpty: 'Bản thiết kế này chưa có phần tử nào.',
  },
  /** `698:97` — the pre-digitizing gate. */
  gate: {
    title: 'Chưa tới bước số hoá',
    body: 'Chỉ có thể tạo phiên bản thiết kế khi yêu cầu đang ở bước số hoá hoặc đang chờ khách duyệt.',
    /** The `DIGITIZING` command lives on the request detail screen, not here. */
    quoteAcceptedHint:
      'Yêu cầu đã được khách chấp nhận báo giá. Hãy chuyển sang bước số hoá ở màn hình chi tiết yêu cầu.',
    goToRequest: 'Mở chi tiết yêu cầu',
  },
  /** `698:3` and `698:63`. */
  states: {
    loading: 'Đang tải hồ sơ thiết kế…',
    errorTitle: 'Không tải được hồ sơ thiết kế',
    errorRetryable: 'Đã xảy ra lỗi khi tải. Vui lòng thử lại.',
    errorMissing: 'Không tìm thấy yêu cầu này, hoặc bạn không có quyền xem.',
    errorUnresolvable:
      'Yêu cầu này chưa có hồ sơ thiết kế hợp lệ. Vui lòng báo quản trị viên; màn hình không tự tạo hồ sơ mới.',
    errorUnauthenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    retry: 'Tải lại',
  },
  /** The version history table. */
  history: {
    empty: 'Chưa có phiên bản thiết kế nào.',
    loading: 'Đang tải danh sách phiên bản…',
    columnVersion: 'Phiên bản',
    columnStatus: 'Trạng thái phiên bản',
    columnCurrent: 'Bản đang dựng',
    columnReview: 'Kết quả duyệt',
    columnSentAt: 'Thời điểm gửi duyệt',
    select: 'Xem phiên bản này',
    /**
     * The design case's own pointer. Deliberately *not* called "bản khách đang
     * duyệt": a newer DRAFT can be current while an older version is still the
     * one awaiting a decision, and one label for both would hide that.
     */
    currentYes: 'Bản mới nhất',
    currentNo: '—',
    reviewNone: 'Chưa có',
    awaitingReview: 'Khách đang duyệt',
  },
  versionStatus: {
    DRAFT: 'Bản nháp',
    SENT_FOR_REVIEW: 'Đã gửi duyệt',
    REVISION_REQUESTED: 'Khách yêu cầu chỉnh sửa',
    APPROVED: 'Khách đã duyệt',
    SUPERSEDED: 'Đã thay thế',
    VOID: 'Đã huỷ',
    unknown: 'Không xác định',
  },
  reviewOutcome: {
    APPROVE: 'Đã duyệt',
    REQUEST_REVISION: 'Yêu cầu chỉnh sửa',
    unknown: 'Không xác định',
  },
  /** The selected-version card and its action matrix (§23). */
  selected: {
    none: 'Chọn một phiên bản để xem chi tiết.',
    loading: 'Đang tải phiên bản…',
    version: (version: number) => `Phiên bản ${String(version)}`,
    documentHash: 'Mã băm tài liệu',
    documentHashAbsent: 'Chưa gửi duyệt nên chưa có mã băm',
    schemaVersion: 'Phiên bản lược đồ tài liệu',
    parent: 'Tiếp nối phiên bản',
    parentNone: 'Bản đầu tiên',
    placement: 'Vị trí thêu',
    dimensions: 'Kích thước vùng thêu',
    dimensionsValue: (width: string, height: string) => `${width} × ${height} mm`,
    openAuthoring: 'Mở trình số hoá',
    createFromThis: 'Tạo bản nháp mới từ phiên bản này',
    send: 'Gửi khách duyệt',
    /** `696:3`. */
    awaitingTitle: 'Đang chờ khách hàng duyệt',
    awaitingBody:
      'Phiên bản này đã gửi và không thể chỉnh sửa. Kết quả duyệt là quyết định của khách hàng.',
    /** `696:113`. */
    revisionTitle: 'Khách hàng yêu cầu chỉnh sửa',
    revisionBody:
      'Phiên bản này giữ nguyên làm lịch sử. Hãy tạo một bản nháp mới từ nó để chỉnh sửa.',
    immutableTitle: 'Phiên bản đã cố định',
    immutableBody: 'Phiên bản này thuộc lịch sử và không thể chỉnh sửa hay gửi lại.',
    approvedTitle: 'Khách hàng đã duyệt',
    approvedBody: 'Bản duyệt là bằng chứng cố định và không thể chỉnh sửa.',
  },
  /** `696:113` — the review-history card. */
  reviews: {
    empty: 'Khách hàng chưa đưa ra quyết định nào cho phiên bản này.',
    decidedAt: 'Thời điểm quyết định',
    feedbackLabel: 'Nội dung khách hàng gửi',
    feedbackNone: 'Khách hàng không kèm nội dung.',
  },
  /** `695:3` — the create-DRAFT dialog. */
  create: {
    open: 'Tạo bản nháp mới',
    title: 'Tạo phiên bản thiết kế mới',
    body: 'Mỗi lần lưu là một phiên bản mới. Phiên bản cũ được giữ nguyên làm lịch sử.',
    sourceLabel: 'Nguồn tài liệu',
    sourceSubmitted: 'Chép từ bản khách đã gửi',
    sourcePredecessor: (version: number, statusLabel: string) =>
      `Chép từ v${String(version)} (${statusLabel})`,
    sourceWorking: 'Dùng bản đang soạn trong trình số hoá',
    sourceAbsent:
      'Chưa có tài liệu nguồn. Hãy mở trình số hoá để soạn bản thiết kế trước khi tạo phiên bản.',
    branchLabel: 'Loại yêu cầu',
    catalogNote:
      'Vị trí thêu của yêu cầu trong cửa hàng do máy chủ xác định và không thể chỉnh ở đây.',
    sideLabel: 'Vị trí thêu (mặt)',
    areaLabel: 'Vị trí thêu (vùng)',
    widthLabel: 'Chiều rộng vùng thêu (mm)',
    heightLabel: 'Chiều cao vùng thêu (mm)',
    copNote: 'Đây là kích thước vùng thêu, không phải kích thước sản phẩm của khách.',
    submit: 'Tạo bản nháp',
    cancel: 'Huỷ',
    submitting: 'Đang tạo…',
    errorRejected:
      'Máy chủ từ chối tài liệu hoặc thông tin vị trí thêu. Vui lòng kiểm tra lại các ô bên trên.',
    errorIneligible:
      'Yêu cầu không còn ở trạng thái cho phép tạo phiên bản. Màn hình đã đọc lại trạng thái mới.',
    errorMissing: 'Không tìm thấy yêu cầu này, hoặc bạn không có quyền thao tác.',
    errorRetryable: 'Không tạo được phiên bản. Vui lòng thử lại.',
    errorUnauthenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    requiredField: 'Vui lòng nhập thông tin này.',
    positiveNumber: 'Vui lòng nhập số lớn hơn 0.',
  },
  /** `695:138` — the send confirmation. */
  send: {
    title: 'Gửi phiên bản cho khách duyệt',
    /** Names the exact version, so the dialog cannot be about a different one. */
    body: (version: number) =>
      `Gửi phiên bản ${String(version)} cho khách hàng duyệt. Tài liệu sẽ được cố định đúng như hiện tại.`,
    note: 'Sau khi gửi, phiên bản này không thể chỉnh sửa. Muốn sửa, hãy tạo một bản nháp mới.',
    confirm: 'Gửi duyệt',
    cancel: 'Huỷ',
    sending: 'Đang gửi…',
    replayNote: 'Phiên bản này đã được gửi trước đó. Không có gì thay đổi.',
    errorStale: 'Phiên bản này không còn gửi được. Màn hình đã đọc lại trạng thái mới nhất.',
    errorRetryable: 'Không gửi được. Vui lòng thử lại.',
    errorUnauthenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  },
  /** `695:266` — the `REVIEW_ALREADY_ACTIVE` reconciliation. */
  reviewActive: {
    title: 'Đã có phiên bản đang chờ khách duyệt',
    body: 'Không có gì được gửi đi. Mỗi hồ sơ thiết kế chỉ có một phiên bản chờ duyệt tại một thời điểm.',
    guidance:
      'Màn hình đã đọc lại trạng thái mới nhất. Hãy chờ khách hàng quyết định phiên bản đang duyệt.',
    dismiss: 'Đã hiểu',
  },
  /** `697:3` — the immutable Approval Snapshot card. */
  approval: {
    title: 'Bằng chứng khách hàng đã duyệt',
    note: 'Đây là bằng chứng cố định tại thời điểm duyệt, không phải thông tin hiện hành.',
    documentHash: 'Mã băm tài liệu đã duyệt',
    approvedAt: 'Thời điểm duyệt',
    customer: 'Khách hàng đã duyệt',
    customerUnknown: 'Khách hàng không cung cấp tên',
    contacts: 'Liên hệ (đã che)',
    contactsNone: 'Không có liên hệ được lưu',
    reverified: 'Đã xác minh lại danh tính',
    reverifiedYes: 'Có',
    reverifiedNo: 'Không',
    product: 'Sản phẩm',
    variant: 'Phân loại',
    variantNone: 'Không có phân loại',
    side: 'Mặt thêu',
    area: 'Vùng thêu',
    dimensions: 'Kích thước vùng thêu',
    quantity: 'Tổng số lượng',
    agreements: 'Điều khoản khách đã chấp nhận',
    agreementsNone: 'Không có điều khoản nào được lưu.',
    agreementHash: 'Mã băm nội dung',
    /**
     * `APP7` has not run. The card is handoff readiness, never a claim that an
     * order, a deposit, a machine file or a production job exists.
     */
    scopeNote: 'Bản duyệt này chưa tạo đơn hàng, chưa thu cọc và chưa sinh lệnh sản xuất.',
  },
  /** The in-browser DesignDocument authoring surface (§17). */
  authoring: {
    title: 'Trình số hoá',
    hint: 'Chỉnh sửa bản đang soạn. Chưa có gì được lưu cho tới khi bạn tạo phiên bản mới.',
    /** Says plainly what this is not, so nobody expects a stitch file. */
    scopeNote:
      'Trình này soạn tài liệu thiết kế. Hệ thống không tạo tệp thêu máy, không mô phỏng mũi chỉ và không sinh lệnh sản xuất.',
    unsaved: 'Bản đang soạn chưa được lưu thành phiên bản.',
    close: 'Đóng trình số hoá',
    reset: 'Khôi phục về tài liệu gốc',
    elements: 'Các lớp',
    elementsEmpty: 'Tài liệu chưa có lớp nào.',
    addText: 'Thêm chữ',
    addTextValue: 'Chữ thêu',
    remove: 'Xoá lớp',
    limitReached: 'Đã đạt giới hạn số lớp của tài liệu.',
    selectElement: 'Chọn lớp',
    moveX: 'Toạ độ X',
    moveY: 'Toạ độ Y',
    invalidTitle: 'Tài liệu đang soạn chưa hợp lệ',
    invalidBody: 'Vui lòng sửa lại trước khi tạo phiên bản mới.',
    saveAsVersion: 'Lưu thành phiên bản mới',
  },
} as const;
