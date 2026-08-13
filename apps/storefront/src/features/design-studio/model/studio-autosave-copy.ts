/**
 * Every customer-visible string of the save, conflict, resume and expiry
 * surfaces (`APP3-S10`).
 *
 * The sentences are the approved frames' own — `610:3`, `610:41`, `610:77`,
 * `610:118`, `610:159` and `610:201` of section `14` (`596:20`) — not
 * paraphrases of them.
 *
 * Three rules hold across all of it.
 *
 * **Nothing here says a design is saved unless the server said so.** The
 * "saved at" time is rendered from an actual successful response, never from a
 * clock read at the moment a request was sent, and there is no optimistic
 * "đã lưu" anywhere in the failure paths.
 *
 * **Nothing here exposes a backend internal.** No revision number, no
 * `sessionId`, no HTTP status and no envelope code reaches a customer. The
 * conflict frame draws a `409 · xung đột bản sửa` eyebrow above its heading;
 * that eyebrow is a status code, and §17 forbids exposing raw backend internals,
 * so the heading below it carries the meaning instead and the code is not shown.
 * The deviation is recorded rather than taken quietly.
 *
 * **Nothing here promises recovery of a lost anonymous credential.** The Session
 * secret is an `HttpOnly` cookie this code cannot read; once it is gone the
 * design behind it is not reachable, and the expiry copy says so plainly instead
 * of offering a retry that could only fail.
 */
export const STUDIO_SAVE_COPY = {
  /** The topbar chip. One word for each state the customer can be in. */
  chipLabel: 'Trạng thái lưu',
  chipSaved: 'Đã lưu',
  chipSavedAtPrefix: 'lúc',
  chipSaving: 'Đang lưu…',
  chipDirty: 'Chưa lưu',
  chipOffline: 'Mất kết nối',
  chipConflict: 'Xung đột',
  chipFailed: 'Lưu thất bại',

  /** `610:3` — saved. */
  savedHeading: 'Mọi thay đổi đã được lưu',
  savedBody: 'Bản thiết kế được lưu tự động vào phiên làm việc ẩn danh. Không cần tài khoản.',

  /** `610:41` — saving. Editing is explicitly not blocked. */
  savingHeading: 'Đang lưu thay đổi…',
  savingBody: 'Thao tác vẫn tiếp tục được trong lúc lưu. Không chặn thao tác của khách hàng.',

  /** `610:77` — failed or offline. */
  offlineHeading: 'Không lưu được — mất kết nối',
  offlineBody: 'Thay đổi của bạn vẫn còn trên màn hình nhưng chưa tới máy chủ. Đừng đóng tab.',
  offlineNote: 'Hệ thống sẽ tự thử lại; bạn cũng có thể bấm thử lại.',
  offlineRetry: 'Thử lưu lại',
  offlineDismiss: 'Tiếp tục thiết kế',

  /**
   * A save the server refused for a reason that is not the network.
   *
   * `610:77` names the connection in its own heading, and that sentence is only
   * true when the connection is what failed. A refused, throttled or broken save
   * would be misdescribed by it, so it gets the same shape — the changes are
   * still here, the tab must stay open, retry and dismiss — with the cause left
   * unnamed rather than named wrongly. No status code, no envelope code.
   */
  failedHeading: 'Chưa lưu được thay đổi',
  failedBody: 'Thay đổi của bạn vẫn còn trên màn hình nhưng máy chủ chưa nhận. Đừng đóng tab.',

  /** `610:118` — stale revision. Exactly two choices, and no third. */
  conflictHeading: 'Bản thiết kế đã được sửa ở nơi khác',
  conflictBody:
    'Phiên này được mở ở một tab hoặc thiết bị khác và đã lưu bản mới hơn. Máy chủ không bị ghi đè.',
  conflictLoadLatest: 'Tải bản mới nhất',
  conflictKeepLocal: 'Giữ bản trên màn hình',
  /**
   * What each choice costs, said before it is made.
   *
   * There is no automatic merge and no real-time collaboration, so one of the
   * two documents is going to be the one that survives. A customer choosing
   * between them without being told that is not choosing.
   */
  conflictLoadLatestNote: 'Bản đang mở trên màn hình sẽ được thay bằng bản trên máy chủ.',
  conflictKeepLocalNote: 'Bản trên màn hình sẽ được lưu đè lên bản mới nhất.',

  /** `610:159` — resume. */
  resumeHeading: 'Khôi phục phiên',
  resumeBody: 'Tiếp tục bản thiết kế đang dở?',
  resumeContinue: 'Tiếp tục',
  resumeRestart: 'Bắt đầu lại',
  resuming: 'Đang mở lại phiên…',
  resumeFailed: 'Chưa thể mở lại phiên thiết kế.',

  /** `610:201` — expired or credential lost. */
  expiredEyebrow: 'Phiên không còn hiệu lực',
  expiredHeading: 'Không mở được phiên thiết kế',
  expiredBody: 'Phiên đã hết hạn hoặc cookie nhận diện không còn trên thiết bị này.',
  expiredPickTemplate: 'Chọn mẫu khác',

  /** The unsaved-work region, named so it can be reached and announced. */
  stateLabel: 'Trạng thái phiên thiết kế',
} as const;
