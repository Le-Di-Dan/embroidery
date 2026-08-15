/**
 * Every user-facing string on the customer-access support screen, in one place
 * (CLAUDE.md §5 — no hard-coded copy in components).
 *
 * The wording follows the approved `APP4-D01` A01 frames as amended under
 * `FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001`. Two rules govern what may be said
 * here, and both are security rules rather than tone:
 *
 * 1. **No refusal explains itself past what the server published.** The lookup
 *    miss says "no customer matches" and never "that address is not verified" —
 *    the server refuses to distinguish those, and copy that did would put the
 *    distinction back.
 * 2. **No string interpolates a contact, a code, a token or a digest.** The only
 *    contact representation on this screen is the server's mask, rendered as it
 *    arrives.
 */
export const CUSTOMER_ACCESS_COPY = {
  page: {
    title: 'Hỗ trợ truy cập khách hàng',
    subtitle: 'Tra cứu khách hàng, kiểm tra quyền truy cập và xử lý lỗi gửi thông báo.',
  },

  lookup: {
    heading: 'Tra cứu khách hàng',
    kindLabel: 'Loại liên hệ',
    kindEmail: 'EMAIL',
    kindPhone: 'PHONE',
    contactLabel: 'Email hoặc số điện thoại',
    placeholder: 'Nhập email hoặc số điện thoại',
    submit: 'Tra cứu',
    submitting: 'Đang tra cứu…',
    hint: 'Khớp chính xác một liên hệ đã xác minh. Không tìm gần đúng.',
    blank: 'Nhập một email hoặc số điện thoại để tra cứu.',
    idle: 'Nhập một liên hệ đã xác minh để mở hồ sơ hỗ trợ của khách hàng.',
  },

  customer: {
    heading: 'Khách hàng & liên hệ',
    loading: 'Đang tải thông tin khách hàng…',
    customerId: 'Mã khách hàng',
    displayName: 'Tên hiển thị',
    displayNameEmpty: 'Chưa có',
    verifiedAt: 'Xác minh lúc',
    contactsHeading: 'Liên hệ hiện tại',
    kindEmail: 'Email',
    kindPhone: 'Số điện thoại',
    primary: 'Liên hệ chính',
    verified: 'Đã xác minh',
    unverified: 'Chưa xác minh',
    maskNote:
      'Liên hệ chỉ hiển thị dạng che. Hệ thống không hiển thị mã, digest, token hay bản rõ.',
  },

  grant: {
    heading: 'Quyền truy cập an toàn',
    loading: 'Đang tải quyền truy cập…',
    none: 'Khách hàng này chưa có quyền truy cập nào.',
    noneActive: 'Không có quyền truy cập nào đang hoạt động.',
    scope: 'Phạm vi',
    request: 'Yêu cầu',
    expiresAt: 'Hết hạn',
    status: 'Trạng thái',
    statusActive: 'Đang hoạt động',
    statusExpiredByTime: 'Đã hết hạn',
    statusExpired: 'Đã hết hạn',
    statusRevoked: 'Đã thu hồi',
    revoke: 'Thu hồi quyền truy cập',
    secretNote: 'Mã liên kết không được lưu ở dạng đọc được và không hiển thị ở màn hình này.',
  },

  revoke: {
    title: 'Thu hồi quyền truy cập?',
    body:
      'Liên kết sẽ ngừng hoạt động ngay lập tức. Thao tác này không thể hoàn tác và không tạo ' +
      'quyền truy cập thay thế.',
    reasonLabel: 'Lý do thu hồi',
    reasonHint: 'Lý do được ghi vào nhật ký kiểm toán, kèm tài khoản quản trị đang đăng nhập.',
    reasonBlank: 'Nhập lý do thu hồi.',
    reasonTooLong: 'Lý do quá dài.',
    confirm: 'Thu hồi',
    working: 'Đang thu hồi…',
    cancel: 'Huỷ',
    success: 'Đã thu hồi quyền truy cập.',
    conflict:
      'Quyền truy cập này không còn hoạt động nên không thể thu hồi. Đã tải lại trạng thái hiện hành.',
    missing: 'Không tìm thấy quyền truy cập này.',
  },

  notification: {
    heading: 'Gửi thông báo',
    loading: 'Đang tải trạng thái gửi…',
    none: 'Không có lỗi gửi nào cần xử lý.',
    boundNote:
      'Chỉ hiển thị lần gửi thất bại vĩnh viễn gần nhất được ràng buộc với khách hàng đang xem.',
    channel: 'Kênh',
    recipient: 'Người nhận',
    template: 'Mẫu',
    createdAt: 'Tạo lúc',
    status: 'Trạng thái',
    statusFailed: 'Thất bại kết thúc',
    timelineHeading: 'Các lần thử',
    columnIndex: 'Lần',
    columnAt: 'Thời điểm',
    columnOutcome: 'Kết quả',
    columnErrorClass: 'Nhóm lỗi',
    noErrorClass: '—',
    replay: 'Gửi lại thông báo',
    redactionNote:
      'Chỉ hiển thị nhóm lỗi đã được giới hạn. Không có nội dung tin nhắn, phản hồi nhà cung cấp hay mã.',
  },

  replay: {
    title: 'Gửi lại thông báo này?',
    body:
      'Mã hoặc liên kết ban đầu sẽ được gửi lại nguyên trạng. Không có mã mới nào được tạo, và ' +
      'bản ghi thất bại cũ vẫn được giữ nguyên làm bằng chứng.',
    confirm: 'Gửi lại',
    working: 'Đang gửi lại…',
    cancel: 'Huỷ',
    created: 'Đã tạo lượt gửi lại. Worker sẽ xử lý với hạn mức thử mới.',
    existing: 'Lượt gửi lại này đã tồn tại',
    existingBody:
      'Yêu cầu của bạn quy về đúng lượt gửi lại đang chạy — không có lượt thứ hai nào được tạo. ' +
      'Dưới đây là trạng thái hiện hành.',
    queuedNote: 'Đã nhận để gửi. Đây chưa phải là xác nhận đã gửi thành công.',
    reissueTitle: 'Cần phát hành lại',
    reissueBody:
      'Mã hoặc liên kết của thông báo này không còn hiệu lực nên không thể gửi lại. Hãy phát ' +
      'hành mới qua luồng nghiệp vụ với khách hàng; màn hình hỗ trợ không tạo mã hay liên kết.',
    notApplicable: 'Thông báo này không ở trạng thái thất bại nên không có gì để gửi lại.',
    sourceUnavailable: 'Không tìm thấy bản ghi gửi thất bại tương ứng để gửi lại.',
    missing: 'Không tìm thấy thông báo này.',
  },

  failure: {
    loadError: 'Không tải được dữ liệu hỗ trợ.',
    loadErrorBody: 'Kết nối hoặc dịch vụ đang gặp sự cố. Thử lại sau ít phút.',
    retry: 'Thử lại',
    notFoundTitle: 'Không tìm thấy khách hàng phù hợp',
    notFoundBody:
      'Không tìm thấy khách hàng có liên hệ đã xác minh khớp với thông tin đã nhập. Kiểm tra ' +
      'lại email hoặc số điện thoại.',
    notFoundNote: 'Màn hình hỗ trợ không tạo, sửa hay gộp khách hàng.',
    unauthenticated: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
    forbidden: 'Yêu cầu bị từ chối. Tải lại trang rồi thử lại.',
    generic: 'Không thực hiện được thao tác. Thử lại sau.',
  },
} as const;

/** `secure_access_grants.revoke_reason` is bounded server-side at 500. */
export const REVOKE_REASON_MAX_LENGTH = 500;
