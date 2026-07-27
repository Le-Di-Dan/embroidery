/**
 * Vietnamese copy catalog for the Admin asset library (FRONTEND_CONVENTIONS
 * §14 — no user-facing string is written at a call site).
 *
 * Every string that appears in an approved Figma node is reproduced verbatim
 * from `FIG-ADMIN-ASSETS-*` (`426:13`, `429:6`, `429:89`, `430:12`, `430:98`,
 * `432:18`, `433:19`) and the normative handoff nodes `450:404` / `484:272`.
 * The few strings the frames do not enumerate — terminal acceptance, an
 * ambiguous cancellation, the safe API-failure fallbacks — are written in the
 * same register and never expose a technical detail.
 *
 * Deliberately absent: any sentence stating the maximum file size. The approved
 * handoff pins the support line to formats only, so the too-large guidance
 * names the outcome rather than advertising a number.
 */
export const ASSET_COPY = {
  page: {
    /** The screen's single `<h1>`, and the navigation label for `/assets`. */
    title: 'Tài sản hình ảnh',
    subtitle: 'Tải ảnh sản phẩm lên và theo dõi trạng thái xử lý trước khi dùng cho tác phẩm.',
    collectionLabel: 'Danh sách tài sản hình ảnh',
  },

  upload: {
    action: 'Tải ảnh lên',
    dropTitle: 'Kéo và thả ảnh vào đây',
    dropHint: 'hoặc chọn tệp từ máy của bạn',
    browse: 'Chọn tệp',
    formats: 'Hỗ trợ định dạng PNG, JPEG và WebP.',
    mobileHint:
      'Trên thiết bị di động, hãy dùng nút “Tải ảnh lên” để chọn ảnh từ máy — không cần thao tác kéo thả.',
    /** Accessible name of the visually hidden native input. */
    inputLabel: 'Chọn ảnh sản phẩm để tải lên',
    selectedTitle: 'Đã chọn · {name}',
    selectedDescription: 'Ảnh đã sẵn sàng để tải lên.',
    submit: 'Bắt đầu tải lên',
    clear: 'Chọn ảnh khác',
  },

  progress: {
    uploadingTitle: 'Đang tải lên · {name}',
    determinate: 'Đã tải {percent}% — vui lòng giữ trang này mở.',
    indeterminate: 'Đang tải lên — vui lòng giữ trang này mở.',
    label: 'Tiến trình tải lên',
    cancel: 'Huỷ tải lên',
  },

  processing: {
    title: 'Đang xử lý · {name}',
    description:
      'Ảnh đang được kiểm tra tự động. Bạn có thể rời khỏi trang — quá trình vẫn tiếp tục.',
  },

  accepted: {
    title: 'Sẵn sàng · {name}',
    description: 'Ảnh đã được kiểm tra và có thể dùng cho tác phẩm.',
  },

  rejected: {
    title: 'Không thể sử dụng · {name}',
    description:
      'Tệp này không phải là ảnh PNG, JPEG hoặc WebP hợp lệ nên không thể dùng cho tác phẩm. Hãy tải lên một ảnh khác.',
    action: 'Tải ảnh khác lên',
  },

  unknownState: {
    title: 'Chưa xác định · {name}',
    description:
      'Chưa thể xác định kết quả kiểm tra của ảnh này. Hãy tải lại trang sau ít phút để xem trạng thái mới nhất.',
  },

  cancelled: {
    title: 'Đã huỷ tải lên',
    description:
      'Bạn đã huỷ khi ảnh đang được gửi đi, nên chưa thể khẳng định máy chủ đã nhận được ảnh hay chưa. Danh sách bên dưới đã được làm mới. Nếu chưa thấy ảnh, hãy thử lại.',
    retry: 'Thử lại lần tải lên này',
    dismiss: 'Bỏ qua',
  },

  uploadError: {
    title: 'Không thể tải ảnh lên',
    retry: 'Thử lại lần tải lên này',
    dismiss: 'Bỏ qua',
  },

  status: {
    pending: 'Đã tải lên / Đang chờ xử lý',
    processing: 'Đang xử lý',
    ready: 'Sẵn sàng',
    rejected: 'Không thể sử dụng',
    unknown: 'Chưa xác định',
  },

  identity: {
    titlePng: 'Ảnh PNG',
    titleJpeg: 'Ảnh JPEG',
    titleWebp: 'Ảnh WebP',
    titleUnknown: 'Tài sản hình ảnh',
    unitBytes: 'B',
    unitKilobytes: 'KB',
    unitMegabytes: 'MB',
    metaUnavailable: 'Chưa có thông tin chi tiết',
    /** Accessible description of the placeholder tile — there is no image yet. */
    thumbnailPlaceholder: 'Chưa có ảnh xem trước',
  },

  list: {
    loading: 'Đang tải danh sách tài sản…',
    unavailableTitle: 'Không thể tải danh sách tài sản',
    unavailableDescription: 'Danh sách tài sản hiện chưa tải được. Hãy thử lại sau giây lát.',
    unavailableRetry: 'Thử lại',
    emptyTitle: 'Chưa có tài sản hình ảnh nào',
    emptyDescription:
      'Hãy tải lên ảnh sản phẩm đầu tiên để bắt đầu. Ảnh sẽ được kiểm tra tự động trước khi sẵn sàng sử dụng.',
  },

  continuation: {
    action: 'Tải thêm tài sản',
    loading: 'Đang tải thêm…',
    loaded: 'Đã tải thêm tài sản.',
    errorMessage: 'Không thể tải thêm tài sản.',
    retry: 'Thử lại',
  },

  /**
   * Safe outcomes for a failed upload. Keyed by the API's stable business code
   * (or the api-client transport code) — never by an HTTP body, a native error
   * or an inspection detail. Anything unmapped falls back to `unexpected`.
   */
  errors: {
    mediaUnsupported: 'Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP. Hãy chọn một ảnh khác.',
    tooLarge: 'Ảnh vượt quá dung lượng cho phép. Hãy chọn một ảnh nhỏ hơn.',
    multipleFiles: 'Mỗi lần chỉ tải lên được một ảnh. Hãy chọn một tệp.',
    signatureMismatch: 'Nội dung tệp không khớp với định dạng ảnh đã khai báo. Hãy chọn ảnh khác.',
    metadataInvalid: 'Yêu cầu tải lên không hợp lệ. Hãy chọn lại ảnh và thử lại.',
    idempotencyConflict:
      'Lần tải lên này đã được dùng cho một yêu cầu khác. Hãy chọn lại ảnh và bắt đầu lượt tải mới.',
    uploadInProgress: 'Ảnh này đang được tải lên. Hãy đợi lượt tải hiện tại kết thúc.',
    stateConflict: 'Lượt tải lên này không còn hiệu lực. Hãy chọn lại ảnh và thử lại.',
    timeout: 'Quá trình tải lên mất quá nhiều thời gian và đã dừng lại. Hãy thử lại.',
    unavailable: 'Dịch vụ lưu trữ ảnh tạm thời không khả dụng. Hãy thử lại sau giây lát.',
    rateLimited: 'Bạn đang thao tác quá nhanh. Hãy đợi một lát rồi thử lại.',
    network: 'Không có kết nối tới máy chủ. Hãy kiểm tra kết nối mạng và thử lại.',
    notFound: 'Không tìm thấy tài sản này.',
    sessionExpired: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.',
    unexpected: 'Đã xảy ra lỗi ngoài dự kiến. Hãy thử lại sau giây lát.',
  },
} as const;

/** Substitutes a single `{token}` placeholder; no user input is interpolated. */
export function withToken(template: string, token: string, value: string): string {
  return template.replace(`{${token}}`, value);
}
