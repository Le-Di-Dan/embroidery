/**
 * Every customer-facing string on `/truy-cap/bao-gia` (`APP6-S01`).
 *
 * One catalog, so no component hard-codes a sentence (`CLAUDE.md` §5) and the
 * approved copy from `700:3`, `701:3`, `701:88`, `701:147`, `702:3`, `702:65`,
 * `702:129`, `704:3` and `705:3` has exactly one spelling. Where a string is
 * lifted verbatim from a frame the node is named beside it.
 *
 * ### The three things nothing here is allowed to say
 *
 * **No payment, no order, no stock.** Accepting a quotation commits a price and
 * nothing else; the deposit, the order and the inventory hold are APP7/APP8.
 * The approved frames say so themselves — `701:197` prints *chấp nhận báo giá
 * không thu tiền và không tạo đơn hàng* on the live offer, and `701:207` /
 * `701:208` repeat it on the committed one — so the copy below never claims
 * money moved, an order exists, or production began.
 *
 * **No claim about the request when a price is declined.** `APP6-B05`'s
 * rejection moves the quotation only; the custom request stays in the quotation
 * stage, where the workshop may send a revised version (`702:64`).
 *
 * **No server prose, and no operator note.** Every refusal is chosen by the
 * classified failure (`secure-quotation-failure.ts`), never by a `message` from
 * the API: those are English operator text on a surface anyone holding a link
 * can reach. For the same reason the adjustment row is labelled neutrally —
 * `700:42` shows the sample text *Giảm giá khách quen*, which is exactly the
 * internal `adjustmentReason` `APP6-B04` deliberately does not return, so the
 * amount is shown and the explanation is not (§17, and the closure of
 * `FU-APP6-B04-CUSTOMER-ADJUSTMENT-EXPLANATION-01`).
 *
 * The three access states — bootstrap (`703:3`), unavailable and transient
 * (`703:36`) — are **not here**. They belong to `APP4-S02`'s `SECURE_LINK_COPY`
 * and are reused rather than redrawn, which is the `APP5-D01` ruling that a
 * second copy of a security state is a second authority for the same behaviour.
 */

export const SECURE_QUOTATION_COPY = {
  /** The document title. Reused as the accessible page name. */
  pageTitle: 'Báo giá của bạn — Nét Thêu',

  /** `700:12` … `702:138` — the card headline, one per drawn state. */
  titles: {
    live: 'Báo giá cho yêu cầu thêu của bạn',
    accepted: 'Bạn đã chấp nhận báo giá này',
    rejected: 'Bạn đã từ chối báo giá này',
    stale: 'Cửa hàng đã gửi một báo giá mới hơn',
    expired: 'Báo giá này đã hết hiệu lực',
  },

  /**
   * `700:13` … `702:139` — the line under the headline.
   *
   * The frames print a request code (`REQ-…`); `APP6-B04` returns the quotation
   * code and no request identifier at all, so the quotation code is what is
   * shown. Nothing here is an authorization input — both codes are display-only
   * and neither endpoint accepts one.
   */
  subtitles: {
    live: (code: string, version: number, quantity: number) =>
      `Mã báo giá ${code} · Phiên bản ${version} · ${quantity} sản phẩm`,
    accepted: (code: string) => `Mã báo giá ${code} · Cửa hàng sẽ bắt đầu số hoá mẫu thêu.`,
    rejected: (code: string) => `Mã báo giá ${code} · Cửa hàng đã nhận được phản hồi của bạn.`,
    stale: (code: string, version: number) =>
      `Mã báo giá ${code} · Bản dưới đây là phiên bản ${version}, phiên bản mới nhất hiện nay.`,
    expired: (code: string) =>
      `Mã báo giá ${code} · Báo giá chỉ có hiệu lực trong thời hạn cửa hàng đã ghi.`,
  },

  /** `700:11` … `702:137` — the status pill. Never colour alone. */
  badges: {
    live: (until: string) => `Còn hiệu lực đến ${until}`,
    liveWithDays: (until: string, days: number) => `Còn hiệu lực đến ${until} · còn ${days} ngày`,
    liveUnknown: 'Còn hiệu lực',
    expired: (until: string) => `Hết hiệu lực từ ${until}`,
    expiredUnknown: 'Đã hết hiệu lực',
    accepted: (at: string) => `Đã chấp nhận ${at}`,
    rejected: (at: string) => `Đã từ chối ${at}`,
    /**
     * When no instant is available.
     *
     * `APP6-B04` carries no decision timestamp — only the decision responses do
     * — so a quotation found already decided (accepted in another tab, or
     * before this mount) states the fact without inventing a moment for it.
     */
    acceptedUndated: 'Đã chấp nhận',
    rejectedUndated: 'Đã từ chối',
    stale: 'Bản bạn đang xem không còn mới nhất',
  },

  /** `700:14` … `700:18` — the line-item table. */
  lines: {
    heading: 'Chi tiết báo giá',
    description: 'Nội dung',
    quantity: 'SL',
    unitPrice: 'Đơn giá',
    lineTotal: 'Thành tiền',
    /** The mobile stack (`704:15`) prints quantity and unit price as one line. */
    quantityAndUnit: (quantity: number, unitPrice: string) => `${quantity} × ${unitPrice}`,
    empty: 'Báo giá này chưa có dòng nào.',
  },

  /**
   * The six line kinds `APP6-B04` can return.
   *
   * Spelled from the contract enum rather than from a free list, so a kind the
   * server adds later shows its raw value instead of silently disappearing.
   */
  lineKinds: {
    PRODUCT: 'Sản phẩm',
    EMBROIDERY: 'Thêu',
    DIGITIZING_FEE: 'Phí số hoá',
    SHIPPING: 'Vận chuyển',
    ADJUSTMENT: 'Điều chỉnh',
    OTHER: 'Khác',
  },

  /** `700:39` totals and `700:48` deposit split. Every figure is the server's. */
  totals: {
    heading: 'Tổng tiền',
    subtotal: 'Tạm tính',
    /**
     * Deliberately neutral.
     *
     * `700:42` reads *Giảm giá khách quen* — an operator's note, which is the
     * one field `APP6-B04` withholds. The amount is the truth this screen owes
     * the customer; the reason is internal.
     */
    manualAdjustment: 'Điều chỉnh',
    shippingFee: 'Phí giao hàng',
    total: 'Tổng cộng',
    /** Interpolates the share **this version was priced at**, not today's policy. */
    deposit: (percent: string) => `Đặt cọc ${percent}`,
    /**
     * No complementary share.
     *
     * `700:51` prints *Phần còn lại 60%*, which only exists by subtracting the
     * deposit share. The remaining **amount** is the server's own recorded
     * figure and is shown; the percentage is not, because deriving it would be
     * exactly the client-side arithmetic on money §16 forbids.
     */
    remaining: 'Phần còn lại',
    note: 'Chấp nhận báo giá không thu tiền và không tạo đơn hàng.',
  },

  /** `700:54` … `702:180` — the small print under the figures. */
  notes: {
    live: 'Chấp nhận báo giá là bước thương mại. Điều khoản thanh toán và đổi trả sẽ được hiển thị đầy đủ và cần bạn đồng ý ở bước duyệt bản thiết kế.',
    accepted:
      'Báo giá đã chấp nhận là bất biến và được lưu lại làm bằng chứng. Nếu sau này có thay đổi làm phát sinh báo giá mới, bạn sẽ được yêu cầu chấp nhận lại.',
    rejected:
      'Phiên bản báo giá đã từ chối là trạng thái cuối và được giữ lại làm lịch sử. Một báo giá mới sẽ là phiên bản mới, cần bạn quyết định lại.',
    stale: 'Các con số phía trên thuộc phiên bản mới nhất. Quyết định trước đó chưa được ghi nhận.',
    expired: 'Các con số phía trên chỉ còn giá trị tham khảo lịch sử.',
  },

  /** `700:55`, `700:57`, `701:140`, `702:127`. */
  actions: {
    heading: 'Quyết định của bạn',
    accept: 'Chấp nhận báo giá',
    reject: 'Từ chối báo giá',
    accepting: 'Đang gửi chấp nhận…',
    rejecting: 'Đang gửi từ chối…',
    reconciling: 'Đang tải lại báo giá mới nhất…',
    viewLatest: 'Xem báo giá mới nhất',
  },

  /** `701:63` — the confirmation, an explicit second action before anything commits. */
  acceptConfirm: {
    title: 'Xác nhận chấp nhận báo giá',
    body: (total: string) =>
      `Bạn chấp nhận tổng cộng ${total} của phiên bản đang hiển thị. Sau khi xác nhận, cửa hàng sẽ bắt đầu số hoá mẫu thêu.`,
    note: 'Bước này chưa thu tiền và chưa tạo đơn hàng.',
    confirm: 'Xác nhận và chấp nhận',
    cancel: 'Huỷ',
  },

  rejectConfirm: {
    title: 'Xác nhận từ chối báo giá',
    body: 'Bạn từ chối phiên bản báo giá đang hiển thị. Yêu cầu thêu của bạn không bị huỷ, và cửa hàng có thể gửi báo giá khác.',
    confirm: 'Xác nhận và từ chối',
    cancel: 'Huỷ',
  },

  /** `701:63` … `701:87` — step-up re-verification, run inside this page. */
  stepUp: {
    title: 'Xác thực lại để chấp nhận báo giá',
    body: 'Chấp nhận báo giá là thao tác quan trọng, nên cần bạn xác thực lại liên hệ đã đăng ký một lần nữa.',
    /** `701:83`, kept verbatim: it is the anti-phishing line. */
    safety:
      'Nét Thêu không bao giờ hỏi mã này qua Zalo hay Messenger. Chỉ thao tác trên liên kết an toàn này mới có giá trị.',
    stay: 'Bạn vẫn đang ở trong phiên truy cập an toàn này. Không cần mở lại liên kết.',
    cancel: 'Huỷ',
    live: 'Cần xác thực lại liên hệ trước khi chấp nhận báo giá.',
    /** Shown after a code is verified, while the quotation is re-read. */
    verified: 'Đã xác thực. Đang kiểm tra lại báo giá…',
  },

  /** `701:206` — the committed acceptance. */
  accepted: {
    title: 'Đã ghi nhận — không thu tiền ở bước này',
    body: 'Cửa hàng sẽ liên hệ khi bản thiết kế sẵn sàng để bạn duyệt. Đơn hàng và thanh toán chỉ phát sinh sau khi bạn duyệt thiết kế.',
    acceptedTotal: 'Số tiền đã chấp nhận',
    replayed:
      'Bạn đã chấp nhận báo giá này trước đó. Đây là kết quả đã ghi nhận, không phải một lần chấp nhận mới.',
    live: 'Đã ghi nhận việc bạn chấp nhận báo giá.',
  },

  /** `702:62` — the committed rejection. */
  rejected: {
    title: 'Đã ghi nhận — bạn không phải trả khoản nào',
    body: 'Nếu bạn muốn tiếp tục, hãy trả lời tin nhắn gần nhất của Nét Thêu; cửa hàng có thể lập một báo giá mới cho cùng yêu cầu này.',
    /** The declined version's own number — its terminal state *is* the record. */
    version: (version: number) => `Phiên bản đã từ chối: ${version}`,
    live: 'Đã ghi nhận việc bạn từ chối báo giá.',
  },

  /** `702:124` — the version the decision named is no longer the one that stands. */
  stale: {
    title: 'Không thể chấp nhận phiên bản đã bị thay thế',
    body: 'Số tiền có thể đã thay đổi. Hãy xem lại bản mới nhất trước khi quyết định — quyết định phải là một lựa chọn mới, có ý thức, trên đúng bản hiện hành. Chưa có quyết định nào được ghi nhận.',
    live: 'Báo giá đã thay đổi. Chưa có quyết định nào được ghi nhận.',
  },

  /** `702:188` — the offer has lapsed. No acceptance control exists here. */
  expired: {
    title: 'Không còn chấp nhận được',
    body: 'Hãy trả lời tin nhắn gần nhất của Nét Thêu để cửa hàng lập báo giá mới. Giá vật tư và lịch sản xuất có thể đã thay đổi.',
    live: 'Báo giá đã hết hiệu lực.',
  },

  /**
   * The refusals that keep the customer on the quotation.
   *
   * Each is chosen by classification alone. None names a request, a quotation,
   * a version, a customer, a grant, a challenge or a constraint.
   */
  notices: {
    TRANSIENT: {
      title: 'Chưa gửi được quyết định',
      body: 'Kết nối tới máy chủ bị gián đoạn nên quyết định của bạn chưa được ghi nhận. Hãy thử lại.',
    },
    INVALID_TRANSITION: {
      title: 'Không thực hiện được quyết định này',
      body: 'Trạng thái của báo giá đã thay đổi. Thông tin bên dưới vừa được tải lại — hãy xem và quyết định theo tình trạng hiện tại.',
    },
    DUPLICATE_OPERATION: {
      title: 'Quyết định đang được xử lý',
      body: 'Một quyết định cho báo giá này đang được xử lý. Hãy chờ một lát rồi thử lại.',
    },
    IDEMPOTENCY_CONFLICT: {
      title: 'Báo giá này đã được quyết định',
      body: 'Phiên bản này đã có một quyết định khác được ghi nhận. Thông tin bên dưới vừa được tải lại.',
    },
    POLICY_UNAVAILABLE: {
      title: 'Tạm thời chưa nhận được quyết định',
      body: 'Chức năng quyết định báo giá đang tạm ngừng. Hãy thử lại sau ít phút.',
    },
  },

  /** Announced while a decision is in flight; these frames draw no alert. */
  live: {
    authorized: 'Đã mở báo giá của bạn.',
    accepting: 'Đang gửi xác nhận chấp nhận báo giá.',
    rejecting: 'Đang gửi xác nhận từ chối báo giá.',
    reconciling: 'Đang tải lại báo giá mới nhất.',
  },
} as const;
