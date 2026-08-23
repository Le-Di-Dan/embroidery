/**
 * Every operator-facing string on the Admin order + deposit workspace
 * (`734:3`, `736:3`, `737:3`, `740:3`, `740:56`, `740:111`, `741:3`, `741:51`,
 * `741:87`, `742:3`, `743:3`, `743:35`).
 *
 * One catalog, so no component hard-codes copy (CLAUDE.md §5) and the screen's
 * vocabulary can be reviewed as a whole against `751:3`. The **status** labels
 * are not here: order states live in `shared/presentation/order-status.ts` and
 * the payment vocabularies in `payment-vocabulary.ts`, because the one rule that
 * matters most is that the three groups never share a phrase.
 *
 * The failure sentences are chosen by classification alone. A server `message`,
 * `code` or `requestId` is never rendered — and `741:121` extends that to the
 * concurrency vocabulary: no lock, transaction, version or contention language
 * reaches an operator, only who acted, when, and what the state is now.
 */
export const ORDER_DETAIL_COPY = {
  page: {
    breadcrumb: 'Quản trị / Đơn hàng',
    backToQueue: 'Danh sách đơn hàng',
    openRequest: 'Mở yêu cầu →',
    orderTotal: 'Tổng đơn',
  },
  sections: {
    frozenFacts: 'Dữ kiện đơn hàng — đông cứng',
    frozenFactsHelp:
      'Toàn bộ giá trị dưới đây là ảnh chụp tại thời điểm tạo đơn. Màn hình không đọc lại Catalog, nên Catalog thay đổi về sau không làm đổi đơn hàng này.',
    items: 'Dòng hàng (OrderItem) — đông cứng',
    itemsHelp:
      'Loại dòng hàng quyết định trường nào tồn tại. Không bịa SKU, biến thể hay kích cỡ cho hàng khách tự gửi.',
    deposit: 'Tiền cọc (DEPOSIT)',
    depositHelp: 'Nguồn sự thật duy nhất của bảng này là dữ liệu thanh toán của đơn hàng.',
    attempts: 'Các lần thanh toán',
    attemptsHelp:
      'Lần thanh toán đã kết thúc không bao giờ được đặt lại — thử lại sẽ sinh lần thanh toán mới.',
    evidence: 'Ảnh giao dịch khách gửi',
    evidenceHelp: 'Chỉ là tài liệu hỗ trợ đối chiếu. Không bao giờ là căn cứ xác nhận thanh toán.',
    actions: 'Hành động đối chiếu',
    history: 'Lịch sử đối chiếu',
    historyHelp:
      'Chỉ dựng từ các bản ghi đối chiếu của đơn hàng. Không hiển thị dữ liệu kiểm toán, hàng đợi sự kiện hay siêu dữ liệu lưu trữ.',
  },
  fields: {
    code: 'Mã đơn hàng',
    status: 'Trạng thái',
    total: 'Tổng tiền',
    createdAt: 'Tạo lúc',
    updatedAt: 'Cập nhật lúc',
    request: 'Yêu cầu gốc',
    customer: 'Khách hàng',
    acceptedQuotationVersion: 'Báo giá đã chấp nhận',
    approvalSnapshot: 'Ảnh duyệt thiết kế',
  },
  items: {
    position: '#',
    product: 'Sản phẩm',
    kind: 'Loại',
    size: 'Kích cỡ',
    quantity: 'SL',
    unitPrice: 'Đơn giá',
    lineTotal: 'Thành tiền',
    catalog: 'Catalog',
    customerOwned: 'Khách gửi',
    /** Rendered when the order froze no size. Never a label rebuilt from a variant. */
    absent: '—',
    absentNote: 'không có',
    customerOwnedNote: 'Sản phẩm của khách · không có SKU',
    skuPrefix: 'SKU',
    variantPrefix: 'biến thể',
    sizeNote:
      'Kích cỡ chỉ hiển thị khi đơn hàng đã đông cứng một nhãn kích cỡ. Khi vắng mặt, ô hiển thị “không có” — không dựng nhãn giả từ biến thể hay từ Catalog hiện tại.',
  },
  deposit: {
    expectedHeading: 'GIÁ TRỊ KỲ VỌNG — hệ thống sinh ra, không sửa được',
    expectedAmount: 'Số tiền cọc kỳ vọng',
    expectedReference: 'Nội dung CK kỳ vọng',
    expectedNote:
      'Nội dung kỳ vọng dẫn xuất từ mã đơn hàng và không lưu ở đâu cả — nên không gì có thể mâu thuẫn với nó.',
    obligationPrefix: 'Nghĩa vụ',
    orderPrefix: 'Đơn',
    satisfiedAt: 'Thu đủ lúc',
    satisfiedBy: 'Lần thanh toán đã thu đủ',
  },
  attempts: {
    amount: 'Số tiền',
    createdAt: 'Tạo lúc',
    updatedAt: 'Cập nhật lúc',
    expiresAt: 'Hết hạn lúc',
    succeededAt: 'Thành công lúc',
    failedAt: 'Thất bại lúc',
    reviewReason: 'Lý do đối chiếu',
    empty: 'Chưa có lần thanh toán nào cho đơn hàng này.',
    pendingNote:
      'Chờ đối chiếu chỉ có nghĩa “đã sinh hướng dẫn chuyển khoản”. Nó KHÔNG có nghĩa khách đã chuyển tiền — hệ thống không có cách nào biết điều đó.',
  },
  evidence: {
    countLabel: (count: number) => `${String(count)} ảnh`,
    readOnly: 'Chỉ đọc — Admin không xoá, không thay, không sắp xếp lại ảnh.',
    empty: 'Khách chưa gửi ảnh giao dịch',
    emptyBody:
      'Đây là trạng thái bình thường, không phải lỗi. Bạn vẫn xác nhận được tiền cọc mà không cần ảnh — căn cứ là số tiền thực nhận trong tài khoản ngân hàng.',
    preview: 'Xem ảnh',
    previewChecking: 'Đang kiểm tra',
    previewBlocked: 'Không xem được',
    authorityNote:
      'Chỉ ảnh đã được tiếp nhận mới xem được. Ảnh đang kiểm tra và ảnh không hợp lệ đều tắt nút xem, và không trạng thái nào nói lên điều gì về việc thanh toán thành hay bại.',
    rejectedNote:
      'Ảnh bị từ chối vẫn nằm lại trong lịch sử và KHÔNG có nghĩa là thanh toán thất bại. Nhân viên vẫn xác nhận được tiền cọc bằng sao kê ngân hàng.',
    dialogTitle: 'Ảnh giao dịch',
    dialogClose: 'Đóng',
    previousImage: 'Ảnh trước',
    nextImage: 'Ảnh sau',
    metadataSubmittedAt: 'Gửi lúc',
    metadataMediaType: 'Định dạng',
    metadataByteSize: 'Dung lượng',
    imageAlt: (position: number) => `Ảnh giao dịch khách gửi số ${String(position)}`,
    loading: 'Đang tải ảnh…',
    unavailable: 'Ảnh không còn xem được. Danh sách đã được tải lại.',
    temporary: 'Tạm thời chưa lấy được ảnh. Thử lại sau ít phút.',
    retry: 'Thử lại',
  },
  actions: {
    verify: 'Xác nhận đã nhận tiền cọc',
    review: 'Đưa vào cần đối chiếu',
    reopenVerify: 'Mở lại xác nhận tiền cọc',
    reviewAgain: 'Đưa vào đối chiếu lần nữa',
    note: 'Xác nhận ghi nhận số tiền thực nhận; đưa vào đối chiếu treo giao dịch để đối soát. Không có ô “ảnh chứng minh đã thanh toán”: ảnh không phải căn cứ.',
    settledNote:
      'Tiền cọc của đơn hàng này đã được xác nhận. Không còn hành động đối chiếu nào ở đây.',
    dismiss: 'Huỷ',
    close: 'Đóng',
    viewHistory: 'Xem lịch sử đối chiếu',
  },
  verify: {
    title: 'Xác nhận đã nhận tiền cọc',
    help: 'So khớp thủ công giữa giá trị hệ thống kỳ vọng và số tiền thực sự về tài khoản. Ảnh giao dịch không phải căn cứ.',
    expectedBadge: 'KỲ VỌNG',
    expectedBadgeNote: 'hệ thống sinh ra · chỉ đọc',
    observedBadge: 'QUAN SÁT ĐƯỢC',
    observedBadgeNote: 'nhân viên tự nhập từ sao kê ngân hàng',
    amountLabel: 'Số tiền thực nhận',
    amountPlaceholder: 'ví dụ 5100000',
    amountHelp: 'Chỉ chữ số, tối đa 12 chữ số nguyên và 2 chữ số thập phân.',
    referenceLabel: 'Nội dung/ghi chú chuyển khoản thực nhận',
    referencePlaceholder: 'chép đúng nội dung hiện trong sao kê',
    referenceHelp:
      'Chuỗi tự do. Không ép chữ hoa, không bỏ dấu câu, không cắt ngắn — giá trị gửi đi đúng như bạn gõ.',
    noteLabel: 'Ghi chú của nhân viên',
    notePlaceholder: 'mô tả ngắn căn cứ đối chiếu',
    noteHelp: 'Bắt buộc, tối đa 2000 ký tự.',
    required: '* bắt buộc',
    prefillWarning:
      'Các ô “quan sát được” cố ý để trống. Không tự điền sẵn giá trị kỳ vọng vào đây — nếu điền sẵn, nhân viên chỉ còn xác nhận lại kỳ vọng của hệ thống thay vì chép lại thứ ngân hàng thực sự ghi nhận.',
    submitting: 'Đang gửi…',
  },
  review: {
    title: 'Đưa vào cần đối chiếu',
    help: 'Dùng khi cần treo giao dịch để đối soát mà chưa xác nhận. Bản thân hành động này đã mang nghĩa cần đối chiếu — người gọi không chọn trạng thái.',
    reasonLabel: 'Lý do đưa vào đối chiếu',
    reasonHelp: 'Bắt buộc, tối đa 2000 ký tự.',
    optional: '· không bắt buộc',
    amountLabel: 'Số tiền quan sát được',
    amountPlaceholder: 'để trống nếu chưa thấy giao dịch nào',
    referenceLabel: 'Nội dung CK quan sát được',
    referencePlaceholder: 'để trống nếu chưa thấy giao dịch nào',
    optionalNote: 'Bỏ trống hai ô dưới sẽ không ghi lại gì cả, thay vì ghi một con số bịa ra.',
  },
  comparison: {
    heading: 'ĐỐI CHIẾU KỲ VỌNG VÀ QUAN SÁT ĐƯỢC',
    expected: 'Kỳ vọng',
    observed: 'Quan sát được',
    amountRow: 'Số tiền',
    referenceRow: 'Nội dung CK',
    serverJudged:
      'Việc khớp hay không khớp do máy chủ quyết định, không do màn hình này so sánh. Bảng trên chỉ đặt cạnh nhau hai giá trị đã gửi đi.',
  },
  outcome: {
    heading: 'TRẠNG THÁI SAU KHI GHI NHẬN',
    attempt: 'Lần thanh toán',
    obligation: 'Nghĩa vụ tiền cọc',
    order: 'Đơn hàng',
    successBadge: 'THÀNH CÔNG',
    successTitle: 'Đã xác nhận tiền cọc',
    successBody: 'Ghi nhận thành công. Trang đã tải lại trạng thái hiện hành của đơn hàng.',
    successNote:
      'Không có hành động sản xuất, giữ tồn kho hay giao hàng ở đây. Những việc đó thuộc giai đoạn sau và chưa tồn tại.',
    reviewBadge: 'CẦN ĐỐI CHIẾU',
    reviewTitle: 'Đã chuyển giao dịch sang cần đối chiếu',
    reviewBody:
      'Máy chủ đã ghi nhận thành công. Đây là một kết quả nghiệp vụ, KHÔNG phải lỗi hệ thống và không phải “xác nhận thất bại”.',
    reviewNote:
      'Đây là một chuyển trạng thái bền vững, đã ghi vào lịch sử đối chiếu — không phải thông báo lỗi biểu mẫu. Sau khi đối soát xong, dùng lại chính hành động Xác nhận để giải quyết.',
    replayed: 'Lần gửi trước đã được ghi nhận; lần này không ghi thêm gì.',
    reviewRecordedTitle: 'Đã treo giao dịch để đối chiếu',
    reviewRecordedBody: 'Lý do đã được ghi vào lịch sử đối chiếu. Tiền cọc và đơn hàng không đổi.',
    otherTitle: 'Máy chủ đã ghi nhận thao tác',
    otherBody: 'Trạng thái hiện hành của đơn hàng đã được tải lại và hiển thị bên dưới.',
  },
  requiresReview: {
    title: 'Giao dịch đang chờ đối soát',
    body: 'Trạng thái bền vững. Giải quyết bằng chính hành động Xác nhận — hệ thống không có thao tác “giải quyết đối chiếu” riêng.',
    resolveNote:
      'Khi đã đối soát xong, mở lại đúng biểu mẫu Xác nhận, nhập số tiền và nội dung thực nhận, rồi xác nhận.',
  },
  ambiguity: {
    badge: 'PHẢN HỒI KHÔNG CHẮC CHẮN',
    title: 'Không nhận được phản hồi cuối cùng',
    body: 'Máy chủ có thể đã ghi nhận thành công rồi mới mất kết nối. Không thể kết luận là thất bại.',
    checking: 'Đang kiểm tra lại trạng thái giao dịch…',
    unchangedTitle: 'Trạng thái giao dịch chưa đổi',
    unchangedBody:
      'Lần gửi trước có thể chưa tới máy chủ. Kiểm tra lại số liệu rồi gửi lại đúng giá trị đó nếu bạn vẫn muốn xác nhận.',
  },
  stale: {
    badge: 'XUNG ĐỘT ĐỒNG THỜI',
    title: 'Một nhân viên khác đã xử lý trước',
    checking: 'Giao dịch này vừa được cập nhật ở nơi khác. Đang tải lại trạng thái mới nhất…',
    body: 'Trạng thái hiện hành đã được tải lại. Hãy thao tác trên dữ liệu vừa tải, không dùng lại dữ liệu cũ.',
  },
  history: {
    at: 'Thời điểm',
    action: 'Hành động',
    result: 'Kết quả',
    amount: 'Số tiền quan sát',
    admin: 'Nhân viên',
    reason: 'Lý do',
    bankReference: 'Nội dung CK quan sát',
    empty: 'Chưa có bản ghi đối chiếu nào cho đơn hàng này.',
    absent: '—',
    reveal: 'Xem đầy đủ',
    hide: 'Thu gọn',
  },
  validation: {
    heading: 'Vui lòng kiểm tra lại các ô được đánh dấu.',
    required: 'Ô này là bắt buộc.',
    amountShape: 'Chỉ nhập chữ số, tối đa 12 chữ số nguyên và 2 chữ số thập phân.',
    tooLong: 'Tối đa 2000 ký tự.',
  },
  failure: {
    detailMissingTitle: 'Không mở được đơn hàng',
    detailMissingBody: 'Đơn hàng này không tồn tại hoặc không còn xem được.',
    detailRetryTitle: 'Không tải được đơn hàng',
    detailRetryBody: 'Kết nối tới máy chủ đang gặp sự cố. Thử lại sau ít phút.',
    unauthenticated: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
    retry: 'Thử lại',
    loading: 'Đang tải đơn hàng…',
    decisionInvalidTitle: 'Máy chủ từ chối dữ liệu vừa nhập',
    decisionInvalidBody: 'Kiểm tra lại số tiền và nội dung chuyển khoản rồi gửi lại.',
    decisionMissingTitle: 'Không thao tác được trên lần thanh toán này',
    decisionMissingBody: 'Lần thanh toán không còn khả dụng. Trạng thái hiện hành đã được tải lại.',
    decisionRetryTitle: 'Không gửi được',
    decisionRetryBody: 'Kết nối tới máy chủ đang gặp sự cố.',
  },
} as const;
