/**
 * Every user-facing string on `/xac-minh-lien-he` (`APP4-S01`).
 *
 * Read from the approved `APP4-D01` frames, not written here: node ids are
 * recorded beside each entry so a copy change is traceable to the design that
 * authorized it. Centralised because `CLAUDE.md` §5 forbids hard-coded
 * user-facing copy inside components.
 *
 * Two rules govern what may be said, both from approved annotations:
 *
 * - **Non-enumeration (`634:59`).** Nothing here distinguishes a contact that
 *   belongs to a customer from one that does not. There is no "email already
 *   registered", no "customer found", no "account exists" — the forbidden list
 *   on that frame is the acceptance criterion.
 * - **No policy value is restated (`634:181`).** Durations shown to the customer
 *   come from server timestamps at runtime. The one number written here is the
 *   expiry sentence on `623:100`, which the design renders as prose; it is
 *   *display copy*, and no timer reads it.
 */

/** The masked destination is the only contact form this screen ever renders. */
export const VERIFICATION_COPY = {
  /** `623:9` / `623:10` / `623:23` — contact entry, and the mobile card `628:8`. */
  contactEntry: {
    title: 'Xác minh liên hệ của bạn',
    body: 'Nhập email hoặc số điện thoại. Chúng tôi gửi một mã gồm 6 chữ số để xác nhận đó là bạn.',
    /** `623:23`. Says what this screen is not, which is also the S01 scope. */
    caption: 'Bạn không cần tạo tài khoản.',
    submit: 'Gửi mã xác minh',
    /** `623:70` — the same control while the request is in flight. */
    submitting: 'Đang gửi mã…',
  },

  /** `623:12` / `623:14` — one control, both contact kinds. */
  contactKind: {
    legend: 'Bạn muốn nhận mã qua đâu?',
    EMAIL: 'Email',
    PHONE: 'Số điện thoại',
  },

  /** `623:17` … `623:20`, and the error state `623:44`. */
  emailField: {
    label: 'Email',
    placeholder: 'ban@vidu.com',
    help: 'Chỉ dùng để gửi mã xác minh và cập nhật về yêu cầu của bạn.',
    invalid: 'Email chưa đúng định dạng. Ví dụ: ban@vidu.com',
  },

  /**
   * The phone field, presented Vietnam-first per `APP4-D01` §D.1.
   *
   * The help text names the national form the customer is expected to type and
   * says an international number is accepted. It deliberately describes nothing
   * about normalization: the server is the canonical normalizer and the customer
   * has no reason to know E.164 exists.
   */
  phoneField: {
    label: 'Số điện thoại',
    placeholder: '0912 345 678',
    help: 'Nhập số trong nước, hoặc số quốc tế bắt đầu bằng dấu +.',
    invalid: 'Số điện thoại chưa đúng định dạng. Ví dụ: 0912 345 678',
  },

  /** `623:81` … `623:104`. */
  codeEntry: {
    title: 'Nhập mã xác minh',
    /** `623:82`. Ends in a colon: the masked destination is its object. */
    body: 'Chúng tôi đã gửi một mã gồm 6 chữ số tới:',
    fieldLabel: 'Mã xác minh (6 chữ số)',
    /** `623:100`. Display prose, never a timer source. */
    help: 'Mã có hiệu lực trong 10 phút.',
    submit: 'Xác minh',
    /** `623:135`. */
    submitting: 'Đang xác minh…',
  },

  /** `623:104` / `625:65` / `625:66`. */
  resend: {
    action: 'Gửi lại mã',
    /** `625:66` renders `có thể gửi lại sau 00:47`; the clock is the server's. */
    cooldown: (remaining: string) => `có thể gửi lại sau ${remaining}`,
    sending: 'Đang gửi lại…',
  },

  /**
   * The alerts, each from its approved frame.
   *
   * `mismatch` deliberately omits the remaining-attempt count that frame
   * `625:28` renders ("Bạn còn 3 lần thử"). `APP4-B04` refuses to publish the
   * count on purpose — its refusal contract calls a "3 attempts remaining"
   * message "a free oracle over how much budget an attacker has left" — and the
   * budget itself is a policy value `634:181` forbids the UI from restating.
   * Recorded as `FU-APP4-S01-ATTEMPT-COUNT-COPY-01`; everything else about the
   * state is exactly as drawn.
   */
  alerts: {
    /** `625:28`, minus the unavailable count. */
    mismatch: 'Mã không đúng. Hãy kiểm tra lại mã trong tin nhắn mới nhất.',
    /** `625:78` / `625:79`. */
    resent: {
      title: 'Đã gửi mã mới',
      body: 'Mã cũ không còn dùng được. Hãy nhập mã trong tin nhắn mới nhất.',
    },
    /** `625:114` / `625:115`. */
    expired: {
      title: 'Mã không còn hiệu lực',
      body: 'Mã xác minh chỉ dùng được trong 10 phút. Hãy yêu cầu một mã mới để tiếp tục.',
    },
    /** `625:148` / `625:149`. */
    locked: {
      title: 'Bạn đã nhập sai quá số lần cho phép',
      body: 'Vì an toàn, mã này đã bị khoá. Hãy yêu cầu một mã mới để thử lại.',
    },
    /** `625:181` / `625:182`. Identical for a known and an unknown contact. */
    rateLimited: {
      title: 'Bạn đã yêu cầu mã quá nhiều lần',
      body: 'Để bảo vệ tài khoản, chúng tôi tạm dừng gửi mã cho liên hệ này. Hãy thử lại sau khoảng 15 phút.',
    },
    /** `625:201` / `625:202`. */
    success: {
      title: 'Xác minh thành công',
      body: 'Liên hệ của bạn đã được xác nhận. Bạn có thể tiếp tục yêu cầu thêu của mình.',
    },
    /** `625:219` / `625:220`. An infrastructure failure, not a verdict. */
    recoverableError: {
      title: 'Mất kết nối tới máy chủ',
      body: 'Yêu cầu chưa được gửi đi. Kiểm tra kết nối mạng rồi thử lại — bạn không bị mất lượt nào.',
    },
  },

  /**
   * The terminal cards, each with its own title distinct from its alert
   * (`625:112`, `625:146`, `625:199`, `625:217`).
   */
  outcome: {
    EXPIRED: {
      title: 'Mã đã hết hạn',
      /** `625:116` — the destination follows, so this ends in a colon. */
      destinationLead: 'Mã sẽ được gửi lại tới:',
      action: 'Gửi mã mới',
    },
    LOCKED: {
      title: 'Đã hết lượt thử cho mã này',
      /** `625:150`. */
      destinationLead: 'Mã mới sẽ được gửi tới:',
      action: 'Gửi mã mới',
    },
    SUCCESS: {
      title: 'Đã xác minh liên hệ',
      destinationLead: undefined,
      /** `625:206` — the forward action. APP5 owns where it leads. */
      action: 'Tiếp tục',
    },
    RECOVERABLE_ERROR: {
      title: 'Không gửi được yêu cầu',
      destinationLead: undefined,
      /** `625:226`. */
      action: 'Thử lại',
    },
  },
  /** `625:207` — the success card's closing caption. */
  successCaption: 'Chúng tôi chỉ dùng liên hệ này để gửi cập nhật về yêu cầu của bạn.',
  /** The one page `h1`; the card titles are `h2` beneath it. */
  pageTitle: 'Xác minh liên hệ',
  /** Announced politely while a request is in flight (`634:145`). */
  live: {
    requesting: 'Đang gửi mã xác minh.',
    verifying: 'Đang xác minh mã.',
  },
} as const;

/** Which field copy a contact kind uses. One lookup, no branching in the view. */
export const CONTACT_FIELD_COPY = {
  EMAIL: VERIFICATION_COPY.emailField,
  PHONE: VERIFICATION_COPY.phoneField,
} as const;
