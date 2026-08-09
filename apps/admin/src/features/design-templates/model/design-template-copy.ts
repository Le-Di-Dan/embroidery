/**
 * Vietnamese copy catalog for the Admin Design Template list (`APP3-A02`).
 *
 * Reproduced from the approved nodes `FIG-ADMIN-TEMPLATELIST-DESKTOP-{DEFAULT,
 * LOADING,EMPTY,ERROR}` and `FIG-ADMIN-TEMPLATELIST-MOBILE-DEFAULT`
 * (section `596:8`).
 *
 * Three rules shape what may appear here.
 *
 * *Nothing claims a capability `APP3-B03` does not have.* No search box, no
 * sort, no page number, no total. The toolbar says so explicitly rather than
 * leaving the operator to wonder where the search field went.
 *
 * *Absence is stated, never implied.* A template with no version and a draft
 * with no placement scope each get their own sentence. An empty cell would read
 * as a rendering bug; "—" alone would read as zero.
 *
 * *No string promises an editor.* `APP3-A03` does not exist yet, so the row
 * affordance says what is missing instead of linking somewhere broken.
 */
export const DESIGN_TEMPLATE_COPY = {
  page: {
    title: 'Mẫu thêu',
    subtitleWide: 'Quản lý mẫu thiết kế dùng cho vùng thêu của sản phẩm.',
    subtitleNarrow: 'Quản lý mẫu thiết kế.',
  },

  actions: {
    create: 'Tạo mẫu thêu',
    retry: 'Thử lại',
    loadMore: 'Trang sau',
    loadingMore: 'Đang tải…',
  },

  filters: {
    label: 'Bộ lọc',
    statusLabel: 'Trạng thái',
    statusAll: 'Tất cả trạng thái',
    productLabel: 'Sản phẩm',
    productAll: 'Tất cả sản phẩm',
    /**
     * Stated on the toolbar because its absence is a contract fact, not an
     * oversight: `APP3-B03` publishes no text search, no sort and no total.
     */
    constraint:
      'Danh sách sắp xếp theo thời gian tạo, mới nhất trước. Không có tìm kiếm hay sắp xếp tuỳ chọn.',
    productUnavailable: 'Không tải được danh sách sản phẩm để lọc.',
  },

  status: {
    draft: 'Bản nháp',
    published: 'Đã xuất bản',
    archived: 'Đã lưu trữ',
    unknown: 'Không xác định',
  },

  columns: {
    name: 'Tên mẫu',
    status: 'Trạng thái',
    scope: 'Phạm vi',
    version: 'Phiên bản',
    updated: 'Cập nhật',
    actions: 'Thao tác',
  },

  row: {
    /** Truthful for a header `APP3-B03` created and `APP3-B03A` has not saved. */
    noVersion: 'Chưa có phiên bản',
    /**
     * The list projection passes no version at all, so the cell must not claim
     * one is absent — that would mislabel every published template. It says
     * where the number lives instead.
     */
    versionNotInList: 'Xem trong chi tiết mẫu',
    noScope: 'Chưa gán phạm vi',
    /**
     * A scope exists but its Product is not among the loaded filter options, so
     * only the fact can be stated — resolving the name would cost a request per
     * row, which is the N+1 the list exists to avoid.
     */
    scopeAssigned: 'Đã gán phạm vi',
    scopeOnProduct: (product: string) => `Sản phẩm: ${product}`,
    archivedAt: (at: string) => `Lưu trữ ${at}`,
  },

  editAffordance: {
    label: 'Mở trình chỉnh sửa',
    /** Why the control is inert. `APP3-A03` is not built. */
    unavailable: 'Trình chỉnh sửa mẫu sẽ có ở bước sau (APP3-A03).',
  },

  states: {
    loading: 'Đang tải danh sách mẫu thêu…',
    emptyTitle: 'Chưa có mẫu thêu nào',
    emptyBody: 'Tạo mẫu thêu đầu tiên để bắt đầu.',
    emptyFilteredTitle: 'Không có mẫu thêu phù hợp',
    emptyFilteredBody: 'Thử đổi bộ lọc hoặc tạo mẫu thêu mới.',
    errorTitle: 'Không tải được danh sách mẫu thêu',
    errorBody: 'Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.',
    /** A malformed cursor is a bounded, non-restarting failure. */
    cursorErrorTitle: 'Không tải được trang tiếp theo',
    cursorErrorBody: 'Liên kết trang không hợp lệ. Vui lòng tải lại danh sách.',
    loadMoreFailed: 'Không tải thêm được. Vui lòng thử lại.',
  },

  create: {
    title: 'Tạo mẫu thêu',
    help: 'Mẫu mới được tạo ở trạng thái bản nháp và chưa có phiên bản nào.',
    nameLabel: 'Tên mẫu',
    nameHelp: 'Tên hiển thị cho nhân viên. Tối đa 120 ký tự.',
    descriptionLabel: 'Mô tả',
    descriptionHelp: 'Không bắt buộc. Tối đa 2.000 ký tự.',
    /**
     * The slug is server-derived, so it is shown as a consequence and never
     * offered as an input.
     */
    slugNote: 'Đường dẫn công khai được máy chủ tạo từ tên mẫu.',
    submit: 'Tạo mẫu',
    submitting: 'Đang tạo…',
    cancel: 'Huỷ',
    created: (name: string) => `Đã tạo mẫu “${name}” ở trạng thái bản nháp, chưa có phiên bản.`,
    nameRequired: 'Vui lòng nhập tên mẫu.',
    nameTooLong: 'Tên mẫu quá dài.',
    descriptionTooLong: 'Mô tả quá dài.',
    failedTitle: 'Không tạo được mẫu thêu',
    failedBody: 'Đã xảy ra lỗi khi tạo. Nội dung bạn nhập vẫn được giữ nguyên.',
    /**
     * The create `409` is *"no template address could be reserved"*, not "that
     * name is taken" — the server appends the new Template's own id when a
     * derived slug collides, so two templates may share a name. Asking for a
     * different name would name the wrong cause and suggest a fix that does not
     * apply; a retry gets a new id and therefore a new address.
     */
    addressUnreservedTitle: 'Chưa cấp được đường dẫn cho mẫu',
    addressUnreservedBody: 'Máy chủ chưa cấp được đường dẫn công khai. Vui lòng thử lại.',
  },
} as const;
