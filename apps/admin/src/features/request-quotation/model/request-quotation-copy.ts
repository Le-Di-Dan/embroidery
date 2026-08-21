/**
 * Every operator-facing string on the Admin quotation workbench (`APP6-A01`).
 *
 * One catalog, so no component hard-codes a sentence (CLAUDE.md §5) and the
 * approved copy from `682:3`, `684:3`, `684:144`, `686:3`, `686:62`, `686:104`,
 * `687:3`, `687:144`, `689:3`, `689:162`, `690:3` and `690:92` has exactly one
 * spelling.
 *
 * ### The failure copy never interpolates a server value
 *
 * Every operation behind this screen is a private Admin endpoint. A server
 * `message`, business `code`, SQL fragment, request id or provider string has no
 * operator value and is a disclosure, so the *classification* alone picks the
 * sentence. Nothing in this catalog takes a string that came from an error.
 *
 * ### The send wording says what the send does
 *
 * The Admin sends a quotation version to the customer. `APP6-B03` may project
 * the request to `QUOTED` as a consequence, but that is the server's move and
 * the operator is not told they are setting a request status — a dialog that
 * said so would describe an authority this screen does not have.
 */
export const REQUEST_QUOTATION_COPY = {
  page: {
    /** Interpolates the request *code*, which is display-only and authorizes nothing. */
    title: (code: string) => `Báo giá cho yêu cầu ${code}`,
    backToRequest: 'Quay lại chi tiết yêu cầu',
    subtitle: 'Lập và gửi báo giá cho khách hàng.',
  },
  sections: {
    context: 'Thông tin yêu cầu',
    draft: 'Soạn báo giá',
    lines: 'Các dòng báo giá',
    totals: 'Tổng tiền',
    history: 'Lịch sử phiên bản',
    versionDetail: 'Chi tiết phiên bản',
    validity: 'Hiệu lực',
  },
  context: {
    status: 'Trạng thái yêu cầu',
    submittedAt: 'Thời điểm gửi',
    totalQuantity: 'Tổng số lượng',
    customerNote: 'Lời nhắn của khách',
    noCustomerNote: 'Khách không để lại lời nhắn.',
    catalogHeading: 'Sản phẩm cửa hàng',
    copHeading: 'Sản phẩm khách tự có',
    productName: 'Sản phẩm',
    variant: 'Phiên bản',
    copName: 'Tên sản phẩm',
    copDescription: 'Mô tả',
    copDimensions: 'Kích thước (mm)',
    unnamedSubject: 'Không xác định được đối tượng thêu.',
    copNotice: 'Khách tự cung cấp sản phẩm, nên báo giá không có dòng sản phẩm.',
  },
  empty: {
    heading: 'Yêu cầu này chưa có báo giá',
    body: 'Tạo báo giá đầu tiên để bắt đầu. Bản nháp sẽ được lưu và có thể chỉnh sửa bằng cách thêm phiên bản mới.',
    action: 'Tạo báo giá đầu tiên',
  },
  loading: {
    label: 'Đang tải báo giá…',
  },
  error: {
    heading: 'Không tải được báo giá',
    missing: 'Không tìm thấy yêu cầu này, hoặc bạn không có quyền xem.',
    unauthenticated: 'Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại.',
    retryable: 'Không kết nối được tới máy chủ. Hãy thử lại.',
    retry: 'Thử lại',
    historyHeading: 'Không tải được lịch sử phiên bản',
    versionHeading: 'Không tải được phiên bản này',
  },
  form: {
    quantityTotal: 'Tổng số lượng',
    stitchCount: 'Số mũi thêu',
    stitchCountHint: 'Không bắt buộc.',
    shippingFee: 'Phí vận chuyển',
    manualAdjustment: 'Điều chỉnh thủ công',
    manualAdjustmentHint: 'Có thể âm để giảm giá. Để trống nếu không điều chỉnh.',
    adjustmentReason: 'Lý do điều chỉnh',
    adjustmentReasonHint: 'Ghi chú nội bộ. Khách hàng không nhìn thấy nội dung này.',
    lineKind: 'Loại dòng',
    lineDescription: 'Diễn giải',
    lineQuantity: 'Số lượng',
    lineUnitPrice: 'Đơn giá',
    addLine: 'Thêm dòng',
    removeLine: 'Xoá dòng',
    submitCreate: 'Tạo báo giá',
    submitVersion: 'Tạo phiên bản mới',
    submitting: 'Đang lưu…',
    pendingTotalsNotice: 'Tổng tiền do máy chủ tính sau khi lưu.',
  },
  lineKinds: {
    PRODUCT: 'Sản phẩm',
    EMBROIDERY: 'Thêu',
    DIGITIZING_FEE: 'Phí số hoá',
    OTHER: 'Khác',
    SHIPPING: 'Vận chuyển',
    ADJUSTMENT: 'Điều chỉnh',
  },
  validation: {
    heading: 'Chưa lưu được báo giá',
    quantityTotal: 'Tổng số lượng phải là số nguyên dương.',
    lineDescription: 'Hãy nhập diễn giải cho dòng này.',
    lineQuantity: 'Số lượng của dòng phải là số nguyên dương.',
    lineUnitPrice: 'Đơn giá không đúng định dạng.',
    shippingFee: 'Phí vận chuyển không đúng định dạng.',
    manualAdjustment: 'Số tiền điều chỉnh không đúng định dạng.',
    stitchCount: 'Số mũi thêu phải là số nguyên không âm.',
    adjustmentReasonRequired: 'Điều chỉnh thủ công cần có lý do.',
    adjustmentReasonUnexpected: 'Không có điều chỉnh nào để giải thích. Hãy xoá lý do.',
    rejected: 'Máy chủ từ chối báo giá này. Hãy kiểm tra lại các số tiền.',
    conflictExists: 'Yêu cầu này đã có báo giá. Màn hình vừa được tải lại.',
    stale: 'Yêu cầu đã thay đổi. Màn hình vừa được tải lại.',
    unauthenticated: 'Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại.',
    retryable: 'Không lưu được. Hãy thử lại.',
  },
  totals: {
    subtotal: 'Tạm tính',
    manualAdjustment: 'Điều chỉnh',
    shipping: 'Vận chuyển',
    total: 'Tổng cộng',
    depositPercent: 'Tỷ lệ đặt cọc',
    deposit: 'Tiền đặt cọc',
    remaining: 'Còn lại',
    quantityTotal: 'Số lượng',
    stitchCount: 'Số mũi thêu',
    adjustmentReason: 'Lý do điều chỉnh (nội bộ)',
    serverComputed: 'Các số tiền dưới đây do máy chủ tính và lưu.',
  },
  lines: {
    position: '#',
    kind: 'Loại',
    description: 'Diễn giải',
    quantity: 'SL',
    unitPrice: 'Đơn giá',
    lineTotal: 'Thành tiền',
    empty: 'Phiên bản này không có dòng nào.',
  },
  version: {
    /** Interpolates the server-assigned version number. */
    label: (version: number) => `Phiên bản ${String(version)}`,
    createdAt: 'Tạo lúc',
    sentAt: 'Gửi lúc',
    acceptedAt: 'Khách chấp nhận lúc',
    supersededAt: 'Bị thay thế lúc',
    expiredAt: 'Hết hiệu lực lúc',
    validFrom: 'Hiệu lực từ',
    validUntil: 'Hiệu lực đến',
    current: 'Khách đang xem',
    selected: 'Đang chọn',
    readOnlyNotice: 'Phiên bản đã gửi là bất biến. Muốn đổi giá, hãy tạo phiên bản mới.',
    selectLabel: 'Xem phiên bản này',
  },
  versionStatus: {
    DRAFT: 'Bản nháp',
    SENT: 'Đã gửi',
    ACCEPTED: 'Đã chấp nhận',
    REJECTED: 'Khách từ chối',
    SUPERSEDED: 'Đã thay thế',
    EXPIRED: 'Hết hiệu lực',
    unknown: 'Không xác định',
  },
  send: {
    action: 'Gửi cho khách',
    dialogTitle: 'Gửi báo giá cho khách?',
    /** Interpolates the version number being sent — the exact one, always. */
    dialogBody: (version: number) =>
      `Phiên bản ${String(version)} sẽ được gửi cho khách và không thể sửa sau khi gửi.`,
    dialogHint: 'Hệ thống sẽ ghi lại thời điểm gửi và thời hạn hiệu lực.',
    confirm: 'Gửi báo giá',
    cancel: 'Huỷ',
    pending: 'Đang gửi…',
    successHeading: 'Đã gửi báo giá',
    successBody: 'Khách hàng có thể xem phiên bản này.',
    replayHeading: 'Phiên bản này đã được gửi trước đó',
    replayBody: 'Không có lần gửi thứ hai nào được thực hiện.',
    staleHeading: 'Không gửi được phiên bản này',
    staleBody: 'Trạng thái đã thay đổi. Màn hình vừa được tải lại — hãy xem lại rồi quyết định.',
    failureHeading: 'Không gửi được báo giá',
    failureBody: 'Chưa có gì được gửi đi. Hãy thử lại.',
    unauthenticated: 'Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại.',
  },
  accepted: {
    heading: 'Khách đã chấp nhận báo giá',
    body: 'Báo giá này đã chốt. Không tạo thêm phiên bản mới ở đây.',
    nextStepHeading: 'Bước tiếp theo',
    nextStepBody: 'Chuyển yêu cầu sang số hoá ở màn hình chi tiết yêu cầu.',
    nextStepLink: 'Mở chi tiết yêu cầu',
  },
} as const;
