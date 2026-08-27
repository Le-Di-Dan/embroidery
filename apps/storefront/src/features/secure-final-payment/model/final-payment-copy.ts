/**
 * Every sentence `/truy-cap/thanh-toan-con-lai` can say, transcribed from the
 * approved `APP9-D01` frames (`FIG-APPROVAL-APP9-D01-PO-001`).
 *
 * Nodes read for this catalog:
 *
 * | area                                   | node       |
 * |----------------------------------------|------------|
 * | payable — instructions + dynamic QR    | `816:4`    |
 * | payable — before the attempt is opened | `816:231`  |
 * | transfer evidence — not sent           | `817:4`    |
 * | transfer evidence — sent               | `817:31`   |
 * | order status — not yet payable         | `818:4`    |
 * | order status — paid, preparing delivery| `818:37`   |
 * | order status — DELIVERED               | `818:87`   |
 * | order status — COMPLETED               | `818:137`  |
 * | mobile 390 — payable + QR, DELIVERED   | `819:4`, `819:200` |
 * | secure link unavailable                | `819:221`  |
 * | storefront error catalog               | `819:237`  |
 * | lifecycle & label mapping              | `820:4`    |
 *
 * ### Why the catalog is private to this feature
 *
 * These are the approved words for this one route, not a shared string table.
 * `APP5-S02`, `APP6-S01` and `APP7-S01` each keep their own for the same
 * reason: a sentence that two screens import is a sentence one of them will
 * eventually be wrong about. That is not theoretical here — the deposit lane's
 * evidence copy says *tiền cọc* in four places, and importing it would put the
 * word "deposit" on the balance screen, which is precisely what `APP9-S01` §11
 * forbids.
 *
 * ### The separations this file exists to hold
 *
 * An **image** is *đang kiểm tra / đã được tiếp nhận / không hợp lệ*; an
 * **attempt** is an intention to transfer; only an **order or obligation**
 * confirmed by an Admin is *đã nhận đủ thanh toán*. No sentence in the evidence
 * group mentions a payment succeeding or failing, and there is no
 * *tôi đã chuyển khoản* control anywhere in this feature for one to attach to.
 *
 * ### What is deliberately absent
 *
 * No carrier, tracking code, courier, estimate or shipment sentence exists
 * below — `818:84` and `818:134` mark that exclusion on the approved frames
 * themselves. No cancellation, refund or return sentence exists either
 * (`818:184`, `PO-APP9-001 = OPTION A — DEFER`), and no shipping-fee
 * acknowledgement wording exists because that UI is deferred by design
 * (`FIG-APP9-FEE-ACK-DISPOSITION`). The three unavailable/loading/network
 * sentences are **not** here: they belong to `APP4-S02`'s `SECURE_LINK_COPY`,
 * and a second copy of them would be a second authority for the one behaviour
 * that must never vary.
 */
export const SECURE_FINAL_PAYMENT_COPY = {
  /** Announcements for the shell's polite live region. */
  live: {
    authorized: 'Đã mở thông tin thanh toán phần còn lại cho đơn hàng của bạn.',
    initiating: 'Đang lấy thông tin chuyển khoản.',
    stepUp: 'Cần xác minh lại danh tính trước khi lấy thông tin chuyển khoản.',
    qrLoading: 'Đang tải mã QR chuyển khoản.',
    qrReady: 'Đã tải xong mã QR chuyển khoản.',
    uploading: 'Đang tải ảnh giao dịch lên.',
    settled: 'Cửa hàng đã nhận đủ thanh toán cho đơn hàng của bạn.',
  },

  /** The order line every panel prints under its heading (`816:15`). */
  order: {
    prefix: 'Đơn hàng',
    suffix: 'Nét Thêu',
    codeLabel: 'Mã đơn hàng',
    /** `818:34` — the one money row the delivered contract can fill. */
    paidRemainingLabel: 'Đã thanh toán phần còn lại',
    factsTitle: 'Đơn hàng của bạn',
  },

  /** `818:4` — production is not finished, or the balance is not yet open. */
  notPayable: {
    title: 'Đơn hàng của bạn',
    cardTitle: 'Đơn hàng đang được sản xuất',
    body: 'Chúng tôi sẽ báo bạn khi cần thanh toán phần còn lại. Bạn chưa cần chuyển khoản gì ở bước này.',
    note: 'Trang này chưa hiển thị số tiền cần chuyển, số tài khoản hay mã QR, vì khoản thanh toán còn lại chưa được mở.',
  },

  /** `816:231` — the balance is payable and no attempt is open yet. */
  preAttempt: {
    title: 'Thanh toán phần còn lại',
    badge: 'Chờ thanh toán',
    summaryTitle: 'Tóm tắt đơn hàng',
    highlightLabel: 'CÒN PHẢI TRẢ',
    startTitle: 'Sẵn sàng chuyển khoản?',
    startBody:
      'Bấm để nhận số tài khoản, nội dung chuyển khoản và mã QR cho đúng số tiền còn lại. Vì đây là thao tác liên quan đến tiền, bạn sẽ được yêu cầu xác minh lại danh tính một lần.',
    startAction: 'Lấy hướng dẫn chuyển khoản',
    starting: 'Đang lấy thông tin…',
  },

  /** `816:4` / `819:4` — instructions, QR and the waiting truth. */
  instructions: {
    title: 'Thanh toán phần còn lại',
    badge: 'Chờ thanh toán',
    amountTitle: 'Số tiền còn phải trả',
    amountNote:
      'Vui lòng chuyển đúng số tiền này. Đây là số tiền cửa hàng đã ghi nhận cho phần còn lại của đơn hàng.',
    panelTitle: 'Thông tin chuyển khoản',
    panelLead:
      'Chuyển khoản thủ công qua ngân hàng. Nét Thêu đối chiếu tài khoản và xác nhận thủ công — không có cổng thanh toán tự động ở bước này.',
    bankLabel: 'Ngân hàng',
    accountNumberLabel: 'Số tài khoản',
    accountNameLabel: 'Chủ tài khoản',
    referenceLabel: 'Nội dung chuyển khoản (bắt buộc giữ nguyên)',
    referenceNote:
      'Giữ nguyên nội dung chuyển khoản để chúng tôi đối chiếu đúng đơn hàng của bạn. Bạn không thể sửa số tiền hay nội dung — cả hai do hệ thống sinh ra.',
    waitingTitle: 'Chúng tôi đang chờ xác nhận khoản chuyển của bạn',
    waitingBody:
      'Sau khi bạn chuyển khoản, Nét Thêu sẽ đối chiếu với tài khoản ngân hàng rồi xác nhận thủ công, thường trong giờ làm việc. Trang này không có nút “Tôi đã chuyển khoản”, vì hệ thống không có cách nào tự kiểm chứng điều đó.',
    expiryPrefix: 'Liên kết bảo mật này hết hạn lúc',
    expirySuffix: 'Hết hạn thì mở lại bằng liên kết mới cửa hàng gửi cho bạn.',
  },

  /** `816:63` / `816:221` — the QR panel and the sentence that bounds it. */
  qr: {
    title: 'Quét mã để chuyển nhanh',
    alt: 'Mã QR chuyển khoản phần còn lại, chứa số tài khoản, số tiền và nội dung chuyển khoản của đơn hàng này.',
    hint: 'Mã đã chứa sẵn số tài khoản, số tiền và nội dung chuyển khoản. Mở ứng dụng ngân hàng và quét để điền tự động.',
    truth:
      'Quét mã hoặc chuyển tiền KHÔNG có nghĩa là đã thanh toán xong. Nét Thêu vẫn phải đối chiếu tiền về tài khoản rồi mới xác nhận.',
    download: 'Tải mã QR',
    loading: 'Đang tải mã QR…',
    fallback:
      'Không quét được mã? Bạn vẫn chuyển khoản bình thường bằng số tài khoản và nội dung ở bên trái — mã QR chỉ là lối tắt.',
    failed: 'Chưa tải được mã QR. Bạn vẫn chuyển khoản được bằng thông tin bên trái.',
    retry: 'Thử tải lại mã QR',
  },

  /** `816:41` — every copy control names what it copies. */
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

  /**
   * `817:4` / `817:31` — optional transfer evidence, in the customer's words.
   *
   * Not one sentence here says *đặt cọc*. The route these calls travel is
   * deposit-named and must stay so (`FU-APP9-B02-01`); the screen is not.
   */
  evidence: {
    title: 'Ảnh xác nhận chuyển khoản',
    optionalBadge: 'Không bắt buộc',
    lead: 'Nếu tiện, bạn có thể gửi ảnh chụp màn hình giao dịch để cửa hàng đối chiếu nhanh hơn.',
    dropzoneTitle: 'Tải ảnh giao dịch (không bắt buộc)',
    dropzoneHint: 'Kéo thả ảnh vào đây, hoặc bấm để chọn từ máy.',
    constraints: 'Chấp nhận PNG, JPEG hoặc WEBP · tối đa 10 MB mỗi ảnh · tối đa 5 ảnh',
    choose: 'Chọn ảnh',
    more: 'Tải thêm ảnh',
    uploadingBadge: 'Đang tải lên',
    uploadingDisabled: 'Đang tải ảnh, vui lòng đợi…',
    uploadingNote:
      'Việc tải ảnh lên KHÔNG làm thay đổi trạng thái thanh toán. Bạn có thể rời trang, ảnh đã gửi vẫn được lưu.',
    notProof:
      'Ảnh chỉ là tài liệu hỗ trợ đối chiếu. Gửi ảnh KHÔNG có nghĩa là khoản thanh toán đã được xác nhận — cửa hàng vẫn phải kiểm tra tiền về tài khoản.',
    quotaFull: 'Đã đạt tối đa 5 ảnh',
    quotaNote:
      'Bạn đã gửi đủ 5 ảnh cho lần thanh toán này nên không gửi thêm được nữa. Trạng thái các ảnh vẫn hiển thị, và khoản thanh toán vẫn được cửa hàng xác nhận bình thường.',
    appendOnlyNote:
      'Ảnh đã gửi không thể xoá, thay thế hay sắp xếp lại — danh sách chỉ ghi thêm. Khách cũng không tải lại được ảnh của mình từ trang này.',
    listLabel: 'Ảnh xác nhận đã gửi',
    empty: 'Chưa có ảnh nào được gửi cho lần thanh toán này.',
    loading: 'Đang tải danh sách ảnh…',
  },

  /** The four contract values, as the customer reads them. */
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
    MEDIA_UNSUPPORTED: 'Chỉ nhận ảnh PNG, JPEG hoặc WEBP.',
    TOO_LARGE: 'Ảnh vượt quá 10 MB. Bạn hãy chọn ảnh nhỏ hơn.',
    QUOTA_REACHED: 'Lần thanh toán này đã đủ 5 ảnh nên không nhận thêm được nữa.',
    ATTEMPT_CLOSED: 'Lần thanh toán này đã kết thúc nên không nhận thêm ảnh.',
    REVERIFICATION_REQUIRED: 'Cần xác minh lại danh tính trước khi gửi ảnh.',
    IN_PROGRESS: 'Ảnh này đang được gửi. Bạn hãy đợi một chút.',
    TRANSIENT: 'Chưa gửi được ảnh. Bạn có thể thử lại.',
    retry: 'Thử gửi lại',
  },

  /** `818:37` / `818:87` / `818:137` — the settled lane, in three readings. */
  settled: {
    title: 'Đơn hàng của bạn',
    progressLabel: 'Tiến độ đơn hàng',
    paid: {
      cardTitle: 'Chúng tôi đã nhận đủ thanh toán',
      body: 'Cảm ơn bạn. Đơn hàng đang được chuẩn bị để giao cho bạn.',
    },
    delivered: {
      cardTitle: 'Đơn hàng đã được giao',
      body: 'Nét Thêu đã ghi nhận đơn hàng của bạn được giao thành công.',
    },
    completed: {
      cardTitle: 'Đơn hàng đã hoàn tất',
      body: 'Cảm ơn bạn đã đặt may tại Nét Thêu. Đơn hàng đã kết thúc.',
    },
  },

  /**
   * A stored obligation state the approved package draws no frame for.
   *
   * `CANCELLED` and `SUPERSEDED` are shown neutrally rather than guessed at,
   * following the rule `APP7-D01` fixed at `751:174`. No cancellation or refund
   * action is offered here, because none exists (`PO-APP9-001`).
   */
  otherState: {
    title: 'Đơn hàng của bạn',
    cardTitle: 'Khoản thanh toán này đang ở một trạng thái khác',
    body: 'Bạn không cần chuyển thêm tiền vào lúc này. Cửa hàng sẽ liên hệ nếu cần bạn hỗ trợ thêm.',
  },

  /** Step-up runs over this page, never as a navigation. */
  stepUp: {
    title: 'Xác minh lại danh tính',
    body: 'Vì đây là thao tác liên quan đến tiền, cửa hàng cần xác minh lại rằng chính bạn đang thực hiện. Nhập số điện thoại hoặc email bạn đã dùng cho yêu cầu này để nhận mã.',
    stay: 'Bạn vẫn đang ở trong phiên truy cập an toàn. Đừng đóng trang này.',
    safety:
      'Cửa hàng không bao giờ hỏi mật khẩu hay mã OTP qua điện thoại. Mã chỉ dùng cho lần xác minh này.',
    verified: 'Đã xác minh. Đang lấy thông tin chuyển khoản…',
    cancel: 'Huỷ',
  },

  /** Refusals of the initiation itself, by the codes `APP9-B02` publishes. */
  initiateFailure: {
    FINAL_PAYMENT_NOT_PAYABLE: 'Khoản thanh toán này không còn ở trạng thái chờ thanh toán.',
    DUPLICATE_OPERATION: 'Lần thanh toán này đang được mở. Bạn hãy đợi một chút rồi thử lại.',
    IDEMPOTENCY_CONFLICT: 'Yêu cầu trước đó chưa hoàn tất. Bạn hãy thử lại.',
    FINAL_PAYMENT_INSTRUCTIONS_UNAVAILABLE:
      'Thông tin chuyển khoản tạm thời chưa sẵn sàng. Bạn hãy thử lại sau ít phút.',
    TRANSIENT: 'Chưa lấy được thông tin chuyển khoản. Bạn có thể thử lại.',
  },
} as const;
