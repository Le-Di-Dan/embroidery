/**
 * Every operator-facing string on the Admin gallery list (`866:905`,
 * `867:907`, `867:946`).
 *
 * One catalog, so no component hard-codes copy (CLAUDE.md §5) and the screen's
 * vocabulary can be reviewed as a whole. The **status** labels are not here —
 * they belong to the shared `gallery-status.ts`, because an entry must not be named one
 * thing in the filter, another in its row and a third in the editor
 * `APP11-A02` builds from the same three states.
 *
 * ### Only what an operator can act on
 *
 * This catalog carries no endpoint name, no contract field (`hasNext`,
 * `nextCursor`, `display_order`), no checkpoint identifier and no note
 * explaining why the screen is built the way it is. Those are engineering
 * facts: they belong in these comments and in the completion report, where the
 * people they are addressed to will read them, and they are noise to an
 * operator looking for a gallery entry. Every string below is a thing the
 * operator is being told, asked, or offered.
 *
 * The error sentences are chosen by failure *classification* alone. A server
 * `message`, `code`, HTTP status or `requestId` is never rendered.
 */
export const GALLERY_LIST_COPY = {
  page: {
    breadcrumb: 'Quản trị / Bộ sưu tập',
    title: 'Bộ sưu tập',
    /** The sidenav entry (`866:905`) — the same words as the page title. */
    navLabel: 'Bộ sưu tập',
    /** The table's accessible name. Not drawn, but announced. */
    tableLabel: 'Danh sách mục bộ sưu tập',
  },
  columns: {
    entry: 'Mục',
    displayOrder: 'Thứ tự',
    linkedProduct: 'Sản phẩm liên kết',
    status: 'Trạng thái',
  },
  entry: {
    /** Prefixes the slug in the row so it reads as an address, not a title. */
    slugPrefix: '/',
    /**
     * The accessible name of a row link.
     *
     * The visible link text is the entry's title, which is the right label in
     * context. Out of context — in a screen reader's list of links — a bare
     * title does not say what following it does, so the name states the action
     * and the subject together.
     */
    openLabel: (title: string) => `Mở mục “${title}”`,
    assetCount: (count: number) => `${String(count)} ảnh`,
  },
  linkedProduct: {
    /**
     * A truthful signal, never the raw id. The list publishes
     * `linkedProductId` and no product label, and resolving one per row would
     * be an N+1 Catalog read this screen has no reason to open. `APP11-A02`
     * owns the actual product selector and label.
     */
    linked: 'Đã liên kết',
    unlinked: 'Chưa liên kết',
  },
  cover: {
    /** The neutral tile for an entry with no cover, or a cover that failed. */
    placeholder: 'Chưa có ảnh bìa',
    failed: 'Không tải được ảnh bìa',
    /** Alt text is DERIVED, never persisted: the API publishes no `altText`. */
    alt: (title: string) => `Ảnh bìa của mục “${title}”`,
  },
  filters: {
    statusLabel: 'Trạng thái',
    /** Omits the parameter entirely — never an invented `ALL` token. */
    all: 'Tất cả trạng thái',
    reset: 'Xoá bộ lọc',
  },
  actions: {
    loadMore: 'Tải thêm mục',
    loadingMore: 'Đang tải thêm…',
    retry: 'Thử lại',
    signIn: 'Đăng nhập lại',
  },
  states: {
    loading: 'Đang tải danh sách bộ sưu tập…',
    appended: 'Đã tải thêm mục bộ sưu tập.',
    emptyTitle: 'Chưa có mục bộ sưu tập',
    /**
     * The create action now exists beside this text, so the body invites the
     * operator to use it rather than explaining an absence.
     */
    emptyBody: 'Tạo mục đầu tiên để bắt đầu bộ sưu tập.',
    filteredEmptyTitle: 'Không có mục phù hợp với trạng thái đã chọn',
    filteredEmptyActive: (label: string) => `Đang lọc: ${label}.`,
    filteredEmptyBody: 'Bỏ bộ lọc để xem toàn bộ mục.',
    errorTitle: 'Không thể tải danh sách bộ sưu tập',
    errorBody: 'Đã xảy ra lỗi khi tải danh sách. Không có mục nào bị thay đổi.',
    unauthenticatedTitle: 'Phiên đăng nhập đã hết hạn',
    unauthenticatedBody: 'Đăng nhập lại để tiếp tục.',
    loadMoreFailed: 'Không thể tải thêm mục. Các mục đã tải vẫn còn nguyên.',
    exhausted: 'Đã hiển thị toàn bộ mục.',
  },
} as const;
