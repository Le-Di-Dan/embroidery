/**
 * Every operator-facing string on the Ready-Made order branch (`913:337`,
 * `914:361`).
 *
 * A catalog of its own beside `order-detail-copy.ts`, not an extension of it:
 * the two branches say different things about different commerce, and one file
 * holding both would make it easy to reach for a deposit sentence on a
 * Ready-Made screen. Status and origin **labels** are in neither — they belong
 * to `shared/presentation/`, because an order must not be named one thing in
 * the list and another on the screen it opens.
 *
 * The refusal sentences are chosen by failure *classification* alone. A server
 * `message`, `code` or `requestId` is never rendered.
 */
export const READY_MADE_DETAIL_COPY = {
  frozen: {
    heading: 'Thông tin đã chốt',
    help: 'Ảnh chụp tại thời điểm tạo đơn. Sửa Catalog sau đó không làm thay đổi đơn này.',
    origin: 'Nguồn đơn',
    code: 'Mã đơn',
    customer: 'Khách hàng',
    contact: 'Liên hệ',
    address: 'Địa chỉ nhận hàng',
    createdAt: 'Tạo lúc',
    /** The reservation's own committed `expires_at`, never a computed window. */
    paymentDeadline: 'Giữ hàng đến',
    /** Shown where the hold has lapsed, been released or been consumed. */
    paymentDeadlineAbsent: 'Không còn giữ hàng',
    /** `BR-031` — the omission is stated, not left as an empty card. */
    omitted:
      'Không hiển thị: yêu cầu thêu riêng · báo giá đã chấp nhận · bản thiết kế đã duyệt · lệnh sản xuất.',
    /** Before the fee is confirmed there is no payable total to name. */
    totalUnknown: 'Tổng đơn hàng chưa xác định',
  },
  items: {
    heading: 'Sản phẩm',
    product: 'Sản phẩm',
    sku: 'SKU',
    quantity: 'SL',
    unitPrice: 'Đơn giá',
    help: 'Ảnh chụp tại thời điểm tạo đơn. Sửa Catalog sau đó không làm thay đổi đơn này (BR-021).',
  },
  shipping: {
    heading: 'Phí giao hàng',
    help: 'Xưởng tự nhập. Không có tính tự động, không có báo giá hãng vận chuyển.',
    feeLabel: 'Phí giao hàng (VND)',
    feePlaceholder: '35000',
    requiredLabel: 'Bắt buộc',
    /** `NULL` is unpriced and `0` is free delivery — two different facts. */
    feeHelp:
      'Nhập số tiền đúng như sẽ thu. Để trống nghĩa là chưa báo phí; nhập 0 nghĩa là miễn phí giao hàng.',
    merchandise: 'Tiền hàng (đã chốt)',
    payable: 'Tổng khách phải trả',
    /** Nothing is payable until the operator confirms a fee (`BR-029`). */
    payableUnknown: 'Chưa xác định',
    confirm: 'Xác nhận phí và mở thanh toán',
    confirmNote:
      'Xác nhận sẽ đóng băng tiền hàng, phí và tổng phải trả, tạo nghĩa vụ thanh toán FULL, đặt lại hạn giữ hàng thành 24 giờ và gửi khách liên kết thanh toán.',
    correct: 'Cập nhật phí',
    /**
     * The successor warning (`914:361`). It says the predecessor is replaced and
     * deliberately does **not** say the payment window is extended — the server
     * reschedules the stock hold, which is a different fact, and claiming a
     * longer time to pay would be this screen inventing a deadline.
     */
    correctWarning:
      'Cập nhật phí sẽ thay thế nghĩa vụ thanh toán hiện tại bằng một nghĩa vụ mới. Liên kết thanh toán cũ không còn dùng được và khách cần dùng liên kết mới.',
    saving: 'Đang lưu…',
    frozenHeading: 'Phí đã chốt',
    /** `BR-028` — the rule and the legitimate path, never a silent disable. */
    refusedTitle: 'Không thể sửa phí',
    refusedBody:
      'Nghĩa vụ FULL đã được thanh toán. Mọi điều chỉnh thương mại phải đi qua quy trình huỷ/hoàn tiền.',
    pendingNote:
      'Khi FULL còn PENDING, sửa phí sẽ thay thế nghĩa vụ hiện tại bằng nghĩa vụ kế nhiệm và đơn vẫn ở AWAITING_PAYMENT.',
  },
  payment: {
    heading: 'Thanh toán',
    /** The one obligation a Ready-Made order carries (`BR-029`). */
    note: 'Ready-Made dùng đúng một nghĩa vụ FULL. Không có DEPOSIT/REMAINING và không có tỷ lệ 40/60 (BR-029).',
    emptyBody:
      'Chưa có nghĩa vụ thanh toán. Nghĩa vụ FULL được tạo khi bạn xác nhận phí giao hàng.',
    amount: 'Số tiền phải trả',
    status: 'Trạng thái nghĩa vụ',
    reference: 'Nội dung chuyển khoản',
    attemptHeading: 'Lần thanh toán hiện tại',
    attemptStatus: 'Trạng thái',
    attemptAmount: 'Số tiền',
    evidence: 'Ảnh khách gửi',
    evidenceCount: (count: number) => `${String(count)} ảnh`,
    noAttempt: 'Khách chưa bắt đầu chuyển khoản.',
    /** Evidence is supporting material and never a payment fact. */
    evidenceNote:
      'Ảnh chuyển khoản là tài liệu hỗ trợ. Ảnh được duyệt không có nghĩa là tiền đã về.',
    verify: 'Đối chiếu và xác nhận',
    settled: 'Đã xác nhận thanh toán',
  },
  fulfillment: {
    heading: 'Giao hàng',
    /** `913:337` — the precondition, stated rather than left as an empty column. */
    lockedHelp:
      'Mở sau khi thanh toán FULL được xác nhận. Đơn bán sẵn không tạo lệnh sản xuất (BR-030).',
  },
  failure: {
    loading: 'Đang tải thông tin thanh toán…',
    unavailableTitle: 'Không tải được thông tin thanh toán',
    unavailableBody: 'Kết nối tới máy chủ đang gặp sự cố. Thử lại sau ít phút.',
    retry: 'Thử lại',
    saveFailed: 'Không lưu được. Kiểm tra lại và thử một lần nữa.',
    stale: 'Đơn hàng đã thay đổi. Màn hình đã được tải lại theo trạng thái mới nhất.',
  },
} as const;
