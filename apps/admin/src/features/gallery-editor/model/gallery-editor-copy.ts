/**
 * Every operator-facing string on the create bootstrap and the gallery editor
 * (`868:909`, `870:1104`, `870:1187`, `870:1274`, `870:1368`).
 *
 * One catalog per concern, so no component hard-codes copy (CLAUDE.md §5) and
 * the screen's vocabulary can be reviewed as a whole. Media and picker strings
 * live beside them in `gallery-media-copy.ts`; the three **status** labels are
 * in neither, because `APP11-A01` already owns them and an entry must not be
 * named one thing in the list and another in the editor.
 *
 * ### Only what an operator can act on
 *
 * This catalog carries no endpoint name, no contract field (`expectedUpdatedAt`,
 * `assetIds`, `display_order`), no DTO name, no checkpoint identifier and no
 * note explaining why the screen is built the way it is. Those are engineering
 * facts: they belong in these comments and in the completion report, and they
 * are noise to an operator authoring a gallery entry. Every string below is a
 * thing the operator is being told, asked, or offered.
 *
 * The error sentences are chosen by failure *classification* alone. A server
 * `message`, `code`, HTTP status or `requestId` is never rendered.
 */
export const GALLERY_EDITOR_COPY = {
  create: {
    /** The action `866:905` and `867:907` draw on the list. */
    open: 'Tạo mục mới',
    title: 'Tạo mục bộ sưu tập',
    help: 'Mục mới là bản nháp. Ảnh, sản phẩm liên kết và xuất bản làm ở bước sau.',
    submit: 'Tạo mục',
    submitting: 'Đang tạo…',
    cancel: 'Huỷ',
    fields: {
      title: 'Tên mục',
      slug: 'Đường dẫn',
      slugHelp: 'Chữ thường không dấu, số và gạch ngang. Không đổi được sau khi tạo.',
      description: 'Mô tả',
      displayOrder: 'Thứ tự hiển thị',
      displayOrderHelp: 'Số nhỏ hơn đứng trước.',
      isIndexable: 'Cho phép lập chỉ mục tìm kiếm',
    },
    /** Offered, never applied silently — the operator edits it before submit. */
    suggestSlug: 'Gợi ý từ tên mục',
    validation: {
      summaryTitle: 'Hãy kiểm tra lại các thông tin sau',
      titleRequired: 'Hãy nhập tên mục.',
      slugRequired: 'Hãy nhập đường dẫn.',
      slugInvalid: 'Đường dẫn chỉ gồm chữ thường không dấu, số và gạch ngang.',
      descriptionRequired: 'Hãy nhập mô tả.',
      displayOrderInvalid: 'Thứ tự hiển thị phải là số nguyên không âm.',
    },
    failure: {
      slugConflict: {
        title: 'Đường dẫn đã được dùng',
        body: 'Một mục khác đang dùng đường dẫn này. Hãy chọn đường dẫn khác.',
      },
      invalid: {
        title: 'Không thể tạo mục',
        body: 'Thông tin chưa hợp lệ. Hãy kiểm tra lại.',
      },
      unauthenticated: {
        title: 'Phiên đăng nhập đã hết hạn',
        body: 'Đăng nhập lại để tiếp tục. Thông tin vừa nhập vẫn còn.',
      },
      generic: {
        title: 'Không thể tạo mục',
        body: 'Đã xảy ra lỗi. Chưa có mục nào được tạo.',
      },
    },
  },

  detail: {
    breadcrumb: 'Quản trị / Bộ sưu tập',
    backToList: 'Về danh sách',
    loading: 'Đang tải mục bộ sưu tập…',
    notFoundTitle: 'Không tìm thấy mục bộ sưu tập',
    notFoundBody: 'Mục này không tồn tại hoặc đã bị gỡ.',
    unavailableTitle: 'Không thể tải mục bộ sưu tập',
    unavailableBody: 'Đã xảy ra lỗi khi tải. Không có gì thay đổi.',
    unauthenticatedTitle: 'Phiên đăng nhập đã hết hạn',
    unauthenticatedBody: 'Đăng nhập lại để tiếp tục.',
    retry: 'Thử lại',
    signIn: 'Đăng nhập lại',
  },

  authoring: {
    groupTitle: 'Thông tin mục',
    seoGroupTitle: 'Tối ưu tìm kiếm',
    save: 'Lưu thay đổi',
    saving: 'Đang lưu…',
    saved: 'Đã lưu thay đổi.',
    discard: 'Huỷ thay đổi',
    fields: {
      title: 'Tên mục',
      slug: 'Đường dẫn',
      /** The approved read-only explanation. No DTO or endpoint is named. */
      slugLocked: 'Đường dẫn được cố định sau khi tạo.',
      description: 'Mô tả',
      displayOrder: 'Thứ tự hiển thị',
      displayOrderHelp: 'Số nhỏ hơn đứng trước.',
      seoTitle: 'Tiêu đề tìm kiếm',
      seoTitleHelp: 'Để trống sẽ dùng tên mục.',
      seoDescription: 'Mô tả tìm kiếm',
      seoDescriptionHelp: 'Để trống sẽ dùng mô tả của mục.',
      isIndexable: 'Cho phép lập chỉ mục tìm kiếm',
      /**
       * States the real consequence, and states that it is not a publication
       * gate — because the server does not treat it as one.
       */
      isIndexableHelp:
        'Tắt sẽ ẩn trang khỏi kết quả tìm kiếm và sơ đồ trang. Mục vẫn xuất bản được.',
    },
    validation: {
      summaryTitle: 'Hãy kiểm tra lại các thông tin sau',
      titleRequired: 'Hãy nhập tên mục.',
      displayOrderInvalid: 'Thứ tự hiển thị phải là số nguyên không âm.',
      seoTitleTooLong: 'Tiêu đề tìm kiếm quá dài.',
      seoDescriptionTooLong: 'Mô tả tìm kiếm quá dài.',
    },
    failure: {
      invalid: {
        title: 'Không thể lưu thay đổi',
        body: 'Thông tin chưa hợp lệ. Hãy kiểm tra lại rồi lưu.',
      },
      notFound: {
        title: 'Không thể lưu thay đổi',
        body: 'Mục này không còn tồn tại. Hãy quay lại danh sách.',
      },
      unauthenticated: {
        title: 'Phiên đăng nhập đã hết hạn',
        body: 'Đăng nhập lại để tiếp tục. Thay đổi của bạn vẫn còn.',
      },
      generic: {
        title: 'Không thể lưu thay đổi',
        body: 'Đã xảy ra lỗi. Thay đổi của bạn vẫn còn trên màn hình.',
      },
    },
  },

  linkedProduct: {
    groupTitle: 'Sản phẩm liên kết',
    help: 'Tuỳ chọn. Không liên kết vẫn xuất bản được.',
    none: 'Chưa liên kết',
    choose: 'Chọn sản phẩm',
    change: 'Đổi sản phẩm',
    clear: 'Bỏ liên kết',
    /** Shown while the linked product's own name is still being read. */
    resolving: 'Đang tải tên…',
    /** Never the raw identifier: a truthful placeholder instead. */
    unresolved: 'Đã liên kết — không tải được tên',
    picker: {
      title: 'Chọn sản phẩm để liên kết',
      help: 'Chọn một sản phẩm. Bỏ liên kết được bất cứ lúc nào.',
      loading: 'Đang tải danh sách sản phẩm…',
      emptyTitle: 'Chưa có sản phẩm nào',
      emptyBody: 'Tạo sản phẩm ở mục Sản phẩm trước.',
      unavailableTitle: 'Không thể tải danh sách sản phẩm',
      unavailableBody: 'Đã xảy ra lỗi khi tải danh sách.',
      loadMore: 'Tải thêm',
      loadingMore: 'Đang tải…',
      loadMoreFailed: 'Không tải thêm được. Các mục đã tải vẫn còn.',
      retry: 'Thử lại',
      cancel: 'Đóng',
      select: 'Chọn',
    },
  },

  publication: {
    groupTitle: 'Xuất bản',
    statusLabel: 'Trạng thái',
    readyTitle: 'Sẵn sàng xuất bản',
    readyBody: 'Mục đã đủ thông tin bắt buộc.',
    blockedTitle: 'Chưa thể xuất bản',
    blockedBody: 'Hoàn tất các mục sau rồi lưu:',
    publishedTitle: 'Đang hiển thị công khai',
    publishedBody: 'Mục đang hiển thị trong bộ sưu tập công khai.',
    archivedTitle: 'Mục đã lưu trữ',
    /** Truthful about what this build can do, without naming a missing API. */
    archivedBody: 'Mục đã lưu trữ: không xuất bản, gỡ xuất bản hay đổi ảnh được.',
    requirements: {
      title: 'Có tên mục',
      slug: 'Có đường dẫn',
      description: 'Có mô tả',
      asset: 'Có ít nhất một ảnh đã lưu',
    },
    /** Shown while local edits mean the persisted state is not what is on screen. */
    unsavedTitle: 'Còn thay đổi chưa lưu',
    unsavedBody: 'Lưu thay đổi trước khi xuất bản hoặc gỡ xuất bản.',
    publish: 'Xuất bản',
    publishing: 'Đang xuất bản…',
    published: 'Đã xuất bản mục.',
    unpublish: 'Gỡ xuất bản',
    unpublishing: 'Đang gỡ xuất bản…',
    unpublished: 'Đã gỡ xuất bản mục.',
    confirmUnpublish: {
      title: 'Gỡ xuất bản mục này?',
      body: 'Mục trở lại bản nháp và không còn hiển thị công khai. Ảnh, mô tả và thông tin tìm kiếm giữ nguyên. Đây không phải là xoá.',
      confirm: 'Gỡ xuất bản',
      cancel: 'Giữ nguyên',
    },
    failure: {
      notReady: {
        title: 'Chưa thể xuất bản',
        body: 'Mục còn thiếu thông tin bắt buộc. Xem danh sách bên dưới.',
      },
      notAllowed: {
        title: 'Không thực hiện được',
        body: 'Trạng thái hiện tại không cho phép thao tác này.',
      },
      notFound: {
        title: 'Không thực hiện được',
        body: 'Mục này không còn tồn tại. Hãy quay lại danh sách.',
      },
      unauthenticated: {
        title: 'Phiên đăng nhập đã hết hạn',
        body: 'Đăng nhập lại để tiếp tục.',
      },
      generic: {
        title: 'Không thực hiện được',
        body: 'Đã xảy ra lỗi. Trạng thái của mục không thay đổi.',
      },
    },
  },

  conflict: {
    title: 'Mục bộ sưu tập đã thay đổi',
    body: 'Mục bộ sưu tập đã thay đổi ở nơi khác. Tải lại dữ liệu mới nhất trước khi tiếp tục.',
    /** Named separately so the operator knows reloading is not free. */
    bodyWithChanges:
      'Mục bộ sưu tập đã thay đổi ở nơi khác. Tải lại dữ liệu mới nhất trước khi tiếp tục — thay đổi chưa lưu sẽ bị bỏ.',
    reload: 'Tải lại',
    close: 'Để sau',
  },

  unsaved: {
    title: 'Rời khỏi trang khi chưa lưu?',
    body: 'Bạn có thay đổi chưa lưu. Rời trang sẽ bỏ các thay đổi này.',
    stay: 'Ở lại',
    leave: 'Rời khỏi trang',
  },
} as const;
