/**
 * Every user-facing string on `/truy-cap/don-hang` (`APP12-S03`).
 *
 * Read from the approved `APP12-D01` frames, never written here; the node id
 * sits beside each entry so a copy change is traceable to the design that
 * authorized it. Centralised because `CLAUDE.md` §5 forbids hard-coded
 * user-facing copy inside components.
 *
 * Design source: file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_12`, section
 * `910:257` / `911:304`, approved under `FIG-APPROVAL-APP12-D01-PO-001`:
 *
 * | registry id | node |
 * |---|---|
 * | `FIG-APP12-S03-ORDER-ACCESS-DESKTOP` | `910:258` |
 * | `FIG-APP12-S03-ORDER-ACCESS-STATES` | `911:305` |
 * | `FIG-APP12-S03-ORDER-ACCESS-MOBILE` | `911:366` |
 *
 * ### Three rules govern what may be said here
 *
 * **No internal vocabulary reaches a customer.** `917:348`'s copy-density board
 * is explicit: `FULL`, `ORDER_ACCESS`, `origin`, `reservation`, `superseded`
 * and `AWAITING_SHIPPING_FEE` appear in Admin frames and annotations only. The
 * state board prints each stored token in a caption labelled *not rendered to
 * the customer* (`911:314`, `911:321`, …) — which is precisely why none of them
 * is in this file. Nothing below was derived from a DTO field name or an enum
 * member.
 *
 * **No deposit vocabulary.** A Ready-Made order carries exactly one obligation
 * (`BR-029`), so there is no *đặt cọc*, no *phần còn lại* and no 40/60 split
 * anywhere in this feature. The transport still travels an APP7 `deposit`-named
 * evidence path (`FU-APP9-B02-01`); that is a URL, and the customer reads *ảnh
 * xác nhận chuyển khoản*.
 *
 * **Nothing a customer does may read as payment confirmed.** `917:596` removes
 * the *tôi đã chuyển khoản* button outright, and there is no sentence below
 * that a scan, a transfer or an uploaded image could make true. Only an Admin
 * verification produces settled copy.
 */

/**
 * The one heading, and why it does not vary with the state.
 *
 * `911:305` states the variance rule in the design itself — *Chỉ ba khối thay
 * đổi: pill trạng thái, khối hành động kế tiếp, khối thanh toán/giao hàng* —
 * and the heading is deliberately not among the three. So the approved package
 * draws exactly one `h1` (`910:285` desktop, `911:370` mobile) and this
 * implementation renders exactly that one rather than inventing seven more.
 *
 * The observation that it reads as payment-specific on the three terminal
 * states is recorded as `FU-APP12-S03-01` for the Product Owner rather than
 * resolved here: writing eight headings would be redesign, and `FIGMA_DELTA`
 * is 0 for this checkpoint. The *substance* of each state is carried truthfully
 * by the pill and the next-action sentence beside it, which are the two blocks
 * the design does vary.
 */
export const ORDER_ACCESS_COPY = {
  /** `910:285` / `911:370`. */
  title: 'Thanh toán đơn hàng',

  /**
   * `910:289` / `911:374` — the order line.
   *
   * The order code is display and support context, never an authorization
   * input (`CST-026`). Split around it so the code is interpolated rather than
   * embedded in a sentence a translator could reorder.
   */
  order: {
    prefix: 'Đơn hàng',
    suffix: 'Liên kết chỉ dành cho bạn',
  },

  /**
   * The eight approved state variants (`911:308` … `911:365`).
   *
   * Each carries the pill label the design drew and the next-action sentence
   * beneath it. `note` is the second line where the frame drew one; the frames
   * that drew a single line have none, and no second line was invented to make
   * the shape uniform.
   */
  states: {
    /** `911:309` … `911:313`. */
    AWAITING_SHIPPING_FEE: {
      pill: 'Chờ xưởng báo phí giao hàng',
      body: 'Xưởng đang tính phí giao hàng cho địa chỉ của bạn.',
      note: 'Chưa có mã QR và chưa có tổng tiền — cả hai chỉ xuất hiện sau khi phí được xác nhận.',
    },
    /** `911:316` … `911:320`. */
    AWAITING_PAYMENT: {
      pill: 'Chờ thanh toán',
      body: 'Xưởng đã xác nhận phí giao hàng. Bạn có thể chuyển khoản theo thông tin bên dưới.',
      note: undefined,
    },
    /** `911:324` … `911:328`. */
    PAYMENT_UNDER_REVIEW: {
      pill: 'Xưởng đang đối chiếu',
      body: 'Xưởng đã nhận thông tin và đang đối chiếu khoản chuyển.',
      note: 'Hướng dẫn chuyển khoản vẫn hiển thị bên dưới cho tới khi xưởng xác nhận.',
    },
    /** `911:331` … `911:335`. */
    READY_FOR_DELIVERY: {
      pill: 'Đã thanh toán · chuẩn bị giao',
      body: 'Xưởng đã xác nhận thanh toán và đang chuẩn bị hàng.',
      note: undefined,
    },
    /** `911:339` … `911:343`. */
    DELIVERED: {
      pill: 'Đã giao',
      body: 'Đơn hàng đã được giao.',
      note: undefined,
    },
    /** `911:346` … `911:350`. */
    COMPLETED: {
      pill: 'Hoàn tất',
      body: 'Cảm ơn bạn đã đặt hàng tại Nét Thêu.',
      note: undefined,
    },
    /** `911:353` … `911:357`. */
    CANCELLED: {
      pill: 'Đã huỷ',
      body: 'Đơn hàng đã được huỷ.',
      note: undefined,
    },
    /** `911:360` … `911:364`. */
    EXPIRED: {
      pill: 'Hết hạn giữ hàng',
      body: 'Đơn đã huỷ vì quá hạn giữ hàng 24 giờ.',
      note: 'Hàng đã trả lại kho. Bạn có thể đặt lại từ trang sản phẩm.',
    },
    /**
     * A stored order state the approved package drew no frame for.
     *
     * `ON_HOLD` and `CANCELLING` are published by the contract and drawn
     * nowhere in `911:305`. `APP7-D01` `751:174` settled the rule for exactly
     * this case — *show it neutrally rather than guess at its meaning* — and
     * `APP9-S01` reused it as `OTHER_STATE`. This reuses that approved rule
     * rather than inventing a ninth variant: falling through to the payment
     * frame would offer a control the server refuses, and falling through to a
     * terminal frame would claim an ending that has not happened.
     */
    OTHER_STATE: {
      pill: 'Đang cập nhật',
      body: 'Đơn hàng của bạn đang được xưởng xử lý.',
      note: 'Xưởng sẽ liên hệ với bạn nếu cần thêm thông tin.',
    },
  },

  /** `910:294` … `910:305` — the amount card. */
  amount: {
    title: 'Số tiền cần thanh toán',
    /** `910:296` — the label above the exact figure. */
    highlightLabel: 'Tổng thanh toán',
    /** `910:299` — the frozen merchandise subtotal row. */
    merchandiseLabel: 'Tiền hàng',
    /** `910:303` — the exact shipping fee row. */
    feeLabel: 'Phí giao hàng',
    /**
     * Shown in place of the highlight while no fee is set.
     *
     * `911:313` states the rule the customer half of `BR-027` needs: before the
     * fee there is no total at all. The contract agrees physically — `payment`
     * and `delivery.feeAmount` are **absent**, not zero — so there is nothing
     * to render and this line says why.
     */
    pendingFee: 'Có sau khi xưởng xác nhận phí giao hàng',
  },

  /** `910:307` … `910:324` — the bank-transfer card. */
  transfer: {
    title: 'Chuyển khoản ngân hàng',
    bankLabel: 'Ngân hàng',
    accountNameLabel: 'Chủ tài khoản',
    accountNumberLabel: 'Số tài khoản',
    referenceLabel: 'Nội dung chuyển khoản',
    /** `910:324` — the one supporting line `917:595` allows this surface. */
    referenceNote: 'Giữ nguyên nội dung chuyển khoản để xưởng đối chiếu đúng đơn của bạn.',
  },

  /** `910:326` … `910:329` desktop, `911:416` … `911:419` mobile. */
  qr: {
    title: 'Quét mã để chuyển khoản',
    /**
     * `910:329` / `911:419` — the QR's own textual fallback, and the reason §57
     * is satisfied by the layout rather than by a promise: every datum the image
     * encodes is printed as readable text in the transfer card.
     *
     * The two frames differ by one word — the desktop code sits *bên cạnh* the
     * details (`910:329`), the mobile one *bên dưới* them (`911:419`) — because
     * the panel moves between the aside and the stack. The implementation mounts
     * **one** QR panel and places it with CSS rather than mounting two and
     * hiding one, so there is no breakpoint at which a component could choose
     * between the two sentences without putting both in the DOM: two text nodes
     * for one fact, one of them wrong at any given width.
     *
     * So the direction is dropped and the sentence names the destination
     * instead, which is true at both sizes and is a smaller deviation than
     * rendering a sentence that points the wrong way. Recorded as
     * `FU-APP12-S03-04`.
     */
    hint: 'Mã QR đã gồm đúng số tiền và nội dung chuyển khoản. Nếu không quét được, bạn dùng thông tin chuyển khoản ngân hàng của đơn này.',
    /**
     * Describes what the code is for, not what it looks like. "A QR code" tells
     * a screen-reader user nothing they can act on.
     */
    alt: 'Mã QR chuyển khoản đã gồm sẵn số tiền và nội dung chuyển khoản của đơn hàng này.',
    loading: 'Đang tạo mã QR…',
    failed: 'Chưa tạo được mã QR.',
    retry: 'Thử lại',
    download: 'Tải mã QR',
    /**
     * The disclaimer the approved package places *inside* the panel the
     * customer is looking at while they scan, following `APP9-D01` `816:222`.
     * Scanning is not paying, and no webhook will change that.
     */
    truth:
      'Quét mã hoặc chuyển tiền chưa có nghĩa là đơn đã được thanh toán. Xưởng sẽ đối chiếu và xác nhận.',
  },

  /** `910:331` … `910:334` — optional transfer evidence. */
  evidence: {
    title: 'Ảnh xác nhận chuyển khoản',
    /** `910:332` — optional, and it says so first. */
    lead: 'Không bắt buộc. Gửi ảnh giúp xưởng đối chiếu nhanh hơn.',
    /**
     * `910:334` renders the tile as *Chọn ảnh (tối đa 3)*.
     *
     * The count is interpolated from the delivered server quota rather than
     * transcribed, because `917:419`/`917:420` classifies payment evidence as
     * `REUSE_AS_IS` with *cùng ô tải ảnh, **cùng giới hạn*** — the same tile and
     * the same limits as APP7 — and APP7-B05 counts five per attempt under a
     * lock. The mock's literal `3` and the reuse directive disagree; the
     * directive wins, because the server is the quota authority and a tile
     * promising three would under-report a limit the customer actually has.
     * Recorded as `FU-APP12-S03-02`.
     */
    choosePrefix: 'Chọn ảnh (tối đa',
    chooseSuffix: ')',
    constraint: 'Ảnh JPG, PNG hoặc WebP, mỗi ảnh tối đa 10 MB.',
    uploading: 'Đang gửi ảnh…',
    /** Said beside the title, so *optional* is stated before the control is. */
    optionalBadge: 'Không bắt buộc',
    empty: 'Bạn chưa gửi ảnh nào.',
    listLabel: 'Ảnh xác nhận chuyển khoản đã gửi',
    /**
     * The sentence that keeps the two vocabularies apart (§22). An accepted
     * image means the file is usable for reconciliation and nothing more; it is
     * rendered as part of this section rather than as an aside elsewhere.
     */
    truth: 'Ảnh đã nhận không có nghĩa là đã thanh toán. Xưởng vẫn cần đối chiếu khoản chuyển.',
    /** Quota reached: the intake closes, the list stays as history. */
    quotaReached: 'Bạn đã gửi đủ số ảnh cho lần chuyển khoản này.',
  },

  /**
   * An image's state is the *image's*, never the payment's (§22).
   *
   * Four stored values, three labels: `UPLOADED` and `INSPECTING` are one
   * customer fact — the file arrived and is being looked at — and a fourth
   * label for a distinction the product does not have would be invention. Each
   * note says what the state means for the **file**, and none of the four says
   * anything about the money.
   */
  evidenceStatus: {
    UPLOADED: {
      label: 'Đang kiểm tra',
      note: 'Xưởng đã nhận được ảnh và đang kiểm tra tệp.',
    },
    INSPECTING: {
      label: 'Đang kiểm tra',
      note: 'Xưởng đã nhận được ảnh và đang kiểm tra tệp.',
    },
    ACCEPTED: {
      label: 'Ảnh dùng được',
      note: 'Ảnh rõ và dùng được để đối chiếu. Xưởng vẫn cần kiểm tra khoản chuyển.',
    },
    REJECTED: {
      label: 'Ảnh không dùng được',
      note: 'Tệp này không đọc được. Bạn có thể gửi ảnh khác.',
    },
  },

  /** The refusals a customer may see beside the evidence control. */
  evidenceFailure: {
    MEDIA_UNSUPPORTED: 'Chỉ nhận ảnh JPG, PNG hoặc WebP.',
    TOO_LARGE: 'Ảnh vượt quá 10 MB. Bạn thử gửi ảnh nhẹ hơn.',
    QUOTA_REACHED: 'Bạn đã gửi đủ số ảnh cho lần chuyển khoản này.',
    ATTEMPT_CLOSED: 'Lần chuyển khoản này đã khép lại, không nhận thêm ảnh.',
    REVERIFICATION_REQUIRED: 'Cần xác minh lại trước khi gửi ảnh.',
    IN_PROGRESS: 'Một ảnh đang được gửi. Bạn chờ ảnh đó xong rồi thử lại.',
    TRANSIENT: 'Chưa gửi được ảnh. Bạn thử lại giúp xưởng nhé.',
    retry: 'Gửi lại ảnh',
  },

  /** `910:336` / `911:421` — the access-expiry note. */
  access: {
    /**
     * Split so the instant is interpolated. This is the **secure link's**
     * expiry and is deliberately worded as such: §25 forbids conflating it with
     * the payment deadline, which is the reserved stock's own release time and
     * is a different fact with a different sentence below.
     */
    expiryPrefix: 'Liên kết này hết hạn lúc',
    expirySuffix: '.',
  },

  /**
   * The payment deadline — the reserved stock's own release instant.
   *
   * A different fact from the access expiry above and never labelled as it. The
   * value is read from `paymentDeadline`, which the contract states is taken
   * from the reservation itself and never recomputed; it disappears once no
   * live reservation stands, which is exactly when a deadline must stop being
   * shown. Nothing on this route counts down (`APP9-S01` §9's rule, kept).
   */
  deadline: {
    prefix: 'Xưởng giữ hàng cho bạn tới',
    suffix: '.',
  },

  /** The FULL-payment initiation control and its refusals. */
  attempt: {
    /**
     * The customer's own explicit request to open a payment attempt. It is what
     * `917:594` names the primary action of this surface, and it is never fired
     * on mount — opening an attempt because a route rendered is not something a
     * page may do on a customer's behalf.
     */
    start: 'Hiện thông tin chuyển khoản',
    starting: 'Đang mở…',
    /** Shown once an attempt is open, so the control is not offered twice. */
    opened: 'Thông tin chuyển khoản đã sẵn sàng bên dưới.',
    /**
     * A shipping-fee correction superseded the obligation this session's
     * attempt was opened against (§24). The old attempt is not migrated and is
     * not presented as the current one; the customer is told the amount moved.
     */
    superseded:
      'Xưởng vừa cập nhật phí giao hàng, nên số tiền đã thay đổi. Bạn chuyển khoản theo số tiền mới bên dưới.',
  },

  /** The refusals a failed initiation may show over a screen that still works. */
  attemptFailure: {
    FULL_PAYMENT_NOT_PAYABLE:
      'Đơn hàng này hiện chưa nhận thanh toán. Bạn tải lại trang giúp xưởng nhé.',
    DUPLICATE_OPERATION: 'Yêu cầu đang được xử lý. Bạn chờ trong giây lát.',
    IDEMPOTENCY_CONFLICT: 'Có một yêu cầu khác cho đơn này. Bạn tải lại trang rồi thử lại.',
    FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE:
      'Chưa lấy được thông tin chuyển khoản. Bạn thử lại trong ít phút.',
    TRANSIENT: 'Chưa mở được thông tin chuyển khoản. Bạn thử lại giúp xưởng nhé.',
  },

  /** The step-up overlay, reusing the APP4 verification machine unchanged. */
  stepUp: {
    title: 'Xác minh lại trước khi thanh toán',
    body: 'Để bảo vệ đơn hàng, xưởng cần xác minh lại liên hệ của bạn trước khi hiện thông tin chuyển khoản.',
    stay: 'Bạn ở lại trang này trong lúc xác minh — đóng trang sẽ phải mở lại liên kết từ tin nhắn.',
    safety: 'Xưởng không bao giờ hỏi mã xác minh qua điện thoại hay tin nhắn.',
    verified: 'Đã xác minh. Đang mở thông tin chuyển khoản…',
    cancel: 'Để sau',
  },

  /** The copy controls beside each exact server value. */
  copy: {
    short: 'Sao chép',
    amount: 'Sao chép số tiền',
    accountNumber: 'Sao chép số tài khoản',
    reference: 'Sao chép nội dung chuyển khoản',
    doneAmount: 'Đã sao chép số tiền.',
    doneAccountNumber: 'Đã sao chép số tài khoản.',
    doneReference: 'Đã sao chép nội dung chuyển khoản.',
    failed: 'Chưa sao chép được. Bạn chọn và sao chép thủ công giúp xưởng nhé.',
  },

  /**
   * The polite live-region announcements.
   *
   * This page changes without the customer acting — an Admin sets a fee, the
   * link settles, a QR arrives — and a screen reader would otherwise experience
   * each as nothing at all. `authorized` is what the secure shell announces the
   * moment the link opens.
   */
  live: {
    authorized: 'Đã mở đơn hàng của bạn.',
    qrLoading: 'Đang tạo mã QR.',
    qrReady: 'Mã QR đã sẵn sàng.',
    initiating: 'Đang mở thông tin chuyển khoản.',
    stepUp: 'Cần xác minh lại trước khi tiếp tục.',
    evidenceUploaded: 'Đã gửi ảnh xác nhận.',
  },

  /** The document title. Names the surface, and carries no order fact. */
  pageTitle: 'Đơn hàng của bạn — Nét Thêu',
  pageDescription:
    'Xem trạng thái đơn hàng, số tiền cần thanh toán và thông tin chuyển khoản qua liên kết truy cập an toàn.',
} as const;
