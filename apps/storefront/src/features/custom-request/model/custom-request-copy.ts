/**
 * Every word `APP5-S01` puts on screen, in one file.
 *
 * Design source: `FIG-APP5-S01-*` (file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_05`,
 * nodes 650:3 · 650:94 · 650:187 · 651:3 · 651:40 · 651:138 · 652:3 · 652:55 ·
 * 652:115 · 652:175 · 652:229 · 654:3 · 654:66 · 654:138 · 654:214 · 654:309 ·
 * 654:397 · 656:3 · 656:74 · 656:119 · 656:166 · 656:213 · 656:258 · 658:3 ·
 * 658:59 · 658:114 · 658:160 · 658:222), approved under
 * `FIG-APPROVAL-APP5-D01-PO-001`.
 *
 * Copy lives here and not beside the markup because `CLAUDE.md` §5 forbids
 * hard-coded user-facing strings in components, and because the rejection and
 * refusal wording is a **privacy boundary** (`APP5-S01` §12): the bounded
 * classes below are the only vocabulary this screen owns for a server refusal,
 * so widening it is an edit to one visible list rather than a string appearing
 * somewhere in a component nobody re-reads.
 */
export const CUSTOM_REQUEST_COPY = {
  pageTitle: 'Gửi yêu cầu thêu riêng',
  pageIntro:
    'Chọn loại yêu cầu, nhập thông tin, xác minh liên hệ rồi gửi. Bạn không cần tài khoản.',

  steps: {
    subject: 'Bước 1 — Nội dung yêu cầu',
    verify: 'Bước 2 — Xác minh liên hệ',
    attach: 'Bước 3 — Hình ảnh và gửi yêu cầu',
    lockedHint: 'Hoàn tất bước trước để mở bước này.',
    // Distinct from the rail's own step labels: the rail navigates between
    // steps, this advances from step 1, and two controls sharing one accessible
    // name would be two different actions a screen reader announces identically.
    continueToVerify: 'Tiếp tục để xác minh liên hệ',
  },

  chooser: {
    legend: 'Bạn muốn thêu lên sản phẩm nào?',
    catalog: 'Sản phẩm của cửa hàng',
    catalogHint: 'Bạn đã chọn mẫu và thiết kế trong Xưởng thiết kế.',
    customerOwned: 'Sản phẩm bạn đã có sẵn',
    customerOwnedHint: 'Bạn gửi ảnh món đồ của mình và mô tả vị trí muốn thêu.',
    switchWarning: 'Đổi loại yêu cầu sẽ xoá thông tin bạn đã nhập ở loại còn lại.',
  },

  catalog: {
    heading: 'Sản phẩm và phiên bản',
    contextNote: 'Sản phẩm và bản thiết kế lấy từ Xưởng thiết kế. Bạn không cần nhập mã nào ở đây.',
    variantLegend: 'Chọn phiên bản bạn muốn đặt',
    variantHint: 'Bắt buộc chọn một phiên bản. Cửa hàng không chọn thay bạn.',
    variantLoading: 'Đang tải các phiên bản có thể chọn…',
    variantUnnamed: 'Phiên bản không có nhãn',
    variantEmpty: 'Sản phẩm này hiện chưa có phiên bản nào để đặt yêu cầu.',
    variantEmptyHint: 'Bạn có thể quay lại chọn sản phẩm khác hoặc gửi yêu cầu cho đồ có sẵn.',
    variantGone: 'Phiên bản bạn chọn vừa ngừng nhận đặt. Vui lòng chọn lại một phiên bản.',
    productUnavailable: 'Không tìm thấy sản phẩm này.',
    productUnavailableHint: 'Sản phẩm có thể đã ngừng hiển thị. Bạn có thể chọn sản phẩm khác.',
    loadFailed: 'Không tải được danh sách phiên bản.',
    retry: 'Thử lại',
    sessionExpired: 'Bản thiết kế của bạn không còn dùng được để gửi yêu cầu.',
    sessionExpiredHint:
      'Phiên thiết kế đã hết hạn hoặc đã đóng. Hãy mở lại Xưởng thiết kế và thiết kế lại trước khi gửi.',
    sessionMissing: 'Chúng tôi không tìm thấy bản thiết kế nào cho sản phẩm này trên trình duyệt.',
  },

  customerOwned: {
    heading: 'Món đồ của bạn',
    nameLabel: 'Tên món đồ',
    namePlaceholder: 'Ví dụ: Áo khoác jean',
    nameRequired: 'Vui lòng cho biết tên món đồ.',
    nameTooLong: 'Tên món đồ tối đa 200 ký tự.',
    descriptionLabel: 'Mô tả và vị trí muốn thêu (không bắt buộc)',
    descriptionTooLong: 'Mô tả tối đa 2000 ký tự.',
    widthLabel: 'Chiều rộng vùng thêu (mm, không bắt buộc)',
    heightLabel: 'Chiều cao vùng thêu (mm, không bắt buộc)',
    dimensionInvalid: 'Nhập số mm, tối đa 2 chữ số thập phân.',
  },

  quantity: {
    heading: 'Số lượng',
    catalogHint: 'Số lượng dưới đây thuộc về phiên bản bạn vừa chọn.',
    catalogHintNoVariant: 'Chọn phiên bản trước khi nhập số lượng.',
    customerOwnedHint: 'Ghi kích cỡ nếu bạn muốn tách theo size.',
    sizeLabel: 'Kích cỡ',
    sizePlaceholder: 'Ví dụ: M',
    quantityLabel: 'Số lượng',
    addLine: 'Thêm dòng',
    removeLine: 'Xoá dòng',
    total: 'Tổng số lượng',
    required: 'Cần ít nhất một dòng số lượng hợp lệ.',
    invalid: 'Số lượng phải là số nguyên lớn hơn 0 và tối đa 100000.',
    sizeTooLong: 'Kích cỡ tối đa 50 ký tự.',
    tooManyLines: 'Tối đa 50 dòng số lượng.',
  },

  verification: {
    heading: 'Xác minh liên hệ',
    intro: 'Chúng tôi gửi mã 6 chữ số để xác nhận bạn là chủ của liên hệ này.',
    verified: 'Đã xác minh liên hệ. Bạn có thể tiếp tục bước 3.',
    required: 'Hoàn tất xác minh liên hệ trước khi tải ảnh và gửi yêu cầu.',
  },

  upload: {
    copHeading: 'Ảnh món đồ của bạn',
    copHint: 'Bắt buộc ít nhất 1 ảnh. Tối đa 10 ảnh.',
    referenceHeading: 'Ảnh tham khảo (không bắt buộc)',
    referenceHint: 'Hình mẫu bạn muốn thêu. Tối đa 10 ảnh.',
    // Two uploaders are on screen at once on the COP branch, so the two file
    // controls need two distinct accessible names — one shared "Chọn ảnh" would
    // announce them identically and give a screen-reader user no way to tell
    // which control they are on.
    chooseCopImage: 'Chọn ảnh món đồ',
    chooseReference: 'Chọn ảnh tham khảo',
    formats: 'JPEG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.',
    empty: 'Chưa có ảnh nào.',
    uploading: 'Đang tải lên…',
    inspecting: 'Đang kiểm tra ảnh…',
    accepted: 'Đã duyệt',
    rejected: 'Ảnh không dùng được',
    remove: 'Bỏ ảnh',
    retry: 'Tải lại ảnh',
    capReached: 'Bạn đã đạt giới hạn 10 ảnh cho mục này.',
    quotaReached: 'Bạn đã đạt giới hạn ảnh cho lần gửi yêu cầu này.',
    copRequired: 'Cần ít nhất một ảnh món đồ đã được duyệt.',
    pending: 'Vui lòng đợi các ảnh kiểm tra xong trước khi gửi.',
    counter: (used: number, max: number) => `${used}/${max} ảnh`,
  },

  /**
   * The only refusal vocabulary this screen owns (`APP5-S01` §12).
   *
   * Bounded classes, never server prose: no scanner output, no detected MIME or
   * file signature, no bucket, key or path, no constraint name, no stack.
   */
  uploadFailure: {
    TOO_LARGE: 'Ảnh vượt quá 10 MB.',
    UNSUPPORTED: 'Định dạng ảnh không được hỗ trợ.',
    PROCESSING_FAILED: 'Ảnh không qua được bước kiểm tra.',
    QUOTA: 'Bạn đã đạt giới hạn ảnh cho lần gửi yêu cầu này.',
    VERIFICATION_UNAVAILABLE: 'Phiên xác minh không còn dùng được. Hãy xác minh lại.',
    GENERIC: 'Không tải được ảnh. Vui lòng thử lại.',
  },

  review: {
    heading: 'Kiểm tra lại yêu cầu',
    subjectCatalog: 'Sản phẩm cửa hàng',
    subjectCustomerOwned: 'Sản phẩm bạn đã có',
    product: 'Sản phẩm',
    variant: 'Phiên bản',
    design: 'Bản thiết kế',
    designAttached: 'Đã đính kèm từ Xưởng thiết kế',
    item: 'Món đồ',
    description: 'Mô tả',
    dimensions: 'Kích thước vùng thêu',
    quantities: 'Số lượng',
    itemPhotos: 'Ảnh món đồ',
    references: 'Ảnh tham khảo',
    contact: 'Liên hệ đã xác minh',
    note: 'Ghi chú cho xưởng (không bắt buộc)',
    noteTooLong: 'Ghi chú tối đa 2000 ký tự.',
    disclaimer:
      'Gửi yêu cầu không phải là báo giá, duyệt thiết kế, thanh toán hay đơn hàng. Xưởng sẽ liên hệ lại với bạn.',
  },

  submit: {
    action: 'Gửi yêu cầu',
    submitting: 'Đang gửi yêu cầu…',
    blocked: 'Hoàn tất các mục còn thiếu để gửi yêu cầu.',
    failed: 'Chưa gửi được yêu cầu. Chưa có yêu cầu nào được tạo.',
    uncertain:
      'Kết nối bị gián đoạn nên chúng tôi chưa rõ kết quả. Bấm gửi lại — hệ thống sẽ không tạo yêu cầu trùng.',
    retry: 'Gửi lại',
    conflict:
      'Lần xác minh này đã được dùng cho một yêu cầu khác. Vui lòng xác minh lại liên hệ để gửi yêu cầu mới.',
    conflictAction: 'Xác minh lại',
    inProgress: 'Yêu cầu của bạn đang được xử lý. Vui lòng đợi một lát rồi thử lại.',
    subjectInvalid: 'Yêu cầu phải thuộc đúng một loại: sản phẩm cửa hàng hoặc đồ có sẵn.',
    notVerified: 'Xác minh liên hệ không còn dùng được. Hãy xác minh lại.',
    assetNotBindable: 'Một trong các ảnh đính kèm không dùng được. Hãy tải lại ảnh đó.',
  },

  live: {
    submitting: 'Đang gửi yêu cầu',
    inspecting: 'Đang kiểm tra ảnh vừa tải lên',
  },
} as const;
