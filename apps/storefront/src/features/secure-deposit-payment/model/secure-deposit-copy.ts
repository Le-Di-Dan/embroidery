/**
 * Every sentence `/truy-cap/thanh-toan` can say, transcribed from the approved
 * `APP7-D01` frames (`FIG-APPROVAL-APP7-D01-PO-001`).
 *
 * Nodes read for this catalog:
 *
 * | area                              | node       |
 * |-----------------------------------|------------|
 * | deposit instructions + dynamic QR | `745:3`    |
 * | before attempt initiation         | `747:3`    |
 * | step-up composition               | `747:41`   |
 * | evidence — empty / optional       | `748:3`    |
 * | evidence — uploading              | `748:29`   |
 * | evidence — INSPECTING             | `748:57`   |
 * | evidence — ACCEPTED               | `748:86`   |
 * | evidence — REJECTED               | `748:115`  |
 * | evidence — quota reached          | `748:144`  |
 * | attempt REQUIRES_REVIEW           | `749:3`    |
 * | attempt FAILED / EXPIRED          | `749:26`   |
 * | DEPOSIT verified confirmation     | `749:50`   |
 * | mobile deposit + QR               | `750:3`    |
 * | mobile evidence                   | `750:376`  |
 * | mobile confirmation               | `750:415`  |
 * | payment state & copy matrix       | `751:3`    |
 * | accessibility specification       | `753:120`  |
 *
 * ### Why the catalog is private to this feature
 *
 * These are the approved words for this one route, not a shared string table.
 * `APP5-S02` and `APP6-S01` each keep their own for the same reason: a sentence
 * that two screens import is a sentence one of them will eventually be wrong
 * about.
 *
 * ### The separations this file exists to hold
 *
 * `751:3` and `751:175` forbid collapsing three vocabularies. An **image** is
 * *đang kiểm tra / đã được tiếp nhận / không hợp lệ*; an **attempt** is *chờ xác
 * nhận tiền cọc / đang đối chiếu / đã kết thúc*; only an **order or obligation**
 * confirmed by an Admin is *đã xác nhận tiền cọc*. There is deliberately no
 * shared "đã thanh toán" badge anywhere below, and no sentence in the evidence
 * group mentions payment succeeding or failing.
 *
 * The three unavailable/loading/network sentences are **not** here. They belong
 * to `APP4-S02`'s `SECURE_LINK_COPY`, and a second copy of them would be a
 * second authority for the one behaviour that must never vary.
 */
export const SECURE_DEPOSIT_COPY = {
  /** Announcements for the shell's polite live region. */
  live: {
    authorized: 'Đã mở thông tin đặt cọc cho đơn hàng của bạn.',
    initiating: 'Đang lấy thông tin chuyển khoản.',
    stepUp: 'Cần xác minh lại danh tính trước khi lấy thông tin chuyển khoản.',
    qrLoading: 'Đang tải mã QR chuyển khoản.',
    qrReady: 'Đã tải xong mã QR chuyển khoản.',
    uploading: 'Đang tải ảnh giao dịch lên.',
    uploaded: 'Đã gửi ảnh giao dịch. Ảnh đang được kiểm tra.',
    confirmed: 'Cửa hàng đã xác nhận tiền cọc.',
  },

  /** `747:3` — the order is created, no attempt has been opened yet. */
  preAttempt: {
    title: 'Đặt cọc đơn hàng',
    badge: 'Chưa bắt đầu chuyển khoản',
    lead: 'Thiết kế của bạn đã được duyệt và đơn hàng đã được tạo. Bước tiếp theo là đặt cọc để cửa hàng bắt đầu xử lý.',
    summaryTitle: 'Tóm tắt đơn hàng',
    orderCodeLabel: 'Mã đơn hàng',
    depositLabel: 'Số tiền đặt cọc',
    currencyLabel: 'Tiền tệ',
    remainderNote:
      'Phần còn lại của đơn hàng sẽ được thu ở một bước khác về sau. Trang này chỉ thu tiền cọc.',
    startTitle: 'Sẵn sàng chuyển khoản?',
    startBody:
      'Bấm nút bên dưới để lấy thông tin tài khoản, số tiền chính xác, nội dung chuyển khoản và mã QR. Vì đây là thao tác liên quan đến tiền, bạn sẽ được yêu cầu xác minh lại danh tính một lần.',
    startAction: 'Lấy thông tin chuyển khoản',
    starting: 'Đang lấy thông tin…',
  },

  /** `745:3` / `750:3` — instructions, QR and the waiting truth. */
  instructions: {
    title: 'Đặt cọc đơn hàng',
    badge: 'Chờ xác nhận tiền cọc',
    orderLine: 'Cửa hàng sẽ kiểm tra và xác nhận sau khi nhận được tiền.',
    orderPrefix: 'Đơn hàng',
    panelTitle: 'Thông tin chuyển khoản',
    amountLabel: 'SỐ TIỀN CẦN CHUYỂN',
    referenceLabel: 'NỘI DUNG CHUYỂN KHOẢN — VUI LÒNG GHI ĐÚNG',
    referenceNote:
      'Ghi đúng nội dung này giúp cửa hàng đối chiếu nhanh hơn. Bạn không thể sửa số tiền hay nội dung — cả hai do hệ thống sinh ra.',
    bankLabel: 'Ngân hàng',
    accountNumberLabel: 'Số tài khoản',
    accountNameLabel: 'Chủ tài khoản',
    expiryPrefix: 'Liên kết truy cập này còn hiệu lực đến',
    expirySuffix: 'Hết hạn thì mở lại bằng liên kết mới cửa hàng gửi cho bạn.',
    waitingTitle: 'Bạn đã chuyển khoản rồi?',
    waitingBody:
      'Nếu bạn đã hoàn tất chuyển khoản, vui lòng chờ cửa hàng xác nhận. Cửa hàng kiểm tra tài khoản ngân hàng và xác nhận thủ công, thường trong giờ làm việc.',
    waitingNoButton:
      'Trang này không có nút “Tôi đã chuyển khoản”, vì hệ thống không có cách nào tự kiểm chứng điều đó. Trạng thái sẽ tự đổi khi cửa hàng xác nhận.',
  },

  /** `745:52` / `750:40` — the QR panel and its download. */
  qr: {
    title: 'Quét mã để chuyển nhanh',
    alt: 'Mã QR chuyển khoản đặt cọc, chứa số tài khoản, số tiền và nội dung chuyển khoản của đơn hàng này.',
    download: 'Tải mã QR',
    loading: 'Đang tải mã QR…',
    fallback:
      'Không quét được mã? Bạn vẫn chuyển khoản bình thường bằng số tài khoản và nội dung ở bên trái — mã QR chỉ là lối tắt.',
    failed: 'Chưa tải được mã QR. Bạn vẫn chuyển khoản được bằng thông tin bên trái.',
    retry: 'Thử tải lại mã QR',
  },

  /** `753:134` — every copy control names what it copies. */
  copy: {
    amount: 'Sao chép số tiền',
    reference: 'Sao chép nội dung chuyển khoản',
    accountNumber: 'Sao chép số tài khoản',
    short: 'Sao chép',
    doneAmount: 'Đã sao chép số tiền.',
    doneReference: 'Đã sao chép nội dung chuyển khoản.',
    doneAccountNumber: 'Đã sao chép số tài khoản.',
    failed: 'Không sao chép được. Bạn có thể bôi đen và sao chép thủ công.',
  },

  /** `745:365` / `750:364` — prominent, and explicitly optional. */
  reminder: {
    headline: 'Sau khi chuyển khoản, hãy chụp màn hình giao dịch thành công',
    body: 'Bạn có thể tải ảnh lên để cửa hàng đối chiếu nhanh hơn.',
    optional:
      'Không bắt buộc. Ảnh giao dịch không tự động xác nhận thanh toán — cửa hàng vẫn phải kiểm tra tiền về tài khoản rồi mới xác nhận.',
  },

  /** `748:*` / `750:376` — the evidence panel. */
  evidence: {
    title: 'Ảnh giao dịch',
    optionalBadge: 'không bắt buộc',
    dropzoneTitle: 'Kéo thả ảnh vào đây hoặc chọn từ máy',
    constraints: 'JPG, PNG hoặc WebP · tối đa 10 MB mỗi ảnh · tối đa 5 ảnh cho mỗi lần thanh toán',
    choose: 'Chọn ảnh',
    more: 'Tải thêm ảnh',
    another: 'Gửi ảnh khác',
    skipTitle: 'Tiếp tục mà không gửi ảnh',
    skipBody: 'Hoàn toàn hợp lệ — cửa hàng vẫn xác nhận được tiền cọc.',
    optionalNote:
      'Ảnh giao dịch chỉ giúp cửa hàng đối chiếu nhanh hơn. Ảnh không tự động xác nhận thanh toán.',
    uploadingBadge: 'Đang tải lên',
    uploadingDisabled: 'Đang tải ảnh, vui lòng đợi…',
    uploadingNote:
      'Việc tải ảnh lên KHÔNG làm thay đổi trạng thái thanh toán và cửa hàng cũng không chờ ảnh này để xác nhận. Bạn có thể rời trang, ảnh đã gửi vẫn được lưu.',
    notPaymentNote:
      'Đây là trạng thái của ẢNH, không phải của thanh toán. Tiền cọc của bạn vẫn đang chờ cửa hàng xác nhận, bất kể ảnh đang ở bước nào.',
    quotaFull: 'Đã đạt tối đa 5 ảnh',
    quotaNote:
      'Bạn đã gửi đủ 5 ảnh cho lần thanh toán này nên không gửi thêm được nữa. Trạng thái các ảnh vẫn hiển thị, và tiền cọc vẫn được cửa hàng xác nhận bình thường.',
    appendOnlyNote:
      'Ảnh đã gửi không thể xoá, thay thế hay sắp xếp lại — danh sách chỉ ghi thêm. Khách cũng không tải lại được ảnh của mình từ trang này.',
    listLabel: 'Ảnh giao dịch đã gửi',
    empty: 'Chưa có ảnh nào được gửi cho lần thanh toán này.',
    loading: 'Đang tải danh sách ảnh…',
  },

  /** `751:121`…`751:168` — the four contract values, as the customer reads them. */
  evidenceStatus: {
    UPLOADED: {
      label: 'Đang kiểm tra ảnh',
      note: 'Hệ thống đang kiểm tra tệp. Bước này tự động và thường chỉ mất ít phút.',
    },
    INSPECTING: {
      label: 'Đang kiểm tra ảnh',
      note: 'Hệ thống đang kiểm tra tệp. Bước này tự động và thường chỉ mất ít phút.',
    },
    ACCEPTED: {
      label: 'Ảnh đã được tiếp nhận',
      note: 'Cửa hàng đã có thể xem ảnh này khi đối chiếu.',
    },
    REJECTED: {
      label: 'Ảnh không hợp lệ',
      note: 'Ảnh này không dùng được để đối chiếu. Bạn có thể gửi một ảnh khác rõ hơn.',
    },
  },

  /** What a refused upload says, bounded to the codes B05 and B01 publish. */
  uploadFailure: {
    MEDIA_UNSUPPORTED: 'Chỉ nhận ảnh JPG, PNG hoặc WebP.',
    TOO_LARGE: 'Ảnh vượt quá 10 MB. Bạn hãy chọn ảnh nhỏ hơn.',
    QUOTA_REACHED: 'Lần thanh toán này đã đủ 5 ảnh nên không nhận thêm được nữa.',
    ATTEMPT_CLOSED: 'Lần thanh toán này đã kết thúc nên không nhận thêm ảnh.',
    REVERIFICATION_REQUIRED: 'Cần xác minh lại danh tính trước khi gửi ảnh.',
    IN_PROGRESS: 'Ảnh này đang được gửi. Bạn hãy đợi một chút.',
    TRANSIENT: 'Chưa gửi được ảnh. Bạn có thể thử lại.',
    retry: 'Thử gửi lại',
  },

  /** `749:3` — the attempt is being reconciled, and nothing internal is shown. */
  review: {
    badge: 'Đang đối chiếu',
    title: 'Giao dịch đang được cửa hàng đối chiếu',
    body: 'Cửa hàng đang kiểm tra lại giao dịch của bạn. Việc này thường xảy ra khi số tiền hoặc nội dung chuyển khoản chưa khớp hoàn toàn với đơn hàng. Cửa hàng sẽ liên hệ nếu cần bạn hỗ trợ thêm.',
    note: 'Bạn không cần chuyển thêm tiền vào lúc này. Vui lòng chờ cửa hàng liên hệ hoặc cập nhật trạng thái.',
  },

  /** `749:26` — the attempt is over; a new one is the only way forward. */
  terminal: {
    badge: 'Lần thanh toán đã kết thúc',
    title: 'Lần thanh toán này không thể tiếp tục',
    expiredTitle: 'Lần thanh toán này đã hết hiệu lực',
    body: 'Hướng dẫn chuyển khoản của lần thanh toán trước đã hết hiệu lực. Bạn hãy bắt đầu một lần thanh toán mới để nhận thông tin và mã QR mới.',
    warning:
      'Nếu bạn đã chuyển tiền theo hướng dẫn cũ, đừng chuyển lại. Hãy liên hệ cửa hàng để được đối chiếu.',
    note: 'Bắt đầu lại sẽ tạo một lần thanh toán MỚI kèm một lần xác minh mới. Lần thanh toán đã kết thúc không bao giờ được đưa về trạng thái chờ.',
    action: 'Bắt đầu lại việc đặt cọc',
  },

  /** `751:174` — a stored value APP7 never produces is shown, not guessed at. */
  undrawn: {
    title: 'Lần thanh toán đang ở một trạng thái khác',
    body: 'Cửa hàng sẽ liên hệ nếu cần bạn hỗ trợ thêm. Bạn không cần chuyển thêm tiền vào lúc này.',
    codeLabel: 'Mã trạng thái',
  },

  /** `749:50` / `750:415` — the one authoritative success on this route. */
  confirmed: {
    title: 'Đã xác nhận tiền cọc',
    lead: 'Cửa hàng đã nhận được tiền cọc của bạn và xác nhận thành công.',
    orderBadge: 'Đơn hàng: Đã xác nhận cọc',
    depositBadge: 'Tiền cọc: Đã thu đủ',
    identityTitle: 'Đơn hàng của bạn',
    orderCodeLabel: 'Mã đơn hàng',
    depositLabel: 'Tiền cọc đã xác nhận',
    referenceLabel: 'Nội dung chuyển khoản',
    nextTitle: 'Tiếp theo là gì?',
    nextBody:
      'Cửa hàng sẽ tiếp tục xử lý đơn hàng ở bước tiếp theo và thông báo cho bạn khi có cập nhật.',
    evidenceNote:
      'Danh sách ảnh vẫn giữ nguyên để bạn đối chiếu về sau. Sau khi tiền cọc đã được xác nhận, trang này không còn đề nghị bạn gửi thêm ảnh nữa.',
  },

  /** `747:41` — step-up runs over this page, never as a navigation. */
  stepUp: {
    title: 'Xác minh lại danh tính',
    body: 'Vì đây là thao tác liên quan đến tiền, cửa hàng cần xác minh lại rằng chính bạn đang thực hiện. Nhập số điện thoại hoặc email bạn đã dùng cho yêu cầu này để nhận mã.',
    stay: 'Bạn vẫn đang ở trong phiên truy cập an toàn. Đừng đóng trang này.',
    safety:
      'Cửa hàng không bao giờ hỏi mật khẩu hay mã OTP qua điện thoại. Mã chỉ dùng cho lần xác minh này.',
    verified: 'Đã xác minh. Đang lấy thông tin chuyển khoản…',
    cancel: 'Huỷ',
  },

  /** Refusals of the initiation itself, by the codes `APP7-B03` publishes. */
  initiateFailure: {
    DEPOSIT_NOT_PAYABLE: 'Khoản đặt cọc này không còn ở trạng thái chờ thanh toán.',
    DUPLICATE_OPERATION: 'Lần thanh toán này đang được mở. Bạn hãy đợi một chút rồi thử lại.',
    IDEMPOTENCY_CONFLICT: 'Yêu cầu trước đó chưa hoàn tất. Bạn hãy thử lại.',
    DEPOSIT_INSTRUCTIONS_UNAVAILABLE:
      'Thông tin chuyển khoản tạm thời chưa sẵn sàng. Bạn hãy thử lại sau ít phút.',
    TRANSIENT: 'Chưa lấy được thông tin chuyển khoản. Bạn có thể thử lại.',
  },
} as const;
