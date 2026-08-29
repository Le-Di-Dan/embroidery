/**
 * Every user-facing string the `APP10-A01` maintenance affordances add
 * (CLAUDE.md §5 — no hard-coded copy in components).
 *
 * The wording follows the approved `APP10-D01` A01 frames, promoted under
 * `FIG-APPROVAL-APP10-D01-PO-001`. It is kept beside `CUSTOMER_ACCESS_COPY`
 * rather than inside it because the two are owned by different checkpoints and
 * different Figma packages: `APP4-D01` still governs the lookup, grant and
 * notification wording, and merging the tables would make one review boundary
 * out of two.
 *
 * The same two rules govern what may be said here, and both are security rules:
 *
 * 1. **No refusal explains itself past what the server published.** The generic
 *    contact conflict names both possibilities it cannot separate rather than
 *    picking the more likely one — `APP10-B01` publishes no code that would let
 *    the screen know, and inventing certainty is worse than stating the doubt.
 * 2. **No string interpolates a contact, an id or an operator note.** The only
 *    contact representation on this screen is the server's mask, and
 *    `contactId` addresses operations — it is never rendered as copy.
 */
export const CUSTOMER_MAINTENANCE_COPY = {
  profile: {
    heading: 'Hồ sơ khách hàng',
    edit: 'Chỉnh sửa hồ sơ',
    displayNameLabel: 'Tên hiển thị',
    displayNameHint: 'Tên khách hàng tự xưng. Để trống để xoá.',
    notesLabel: 'Ghi chú nội bộ',
    notesHint:
      'Chỉ nhân viên nhìn thấy. Không bao giờ hiển thị cho khách hàng và không được gửi kèm thông báo.',
    notesEmpty: 'Chưa có ghi chú.',
    save: 'Lưu thay đổi',
    saving: 'Đang lưu…',
    cancel: 'Huỷ',
    saved: 'Đã lưu hồ sơ khách hàng.',
    scopeNote:
      'Chỉ sửa được tên hiển thị và ghi chú nội bộ. Không sửa được liên hệ, trạng thái xác minh hay dữ liệu gộp.',
    unchanged: 'Chưa có thay đổi nào để lưu.',
    displayNameTooLong: 'Tên hiển thị quá dài.',
    notesTooLong: 'Ghi chú quá dài.',
    validation: 'Dữ liệu không hợp lệ. Kiểm tra lại tên hiển thị và ghi chú.',
    merged:
      'Khách hàng này đã được gộp vào một khách hàng khác nên không thể chỉnh sửa. Mở khách hàng được giữ lại để tiếp tục.',
    stale: 'Không còn tìm thấy khách hàng này. Tra cứu lại để lấy trạng thái hiện hành.',
    unauthenticated: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
    forbidden: 'Yêu cầu bị từ chối. Tải lại trang rồi thử lại.',
    generic: 'Không lưu được hồ sơ. Thử lại sau.',
  },

  contacts: {
    promote: 'Đặt làm liên hệ chính',
    deactivate: 'Ngừng sử dụng',
    // The matrix in `FIG-APP10-A01-CONTACT-ELIGIBILITY` stated as one sentence:
    // why the primary row carries neither action, and why an unverified one
    // cannot be promoted from here.
    eligibilityNote:
      'Liên hệ chính không có thao tác: hãy đặt một liên hệ đã xác minh khác làm liên hệ chính trước. ' +
      'Liên hệ chưa xác minh chỉ được xác minh qua luồng xác minh của khách hàng.',
    deactivatedNote:
      'Liên hệ đã ngừng sử dụng sẽ không còn trong danh sách này. Màn hình hỗ trợ không khôi phục lại được.',
  },

  promote: {
    title: 'Đặt làm liên hệ chính?',
    body:
      'Liên hệ này sẽ trở thành nơi nhận thông báo mặc định của khách hàng. Liên hệ chính hiện tại ' +
      'sẽ thôi giữ vai trò đó. Không có liên hệ nào bị xoá và không có trạng thái xác minh nào thay đổi.',
    confirm: 'Đặt làm liên hệ chính',
    working: 'Đang cập nhật…',
    cancel: 'Huỷ',
    close: 'Đóng',
    successTitle: 'Đã đổi liên hệ chính',
    successBody: 'Danh sách liên hệ bên dưới đã được tải lại từ máy chủ.',
  },

  deactivate: {
    title: 'Ngừng sử dụng liên hệ này?',
    // States in the dialog itself that this is not a delete, and that there is
    // no way back through this screen — `APP10-B01` publishes no reactivate
    // operation, so an undo affordance would be a button with nothing behind it.
    body:
      'Liên hệ sẽ ngừng được dùng để gửi thông báo và biến mất khỏi danh sách hiện hành. Đây không ' +
      'phải là xoá: bản ghi và trạng thái xác minh được giữ nguyên. Màn hình này không có thao tác ' +
      'hoàn tác hay kích hoạt lại.',
    confirm: 'Ngừng sử dụng',
    working: 'Đang cập nhật…',
    cancel: 'Huỷ',
    close: 'Đóng',
    successTitle: 'Đã ngừng sử dụng liên hệ',
    successBody:
      'Liên hệ này không còn trong danh sách hiện hành. Danh sách đã được tải lại từ máy chủ.',
  },

  contactFailure: {
    primary:
      'Đây đang là liên hệ chính nên không thể ngừng sử dụng. Hãy đặt một liên hệ đã xác minh khác ' +
      'làm liên hệ chính trước, rồi thử lại.',
    lastVerified:
      'Đây là liên hệ đã xác minh duy nhất của khách hàng nên không thể ngừng sử dụng. Khách hàng ' +
      'cần xác minh thêm một liên hệ khác trước.',
    unverified:
      'Liên hệ này chưa được xác minh nên không thể trở thành liên hệ chính. Chỉ luồng xác minh của ' +
      'khách hàng mới xác minh được một liên hệ.',
    stale: 'Không còn tìm thấy liên hệ này của khách hàng. Trạng thái hiện hành đã được tải lại.',
    conflict:
      'Trạng thái đã thay đổi hoặc khách hàng đã được gộp nên thao tác bị từ chối. Trạng thái hiện ' +
      'hành đã được tải lại.',
    unauthenticated: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
    forbidden: 'Yêu cầu bị từ chối. Tải lại trang rồi thử lại.',
    generic: 'Không thực hiện được thao tác. Thử lại sau.',
  },
} as const;
