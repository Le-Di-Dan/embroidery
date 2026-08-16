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
 * ### Why nothing here describes an authorized link
 *
 * The authorized state is the consumer's. `APP4-D01` drew it as an empty
 * handoff slot; `APP5-D01` fills that slot with the request itself and states
 * so explicitly (`661:335` — the resolve step is `APP4-S02`'s, the content is
 * built only after a valid grant). The three access states below are the ones
 * that say nothing about what the link opens, and they are the ones this module
 * still owns.
 *
 * The unavailable card diverges only in type size, so it carries one string per
 * entry; `634:119` states that state keeps its layout at both sizes.
 */

export const SECURE_LINK_COPY = {
  /** `629:9` / `629:10` / `629:16` — bootstrap while the landing resolves. */
  bootstrap: {
    title: 'Đang mở liên kết an toàn',
    body: 'Vui lòng chờ trong giây lát.',
    caption: 'Không đóng tab trong lúc kiểm tra.',
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
    unavailable: 'Liên kết không sử dụng được.',
    transientError: 'Không kết nối được máy chủ. Bạn có thể thử lại.',
  },

  /** The document title. Reused as the accessible page name. */
  pageTitle: 'Truy cập an toàn — Nét Thêu',
} as const;
