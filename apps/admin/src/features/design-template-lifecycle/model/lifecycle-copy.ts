/**
 * Every operator-facing string on the lifecycle screen (`APP3-A04`).
 *
 * Transcribed from the five approved frames in Figma section `596:10`
 * (`FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-*`). One catalogue, so no server message
 * can reach the screen: a lifecycle failure selects a key here, and the
 * normalized envelope's `message` is never rendered.
 *
 * The wording carries the rulings, not just labels. Archive says *retained, not
 * deleted*; restore says *returns to DRAFT, not republished*; the readiness
 * footer says the server changes nothing when it refuses. Those sentences are
 * the contract the operator is owed.
 */
export const LIFECYCLE_COPY = {
  page: {
    back: '← Mẫu thêu',
    versionSuffix: 'phiên bản bất biến',
    noVersion: 'chưa có phiên bản',
    loading: 'Đang tải mẫu thêu…',
    loadFailed: 'Không tải được mẫu thêu này.',
    notFound: 'Mẫu thêu này không tồn tại.',
    retry: 'Thử lại',
  },

  readiness: {
    title: 'Điều kiện xuất bản · GRD-T01',
    footer:
      'Toàn bộ 7 điều kiện phải đạt. Máy chủ không tự sửa mẫu — nếu không đạt, mẫu giữ nguyên.',
    /** The advisory legend. The third state is the one that must never read as a pass. */
    legendChecked: 'Máy chủ kiểm tra khi xuất bản',
    labels: {
      IMMUTABLE_VERSION: 'Có phiên bản bất biến',
      SCOPE_COMPLETE: 'Phạm vi đầy đủ',
      DOCUMENT_VALID: 'Tài liệu hợp lệ (APP3-P01)',
      SCOPE_ACTIVE: 'Chuỗi Sản phẩm → Mặt → Vùng còn hiệu lực',
      PLACEMENT_MATCHES: 'Khớp vị trí (APP3-P02)',
      WITHIN_AREA: 'Nằm trong vùng thêu',
      MEDIA_ELIGIBLE: 'Ảnh đủ điều kiện',
    },
    details: {
      versionSaved: 'Đã lưu {value}',
      versionMissing: 'Chưa có phiên bản nào được lưu',
      scopePresent: '{value}',
      scopeMissing: 'Chưa gán Sản phẩm · Mặt · Vùng thêu',
      documentValid: 'Sơ đồ hợp lệ, độ phức tạp trong hạn',
      documentInvalid: 'Tài liệu không hợp lệ theo APP3-P01',
      scopeActive: 'Không có mặt/vùng bị thu hồi',
      scopeRetired: 'Mặt hoặc vùng thêu đã bị thu hồi',
      scopeNotRead: 'Chưa đọc được phạm vi',
      placementMatches: 'Placement khớp Mặt và Vùng đã chọn',
      placementMismatch: 'Placement không khớp Mặt hoặc Vùng đã chọn',
      withinArea: 'Mọi phần tử nằm trong ranh giới',
      outOfBounds: 'Có phần tử nằm ngoài ranh giới vùng thêu',
      geometryNotEvaluable: 'Không kiểm tra được — máy chủ sẽ kiểm tra khi xuất bản',
      noVersionYet: 'Không kiểm tra được — chưa có phiên bản',
      mediaNoneReferenced: 'Tài liệu không dùng ảnh nào',
      mediaCheckedOnPublish: 'Máy chủ kiểm tra khi xuất bản',
    },
  },

  actions: {
    title: 'Hành động vòng đời',
    readyHeading: 'Sẵn sàng xuất bản',
    readyBody:
      'Mẫu này đạt cả 7 điều kiện GRD-T01. Xuất bản sẽ đưa mẫu ra Studio khách hàng cho đúng vùng thêu đã gán.',
    advisoryHeading: 'Có thể xuất bản',
    advisoryBody:
      'Những điều kiện kiểm tra được ở đây đều đạt. Máy chủ vẫn chạy đủ 7 điều kiện GRD-T01 khi bạn xuất bản.',
    blockedBadge: 'Không thể xuất bản',
    blockedBody:
      'Máy chủ từ chối xuất bản và không thay đổi gì. Sửa từng mục bên trái rồi thử lại.',
    blockedCount: '{count} điều kiện chưa đạt',
    publish: 'Xuất bản mẫu thêu',
    publishNote: 'Xuất bản không tạo phiên bản mới — {value} hiện tại chính là bản được công bố.',
    unpublish: 'Gỡ xuất bản',
    unpublishNote:
      'Gỡ xuất bản đưa mẫu về DRAFT để sửa tiếp. Mọi phiên bản đã công bố vẫn được giữ nguyên.',
    publishedHeading: 'Đang xuất bản',
    publishedBody:
      'Khách hàng có thể thấy mẫu này trong Studio khi Sản phẩm · Mặt · Vùng thêu vẫn còn hiệu lực.',
    dangerZone: 'Vùng nguy hiểm',
    archive: 'Lưu trữ mẫu thêu',
    archiveNote: 'Lưu trữ là thu hồi lâu dài, không phải xoá. Phiên bản và liên kết vẫn được giữ.',
    fixListTitle: 'Cần xử lý',
    fixListFooter: 'Không có đường tắt bỏ qua điều kiện. GRD-T01 không thể rút gọn.',
  },

  archived: {
    title: 'Mẫu đã lưu trữ',
    heading: '{value} · ARCHIVED',
    body: 'Lưu trữ ngày {value} · Mọi phiên bản và lịch sử công bố vẫn còn nguyên.',
    bodyNoDate: 'Mọi phiên bản và lịch sử công bố vẫn còn nguyên.',
    reasonNote: 'Lý do lưu trữ được ghi trong nhật ký kiểm toán, không hiển thị ở đây.',
    restore: 'Khôi phục về DRAFT',
    restoreNote:
      'Khôi phục đưa mẫu về DRAFT — không xuất bản lại. Phạm vi giữ nguyên, không được sửa tự động.',
  },

  publishDialog: {
    title: 'Xuất bản “{value}”?',
    body: 'Khách hàng sẽ thấy mẫu này trong Studio cho {value}. Bạn có thể gỡ xuất bản bất cứ lúc nào.',
    bodyNoScope: 'Khách hàng sẽ thấy mẫu này trong Studio cho vùng thêu đã gán.',
    version: 'Phiên bản công bố: {value}',
    confirm: 'Xuất bản',
    cancel: 'Huỷ',
  },

  unpublishDialog: {
    title: 'Gỡ xuất bản “{value}”?',
    body: 'Mẫu sẽ không còn hiển thị với khách hàng và trở lại DRAFT để sửa tiếp. Không có phiên bản nào bị xoá.',
    confirm: 'Gỡ xuất bản',
    cancel: 'Huỷ',
  },

  archiveDialog: {
    badge: 'Hành động thu hồi',
    title: 'Lưu trữ “{value}”?',
    body: 'Mẫu sẽ biến mất khỏi Studio khách hàng ngay lập tức. Không có phiên bản nào bị xoá và có thể khôi phục sau.',
    reasonLabel: 'Lý do lưu trữ *',
    reasonHint: 'Bắt buộc, tối đa 500 ký tự. Lý do được ghi vào nhật ký kiểm toán.',
    confirm: 'Lưu trữ mẫu thêu',
    cancel: 'Huỷ',
  },

  restoreDialog: {
    badge: 'Khôi phục',
    title: 'Khôi phục “{value}” về DRAFT?',
    body: 'Mẫu trở lại DRAFT và có thể sửa tiếp — không được xuất bản lại. Phiên bản và mốc công bố cũ vẫn giữ nguyên, phạm vi không được sửa tự động. Điều kiện xuất bản chỉ được kiểm tra khi bạn xuất bản lần sau.',
    reasonLabel: 'Lý do khôi phục *',
    reasonHint: 'Bắt buộc, tối đa 500 ký tự. Lý do được ghi vào nhật ký kiểm toán.',
    confirm: 'Khôi phục về DRAFT',
    cancel: 'Huỷ',
  },

  reason: {
    blank: 'Vui lòng nhập lý do.',
    tooLong: 'Lý do tối đa 500 ký tự.',
  },

  outcome: {
    published: 'Đã xuất bản mẫu thêu. Trạng thái hiện tại: PUBLISHED.',
    unpublished: 'Đã gỡ xuất bản. Trạng thái hiện tại: DRAFT.',
    archived: 'Đã lưu trữ mẫu thêu. Trạng thái hiện tại: ARCHIVED.',
    restored: 'Đã khôi phục mẫu thêu. Trạng thái hiện tại: DRAFT.',
    working: 'Đang gửi yêu cầu…',
  },

  failure: {
    /**
     * The publish refusal. It names no condition on purpose: the wire publishes
     * no per-guard discriminator, and inventing one would tell the operator to
     * fix something the server may not have objected to.
     */
    notReady:
      'Máy chủ chưa cho xuất bản mẫu này. Mẫu thêu chưa được xuất bản và máy chủ không thay đổi gì. Xem lại các điều kiện bên trái rồi thử lại.',
    staleReloaded:
      'Mẫu thêu đã thay đổi từ lúc mở trang, nên yêu cầu không được thực hiện lại. Trạng thái mới nhất đã được tải; kiểm tra rồi chọn lại hành động.',
    staleReasonCleared:
      'Mẫu thêu đã thay đổi nên xác nhận cũ không còn hiệu lực. Nhập lại lý do nếu bạn vẫn muốn tiếp tục.',
    rejected: 'Yêu cầu không hợp lệ. Kiểm tra lại lý do rồi thử lại.',
    unauthenticated: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi thử lại.',
    missing: 'Mẫu thêu này không còn tồn tại.',
    generic: 'Không thực hiện được yêu cầu. Thử lại sau.',
  },
} as const;

/** Substitutes the single `{value}`/`{count}` placeholder the catalogue uses. */
export function withValue(template: string, value: string): string {
  return template.replace('{value}', value).replace('{count}', value);
}
