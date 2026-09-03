/**
 * Every operator-visible string on the category screen (`APP12-A01`).
 *
 * ## Where each string comes from
 *
 * The screen copy is transcribed from the two approved frames — the list
 * (`FIG-APP12-A04-CATEGORY-LIST-DESKTOP`, `915:342`) and the form states
 * (`FIG-APP12-A04-CATEGORY-FORM-STATES`, `916:343`) — and each entry carries
 * the node it was read from. Nothing is written from a DTO field name, an enum
 * member or a backend message: `APP12-C02` can name a slug, a table or a UUID
 * in its own prose, and none of that belongs on an operator screen.
 *
 * Entries marked `AUTHORED` name a state the frames do not draw — the archived
 * read-only form, the concurrency conflict, the list's own loading and failure
 * states, and one message per `APP12-C02` domain code. They are written in the
 * voice the drawn refusal establishes: say what happened, then the next action,
 * never "không được" alone.
 *
 * ## No category value may ever appear here
 *
 * This module holds labels for *rules* — statuses, fields, actions, failures.
 * It holds no category name, no slug and no taxonomy, and it must never grow
 * one. `category.name` is the label authority for a category
 * (`APP12-P01` §0.0, `BR-034`), and a Vietnamese label table compiled next to
 * it is exactly what `APP12-C01-C1` removed from this app.
 */

export const CATEGORY_COPY = {
  page: {
    /** `915:370` — also the sidebar entry. */
    title: 'Danh mục',
    /** `915:371` */
    subtitle:
      'Danh mục điều khiển bộ lọc Khám phá, breadcrumb và sitemap. Cấu trúc phẳng — không có danh mục cha.',
    /** `915:372` */
    create: 'Tạo danh mục',
    /** `915:426` */
    footnote:
      'Nhãn danh mục lấy từ tên đã lưu — không có bảng ánh xạ tiếng Việt biên dịch sẵn trong Storefront hay Admin (BR-034).',
  },
  table: {
    /** AUTHORED — the accessible name of the table, never shown visually. */
    caption: 'Danh sách danh mục',
    /** `915:376` */
    name: 'Tên danh mục',
    /** `915:377` */
    slug: 'Slug',
    /** `915:378` */
    status: 'Trạng thái',
    /** `915:379` */
    publishedProducts: 'Sản phẩm đang bán',
    /** `915:380` */
    indexable: 'Lập chỉ mục',
    /** `915:389` */
    indexableYes: 'Có',
    /** `915:407` */
    indexableNo: 'Không',
    /**
     * `915:416` / `915:425` — the draft and archived rows.
     *
     * Indexability is only ever acted on for a published category, so for the
     * other two states the frame shows a dash rather than a value that would
     * read as a promise the sitemap is not keeping.
     */
    indexableNotApplicable: '—',
  },
  list: {
    /** AUTHORED */
    loading: 'Đang tải danh mục…',
    /** AUTHORED — the taxonomy is genuinely empty, not merely unread. */
    empty: 'Chưa có danh mục nào. Tạo danh mục đầu tiên để bắt đầu.',
    /** AUTHORED */
    failed: 'Không tải được danh sách danh mục.',
    /** AUTHORED */
    retry: 'Thử lại',
  },
  form: {
    /** `916:345` — create mode only; edit mode shows `category.name` (`916:392`). */
    createTitle: 'Tạo danh mục',
    /** `916:350` */
    nameLabel: 'Tên danh mục',
    /** `916:355` */
    slugLabel: 'Slug',
    /** `916:358` */
    slugHelp: 'Chỉ chữ thường, số và dấu gạch ngang. Slug sẽ bị khoá sau lần xuất bản đầu tiên.',
    /** `916:379` — rendered beside the label, not inside the control. */
    slugLockedChip: '🔒 khoá sau khi xuất bản',
    /** `916:382` */
    slugLockedHelp: 'Đã xuất bản nên không thể đổi. Đổi tên không làm đổi slug.',
    /** `916:361` */
    indexableLabel: 'Cho phép lập chỉ mục (sitemap, canonical)',
    /**
     * AUTHORED — the contract requires `displayOrder` on create and allows it
     * on update, and the frames draw no control for it. Written in the drawn
     * field language so it reads as one form, not as an appended extra.
     */
    displayOrderLabel: 'Thứ tự hiển thị',
    /** AUTHORED */
    displayOrderHelp:
      'Số nhỏ hiện trước. Không tự đánh số: đổi một danh mục không đánh lại các danh mục khác.',
    /** `916:363` */
    saveDraft: 'Lưu nháp',
    /** `916:384` */
    save: 'Lưu',
    /** `916:365` */
    publish: 'Xuất bản',
    /** `916:386` */
    archive: 'Lưu trữ',
    /** AUTHORED */
    cancel: 'Đóng',
    /** AUTHORED — announced while a write is in flight. */
    saving: 'Đang lưu…',
    /** AUTHORED */
    publishing: 'Đang xuất bản…',
    /** AUTHORED */
    archiving: 'Đang lưu trữ…',
    /**
     * AUTHORED — the archived form.
     *
     * Says the record is closed and that nothing here reopens it, because the
     * contract has no relist and no restore and the operator should not go
     * looking for one.
     */
    archivedNotice:
      'Danh mục đã lưu trữ nên chỉ xem được. Không thể sửa, không thể xuất bản lại và không thể xoá.',
    /** AUTHORED — announced after a successful write. */
    savedNotice: 'Đã lưu danh mục.',
    /** AUTHORED */
    publishedNotice: 'Đã xuất bản danh mục. Slug từ nay bị khoá.',
    /** AUTHORED */
    archivedDoneNotice: 'Đã lưu trữ danh mục. Danh mục không còn hiển thị công khai.',
  },
  validation: {
    /** AUTHORED */
    nameRequired: 'Nhập tên danh mục.',
    /** AUTHORED */
    nameTooLong: 'Tên danh mục tối đa 120 ký tự.',
    /** AUTHORED */
    slugRequired: 'Nhập slug.',
    /** AUTHORED */
    slugMalformed: 'Slug chỉ gồm chữ thường, số và dấu gạch ngang, ví dụ: qua-tang-doanh-nghiep.',
    /** AUTHORED */
    slugTooLong: 'Slug tối đa 80 ký tự.',
    /** AUTHORED */
    displayOrderInvalid: 'Thứ tự hiển thị phải là một số nguyên không âm.',
    /** AUTHORED */
    displayOrderRange: 'Thứ tự hiển thị nằm trong khoảng 0 đến 100000.',
  },
  archiveRefusal: {
    /** `916:394` — the symbol is rendered separately and `aria-hidden`. */
    title: 'Không thể lưu trữ danh mục',
    /** `916:394` */
    symbol: '✕',
    /** `916:395` — the count is the server's, re-read after the refusal. */
    body: (count: number): string =>
      'Còn ' +
      String(count) +
      ' sản phẩm đang bán thuộc danh mục này. Hãy chuyển chúng sang danh mục khác hoặc gỡ khỏi trang bán trước.',
    /** `916:396` — the safe next action: the product list, filtered to exactly those rows. */
    action: (count: number): string => 'Xem ' + String(count) + ' sản phẩm',
  },
  failure: {
    /** AUTHORED — one message per `APP12-C02` domain code (§12). */
    notFound: 'Danh mục này không còn tồn tại. Tải lại danh sách để xem trạng thái mới nhất.',
    slugConflict: 'Slug này đã thuộc về một danh mục khác. Chọn slug khác.',
    slugImmutable: 'Slug đã bị khoá sau khi xuất bản nên không thể đổi.',
    invalidTransition:
      'Không thực hiện được thay đổi trạng thái này. Tải lại danh sách để xem trạng thái mới nhất.',
    inventoryTooLarge:
      'Danh sách danh mục quá lớn để hiển thị. Liên hệ đội kỹ thuật trước khi tạo thêm danh mục.',
    generic: 'Không thực hiện được thao tác. Thử lại sau ít phút.',
  },
  conflict: {
    /** AUTHORED — the Admin conflict pattern, reused verbatim in structure. */
    title: 'Danh mục đã được người khác thay đổi',
    body: 'Có người vừa lưu danh mục này. Tải lại để lấy bản mới nhất — thay đổi chưa lưu của bạn sẽ mất.',
    reload: 'Tải lại bản mới nhất',
    close: 'Để nguyên',
  },
} as const;

/** The validation reason keys resolved to their approved sentences. */
export const CATEGORY_VALIDATION_COPY = {
  'name-required': CATEGORY_COPY.validation.nameRequired,
  'name-too-long': CATEGORY_COPY.validation.nameTooLong,
  'slug-required': CATEGORY_COPY.validation.slugRequired,
  'slug-malformed': CATEGORY_COPY.validation.slugMalformed,
  'slug-too-long': CATEGORY_COPY.validation.slugTooLong,
  'display-order-invalid': CATEGORY_COPY.validation.displayOrderInvalid,
  'display-order-range': CATEGORY_COPY.validation.displayOrderRange,
} as const;

/**
 * The approved sentence for a classified failure, or `null` when the failure
 * has no page-level message.
 *
 * `version-conflict` and `archive-blocked` return `null` deliberately: each has
 * its own approved surface — a dialog and a refusal panel — and also printing a
 * banner would say the same thing twice in two voices.
 */
export function categoryFailureMessage(
  failure:
    | 'not-found'
    | 'slug-conflict'
    | 'slug-immutable'
    | 'invalid-transition'
    | 'archive-blocked'
    | 'version-conflict'
    | 'inventory-too-large'
    | 'generic',
): string | null {
  switch (failure) {
    case 'not-found':
      return CATEGORY_COPY.failure.notFound;
    case 'slug-conflict':
      return CATEGORY_COPY.failure.slugConflict;
    case 'slug-immutable':
      return CATEGORY_COPY.failure.slugImmutable;
    case 'invalid-transition':
      return CATEGORY_COPY.failure.invalidTransition;
    case 'inventory-too-large':
      return CATEGORY_COPY.failure.inventoryTooLarge;
    case 'generic':
      return CATEGORY_COPY.failure.generic;
    default:
      return null;
  }
}
