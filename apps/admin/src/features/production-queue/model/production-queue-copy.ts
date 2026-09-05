/**
 * Every operator-facing string on the production queue (`780:3`, `780:105`,
 * `782:3`, `782:44`, `782:89`, `782:206`, `789:85`).
 *
 * One catalog, so no component hard-codes copy (CLAUDE.md §5) and the queue's
 * vocabulary can be reviewed as a whole. The **status** labels are not here —
 * they belong to `src/shared/presentation/production-status.ts`, because a job
 * must not be named one thing in the filter, another in its row and a third on
 * the detail screen `APP8-A03` builds from the same four states.
 *
 * The error sentences are chosen by failure *classification* alone. A server
 * `message` is never rendered; the published business code rides inside the
 * body as an engineer-facing annotation, exactly as `782:243` draws it and as
 * the refusal catalog (`787:3`) requires.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-wave2.json`, under `productionQueue`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const productionQueueMessage = messageView(VI_MESSAGES.adminWave2, 'productionQueue');

export const PRODUCTION_QUEUE_COPY = {
  page: {
    breadcrumb: productionQueueMessage.text('page.breadcrumb'),
    title: productionQueueMessage.text('page.title'),
    /** The sidenav entry (`780:22`) — shorter than the page title, as drawn. */
    navLabel: productionQueueMessage.text('page.navLabel'),
    tableLabel: productionQueueMessage.text('page.tableLabel'),
    /**
     * `780:29`. States what the queue publishes *and* what it does not, so an
     * operator who expects an `ORD-…` code or a product name learns where those
     * live instead of hunting for a column that was never designed.
     */
    source: productionQueueMessage.text('page.source'),
    ordering: productionQueueMessage.text('page.ordering'),
  },
  columns: {
    jobId: productionQueueMessage.text('columns.jobId'),
    orderId: productionQueueMessage.text('columns.orderId'),
    approvalSnapshotId: productionQueueMessage.text('columns.approvalSnapshotId'),
    status: productionQueueMessage.text('columns.status'),
    createdAt: productionQueueMessage.text('columns.createdAt'),
    milestone: productionQueueMessage.text('columns.milestone'),
    open: productionQueueMessage.text('columns.open'),
  },
  milestones: {
    /** `780:57` renders an absent milestone as an em dash, never as "chưa rõ". */
    none: productionQueueMessage.text('milestones.none'),
    started: productionQueueMessage.text('milestones.started'),
    completed: productionQueueMessage.text('milestones.completed'),
    cancelled: productionQueueMessage.text('milestones.cancelled'),
  },
  filters: {
    statusLegend: productionQueueMessage.text('filters.statusLegend'),
    statusDropdownTitle: productionQueueMessage.text('filters.statusDropdownTitle'),
    all: productionQueueMessage.text('filters.all'),
    selected: (count: number) => productionQueueMessage.text('filters.selected', { count }),
    vocabulary: productionQueueMessage.text('filters.vocabulary'),
    orderLabel: productionQueueMessage.text('filters.orderLabel'),
    orderPlaceholder: productionQueueMessage.text('filters.orderPlaceholder'),
    orderHelp: productionQueueMessage.text('filters.orderHelp'),
    orderInvalid: productionQueueMessage.text('filters.orderInvalid'),
    scope: productionQueueMessage.text('filters.scope'),
    clearStatus: productionQueueMessage.text('filters.clearStatus'),
    clearOrder: productionQueueMessage.text('filters.clearOrder'),
    clearAll: productionQueueMessage.text('filters.clearAll'),
  },
  actions: {
    open: productionQueueMessage.text('actions.open'),
    loadMore: productionQueueMessage.text('actions.loadMore'),
    loadingMore: productionQueueMessage.text('actions.loadingMore'),
    retry: productionQueueMessage.text('actions.retry'),
    backToFirstPage: productionQueueMessage.text('actions.backToFirstPage'),
    signIn: productionQueueMessage.text('actions.signIn'),
    openOrders: productionQueueMessage.text('actions.openOrders'),
  },
  states: {
    loading: productionQueueMessage.text('states.loading'),
    loadingNote: productionQueueMessage.text('states.loadingNote'),
    appended: productionQueueMessage.text('states.appended'),
    emptyTitle: productionQueueMessage.text('states.emptyTitle'),
    emptyBody: productionQueueMessage.text('states.emptyBody'),
    filteredEmptyTitle: productionQueueMessage.text('states.filteredEmptyTitle'),
    filteredEmptyBody: productionQueueMessage.text('states.filteredEmptyBody'),
    /** `782:81` names the active conditions back to the operator. */
    filteredEmptyActive: (conditions: string) =>
      productionQueueMessage.text('states.filteredEmptyActive', { conditions }),
    filteredEmptyStatuses: (labels: string) =>
      productionQueueMessage.text('states.filteredEmptyStatuses', { labels }),
    filteredEmptyOrder: (shortId: string) =>
      productionQueueMessage.text('states.filteredEmptyOrder', { shortId }),
    cursorErrorTitle: productionQueueMessage.text('states.cursorErrorTitle'),
    cursorErrorBody: productionQueueMessage.text('states.cursorErrorBody'),
    errorTitle: productionQueueMessage.text('states.errorTitle'),
    errorBody: productionQueueMessage.text('states.errorBody'),
    unauthenticatedTitle: productionQueueMessage.text('states.unauthenticatedTitle'),
    unauthenticatedBody: productionQueueMessage.text('states.unauthenticatedBody'),
    loadMoreFailed: productionQueueMessage.text('states.loadMoreFailed'),
    pagination: productionQueueMessage.text('states.pagination'),
    exhausted: productionQueueMessage.text('states.exhausted'),
  },
  responsive: {
    /** `789:158` — the single reduction the approved narrow frame makes. */
    narrowNote: productionQueueMessage.text('responsive.narrowNote'),
  },
} as const;
