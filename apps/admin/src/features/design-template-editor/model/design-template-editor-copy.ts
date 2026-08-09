/**
 * Vietnamese copy catalog for the Admin Design Template editor (`APP3-A03`).
 *
 * Reproduced from the approved nodes `FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-
 * {DEFAULT,TEXTSELECTED,SAVING,CONFLICT}`, `FIG-ADMIN-TEMPLATEEDITOR-MOBILE-
 * READONLY` and `FIG-ADMIN-TEMPLATEEDITOR-NARROW-1280` (section `596:9`,
 * `618:3`).
 *
 * Four rules shape what may appear here.
 *
 * *The conflict never reads as "your change won".* `APP3-D01` §I.3 makes this a
 * design decision rather than a wording preference: the dialog states that the
 * server was **not** overwritten, offers exactly two choices, and says plainly
 * that keeping the local draft keeps it in this browser only.
 *
 * *Nothing claims a capability that has not shipped.* Adding a Template image
 * needs a `TEMPLATE_SOURCE` Asset, and no accepted API creates one. The control
 * is drawn, disabled and labelled with what it waits for — `APP3-D01` §I.1's
 * disabled-with-a-reason rule — never hidden and never wired to a substitute.
 *
 * *An absence is stated, never implied.* A Template with no placement scope, an
 * image whose bytes cannot be shown, and a Product whose Side no longer resolves
 * each get their own sentence.
 *
 * *No string exposes an internal.* No storage key, bucket, provider message,
 * SQL fragment or error code reaches this catalog; the conflict names the
 * situation, not the wire format.
 */
export const DESIGN_TEMPLATE_EDITOR_COPY = {
  page: {
    backToList: 'Danh sách mẫu thêu',
    /** The one `APP3-A04` affordance: navigation, never a lifecycle command. */
    managePublication: 'Quản lý xuất bản',
    loading: 'Đang tải mẫu thêu…',
    notFoundTitle: 'Không tìm thấy mẫu thêu',
    notFoundBody: 'Mẫu thêu này không tồn tại hoặc đã bị xoá khỏi danh sách.',
    loadFailedTitle: 'Không tải được mẫu thêu',
    loadFailedBody: 'Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.',
    retry: 'Thử lại',
  },

  status: {
    draft: 'Bản nháp',
    published: 'Đã xuất bản',
    archived: 'Đã lưu trữ',
    unknown: 'Không xác định',
  },

  version: {
    /** Truthful for a header `APP3-B03` created and `APP3-B03A` has not saved. */
    none: 'Chưa có phiên bản',
    current: (version: number) => `Phiên bản hiện tại: v${String(version)}`,
  },

  save: {
    action: 'Lưu phiên bản',
    /** The chip. Four states, and `conflict` is not a kind of error. */
    chipSaved: 'Đã lưu',
    chipUnsaved: 'Chưa lưu',
    chipSaving: 'Đang lưu…',
    chipConflict: 'Xung đột phiên bản',
    /** Announced politely so a save does not interrupt an operator mid-edit. */
    announcedSaved: (version: number) => `Đã lưu phiên bản v${String(version)}.`,
    announcedSaving: 'Đang lưu phiên bản…',
    failedTitle: 'Không lưu được phiên bản',
    failedBody: 'Đã xảy ra lỗi khi lưu. Bản nháp của bạn vẫn được giữ nguyên.',
    rejectedTitle: 'Máy chủ từ chối tài liệu này',
    rejectedBody: 'Tài liệu chưa hợp lệ để lưu. Bản nháp của bạn vẫn được giữ nguyên.',
    notEditableTitle: 'Mẫu thêu này không còn ở trạng thái bản nháp',
    notEditableBody:
      'Chỉ bản nháp mới lưu được phiên bản mới. Vui lòng tải lại để xem trạng thái mới nhất.',
  },

  conflict: {
    title: 'Máy chủ đã có phiên bản mới hơn',
    /** The load-bearing sentence: nothing of the operator's was written. */
    notOverwritten:
      'Máy chủ chưa ghi đè bất cứ thay đổi nào. Phiên bản trên máy chủ vẫn nguyên vẹn.',
    body: 'Một phiên bản mới đã được lưu sau khi bạn mở mẫu này, nên bản nháp của bạn không còn dựa trên phiên bản hiện tại.',
    noMerge: 'Hệ thống không tự động gộp hai bản. Bạn cần chọn một trong hai.',
    reload: 'Tải phiên bản mới nhất',
    reloadHelp: 'Thay thế bản nháp trên máy bạn bằng phiên bản mới nhất của máy chủ.',
    keepLocal: 'Giữ bản nháp trên máy',
    keepLocalHelp:
      'Giữ nội dung bạn đang sửa. Bản nháp chỉ nằm trong trình duyệt này và chưa lưu được.',
    /** Shown persistently after the dialog closes, so nothing looks saved. */
    banner:
      'Bản nháp của bạn dựa trên một phiên bản cũ. Hãy tải lại phiên bản mới nhất trước khi lưu.',
    reloadDiscardTitle: 'Bỏ bản nháp trên máy?',
    reloadDiscardBody: 'Tải phiên bản mới nhất sẽ thay thế toàn bộ nội dung bạn đang sửa.',
    reloadDiscardConfirm: 'Tải lại và bỏ bản nháp',
    reloadDiscardCancel: 'Giữ bản nháp',
  },

  unsaved: {
    title: 'Rời khỏi trang khi chưa lưu?',
    body: 'Bản nháp của bạn chưa được lưu lên máy chủ và sẽ mất nếu rời khỏi trang.',
    leave: 'Rời khỏi trang',
    stay: 'Ở lại và tiếp tục sửa',
  },

  readOnly: {
    publishedTitle: 'Mẫu thêu đã xuất bản — chỉ xem',
    archivedTitle: 'Mẫu thêu đã lưu trữ — chỉ xem',
    body: 'Chỉ mẫu ở trạng thái bản nháp mới chỉnh sửa được. Các thao tác vòng đời thuộc bước sau (APP3-A04).',
  },

  mobile: {
    title: 'Chỉnh sửa mẫu thêu cần màn hình lớn',
    body: 'Trình chỉnh sửa mẫu chỉ dùng được trên máy tính. Trên màn hình nhỏ, trang này chỉ hiển thị thông tin.',
  },

  scope: {
    title: 'Phạm vi',
    none: 'Chưa gán phạm vi',
    /**
     * The unscoped Template that can **no longer** be assigned one.
     *
     * `APP3-B03B` admits an initial assignment only for a versionless `DRAFT`,
     * so this state is a Template that lost its eligibility — it has a version,
     * or it left `DRAFT`. Until `APP3-A03-C1` this sentence said no assignment
     * operation existed at all, which was true then and would be a lie now.
     *
     * The assignable case never reaches here: it gets the selector instead.
     */
    noneBody:
      'Mọi tài liệu thiết kế đều cần một phạm vi (sản phẩm · mặt · vùng thêu). Chỉ gán được phạm vi cho bản nháp chưa có phiên bản nào, và mẫu này không còn ở trạng thái đó.',
    unresolvedTitle: 'Không xác định được phạm vi',
    unresolvedBody:
      'Mặt hoặc vùng thêu được mẫu này tham chiếu không còn tồn tại trên sản phẩm. Bản nháp của bạn vẫn được giữ nguyên.',
    loading: 'Đang tải phạm vi…',
    failedTitle: 'Không tải được phạm vi',
    failedBody: 'Đã xảy ra lỗi khi tải thông tin sản phẩm. Vui lòng thử lại.',
    product: (name: string) => `Sản phẩm: ${name}`,
    side: (name: string) => `Mặt: ${name}`,
    area: (name: string) => `Vùng thêu: ${name}`,
    canvas: (width: number, height: number) => `Khung vẽ ${String(width)}×${String(height)} px`,
  },

  /**
   * The one-time initial scope assignment (`APP3-A03-C1`).
   *
   * The copy never says "change" or "edit" anywhere: `APP3-B03B` publishes no
   * rescope, so a word implying one would promise a capability that does not
   * exist. It says *assign*, once, and afterwards the scope is context.
   */
  assign: {
    title: 'Chọn phạm vi cho mẫu',
    intro:
      'Mẫu này chưa có phạm vi. Chọn sản phẩm, mặt và vùng thêu để bắt đầu thiết kế. Phạm vi chỉ gán được một lần và không đổi được sau đó.',
    productLabel: 'Sản phẩm',
    productPlaceholder: 'Chọn sản phẩm',
    productLoading: 'Đang tải danh sách sản phẩm…',
    productFailedTitle: 'Không tải được danh sách sản phẩm',
    productFailedBody: 'Đã xảy ra lỗi khi tải sản phẩm. Vui lòng thử lại.',
    productEmpty: 'Chưa có sản phẩm nào để chọn.',
    sideLabel: 'Mặt sản phẩm',
    sidePlaceholder: 'Chọn mặt',
    sideLoading: 'Đang tải mặt và vùng thêu…',
    sideFailedTitle: 'Không tải được mặt và vùng thêu',
    sideFailedBody: 'Đã xảy ra lỗi khi tải thông tin sản phẩm. Vui lòng thử lại.',
    /** Truthful: retired rows exist but may not be chosen for a *new* scope. */
    sideEmpty: 'Sản phẩm này chưa có mặt nào đang dùng được.',
    areaLabel: 'Vùng thêu',
    areaPlaceholder: 'Chọn vùng thêu',
    areaEmpty: 'Mặt này chưa có vùng thêu nào đang dùng được.',
    submit: 'Gán phạm vi',
    submitting: 'Đang gán phạm vi…',
    /** Why the button is disabled, stated rather than left to be guessed. */
    incomplete: 'Chọn đủ sản phẩm, mặt và vùng thêu để tiếp tục.',
    retry: 'Thử lại',
    assignedAnnouncement: 'Đã gán phạm vi. Bạn có thể bắt đầu thiết kế.',
    notAssignableTitle: 'Mẫu này không còn gán được phạm vi',
    notAssignableBody:
      'Mẫu đã được gán phạm vi ở nơi khác, đã có phiên bản, hoặc không còn là bản nháp. Nội dung hiển thị đã được cập nhật theo máy chủ.',
    invalidTitle: 'Phạm vi không hợp lệ',
    invalidBody:
      'Máy chủ không chấp nhận tổ hợp sản phẩm · mặt · vùng thêu này. Vui lòng chọn lại.',
    failedTitle: 'Không gán được phạm vi',
    failedBody: 'Đã xảy ra lỗi khi gán phạm vi. Lựa chọn của bạn vẫn được giữ nguyên.',
  },

  background: {
    loading: 'Đang tải ảnh nền…',
    unavailable: 'Mặt này chưa có ảnh nền được duyệt.',
    failed: 'Không tải được ảnh nền.',
    retry: 'Thử lại',
  },

  stage: {
    title: 'Khung thiết kế',
    label: (width: number, height: number) =>
      `Khung thiết kế ${String(width)}×${String(height)} px`,
    empty: 'Tài liệu chưa có phần tử nào. Thêm chữ để bắt đầu.',
    outOfBounds: 'Nằm ngoài vùng thêu',
    /**
     * A draft may legitimately sit outside the area — `APP3-B04` owns the
     * publication guard, and refusing a save here would be a second, weaker
     * definition of publishable.
     */
    outOfBoundsNote:
      'Phần tử nằm ngoài vùng thêu vẫn lưu được ở bản nháp. Điều kiện xuất bản được kiểm tra ở bước xuất bản.',
  },

  layers: {
    title: 'Lớp',
    empty: 'Chưa có lớp nào.',
    unnamedText: 'Chữ',
    typeText: 'Chữ',
    typeImage: 'Ảnh',
    typeShape: 'Hình',
    typeFreehand: 'Nét vẽ',
    typeGroup: 'Nhóm',
    hidden: 'Đang ẩn',
    locked: 'Đang khoá',
    selected: 'Đang chọn',
    /** Document order is bottom-first; the list shows top-first, and says so. */
    orderNote: 'Lớp trên cùng hiển thị trước.',
    addText: 'Thêm chữ',
    addTextLimit: 'Đã đạt giới hạn số phần tử của tài liệu.',
    remove: 'Xoá lớp',
  },

  image: {
    /** Visible, disabled, and labelled with what it waits for. */
    add: 'Thêm ảnh mẫu',
    addDisabled: 'Thêm ảnh mẫu chưa khả dụng.',
    addDisabledReason: 'Đang chờ luồng tạo tài sản TEMPLATE_SOURCE.',
    /**
     * There is no authenticated Admin route that serves Template draft asset
     * bytes, so the element is drawn as an honest empty frame. Its Asset id is
     * deliberately not used as a label — an internal identifier is not a name.
     */
    placeholder: 'Ảnh mẫu (chưa xem trước được)',
    placeholderNote: 'Chưa có kênh xem trước ảnh mẫu cho bản nháp trong trang quản trị.',
  },

  inspector: {
    title: 'Thuộc tính',
    none: 'Chọn một lớp để xem thuộc tính.',
    unsupported: 'Loại phần tử này chưa chỉnh sửa được trong trình quản trị.',
    textSection: 'Nội dung chữ',
    transformSection: 'Vị trí và kích thước',
    textLabel: 'Nội dung',
    fontLabel: 'Phông chữ',
    fontSizeLabel: 'Cỡ chữ (px)',
    fontWeightLabel: 'Độ đậm',
    fontStyleLabel: 'Kiểu chữ',
    fontStyleNormal: 'Thường',
    fontStyleItalic: 'Nghiêng',
    alignLabel: 'Căn lề',
    alignLeft: 'Trái',
    alignCenter: 'Giữa',
    alignRight: 'Phải',
    fillLabel: 'Màu chữ',
    xLabel: 'X (px)',
    yLabel: 'Y (px)',
    widthLabel: 'Chiều rộng (px)',
    heightLabel: 'Chiều cao (px)',
    rotationLabel: 'Xoay (độ)',
    invalidNumber: 'Giá trị không hợp lệ.',
    /** The controlled registry is the only source of a font (IMP-D044 PO-10). */
    fontNote: 'Chỉ dùng được phông chữ trong danh mục đã duyệt.',
  },
} as const;
