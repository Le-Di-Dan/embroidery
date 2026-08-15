/**
 * Every user-facing string on `/truy-cap` (`APP4-S02`).
 *
 * Read from the approved `APP4-D01` frames, not written here; node ids sit
 * beside each entry so a copy change is traceable to the design that authorized
 * it. Centralised because `CLAUDE.md` §5 forbids hard-coded user-facing copy
 * inside components.
 *
 * ### The rule that governs what may be said
 *
 * **Non-enumeration (`634:59`, `APP4-G01` PO-04).** The server collapses six
 * causes — unknown, expired, revoked, superseded, wrong target, wrong purpose —
 * into one identical `404`. The browser is not told which one, and could not
 * say even if it wanted to. So there is exactly one unavailable text here, and
 * it names no cause: the alert body lists *possibilities* in the customer's own
 * terms and commits to none of them, which is what `629:46` was drawn to say.
 *
 * Nothing below may grow an "đã hết hạn", "đã bị thu hồi", "sai tài khoản" or
 * "liên kết không hợp lệ" variant. A missing fragment, a malformed fragment and
 * a definitive 404 all render this same text (§13, §14).
 *
 * ### Why some entries carry two strings
 *
 * `APP4-D01` drew the authorized card twice, and the two frames do not merely
 * rescale — `629:20` and `629:70` carry **different words**. That divergence is
 * approved design, not an artifact, so it is represented rather than resolved:
 * `wide` is the desktop frame's text, `narrow` is the mobile frame's, and the
 * card renders both inside one element with CSS choosing which is visible. One
 * heading element, two candidate strings — never two headings.
 *
 * The unavailable card diverges only in type size, so it carries one string per
 * entry; `634:119` states that state keeps its layout at both sizes.
 */

/** A string the approved frames express differently per viewport. */
export interface ResponsiveCopy {
  /** Desktop 1440 — `629:20`. */
  readonly wide: string;
  /** Mobile 390 — `629:70`. */
  readonly narrow: string;
}

export const SECURE_LINK_COPY = {
  /** `629:9` / `629:10` / `629:16` — bootstrap while B06 resolves. */
  bootstrap: {
    title: 'Đang mở liên kết an toàn',
    body: 'Vui lòng chờ trong giây lát.',
    caption: 'Không đóng tab trong lúc kiểm tra.',
  },

  /** `629:26` … `629:33` desktop, `629:76` … `629:83` mobile. */
  authorized: {
    badge: {
      wide: 'Truy cập an toàn đã xác thực',
      narrow: 'Đã xác thực',
    },
    title: {
      wide: 'Bạn đã vào khu vực riêng',
      narrow: 'Khu vực riêng của bạn',
    },
    body: {
      wide: 'Liên kết hợp lệ. Đây là khu vực dành riêng cho yêu cầu thêu của bạn.',
      narrow: 'Liên kết hợp lệ.',
    },
    /**
     * `629:30` / `629:80` — the handoff slot.
     *
     * A dashed, explicitly labelled placeholder, and deliberately nothing more.
     * APP4 authenticates access and builds the frame; the request content,
     * quotation, design approval and payment all belong to APP5 and later, and
     * inventing any of them here is the boundary `APP4-P00` §F drew (§12).
     */
    slotTitle: {
      wide: 'Nội dung yêu cầu sẽ hiển thị tại đây',
      narrow: 'Nội dung yêu cầu (APP5+)',
    },
    slotNote: {
      wide: 'Phần này thuộc APP5 trở đi. APP4 chỉ xác thực quyền truy cập và dựng khung — không hiển thị báo giá, duyệt mẫu hay thanh toán.',
      narrow: 'APP4 chỉ dựng khung đã xác thực.',
    },
    caption: {
      wide: 'Liên kết này chỉ dành cho bạn. Vui lòng không chia sẻ lại.',
      narrow: 'Vui lòng không chia sẻ liên kết này.',
    },
  },

  /**
   * `629:43` … `629:49` desktop, `629:93` … `629:99` mobile — identical words at
   * both sizes, which is the design's own statement that this state must look
   * the same wherever it is read.
   */
  unavailable: {
    title: 'Liên kết không sử dụng được',
    alertTitle: 'Không mở được liên kết này',
    alertBody:
      'Liên kết có thể đã hết hạn, đã được thay bằng liên kết mới, hoặc không dành cho thiết bị này. Hãy dùng liên kết mới nhất trong tin nhắn của bạn.',
    body: 'Nếu bạn vẫn cần truy cập, hãy trả lời tin nhắn gần nhất của Nét Thêu để được gửi liên kết mới.',
  },

  /** `629:59` … `629:66` — transport uncertainty, kept distinct on purpose. */
  transientError: {
    title: 'Không kết nối được',
    alertTitle: 'Mất kết nối tới máy chủ',
    alertBody:
      'Chúng tôi chưa kiểm tra được liên kết. Đây là lỗi kết nối, không phải liên kết của bạn có vấn đề.',
    retry: 'Thử lại',
  },

  /** `629:48` / `629:65` / `629:98` — the one navigation out of every dead end. */
  home: 'Về trang chủ',

  /**
   * The polite live-region announcements (`634:145`, `634:146`).
   *
   * Every state change is announced, not only colour-signalled. The unavailable
   * announcement repeats the visible title and carries no cause, for the same
   * reason the visible copy does not.
   */
  live: {
    bootstrap: 'Đang kiểm tra liên kết an toàn.',
    authorized: 'Liên kết hợp lệ. Bạn đã vào khu vực riêng.',
    unavailable: 'Liên kết không sử dụng được.',
    transientError: 'Không kết nối được máy chủ. Bạn có thể thử lại.',
  },

  /** The document title. Reused as the accessible page name. */
  pageTitle: 'Truy cập an toàn — Nét Thêu',
} as const;
