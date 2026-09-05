/**
 * Every operator-facing string on the order queue (`732:3`, `732:110`).
 *
 * One catalog, so no component hard-codes copy (CLAUDE.md §5) and the queue's
 * vocabulary can be reviewed as a whole. The **status** labels are not here —
 * they belong to `shared/presentation/order-status.ts`, because an order must
 * not be named one thing in the list and another on the screen it opens.
 *
 * The error sentences are chosen by failure *classification* alone. A server
 * `message`, `code` or `requestId` is never rendered.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-orders.json`, under `queue`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const queueMessage = messageView(VI_MESSAGES.adminOrders, 'queue');

export const ORDER_QUEUE_COPY = {
  page: {
    breadcrumb: queueMessage.text('page.breadcrumb'),
    title: queueMessage.text('page.title'),
    subtitle: queueMessage.text('page.subtitle'),
    tableLabel: queueMessage.text('page.tableLabel'),
  },
  columns: {
    code: queueMessage.text('columns.code'),
    origin: queueMessage.text('columns.origin'),
    status: queueMessage.text('columns.status'),
    total: queueMessage.text('columns.total'),
    currency: queueMessage.text('columns.currency'),
    createdAt: queueMessage.text('columns.createdAt'),
    request: queueMessage.text('columns.request'),
    customer: queueMessage.text('columns.customer'),
  },
  filters: {
    legend: queueMessage.text('filters.legend'),
    originLegend: queueMessage.text('filters.originLegend'),
    all: queueMessage.text('filters.all'),
    selected: (count: number) => queueMessage.text('filters.selected', { count }),
    reset: queueMessage.text('filters.reset'),
  },
  actions: {
    openOrder: queueMessage.text('actions.openOrder'),
    openRequest: queueMessage.text('actions.openRequest'),
    /** A Ready-Made order has no custom request behind it (`BR-031`). */
    noRequest: queueMessage.text('actions.noRequest'),
    loadMore: queueMessage.text('actions.loadMore'),
    loadingMore: queueMessage.text('actions.loadingMore'),
    retry: queueMessage.text('actions.retry'),
  },
  states: {
    loading: queueMessage.text('states.loading'),
    appended: queueMessage.text('states.appended'),
    emptyTitle: queueMessage.text('states.emptyTitle'),
    emptyBody: queueMessage.text('states.emptyBody'),
    filteredEmptyTitle: queueMessage.text('states.filteredEmptyTitle'),
    filteredEmptyBody: queueMessage.text('states.filteredEmptyBody'),
    errorTitle: queueMessage.text('states.errorTitle'),
    errorBody: queueMessage.text('states.errorBody'),
    cursorErrorTitle: queueMessage.text('states.cursorErrorTitle'),
    cursorErrorBody: queueMessage.text('states.cursorErrorBody'),
    loadMoreFailed: queueMessage.text('states.loadMoreFailed'),
  },
} as const;
