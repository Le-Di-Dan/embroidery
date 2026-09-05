/**
 * Vietnamese copy catalog for the Admin product list (FRONTEND_CONVENTIONS §14
 * — no user-facing string is written at a call site).
 *
 * Every string that appears in an approved Figma node is reproduced verbatim
 * from `FIG-ADMIN-CATALOG-*` (`439:100`, `440:102`, `440:191`) and the
 * normative handoff node `498:272`
 * (`FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`). The few strings the frames do not
 * enumerate — the first-page failure state and the accessible names of the
 * collection and the media placeholder — are written in the same register and
 * never expose a technical detail.
 *
 * Deliberately absent: any price, slug, timestamp, search or action label.
 * `APP2-A02` is a read-only list; `Tạo sản phẩm`, `Chỉnh sửa`, `Xuất bản`,
 * `Gỡ xuất bản`, `Lưu trữ` and `Xoá` belong to `APP2-A03`/`APP2-A04` and must
 * not exist as copy before the capability behind them exists.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `products`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const productsMessage = messageView(VI_MESSAGES.admin, 'products');

export const PRODUCT_COPY = {
  page: {
    /** The screen's single `<h1>`, and the navigation label for `/products`. */
    title: productsMessage.text('page.title'),
    /** Desktop subtitle (`439:183`). */
    subtitleWide: productsMessage.text('page.subtitleWide'),
    /** Mobile subtitle (`440:232`) — the approved shorter line at 390. */
    subtitleNarrow: productsMessage.text('page.subtitleNarrow'),
    /** Accessible name of the desktop table. */
    tableLabel: productsMessage.text('page.tableLabel'),
    /** Accessible name of the mobile card collection. */
    collectionLabel: productsMessage.text('page.collectionLabel'),
  },

  columns: {
    product: productsMessage.text('columns.product'),
    category: productsMessage.text('columns.category'),
    status: productsMessage.text('columns.status'),
  },

  filters: {
    statusLabel: productsMessage.text('filters.statusLabel'),
    categoryLabel: productsMessage.text('filters.categoryLabel'),
    statusAll: productsMessage.text('filters.statusAll'),
    categoryAll: productsMessage.text('filters.categoryAll'),
  },

  /** Status language from the approved handoff (`498:272` — Bộ lọc trạng thái). */
  status: {
    draft: productsMessage.text('status.draft'),
    published: productsMessage.text('status.published'),
    archived: productsMessage.text('status.archived'),
    unknown: productsMessage.text('status.unknown'),
  },

  // No category label catalog. A category's name is **data** — it comes from the
  // `categories` row on every product and inventory response — so a copy entry
  // here would be a second, compiled taxonomy and would render a real category
  // the build had not heard of as "Chưa xác định" (`APP12-C01-C1`).

  media: {
    /**
     * Accessible description of the placeholder tile. APP2 exposes no media
     * delivery operation, so there is no image and no URL to render — only an
     * honest statement that a preview does not exist yet.
     */
    placeholder: productsMessage.text('media.placeholder'),
  },

  list: {
    loading: productsMessage.text('list.loading'),
    unavailableTitle: productsMessage.text('list.unavailableTitle'),
    unavailableDescription: productsMessage.text('list.unavailableDescription'),
    unavailableRetry: productsMessage.text('list.unavailableRetry'),
    /** Shown only when no filter is active (`440:187` / `440:188`). */
    emptyTitle: productsMessage.text('list.emptyTitle'),
    emptyDescription: productsMessage.text('list.emptyDescription'),
    /** Shown when a filter is active (`498:272` — Hành vi bộ lọc). */
    filteredEmptyTitle: productsMessage.text('list.filteredEmptyTitle'),
    filteredEmptyDescription: productsMessage.text('list.filteredEmptyDescription'),
  },

  /**
   * The two entry points `APP2-A03` restores (`521:284` — Phạm vi & bàn giao).
   * Exactly these: no publish, unpublish, archive or delete joins them, because
   * no checkpoint has shipped the capability behind those words.
   */
  actions: {
    create: productsMessage.text('actions.create'),
    edit: productsMessage.text('actions.edit'),
    /** Column heading for the desktop action cell. */
    columnLabel: productsMessage.text('actions.columnLabel'),
  },

  continuation: {
    action: productsMessage.text('continuation.action'),
    loading: productsMessage.text('continuation.loading'),
    loaded: productsMessage.text('continuation.loaded'),
    errorMessage: productsMessage.text('continuation.errorMessage'),
    retry: productsMessage.text('continuation.retry'),
  },
} as const;
