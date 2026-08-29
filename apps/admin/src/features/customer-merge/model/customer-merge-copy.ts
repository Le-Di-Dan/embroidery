/**
 * Every user-facing string in the merge workflow (CLAUDE.md §5 — no hard-coded
 * copy in components).
 *
 * The wording follows the approved `APP10-D01` A02 frames under
 * `FIG-APPROVAL-APP10-D01-PO-001`. Four rules govern what may be said here, and
 * all four are correctness rules rather than tone:
 *
 * 1. **The two roles are named, never numbered.** "Khách giữ lại" and "Khách
 *    được gộp" each carry a definition line. "Khách hàng 1 / 2" would leave the
 *    direction of an irreversible operation to be inferred from position.
 * 2. **No refusal claims more than the API published.** The open conflict names
 *    both possibilities it cannot separate; the execute participant refusal does
 *    the same. Neither picks the likelier one.
 * 3. **Nothing promises reversal.** There is no unmerge operation, so no string
 *    may suggest one, and the confirmation says so in as many words.
 * 4. **Frozen evidence is described as preserved, never as rewritten.** A merge
 *    records a decision; approval snapshots, quotation acceptances, design
 *    reviews and every append-only history keep the Customer they were taken
 *    against. Copy claiming "everything moves" would be false and would invite
 *    an operator to expect a rewrite that never happens.
 */
export const CUSTOMER_MERGE_COPY = {
  page: {
    title: 'Gộp khách hàng',
    subtitle:
      'Gộp hai hồ sơ khách hàng trùng nhau thành một. Đây là thao tác quản trị, không thể hoàn tác.',
    backToSupport: 'Về màn hình hỗ trợ khách hàng',
  },

  selection: {
    heading: 'Chọn hai khách hàng',
    intro:
      'Tra cứu từng khách hàng bằng một liên hệ đã xác minh. Không có danh sách hay tìm kiếm gần đúng.',
    survivorTitle: 'Khách giữ lại',
    survivorMeaning: 'Hồ sơ này vẫn hoạt động sau khi gộp và nhận toàn bộ dữ liệu đang sống.',
    loserTitle: 'Khách được gộp',
    loserMeaning:
      'Hồ sơ này sẽ được đánh dấu đã gộp vào khách giữ lại và không còn là danh tính hoạt động.',
    kindLabel: 'Loại liên hệ',
    kindEmail: 'EMAIL',
    kindPhone: 'PHONE',
    contactLabel: 'Email hoặc số điện thoại',
    placeholder: 'Nhập email hoặc số điện thoại',
    resolve: 'Tra cứu',
    resolving: 'Đang tra cứu…',
    empty: 'Chưa chọn khách hàng.',
    replace: 'Đổi khách hàng',
    blank: 'Nhập một email hoặc số điện thoại để tra cứu.',
    loading: 'Đang tải thông tin khách hàng…',
    loadError: 'Không tải được thông tin khách hàng này. Tra cứu lại.',
    sameCustomer:
      'Hai ô đang là cùng một khách hàng. Một khách hàng không thể vừa là khách giữ lại vừa là khách được gộp.',
    contactsHeading: 'Liên hệ hiện tại',
    verified: 'Đã xác minh',
    unverified: 'Chưa xác minh',
    primary: 'Liên hệ chính',
    displayNameEmpty: 'Chưa có',
    verifiedAt: 'Xác minh lúc',
    maskNote: 'Liên hệ chỉ hiển thị dạng che. Hệ thống không hiển thị bản rõ, mã hay token.',
  },

  open: {
    heading: 'Lý do gộp',
    reasonLabel: 'Vì sao hai hồ sơ này là cùng một người?',
    reasonHint:
      'Bắt buộc. Lý do được lưu trên hồ sơ gộp làm bằng chứng cho quyết định này. Không gửi cho khách hàng.',
    reasonBlank: 'Nhập lý do gộp.',
    reasonTooLong: 'Lý do quá dài.',
    submit: 'Mở hồ sơ gộp',
    submitting: 'Đang mở hồ sơ gộp…',
    nothingMovedNote:
      'Mở hồ sơ gộp chưa di chuyển bất cứ thứ gì. Việc gộp chỉ diễn ra khi bạn xác nhận thực hiện ở bước sau.',
  },

  openFailure: {
    validation: 'Dữ liệu không hợp lệ. Kiểm tra lại lý do gộp.',
    participantMissing:
      'Không còn tìm thấy một trong hai khách hàng đã chọn. Tra cứu lại cả hai rồi thử lại.',
    // Two causes the API does not separate, both named.
    conflict:
      'Không mở được hồ sơ gộp: cặp khách hàng này đã có một hồ sơ gộp đang mở, hoặc một trong hai đã được gộp vào khách hàng khác.',
    unauthenticated: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
    forbidden: 'Yêu cầu bị từ chối. Tải lại trang rồi thử lại.',
    generic: 'Không mở được hồ sơ gộp. Thử lại sau.',
  },

  caseDetail: {
    heading: 'Hồ sơ gộp khách hàng',
    caseReference: 'Mã hồ sơ gộp',
    loading: 'Đang tải hồ sơ gộp…',
    loadError: 'Không tải được hồ sơ gộp.',
    loadErrorBody: 'Kết nối hoặc dịch vụ đang gặp sự cố. Thử lại sau ít phút.',
    notFound: 'Không tìm thấy hồ sơ gộp này.',
    notFoundBody:
      'Hồ sơ có thể chưa từng tồn tại. Mở một hồ sơ gộp mới từ màn hình chọn khách hàng.',
    retry: 'Thử lại',
    status: 'Trạng thái',
    statusRequested: 'Đang chờ quyết định',
    statusExecuted: 'Đã gộp',
    statusRejected: 'Đã từ chối',
    requestedAt: 'Mở lúc',
    decidedAt: 'Quyết định lúc',
    openReason: 'Lý do mở hồ sơ',
    directionNote:
      'Chiều gộp do người mở hồ sơ chọn và không thể đảo lại ở đây. Muốn đổi chiều, hãy từ chối hồ sơ này và mở hồ sơ mới.',
  },

  preview: {
    heading: 'Những gì sẽ được chuyển',
    intro:
      'Đếm từ dữ liệu đang sống của khách được gộp, tại thời điểm đọc. Đây là số liệu tham khảo: khi thực hiện, hệ thống đánh giá lại trạng thái thật trong cùng một giao dịch.',
    contactPoints: 'Liên hệ',
    activeSecureAccessGrants: 'Quyền truy cập an toàn đang hoạt động',
    activeSecureAccessGrantsNote: 'Sẽ bị thu hồi khi gộp.',
    customRequests: 'Yêu cầu đặt riêng',
    orders: 'Đơn hàng',
    uploadedAssets: 'Tệp khách tải lên',
    businessProfileHeading: 'Hồ sơ doanh nghiệp',
    businessProfileLoserHas: 'Khách được gộp có hồ sơ doanh nghiệp',
    businessProfileSurvivorHas: 'Khách giữ lại có hồ sơ doanh nghiệp',
    yes: 'Có',
    no: 'Không',
    frozenNote:
      'Bằng chứng thương mại đã đóng băng — bản duyệt thiết kế, chấp nhận báo giá, lịch sử trạng thái và nhật ký kiểm toán — vẫn giữ nguyên khách hàng gốc. Việc gộp không viết lại chúng.',
    noPreviewAfterDecision:
      'Số liệu tham khảo chỉ hiển thị khi hồ sơ còn đang chờ quyết định. Sau khi quyết định, con số đọc lại chỉ mô tả dữ liệu đang sống hiện tại, không phải những gì đã được chuyển.',
  },

  blocker: {
    title: 'Không thể gộp: cả hai đều có hồ sơ doanh nghiệp',
    body: 'Mỗi khách hàng chỉ được có tối đa một hồ sơ doanh nghiệp, và cả hai bên đều đang có. Hệ thống không tự chọn, không ghi đè, không trộn trường và không xoá bên nào.',
    resolution:
      'Hãy xử lý hồ sơ doanh nghiệp bên ngoài luồng này trước, sau đó quay lại thực hiện gộp. Chưa có gì được gộp.',
    executeDisabled: 'Nút thực hiện gộp bị vô hiệu hoá vì lý do này.',
  },

  execute: {
    action: 'Thực hiện gộp',
    title: 'Thực hiện gộp hai khách hàng?',
    survivorLabel: 'Khách giữ lại',
    loserLabel: 'Khách được gộp',
    direction: 'Khách được gộp sẽ được đánh dấu đã gộp vào khách giữ lại.',
    effects: 'Khi bạn xác nhận:',
    effectContacts: 'Toàn bộ liên hệ của khách được gộp chuyển sang khách giữ lại.',
    effectOwnership:
      'Yêu cầu đặt riêng, đơn hàng, tệp tải lên và hồ sơ doanh nghiệp đang sống được chuyển sang khách giữ lại.',
    effectGrants: 'Mọi quyền truy cập an toàn đang hoạt động của khách được gộp bị thu hồi.',
    effectFrozen:
      'Bằng chứng đã đóng băng và lịch sử chỉ-ghi-thêm được giữ nguyên với khách hàng gốc, không bị viết lại.',
    irreversible:
      'Không có thao tác huỷ gộp. Sau khi thực hiện, không thể hoàn tác từ màn hình này.',
    confirm: 'Xác nhận gộp',
    working: 'Đang gộp…',
    cancel: 'Huỷ',
    close: 'Đóng',
    successTitle: 'Đã gộp xong',
    successBody: 'Hồ sơ gộp đã được thực hiện. Trạng thái bên dưới được đọc lại từ máy chủ.',
    alreadyTitle: 'Hồ sơ này đã được gộp trước đó',
    alreadyBody:
      'Yêu cầu của bạn quy về đúng lần gộp đã thực hiện — không có gì được chuyển hay thu hồi lần thứ hai. Đây là kết thúc an toàn, không phải lỗi.',
  },

  executeFailure: {
    businessProfile:
      'Cả hai khách hàng đều có hồ sơ doanh nghiệp nên không thể gộp. Chưa có gì được gộp. Hãy xử lý hồ sơ doanh nghiệp trước.',
    notExecutable: 'Hồ sơ gộp này đã bị từ chối nên không thể thực hiện.',
    // One approved frame (`841:3`) covers both causes; the copy names both.
    participantOrContact:
      'Trạng thái đã thay đổi so với lúc xem trước nên không thể gộp: một trong hai khách hàng đã được gộp vào khách hàng khác, hoặc một liên hệ không thể chuyển mà không làm mất bằng chứng danh tính. Chưa có gì được gộp.',
    stale: 'Không còn tìm thấy hồ sơ gộp này.',
    unauthenticated: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
    forbidden: 'Yêu cầu bị từ chối. Tải lại trang rồi thử lại.',
    generic: 'Không thực hiện được thao tác gộp. Thử lại sau. Chưa có gì được gộp.',
  },

  reject: {
    action: 'Từ chối hồ sơ gộp',
    title: 'Từ chối hồ sơ gộp này?',
    body: 'Hồ sơ sẽ được đánh dấu đã từ chối và không thể thực hiện nữa. Không có liên hệ, quyền truy cập, yêu cầu, đơn hàng hay tệp nào bị thay đổi.',
    reasonLabel: 'Lý do từ chối',
    reasonHint:
      'Bắt buộc. Lý do được ghi vào nhật ký kiểm toán kèm tài khoản quản trị đang đăng nhập, và không hiển thị lại trên màn hình này.',
    reasonBlank: 'Nhập lý do từ chối.',
    reasonTooLong: 'Lý do quá dài.',
    confirm: 'Từ chối',
    working: 'Đang từ chối…',
    cancel: 'Huỷ',
    close: 'Đóng',
    successTitle: 'Đã từ chối hồ sơ gộp',
    successBody: 'Trạng thái bên dưới được đọc lại từ máy chủ.',
  },

  rejectFailure: {
    validation: 'Dữ liệu không hợp lệ. Kiểm tra lại lý do từ chối.',
    alreadyDecided: 'Hồ sơ gộp này đã được quyết định nên không thể từ chối nữa.',
    stale: 'Không còn tìm thấy hồ sơ gộp này.',
    unauthenticated: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
    forbidden: 'Yêu cầu bị từ chối. Tải lại trang rồi thử lại.',
    generic: 'Không từ chối được hồ sơ gộp. Thử lại sau.',
  },

  executed: {
    heading: 'Đã gộp xong',
    body: 'Khách được gộp đã được đánh dấu gộp vào khách giữ lại.',
    // Says in place why no figures and no timeline appear, so their absence
    // reads as a decision rather than as a screen that failed to load them.
    noCountsNote:
      'Màn hình này không hiển thị số lượng bản ghi đã chuyển: hệ thống không công bố lịch sử sự kiện gộp qua API, và con số xem trước là số liệu trước khi gộp — hiển thị lại chúng như “đã chuyển” sẽ là một khẳng định sai.',
    noUndoNote: 'Không có thao tác huỷ gộp.',
  },

  rejected: {
    heading: 'Hồ sơ gộp đã bị từ chối',
    body: 'Không có gì được chuyển. Cả hai khách hàng giữ nguyên như trước.',
    // The rejection reason has no column and no read operation; saying so is
    // more honest than an empty field the operator would read as missing data.
    noReasonNote:
      'Lý do từ chối được ghi trong nhật ký kiểm toán và không được công bố lại qua API, nên không hiển thị ở đây.',
  },
} as const;
