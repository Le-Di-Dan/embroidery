/**
 * Every operator-facing string the APP9 commerce-completion workspace renders
 * (`809:4`, `809:95`, `811:4`, `812:4`, `812:109`, `814:4`, `815:4`, `815:89`,
 * `815:124`, and the refusal catalog `820:47`).
 *
 * A second catalog beside `order-detail-copy.ts` rather than an addition to it:
 * the APP7 deposit workbench and the APP9 fulfillment rail are different
 * capabilities on one screen, they were approved by different design packages,
 * and a single object holding both would be reviewed as neither.
 *
 * ## Two vocabularies never reach this file
 *
 * **Transport names.** `PaymentDecisionResponse.depositObligationId` and
 * `.depositStatus` carry the **REMAINING** obligation on a balance verification
 * (`FU-APP9-B03-01`). They are wire spellings, not words: the screen says
 * "Thanh toán còn lại" and "Trạng thái thanh toán", and `811:88` requires it in
 * so many terms.
 *
 * **Database terms.** No `shipping_snapshots`, no `payment_obligations`, no
 * SQLSTATE and no constraint name appears in primary copy. The dispatch dialog
 * says the detail is frozen and photographed, which is what an operator needs
 * to decide; the table it is written to is not their business.
 *
 * ## The refusal sentences are chosen by classification, never by server text
 *
 * A `message`, `code` or `requestId` from the server is never rendered. Each
 * sentence below is the approved product copy for one classified outcome, so a
 * backend wording change cannot leak an English stack sentence onto a
 * Vietnamese screen.
 */
export const ORDER_FULFILLMENT_COPY = {
  finalPayment: {
    title: 'Thanh toán còn lại',
    readyHelp:
      'Sản xuất đã xong. Bước tiếp theo là mở kỳ thanh toán còn lại để khách nhận được hướng dẫn chuyển khoản.',
    openAction: 'Yêu cầu thanh toán phần còn lại',
    openNote:
      'Mở kỳ thanh toán không tạo ra nghĩa vụ mới — nghĩa vụ đã tồn tại từ khi đơn được tạo.',
    awaitingBadge: 'Trạng thái thanh toán: Chờ thu',
    awaitingHelp:
      'Kỳ thanh toán còn lại đã mở. Khách đã nhận được hướng dẫn chuyển khoản trên trang bảo mật của họ.',
  },
  openDialog: {
    title: 'Yêu cầu thanh toán phần còn lại?',
    body: 'Đơn hàng sẽ chuyển sang AWAITING_FINAL_PAYMENT. Khách sẽ thấy số tiền còn lại và hướng dẫn chuyển khoản trên trang thanh toán bảo mật của họ.',
    effectLabel: 'Trạng thái sau khi xác nhận',
    effectValue: 'AWAITING_FINAL_PAYMENT',
    effectNote: 'Không sinh nghĩa vụ mới, không gửi thông báo tự động, không thu tiền.',
    confirm: 'Xác nhận mở thanh toán',
    cancel: 'Huỷ',
    pending: 'Đang mở kỳ thanh toán…',
  },
  /**
   * The named API gap, drawn rather than hidden (`811:74`).
   *
   * `FU-APP9-B03-02`: no Admin read projects the REMAINING obligation, so the
   * balance, its attempts, its evidence and its reconciliations are all
   * unreadable here. The last sentence is the one that matters — the screen must
   * never subtract the deposit from the total, because a shipping-fee increase
   * supersedes the obligation and falsifies that arithmetic.
   */
  apiGap: {
    title: 'GIỚI HẠN API ĐÃ BIẾT',
    body:
      'Hiện không có endpoint quản trị nào chiếu nghĩa vụ còn lại: không đọc được số tiền còn lại, ' +
      'danh sách lần chuyển khoản, ảnh giao dịch hay lịch sử đối chiếu của nó. Vì vậy màn hình không ' +
      'suy ra số còn lại bằng "tổng đơn trừ tiền cọc": một lần tăng phí vận chuyển sẽ thay thế nghĩa ' +
      'vụ và làm phép trừ đó sai.',
  },
  verification: {
    title: 'Xác nhận đã nhận tiền',
    help: 'Căn cứ duy nhất là số tiền thực nhận trong tài khoản ngân hàng. Không có webhook, không có cổng thanh toán, không có đối chiếu ngân hàng tự động.',
    unavailable:
      'Chưa thể mở thao tác xác nhận từ màn hình này: cả xác nhận lẫn đưa vào đối chiếu đều cần mã lần chuyển khoản của khoản còn lại, mà không endpoint quản trị nào đang trả về. Xem giới hạn API ở trên.',
  },
  shipping: {
    title: 'Thông tin giao hàng',
    editableBadge: 'Có thể sửa',
    frozenBadge: 'Đã đóng băng',
    editableHelp:
      'Sửa được cho tới khi bấm giao hàng. Sau khi giao, toàn bộ khối này bị đóng băng và chuyển sang chỉ đọc — không có nút đóng băng riêng.',
    frozenHelp: 'Ảnh chụp tại thời điểm giao hàng. Chỉ đọc.',
    requiredNote:
      'Người nhận, số điện thoại, địa chỉ, tỉnh/thành và phí là bắt buộc; phường/xã, quận/huyện, đơn vị vận chuyển và mã vận đơn là tuỳ chọn.',
    save: 'Lưu thông tin giao hàng',
    reset: 'Hoàn tác thay đổi',
    saving: 'Đang lưu…',
    saved: 'Đã lưu thông tin giao hàng.',
    missing: 'Đơn này chưa có thông tin giao hàng. Nhập đầy đủ các trường bắt buộc rồi lưu để tạo.',
    noTracking:
      'Đơn vị vận chuyển và mã vận đơn ở đây là ghi chú nội bộ. Không có tra cứu hành trình, không có trạng thái từ đơn vị vận chuyển.',
  },
  shippingFields: {
    recipientName: 'Người nhận',
    recipientPhone: 'Số điện thoại',
    addressLine: 'Địa chỉ',
    ward: 'Phường/Xã',
    district: 'Quận/Huyện',
    province: 'Tỉnh/Thành',
    feeAmount: 'Phí vận chuyển (VND)',
    carrierName: 'Đơn vị vận chuyển',
    trackingCode: 'Mã vận đơn',
    frozenAt: 'Đóng băng lúc',
  },
  shippingFee: {
    title: 'Phí vận chuyển',
    currentLabel: 'Phí hiện tại',
    ruleTitle: 'QUY TẮC TĂNG PHÍ',
    ruleBody:
      'Giảm phí hoặc giữ nguyên: lưu được ngay. Tăng phí: chỉ lưu được khi khách đã xác nhận đúng mức phí mới. Quản trị viên không thể xác nhận thay khách.',
    unsetValue: 'Chưa đặt',
  },
  /**
   * The fee-increase refusal (`812:109`), and the one card in this catalog whose
   * *absences* are as approved as its text.
   *
   * `APP9-B04-C1` is the authority: an Admin write may never mint the customer's
   * acknowledgement. So there is no "confirm on the customer's behalf" label
   * here, no field for a fee the operator claims the customer agreed to, and
   * nothing that names a grant, a challenge or a secure link — a screen that
   * showed one would be publishing the state of a customer's credential to an
   * operator who has no use for it.
   */
  feeRefusal: {
    title: 'Không thể áp dụng phí vận chuyển mới',
    body: 'Khách hàng chưa xác nhận mức phí này.',
    acknowledgedLabel: 'Phí đang áp dụng',
    attemptedLabel: 'Phí bạn vừa nhập',
    nothingWritten:
      'Phần còn lại của thông tin giao hàng đã không được lưu. Không có thay đổi nào được ghi.',
    remedy:
      'Cách xử lý: giữ mức phí đang áp dụng, hoặc liên hệ khách để họ xác nhận mức phí mới rồi lưu lại. Việc gửi đề nghị phí mới cho khách chưa thuộc phạm vi giai đoạn này.',
    noOverrideTitle: 'CỐ Ý KHÔNG CÓ',
    noOverrideBody:
      'Không có nút xác nhận thay khách, không có ô tự nhập mức khách đồng ý, không hiển thị mã xác thực hay mã phiên của khách. Sự đồng ý của khách chỉ có thể do chính khách tạo ra.',
    restore: 'Khôi phục mức phí đã lưu',
  },
  dispatch: {
    title: 'Giao hàng',
    help: 'Đánh dấu đơn đã giao cho khách. Thông tin giao hàng sẽ bị đóng băng và chụp lại.',
    action: 'Đánh dấu đã giao',
    blockedNote:
      'Tạm khoá vì đang có thay đổi phí chưa lưu được. Máy chủ vẫn kiểm tra lại điều kiện khi bấm.',
    dialogTitle: 'Đánh dấu đơn hàng đã giao?',
    dialogBody:
      'Xác nhận rằng đơn hàng đã được giao cho khách. Đây là ghi nhận của cửa hàng, không phải xác nhận từ đơn vị vận chuyển.',
    freezeTitle: 'Thông tin giao hàng sẽ bị đóng băng vĩnh viễn',
    freezeBody:
      'Sau bước này, người nhận, số điện thoại, địa chỉ, phí vận chuyển, đơn vị vận chuyển và mã vận đơn không thể sửa được nữa. Hệ thống chụp lại toàn bộ giá trị tại thời điểm giao. Hãy kiểm tra kỹ trước khi xác nhận.',
    snapshotTitle: 'SẼ ĐƯỢC CHỤP LẠI',
    confirm: 'Xác nhận đã giao',
    cancel: 'Huỷ',
    pending: 'Đang ghi nhận đã giao…',
  },
  completion: {
    title: 'Hoàn tất đơn hàng',
    help: 'Khép lại đơn hàng sau khi đã giao và không còn việc gì phải xử lý. Đây là hành động riêng, cố ý tách khỏi bước giao hàng.',
    action: 'Hoàn tất đơn hàng',
    deliveredAtLabel: 'Đã giao lúc',
    dialogTitle: 'Hoàn tất đơn hàng này?',
    dialogBody: 'Đơn hàng sẽ chuyển sang COMPLETED. Đây là trạng thái cuối của vòng đời đơn hàng.',
    effectLabel: 'Trạng thái sau khi xác nhận',
    effectValue: 'COMPLETED',
    effectNote:
      'Sau khi hoàn tất, giao diện quản trị không còn thao tác nào trên đơn này: không mở lại, không giao lại, không hoàn tất lần nữa, không sửa giao hàng.',
    confirm: 'Xác nhận hoàn tất',
    cancel: 'Huỷ',
    pending: 'Đang hoàn tất…',
  },
  completed: {
    title: 'Đơn hàng đã hoàn tất',
    noActionsTitle: 'KHÔNG CÒN THAO TÁC NÀO',
    noActions: [
      'Không mở lại đơn',
      'Không hoàn tiền',
      'Không huỷ đơn',
      'Không sửa thông tin giao hàng',
      'Không giao lại',
      'Không hoàn tất lần nữa',
    ],
    deferred:
      'Hoàn tiền và huỷ đơn không thuộc phạm vi giai đoạn này và chưa có bề mặt quản trị nào.',
  },
  payment: {
    title: 'Thanh toán',
    depositSettled: 'Tiền cọc: Đã thu',
    remainingSettled: 'Còn lại: Đã thu',
    settledNote:
      'Đơn đã đi qua chốt chặn thanh toán khi giao hàng, nên tại đây khoản phải thu chắc chắn đã được xác nhận.',
  },
  locked: {
    title: 'Chưa khả dụng ở bước này',
    shipping: 'Thông tin giao hàng',
    shippingWhy: 'Chỉ mở khi đơn sang READY_FOR_DELIVERY',
    dispatch: 'Giao hàng',
    dispatchWhy: 'Cần thanh toán còn lại được xác nhận trước',
    completion: 'Hoàn tất đơn',
    completionWhy: 'Chỉ có sau khi đã giao',
  },
  /** One sentence per classified refusal — the `820:47` catalog. */
  refusal: {
    transitionStale:
      'Trạng thái nguồn đã đổi. Mời tải lại trang; màn hình không tự đoán và không tự thử lại.',
    shippingMissing: 'Đơn này chưa có thông tin giao hàng để đọc.',
    shippingIncomplete:
      'Thiếu trường bắt buộc. Người nhận, số điện thoại, địa chỉ, tỉnh/thành và phí là bắt buộc.',
    shippingFrozen:
      'Đơn đã giao nên thông tin giao hàng không sửa được nữa. Tải lại để thấy bản đã đóng băng.',
    feeChangeUnavailable:
      'Khoản còn lại của đơn đã được thu xong, nên phí vận chuyển không đổi được nữa.',
    feeNotApplicable: 'Mức phí này không để lại một khoản phải thu hợp lệ trên đơn.',
    remainingMissing: 'Đơn này không có khoản phải thu đang hoạt động để tính lại.',
    dispatchPaymentGuard:
      'Đơn vẫn còn khoản phải thu chưa được xác nhận — thường do phí vận chuyển tăng sau khi khách đã trả. Trạng thái đơn không phải bằng chứng đã thu đủ.',
    dispatchShippingNotReady:
      'Thông tin giao hàng chưa đủ để giao. Kiểm tra lại các trường bắt buộc rồi lưu trước khi giao.',
    dispatchInvalid:
      'Đơn không ở trạng thái có thể giao. Mời tải lại trang; màn hình không âm thầm giao lần thứ hai.',
    completionInvalid: 'Chỉ đơn đã giao mới hoàn tất được. Mời tải lại trang.',
    notFound: 'Không tìm thấy đơn hàng này, hoặc bạn không có quyền với nó.',
    unauthenticated: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi thử lại.',
    generic: 'Không thực hiện được. Dữ liệu bạn vừa nhập vẫn được giữ nguyên; thử lại sau ít phút.',
  },
  failure: {
    loading: 'Đang tải…',
    retry: 'Thử lại',
  },
} as const;
