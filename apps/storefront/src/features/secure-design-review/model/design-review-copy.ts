/**
 * Every customer-facing string on `/truy-cap/duyet-thiet-ke` (`APP6-S02`).
 *
 * One catalog, so no component hard-codes a sentence (`CLAUDE.md` §5) and the
 * approved copy from `707:3`, `709:3`, `709:84`, `709:164`, `710:3`, `710:109`,
 * `710:203`, `711:3`, `713:3` and `713:61` has exactly one spelling.
 *
 * ### The four things nothing here is allowed to say
 *
 * **No payment, no order, no stock, no production.** Approving a design freezes
 * an Approval Snapshot and nothing else. APP6 stops there; the deposit, the
 * order, the inventory hold and the machine file are APP7/APP8. So no sentence
 * below claims money moved, an order exists, stock was reserved, stitching
 * started or a file was generated.
 *
 * **No claim about the request when a revision is asked for.** `APP6-B11`'s
 * revision path moves the *design version* only: no transition row is written,
 * the custom request stays where it was, and the next draft does not yet exist.
 * The outcome copy therefore reports what was recorded and predicts nothing.
 *
 * **No agreement text.** The policies are rendered from B10's own `content`,
 * verbatim. There is no summary, no paraphrase and no house boilerplate here,
 * because a screen that restated the terms would be showing the customer
 * something other than the text whose hash their approval binds.
 *
 * **No screenshot claim.** The watermark notice says the preview is marked and
 * that there is nothing to download. `docs/09-SECURITY-AND-ABUSE-PREVENTION.md`
 * §6 ends with "do not claim absolute screenshot prevention", and a promise a
 * build cannot keep is worse than no promise.
 *
 * The three access states — bootstrap (`712:3`), the single non-enumerating
 * unavailable card and the transient card (`712:31`) — are **not here**. They
 * belong to `APP4-S02`'s `SECURE_LINK_COPY` and are reused rather than
 * redrawn: a second copy of a security state is a second authority for the one
 * behaviour that must never vary.
 */

export const DESIGN_REVIEW_COPY = {
  /** The document title. Reused as the accessible page name. */
  pageTitle: 'Duyệt mẫu thiết kế — Nét Thêu',

  /** `707:12` … `710:210` — the card headline, one per drawn state. */
  titles: {
    review: 'Mẫu thêu của bạn đã sẵn sàng để duyệt',
    approved: 'Bạn đã duyệt mẫu thiết kế này',
    revisionRequested: 'Cửa hàng đã nhận yêu cầu chỉnh sửa của bạn',
    versionMismatch: 'Cửa hàng đã gửi một phiên bản mới hơn',
  },

  /** `707:13` … `710:211` — the line under the headline. */
  subtitles: {
    review: (version: number, sentAt: string) =>
      `Phiên bản ${String(version)} · Cửa hàng gửi ngày ${sentAt}`,
    approved: (version: number) =>
      `Phiên bản ${String(version)} · Bản duyệt này đã được lưu lại và không thay đổi được nữa.`,
    revisionRequested: (version: number) =>
      `Phiên bản ${String(version)} · Cửa hàng sẽ xem phản hồi của bạn và chuẩn bị bản chỉnh sửa.`,
    versionMismatch: (version: number) =>
      `Phiên bản ${String(version)} là bản mới nhất hiện nay. Vui lòng xem lại trước khi quyết định.`,
  },

  /** `707:11` — the status pill. Never colour alone. */
  badges: {
    review: 'Chờ bạn duyệt',
    approving: 'Đang gửi quyết định',
    approved: 'Đã duyệt',
    revisionRequested: 'Đã yêu cầu chỉnh sửa',
    versionMismatch: 'Có phiên bản mới',
  },

  /** `707:30` — the exact version the decision binds, printed beside the artwork. */
  exactVersion: {
    legend: 'Bản thiết kế bạn đang xem',
    version: (version: number) => `Phiên bản ${String(version)}`,
    schema: (schemaVersion: number) => `Định dạng tài liệu v${String(schemaVersion)}`,
    hashLabel: 'Mã kiểm tra bản vẽ',
    note: 'Quyết định của bạn gắn với đúng phiên bản và đúng bản vẽ hiển thị ở đây.',
  },

  /** `707:40` — the browser-side preview. */
  preview: {
    label: 'Xem trước mẫu thêu',
    /** The repeated mark's two fixed words, ahead of the runtime token. */
    watermarkWordmark: 'NÉT THÊU',
    watermarkTag: 'XEM TRƯỚC',
    /** `609:371`, reused verbatim: marked, and no download exists. */
    watermarkPolicy:
      'Bản xem trước được đánh dấu chìm và chỉ hiển thị trong trình duyệt. Trang này không có chức năng tải về.',
    /** Image elements have no bytes on this surface; the frame is honest about it. */
    imagePlaceholder: 'Ảnh của bạn',
    failure: 'Không hiển thị được bản vẽ này trên trình duyệt của bạn.',
    failureNote:
      'Vui lòng liên hệ cửa hàng để được gửi lại. Đừng duyệt mẫu mà bạn chưa nhìn thấy đầy đủ.',
  },

  /** `711:3` — the effective agreement set, rendered verbatim. */
  agreements: {
    legend: 'Điều khoản bạn cần đồng ý trước khi duyệt',
    intro:
      'Đây là nội dung đang có hiệu lực. Quyết định duyệt của bạn được lưu cùng đúng các bản điều khoản này.',
    accept: 'Tôi đã đọc và đồng ý với nội dung trên',
    versionLabel: (version: number) => `Bản ${String(version)}`,
    /** `709:3` — why the approve control is unavailable. */
    outstanding: (remaining: number) =>
      `Còn ${String(remaining)} mục điều khoản bạn chưa đánh dấu đồng ý.`,
    changed:
      'Nội dung điều khoản đã được cập nhật. Vui lòng đọc lại và đánh dấu đồng ý một lần nữa.',
  },

  /** `707:55`, `710:109` — the two customer actions. */
  actions: {
    approve: 'Duyệt mẫu này',
    approving: 'Đang gửi…',
    requestRevision: 'Yêu cầu chỉnh sửa',
    reviewLatest: 'Xem phiên bản mới nhất',
  },

  /** `709:84` — the in-progress frame. */
  approving: {
    title: 'Đang gửi quyết định duyệt của bạn',
    body: 'Vui lòng không đóng trang này.',
  },

  /** `710:3` — the approval confirmation, before the decision leaves the browser. */
  approveConfirm: {
    title: 'Xác nhận duyệt mẫu thiết kế',
    body: 'Sau khi duyệt, bản thiết kế này được lưu cố định và không chỉnh sửa được nữa. Mọi thay đổi sau đó sẽ là một phiên bản mới.',
    binds: (version: number) => `Bạn đang duyệt phiên bản ${String(version)}.`,
    terms: 'Bạn đồng ý với các điều khoản đã đánh dấu ở trên.',
    noPayment: 'Duyệt mẫu không thu tiền, không tạo đơn hàng và chưa bắt đầu sản xuất.',
    confirm: 'Xác nhận duyệt',
    cancel: 'Quay lại',
  },

  /** `710:3` — step-up re-verification, run inside this route. */
  stepUp: {
    title: 'Xác minh lại trước khi duyệt',
    body: 'Để bảo vệ bạn, cửa hàng cần xác minh lại liên hệ của bạn trước khi ghi nhận quyết định duyệt.',
    stay: 'Bạn vẫn đang ở trang này. Đừng đóng trang cho đến khi hoàn tất.',
    safety: 'Cửa hàng không bao giờ hỏi mã xác minh qua điện thoại hay tin nhắn.',
    verified: 'Đã xác minh. Đang tải lại bản thiết kế mới nhất…',
    cancel: 'Huỷ',
    live: 'Cần xác minh lại trước khi duyệt.',
  },

  /** `710:109` — the revision form. */
  revision: {
    title: 'Yêu cầu chỉnh sửa mẫu thiết kế',
    body: 'Hãy mô tả cụ thể điều bạn muốn thay đổi. Cửa hàng sẽ dựa vào nội dung này để chuẩn bị bản tiếp theo.',
    label: 'Điều bạn muốn thay đổi',
    placeholder: 'Ví dụ: chữ ở ngực trái cần lớn hơn một chút và đổi sang màu trắng.',
    required: 'Vui lòng mô tả điều bạn muốn thay đổi.',
    tooLong: (max: number) => `Nội dung tối đa ${String(max)} ký tự.`,
    counter: (used: number, max: number) => `${String(used)}/${String(max)} ký tự`,
    noStepUp: 'Yêu cầu chỉnh sửa không cần xác minh lại vì không cam kết điều gì.',
    submit: 'Gửi yêu cầu chỉnh sửa',
    submitting: 'Đang gửi…',
    cancel: 'Quay lại',
  },

  /** `709:164`, `713:61` — the committed approval. */
  approved: {
    heading: 'Quyết định đã được ghi nhận',
    approvedAt: (at: string) => `Thời điểm duyệt: ${at}`,
    versionLabel: (version: number) => `Phiên bản đã duyệt: ${String(version)}`,
    hashLabel: 'Mã kiểm tra bản vẽ đã duyệt',
    snapshotLabel: 'Mã bản lưu duyệt',
    acceptedTerms: 'Các điều khoản bạn đã đồng ý',
    /** Nothing beyond the snapshot is claimed. */
    scope:
      'Bản thiết kế đã được lưu cố định. Việc thu tiền, tạo đơn hàng, giữ hàng và sản xuất không nằm trong bước này.',
    replayed:
      'Quyết định này đã được ghi nhận trước đó. Đây là cùng một bản lưu, không phải bản mới.',
    live: 'Bạn đã duyệt mẫu thiết kế này.',
  },

  /** The committed revision request. */
  revisionRequested: {
    heading: 'Yêu cầu chỉnh sửa đã được ghi nhận',
    decidedAt: (at: string) => `Thời điểm gửi: ${at}`,
    versionLabel: (version: number) => `Phiên bản đã gửi phản hồi: ${String(version)}`,
    /** Truthful: no new draft exists, and the request did not move. */
    scope:
      'Cửa hàng đã nhận phản hồi của bạn. Bản chỉnh sửa chưa được tạo và yêu cầu của bạn vẫn đang ở bước duyệt mẫu.',
    live: 'Đã gửi yêu cầu chỉnh sửa.',
  },

  /** `710:203` — the exact-version race. */
  mismatch: {
    title: 'Bản thiết kế đã thay đổi',
    body: 'Quyết định vừa rồi chưa được ghi nhận. Cửa hàng đã gửi một phiên bản khác, nên bạn cần xem lại và quyết định lần nữa.',
    live: 'Có phiên bản mới. Vui lòng xem lại.',
  },

  /** The terms race — a change of terms only, never called a version mismatch. */
  termsChanged: {
    title: 'Điều khoản đã được cập nhật',
    body: 'Quyết định vừa rồi chưa được ghi nhận. Nội dung điều khoản đã thay đổi, nên bạn cần đọc lại và đánh dấu đồng ý một lần nữa.',
    live: 'Điều khoản đã thay đổi. Vui lòng đọc lại.',
  },

  /**
   * One-shot banners for the refusals that leave the customer on the review.
   *
   * Chosen by the classified failure, never by a server `message`: those are
   * English operator prose on a surface anyone holding a link can reach.
   */
  notices: {
    TRANSIENT: {
      title: 'Chưa gửi được quyết định',
      body: 'Kết nối bị gián đoạn nên chưa có gì được ghi nhận. Vui lòng thử lại.',
    },
    INVALID_TRANSITION: {
      title: 'Phiên bản này đã có quyết định',
      body: 'Bản thiết kế này đã được quyết định trước đó. Nội dung bên dưới là tình trạng mới nhất.',
    },
    DUPLICATE_OPERATION: {
      title: 'Quyết định đang được xử lý',
      body: 'Một quyết định cho phiên bản này đang được ghi nhận. Vui lòng đợi một chút rồi kiểm tra lại.',
    },
    IDEMPOTENCY_CONFLICT: {
      title: 'Chưa gửi được quyết định',
      body: 'Cửa hàng chưa ghi nhận quyết định này. Nội dung bên dưới là tình trạng mới nhất; vui lòng quyết định lại.',
    },
    POLICY_UNAVAILABLE: {
      title: 'Tạm thời chưa duyệt được',
      body: 'Hệ thống chưa lấy được nội dung điều khoản đang có hiệu lực. Đây là sự cố phía cửa hàng, không phải do bạn. Vui lòng thử lại sau.',
    },
  },

  /** Polite live-region announcements. */
  live: {
    authorized: 'Đã mở bản thiết kế chờ duyệt.',
    approving: 'Đang gửi quyết định duyệt.',
    revisionSubmitting: 'Đang gửi yêu cầu chỉnh sửa.',
    reconciling: 'Đang tải lại bản thiết kế mới nhất.',
  },
} as const;
