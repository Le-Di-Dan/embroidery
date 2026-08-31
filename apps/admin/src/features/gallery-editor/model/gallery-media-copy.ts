/**
 * Every operator-facing string in the editor's media section and its two
 * pickers (`870:926`).
 *
 * Kept apart from `gallery-editor-copy.ts` because the media half is a distinct
 * vocabulary with its own failure bands, and because one catalog holding both
 * would be past the review threshold for no reason other than proximity.
 *
 * ### What this catalog deliberately cannot say
 *
 * There is no alt-text label, placeholder or help string anywhere below.
 * `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED` (`APP11-D01-C1`): the contract
 * publishes no `altText` field, so an input for one would collect a value with
 * nowhere to go. The alt an image is rendered with is derived from the entry's
 * own title, and `alt()` below is that derivation, not a stored value.
 *
 * There is no lane, classification, status, storage or rendition vocabulary
 * either. Those are the server's decisions on this operation — a caller cannot
 * choose them — so naming them on screen would offer the operator a choice they
 * do not have.
 */
export const GALLERY_MEDIA_COPY = {
  section: {
    title: 'Ảnh của mục',
    /** States the two facts that actually change what the operator sees. */
    help: 'Ảnh đầu tiên là ảnh bìa. Thứ tự bên dưới là thứ tự hiển thị.',
    empty: 'Chưa có ảnh. Cần ít nhất một ảnh để xuất bản.',
    listLabel: 'Danh sách ảnh đã chọn',
    add: 'Chọn ảnh có sẵn',
    prepare: 'Chuẩn bị ảnh mới',
    save: 'Lưu danh sách ảnh',
    saving: 'Đang lưu…',
    saved: 'Đã lưu danh sách ảnh.',
    discard: 'Huỷ thay đổi ảnh',
    /** Announced politely after a reorder or a removal. */
    reordered: 'Đã thay đổi thứ tự ảnh.',
    removed: 'Đã gỡ ảnh khỏi mục.',
    added: 'Đã thêm ảnh vào mục.',
    coverSet: 'Đã đặt làm ảnh bìa.',
    /** The unsaved-media notice, in the operator's terms. */
    dirty: 'Danh sách ảnh có thay đổi chưa lưu.',
    lockedTitle: 'Không thể thay đổi ảnh',
    lockedBody: 'Mục đã lưu trữ nên danh sách ảnh giữ nguyên.',
  },

  row: {
    cover: 'Ảnh bìa',
    position: (index: number) => `Ảnh ${String(index + 1)}`,
    moveEarlier: 'Di chuyển trước',
    moveLater: 'Di chuyển sau',
    setCover: 'Đặt làm ảnh bìa',
    remove: 'Gỡ ảnh',
    /** The neutral tile while bytes load, and when they cannot be shown. */
    previewLoading: 'Đang tải ảnh…',
    previewFailed: 'Không tải được ảnh',
    /** Derived from the entry, never persisted. */
    alt: (title: string, index: number) => `Ảnh ${String(index + 1)} của mục “${title}”`,
  },

  picker: {
    title: 'Chọn ảnh cho bộ sưu tập',
    help: 'Chỉ hiện ảnh đã chuẩn bị cho bộ sưu tập. Ảnh đã chọn không hiện lại.',
    loading: 'Đang tải danh sách ảnh…',
    emptyTitle: 'Chưa có ảnh nào cho bộ sưu tập',
    emptyBody: 'Dùng “Chuẩn bị ảnh mới” để tạo ảnh từ ảnh sản phẩm.',
    unavailableTitle: 'Không thể tải danh sách ảnh',
    unavailableBody: 'Đã xảy ra lỗi khi tải danh sách.',
    loadMore: 'Tải thêm',
    loadingMore: 'Đang tải…',
    loadMoreFailed: 'Không tải thêm được. Các ảnh đã tải vẫn còn.',
    retry: 'Thử lại',
    cancel: 'Huỷ',
    confirm: 'Thêm vào mục',
    selectionCount: (count: number) => `Đã chọn ${String(count)} ảnh`,
    /** The tile image's accessible name; never rendered as visible prose. */
    optionAlt: 'Ảnh bộ sưu tập',
  },

  source: {
    title: 'Chuẩn bị ảnh cho bộ sưu tập',
    help: 'Chọn một ảnh sản phẩm. Hệ thống tạo bản sao công khai cho bộ sưu tập; ảnh gốc giữ nguyên.',
    loading: 'Đang tải ảnh sản phẩm…',
    emptyTitle: 'Chưa có ảnh sản phẩm phù hợp',
    emptyBody: 'Tải ảnh lên ở mục Tài sản và chờ xử lý xong.',
    unavailableTitle: 'Không thể tải ảnh sản phẩm',
    unavailableBody: 'Đã xảy ra lỗi khi tải danh sách.',
    loadMore: 'Tải thêm',
    loadingMore: 'Đang tải…',
    loadMoreFailed: 'Không tải thêm được. Các ảnh đã tải vẫn còn.',
    retry: 'Thử lại',
    cancel: 'Huỷ',
    confirm: 'Chuẩn bị ảnh',
    preparing: 'Đang chuẩn bị…',
    prepared: 'Đã chuẩn bị ảnh và thêm vào mục.',
    /** The tile's accessible name; the visible tile shows `noPreview`. */
    optionAlt: 'Ảnh sản phẩm',
    /**
     * The visible tile label. Product media has no authenticated delivery
     * route, so there is nothing to render and the tile says so in two words
     * rather than repeating a sentence on every card.
     */
    noPreview: 'Chưa có xem trước',
  },

  failure: {
    /** Media replacement failures. */
    save: {
      notEligible: {
        title: 'Không thể lưu danh sách ảnh',
        body: 'Một ảnh đã chọn không còn dùng được. Hãy gỡ ảnh đó rồi lưu lại.',
      },
      duplicate: {
        title: 'Không thể lưu danh sách ảnh',
        body: 'Một ảnh xuất hiện nhiều lần. Hãy gỡ bớt rồi lưu lại.',
      },
      notFound: {
        title: 'Không thể lưu danh sách ảnh',
        body: 'Mục này không còn tồn tại. Hãy quay lại danh sách.',
      },
      unauthenticated: {
        title: 'Phiên đăng nhập đã hết hạn',
        body: 'Đăng nhập lại để tiếp tục. Danh sách ảnh vẫn còn.',
      },
      generic: {
        title: 'Không thể lưu danh sách ảnh',
        body: 'Đã xảy ra lỗi. Danh sách ảnh của bạn vẫn còn.',
      },
    },
    /** Preparation failures. */
    prepare: {
      /** The exact approved sentence for a stale source. No automatic retry. */
      staleSource: {
        title: 'Không thể chuẩn bị ảnh',
        body: 'Nguồn ảnh đã thay đổi. Hãy tải lại danh sách và chọn lại.',
      },
      notEligible: {
        title: 'Không thể chuẩn bị ảnh',
        body: 'Ảnh này không dùng được làm nguồn. Hãy chọn ảnh khác đã xử lý xong.',
      },
      unavailable: {
        title: 'Không thể chuẩn bị ảnh',
        body: 'Kho ảnh tạm thời không sẵn sàng. Chưa có ảnh nào được tạo.',
      },
      unauthenticated: {
        title: 'Phiên đăng nhập đã hết hạn',
        body: 'Đăng nhập lại để tiếp tục.',
      },
      generic: {
        title: 'Không thể chuẩn bị ảnh',
        body: 'Đã xảy ra lỗi. Chưa có ảnh nào được tạo.',
      },
    },
  },
} as const;
