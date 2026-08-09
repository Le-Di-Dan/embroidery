/**
 * Every customer-visible string of the Studio bootstrap route (`APP3-S01`).
 *
 * Copy is data, not markup: components read from here so no user-facing
 * sentence is hard-coded at a call site (CLAUDE.md §5), and so the whole
 * vocabulary of the screen can be read in one place when it is reviewed.
 *
 * Refusal copy is deliberately uniform. `APP3-B05`, `APP3-B05A` and `APP3-B07`
 * all answer one non-disclosing 404 for every invisible state — unknown,
 * unpublished, archived, withdrawn, retired — so the screen must not invent a
 * more specific explanation than the server was willing to give.
 */
export const STUDIO_COPY = {
  heading: 'Thiết kế mẫu thêu',
  introPrefix: 'Bạn đang thiết kế trên sản phẩm',

  loadingPlacement: 'Đang tải vùng thêu…',
  placementError: 'Chưa thể tải vùng thêu của sản phẩm này.',
  retry: 'Thử lại',

  ineligibleHeading: 'Sản phẩm này chưa mở phần thiết kế',
  ineligibleBody:
    'Sản phẩm đã được đăng, nhưng vùng thêu chưa sẵn sàng để mở phiên thiết kế. Bạn có thể quay lại sau.',

  sideLabel: 'Mặt sản phẩm',
  areaLabel: 'Vùng thêu',
  singleSideNote: 'Sản phẩm này chỉ có một mặt thêu.',
  singleAreaNote: 'Mặt này chỉ có một vùng thêu.',

  templateHeading: 'Chọn mẫu có sẵn',
  templateLoading: 'Đang tải mẫu thiết kế…',
  templateError: 'Chưa thể tải danh sách mẫu.',
  templateEmpty: 'Chưa có mẫu nào cho vùng thêu này.',
  templateEmptyHint: 'Bạn vẫn có thể bắt đầu với một thiết kế trống.',
  templateMore: 'Xem thêm mẫu',
  templateMoreLoading: 'Đang tải thêm…',
  templateMoreError: 'Chưa thể tải thêm mẫu.',
  templateVersionPrefix: 'Phiên bản',

  previewHeading: 'Xem trước mẫu',
  previewLoading: 'Đang tải hình xem trước…',
  previewTextOnly: 'Mẫu này chỉ gồm chữ thêu, không có hình ảnh xem trước.',
  previewUnavailable: 'Mẫu này không còn khả dụng. Vui lòng chọn mẫu khác.',
  previewRetryable: 'Chưa thể tải hình xem trước.',
  previewAlt: 'Hình xem trước của mẫu',

  detailUnavailable: 'Mẫu bạn chọn không còn khả dụng. Vui lòng chọn mẫu khác.',

  startHeading: 'Bắt đầu thiết kế',
  startBlank: 'Bắt đầu với thiết kế trống',
  startClone: 'Dùng mẫu đã chọn',
  starting: 'Đang mở phiên thiết kế…',
  startBlankError: 'Chưa thể mở phiên thiết kế trống.',
  startCloneError: 'Chưa thể mở phiên thiết kế từ mẫu này.',

  readyHeading: 'Phiên thiết kế đã sẵn sàng',
  readyBody: 'Khung vẽ sẽ có ở bước tiếp theo. Phiên của bạn đã được lưu trên máy chủ.',
  readyExpiresPrefix: 'Phiên hết hạn lúc',
  readyFromTemplatePrefix: 'Tạo từ mẫu',

  resume: 'Kiểm tra phiên hiện tại',
  resuming: 'Đang kiểm tra phiên…',
  expiredHeading: 'Phiên thiết kế đã kết thúc',
  expiredBody: 'Phiên thiết kế này không còn hiệu lực. Bạn có thể bắt đầu một phiên mới từ đầu.',
  expiredRestart: 'Bắt đầu phiên mới',

  statusBusy: 'Đang xử lý',
} as const;
