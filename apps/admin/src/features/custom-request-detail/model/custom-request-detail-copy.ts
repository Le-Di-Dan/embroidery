/**
 * Every operator-facing string on the Admin request detail screen (`APP5-A02`).
 *
 * One catalog, so no component hard-codes a sentence (CLAUDE.md §5) and the
 * approved copy from `665:3` / `665:115` / `667:3` / `667:30` / `669:3` /
 * `669:60` / `669:119` / `669:173` / `670:3` / `670:46` / `670:104` / `670:148`
 * has exactly one spelling.
 *
 * ### Two reasons, never one string
 *
 * `internal` and `customerVisible` are labelled separately everywhere they
 * appear — the field labels, the history entries and the dialog help text. An
 * operator has to be able to tell, at a glance, which of the two texts the
 * customer will read. Collapsing them into one "reason" label is how an internal
 * note about a suspected fraud ends up believed to be private while `APP5-B03`
 * publishes the other field to the customer's status page.
 *
 * ### The failure copy is bounded on purpose
 *
 * The detail, the evidence and both mutations read private Admin endpoints. A
 * server `message`, `code`, SQL fragment or provider string has no operator
 * value and is a disclosure, so the classification alone picks the sentence.
 * Nothing in this catalog interpolates a value that came from an error.
 */
export const CUSTOM_REQUEST_DETAIL_COPY = {
  page: {
    /** Interpolates the request *code*, which is display-only and authorizes nothing. */
    title: (code: string) => `Yêu cầu ${code}`,
    backToQueue: 'Quay lại hàng đợi',
  },
  sections: {
    subject: 'Đối tượng thêu',
    customer: 'Khách hàng',
    quantity: 'Số lượng',
    evidence: 'Hình ảnh khách gửi',
    history: 'Lịch sử trạng thái',
    notes: 'Ghi chú nội bộ',
    actions: 'Hành động',
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
    label: 'Trạng thái hiện tại',
  },
  request: {
    submittedAt: 'Thời điểm gửi',
    updatedAt: 'Cập nhật lần cuối',
    customerNote: 'Lời nhắn của khách',
    noCustomerNote: 'Khách không để lại lời nhắn.',
  },
  reason: {
    internal: 'Lý do nội bộ (chỉ nhân viên đọc)',
    customerVisible: 'Nội dung gửi khách (khách sẽ đọc)',
    /** Shown where a status legitimately carries no text at all. */
    none: 'Không có',
    currentHeading: 'Lý do của trạng thái hiện tại',
  },
  subject: {
    catalog: 'Sản phẩm cửa hàng',
    customerOwned: 'Đồ khách tự có',
    unknown: 'Không xác định',
    productName: 'Sản phẩm',
    productSlug: 'Đường dẫn sản phẩm',
    variantColor: 'Màu',
    variantSize: 'Kích cỡ',
    designSession: 'Phiên thiết kế',
    itemName: 'Tên món đồ',
    itemDescription: 'Mô tả của khách',
    width: 'Chiều rộng',
    height: 'Chiều cao',
    millimetres: 'mm',
    /**
     * `APP5-B04` omits a label it can no longer resolve rather than filling it
     * in, so the screen says the label is gone instead of naming a product the
     * request may not have.
     */
    unavailableLabel: 'Không còn thông tin',
    noDescription: 'Khách không mô tả thêm.',
    /** A customer-owned item has no design session and no design document. */
    copHasNoDesign: 'Đồ khách tự có không đi kèm phiên thiết kế.',
  },
  designPreview: {
    heading: 'Bản thiết kế',
    /**
     * `FU-APP5-B04-DESIGN-PREVIEW-01`. There is no authorized way for this
     * surface to open a Catalog design session, so the screen states that
     * plainly. It does not offer a control that would fail, and it does not
     * imply the artwork is missing — only that it is not viewable here yet.
     */
    unavailable: 'Chưa xem được bản thiết kế trên màn hình này.',
    provenanceHelp: 'Mã phiên chỉ dùng để tra cứu nguồn gốc, không mở được bản thiết kế.',
  },
  customer: {
    displayName: 'Tên hiển thị',
    unnamed: 'Khách chưa đặt tên hiển thị',
    verifiedAt: 'Xác minh từ',
    contacts: 'Liên hệ',
    /** Only the deterministic mask is ever published; there is no raw value. */
    maskedNote: 'Liên hệ hiển thị dạng che, không tra ngược được giá trị gốc.',
    primary: 'Liên hệ chính',
    verified: 'Đã xác minh',
    unverified: 'Chưa xác minh',
    email: 'Email',
    phone: 'Số điện thoại',
    missing: 'Không còn hồ sơ khách hàng.',
    noContacts: 'Không có liên hệ nào đang hoạt động.',
  },
  quantity: {
    total: 'Tổng số lượng',
    lines: 'Chi tiết theo dòng',
    sizeLabel: 'Kích cỡ',
    units: 'Số lượng',
    noSize: 'Không ghi kích cỡ',
    empty: 'Yêu cầu không có dòng số lượng nào.',
    /** Read-only on this surface: A02 owns no quantity edit. */
    readOnly: 'Số lượng giữ nguyên như khách đã gửi.',
  },
  evidence: {
    roleCopImage: 'Ảnh món đồ của khách',
    roleReference: 'Ảnh tham khảo',
    roleUnknown: 'Tệp đính kèm',
    /** Position within its role group, so no asset id is ever a visible label. */
    altText: (role: string, position: number) => `${role} ${String(position)}`,
    linkedAt: 'Đính kèm lúc',
    size: 'Dung lượng',
    loading: 'Đang tải ảnh…',
    empty: 'Khách chưa gửi ảnh nào.',
    /**
     * One bounded sentence for every unavailable reason. The server answers the
     * same way for an asset that belongs elsewhere, failed inspection, was
     * deleted or has an unsupported type — a screen that split them would
     * rebuild the enumeration oracle `APP5-B06` refuses to be.
     */
    unavailable: 'Không mở được ảnh này.',
    retryable: 'Chưa tải được ảnh.',
    retry: 'Thử lại',
    open: 'Xem ảnh lớn',
    close: 'Đóng',
    viewerLabel: 'Ảnh khách gửi',
  },
  history: {
    empty: 'Chưa có thao tác duyệt nào. Khi khách gửi yêu cầu, hệ thống không ghi bước chuyển nào.',
    movedTo: 'Chuyển sang',
    movedFrom: 'Từ',
    occurredAt: 'Thời điểm',
    actor: 'Người thực hiện',
    actorAdmin: 'Nhân viên',
    actorCustomer: 'Khách hàng',
    actorSystem: 'Hệ thống',
    actorUnknown: 'Không xác định',
    sequence: 'Bước',
  },
  notes: {
    empty: 'Chưa có ghi chú nội bộ nào.',
    kindSpam: 'Spam',
    kindReject: 'Từ chối',
    kindPause: 'Tạm dừng',
    kindClarify: 'Yêu cầu làm rõ',
    kindNote: 'Ghi chú',
    kindUnknown: 'Ghi chú',
    /** Append-only: the screen offers no edit and no delete, and says so. */
    appendOnly: 'Ghi chú chỉ thêm mới, không sửa và không xoá.',
    internalOnly: 'Ghi chú nội bộ không gửi cho khách.',
    addHeading: 'Thêm ghi chú nội bộ',
    addLabel: 'Nội dung ghi chú',
    addSubmit: 'Lưu ghi chú',
    addSubmitting: 'Đang lưu…',
    added: 'Đã lưu ghi chú.',
    author: 'Nhân viên',
  },
  actions: {
    startReview: 'Bắt đầu xem xét',
    resumeReview: 'Tiếp tục xem xét',
    needsClarification: 'Yêu cầu khách làm rõ',
    reject: 'Từ chối yêu cầu',
    cancel: 'Huỷ yêu cầu',
    /** Every state APP5 owns no move from, including the APP6 ones. */
    none: 'Trạng thái này không có thao tác duyệt nào ở bước hiện tại.',
    confirm: 'Xác nhận',
    dismiss: 'Đóng',
  },
  dialog: {
    clarifyTitle: 'Yêu cầu khách làm rõ',
    clarifyHelp: 'Khách sẽ đọc nội dung gửi khách. Lý do nội bộ chỉ nhân viên thấy.',
    rejectTitle: 'Từ chối yêu cầu',
    rejectHelp: 'Từ chối là bước cuối. Khách sẽ đọc nội dung gửi khách.',
    cancelTitle: 'Huỷ yêu cầu',
    cancelHelp: 'Huỷ là bước cuối. Khách sẽ đọc nội dung gửi khách.',
    noteLabel: 'Ghi chú nội bộ',
    noteOptionalLabel: 'Ghi chú nội bộ (không bắt buộc)',
    noteKindLabel: 'Loại ghi chú',
    rejectKindReject: 'Từ chối',
    rejectKindSpam: 'Spam',
    submitting: 'Đang gửi…',
  },
  validation: {
    heading: 'Chưa gửi được. Hãy kiểm tra các mục sau.',
    internalRequired: 'Hãy nhập lý do nội bộ.',
    customerRequired: 'Hãy nhập nội dung gửi khách.',
    noteRequired: 'Hãy nhập ghi chú nội bộ.',
    tooLong: 'Nội dung tối đa 2000 ký tự.',
  },
  outcome: {
    successHeading: 'Đã cập nhật yêu cầu.',
    successBody: 'Trạng thái và lịch sử bên dưới là dữ liệu đã lưu.',
    conflictHeading: 'Yêu cầu đã được người khác xử lý.',
    /** No "apply anyway": the operator decides again against the new state. */
    conflictBody: 'Màn hình đã tải lại trạng thái mới nhất. Hãy xem lại rồi chọn thao tác khác.',
    failureHeading: 'Chưa gửi được thao tác.',
    failureBody: 'Nội dung bạn nhập vẫn được giữ. Hãy thử gửi lại.',
    unauthenticated: 'Phiên đăng nhập đã hết hạn.',
  },
  states: {
    loading: 'Đang tải yêu cầu…',
    notFoundTitle: 'Không mở được yêu cầu này',
    notFoundBody: 'Yêu cầu không tồn tại hoặc không thuộc quyền xem của bạn.',
    errorTitle: 'Không tải được yêu cầu',
    errorBody: 'Chưa rõ yêu cầu đang ở trạng thái nào. Hãy thử tải lại.',
    retry: 'Thử lại',
  },
} as const;
