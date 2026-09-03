/**
 * Vietnamese copy catalog for the Admin product form/detail (`APP2-A03`).
 *
 * Every string that appears in an approved node is reproduced verbatim from
 * `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-{DEFAULT,VALIDATION,SAVING}` (`434:20`,
 * `436:37`, `436:140`), `FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP` (`437:73`),
 * `FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT` (`438:90`) and the normative handoff
 * `FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF` (`521:284`), approved under
 * `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`.
 *
 * Create mode reuses the edit shell with fewer groups, exactly as the handoff
 * specifies, so its labels live beside the edit labels rather than in a second
 * catalog.
 *
 * Deliberately absent: `Phiên bản`, `SKU`, `Điều kiện xuất bản`, `Tới bước xuất
 * bản`, `Xuất bản`, `Gỡ xuất bản`, `Lưu trữ`, `Xoá`. Those capabilities do not
 * exist in `APP2-B02`, so the words for them must not exist here either.
 */
import type { ProductSaveFailure } from './product-conflict';

export const PRODUCT_FORM_COPY = {
  create: {
    title: 'Sản phẩm mới',
    subtitle: 'Tạo bản nháp với thông tin cơ bản. Giá và ảnh được thêm ở bước chỉnh sửa.',
    submit: 'Tạo bản nháp',
    cancel: 'Huỷ',
    submitting: 'Đang tạo…',
    created: 'Đã tạo bản nháp sản phẩm.',
    failedTitle: 'Chưa thể tạo bản nháp',
    failedBody: 'Bản nháp chưa được tạo. Hãy kiểm tra thông tin và thử lại.',
  },

  edit: {
    subtitle:
      'Bản nháp chưa hiển thị công khai. Thay đổi chỉ được lưu khi bạn chọn “Lưu thay đổi”.',
    subtitleNarrow: 'Bản nháp chưa hiển thị công khai.',
    save: 'Lưu thay đổi',
    cancel: 'Huỷ thay đổi',
    saving: 'Đang lưu…',
    savingTitle: 'Đang lưu thay đổi…',
    savingHelp: 'Vui lòng không đóng trang cho tới khi lưu xong.',
    saveFailedTitle: 'Chưa thể lưu thay đổi',
    saveFailedBody: 'Thay đổi chưa được lưu. Hãy thử lại sau giây lát.',
    /** The mobile frame's closing note; a boundary statement, not a control. */
    savePublishNote:
      'Lưu thay đổi và Xuất bản là hai hành động tách biệt. Xuất bản thuộc bước sau.',
  },

  detail: {
    loading: 'Đang tải sản phẩm…',
    notFoundTitle: 'Không tìm thấy sản phẩm',
    notFoundBody: 'Sản phẩm này không tồn tại hoặc đã bị gỡ khỏi danh sách.',
    notEditableTitle: 'Sản phẩm không thể chỉnh sửa',
    notEditableBody: 'Chỉ bản nháp mới có thể chỉnh sửa tại màn hình này.',
    unavailableTitle: 'Không thể tải sản phẩm',
    unavailableBody: 'Sản phẩm hiện chưa tải được. Hãy thử lại sau giây lát.',
    retry: 'Thử lại',
    backToList: 'Về danh sách sản phẩm',
  },

  groups: {
    basic: 'Thông tin cơ bản',
    category: 'Danh mục',
    price: 'Giá',
    media: 'Ảnh sản phẩm',
    /** The mobile frame merges the last three groups into one card. */
    categoryPriceMedia: 'Danh mục, Giá & Ảnh',
  },

  fields: {
    nameLabel: 'Tên sản phẩm',
    nameHelp: 'Tên hiển thị công khai khi sản phẩm được xuất bản.',
    namePlaceholder: 'Nhập tên sản phẩm',
    descriptionLabel: 'Mô tả',
    descriptionHelp: 'Mô tả ngắn hiển thị trên trang sản phẩm công khai.',
    categoryLabel: 'Danh mục sản phẩm',
    categoryHelp: 'Chọn một danh mục để sản phẩm xuất hiện đúng nhóm.',
    categoryPlaceholder: 'Chọn danh mục',
    /**
     * The product's category is no longer assignable (`APP12-A01`).
     *
     * Shown when the category a product is already filed under has since been
     * drafted back or archived, so it is not among the options. The real name
     * is interpolated — the record has a category, and denying it with
     * `Không xác định`, or quietly moving the product to another one, would
     * both be lies. Reassignment is the operator's, through this same select.
     */
    categoryUnassignable: (name: string): string =>
      'Danh mục hiện tại "' +
      name +
      '" không còn nhận sản phẩm mới. Chọn danh mục khác trước khi lưu.',
    /** The same situation when the inventory has no row for the stored slug at all. */
    categoryMissing: 'Danh mục hiện tại không còn tồn tại. Chọn danh mục khác trước khi lưu.',
    priceLabel: 'Giá cơ bản',
    priceHelp: 'Số nguyên đồng, không dấu phân cách. Để trống nếu chưa xác định giá.',
  },

  validation: {
    summaryTitle: 'Chưa thể lưu thay đổi',
    createSummaryTitle: 'Chưa thể tạo bản nháp',
    nameRequired: 'Tên sản phẩm không được để trống.',
    categoryRequired: 'Hãy chọn một danh mục cho sản phẩm.',
    priceInvalid: 'Giá cơ bản phải là số nguyên đồng, không âm.',
  },

  status: {
    cardTitle: 'Trạng thái',
    draftNote:
      'Bản nháp không hiển thị với khách truy cập. Sản phẩm chỉ công khai sau khi được xuất bản.',
  },

  slug: {
    cardTitle: 'Đường dẫn',
    note: 'Do hệ thống tạo và không thay đổi, kể cả khi đổi tên sản phẩm.',
    /** The mobile frame states path and immutability on one line. */
    inlinePrefix: 'Đường dẫn: ',
    inlineSuffix: ' · do hệ thống tạo, không thay đổi.',
  },

  media: {
    pick: 'Chọn ảnh',
    help: 'Chỉ ảnh ở trạng thái “Sẵn sàng” mới có thể chọn. Ảnh đầu tiên là ảnh đại diện; dùng “Di chuyển trước/sau” để đổi thứ tự.',
    helpNarrow: 'Chỉ ảnh “Sẵn sàng” mới chọn được. Ảnh đầu tiên là ảnh đại diện.',
    roleThumbnail: 'Ảnh đại diện',
    roleGallery: 'Ảnh thư viện',
    moveEarlier: 'Di chuyển trước',
    moveLater: 'Di chuyển sau',
    remove: 'Gỡ ảnh',
    empty: 'Chưa chọn ảnh nào cho sản phẩm này.',
    listLabel: 'Ảnh đã chọn',
    /** Announced after a keyboard reorder so the new position is perceivable. */
    reordered: 'Đã đổi thứ tự ảnh.',
    removed: 'Đã gỡ ảnh khỏi sản phẩm.',
  },

  picker: {
    title: 'Chọn ảnh cho sản phẩm',
    help: 'Chỉ hiển thị ảnh ở trạng thái “Sẵn sàng”. Ảnh đang xử lý hoặc không thể sử dụng sẽ không xuất hiện ở đây. Danh sách tải theo từng trang.',
    close: 'Đóng',
    confirm: 'Dùng ảnh đã chọn',
    cancel: 'Huỷ',
    statusReady: 'Sẵn sàng',
    loading: 'Đang tải danh sách ảnh…',
    emptyTitle: 'Chưa có ảnh nào sẵn sàng',
    emptyBody: 'Hãy tải ảnh lên ở màn hình Tài sản hình ảnh trước khi chọn.',
    unavailableTitle: 'Không thể tải danh sách ảnh',
    unavailableBody: 'Danh sách ảnh hiện chưa tải được. Hãy thử lại sau giây lát.',
    retry: 'Thử lại',
    loadMore: 'Tải thêm tài sản',
    loadingMore: 'Đang tải thêm…',
    loadMoreFailed: 'Không thể tải thêm tài sản.',
    /** Rendered with the selected count; the contract exposes no total. */
    selectionCount: (count: number) => `Đã chọn ${count} ảnh`,
  },

  conflict: {
    title: 'Sản phẩm đã được cập nhật ở nơi khác',
    body: 'Dữ liệu trên máy chủ đã thay đổi kể từ lần bạn mở sản phẩm này. Hãy tải lại để xem phiên bản mới nhất trước khi tiếp tục chỉnh sửa.',
    reload: 'Tải lại dữ liệu',
    close: 'Đóng',
  },

  unsaved: {
    title: 'Bỏ các thay đổi chưa lưu?',
    body: 'Những thay đổi trên màn hình này sẽ không được lưu.',
    leave: 'Rời khỏi trang',
    stay: 'Tiếp tục chỉnh sửa',
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
    /** There is no media-delivery contract, so no tile ever shows real pixels. */
    placeholder: 'Chưa có ảnh xem trước',
  },
} as const;

/**
 * What a failed save is allowed to say, per classified outcome.
 *
 * The screen never renders a server message, so anything it cannot name falls
 * back to the generic pair rather than to whatever the backend happened to
 * return. Two outcomes get their own words because the operator's next step
 * genuinely differs: a product that left the draft state cannot be saved from
 * here at all, and an ineligible image is fixed by changing the selection.
 *
 * `version-conflict` maps to the generic pair on purpose — that outcome is
 * carried by the approved dialog, and the banner is only what remains after the
 * operator dismisses it.
 */
export const PRODUCT_SAVE_FAILURE_COPY: Readonly<
  Record<ProductSaveFailure, { readonly title: string; readonly body: string }>
> = {
  'version-conflict': {
    title: PRODUCT_FORM_COPY.edit.saveFailedTitle,
    body: PRODUCT_FORM_COPY.edit.saveFailedBody,
  },
  'not-editable': {
    title: PRODUCT_FORM_COPY.detail.notEditableTitle,
    body: PRODUCT_FORM_COPY.detail.notEditableBody,
  },
  'media-unavailable': {
    title: 'Chưa thể lưu ảnh đã chọn',
    body: 'Một ảnh trong lựa chọn không còn ở trạng thái “Sẵn sàng”. Hãy chọn lại ảnh rồi lưu thay đổi.',
  },
  generic: {
    title: PRODUCT_FORM_COPY.edit.saveFailedTitle,
    body: PRODUCT_FORM_COPY.edit.saveFailedBody,
  },
} as const;
