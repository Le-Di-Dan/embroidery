/**
 * Every operator-facing string on the Admin custom-request queue (`APP5-A01`).
 *
 * One catalog, so no component hard-codes a sentence (CLAUDE.md §5) and the
 * approved copy from `662:3` / `662:112` / `662:182` / `662:243` / `662:306`
 * has exactly one spelling.
 *
 * The failure copy is bounded on purpose: the queue reads a private Admin
 * endpoint, and a server `message`, `code`, SQL fragment or stack would be a
 * disclosure with no operator value. The classification alone picks the string.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-wave2.json`, under `requestQueue`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const requestQueueMessage = messageView(VI_MESSAGES.adminWave2, 'requestQueue');

export const CUSTOM_REQUEST_QUEUE_COPY = {
  page: {
    title: requestQueueMessage.text('page.title'),
    subtitle: requestQueueMessage.text('page.subtitle'),
    tableLabel: requestQueueMessage.text('page.tableLabel'),
  },
  scope: {
    /** Never "tất cả yêu cầu": the server states which statuses it applied. */
    applied: (statuses: string) => requestQueueMessage.text('scope.applied', { statuses }),
    note: requestQueueMessage.text('scope.note'),
  },
  columns: {
    code: requestQueueMessage.text('columns.code'),
    status: requestQueueMessage.text('columns.status'),
    subject: requestQueueMessage.text('columns.subject'),
    customer: requestQueueMessage.text('columns.customer'),
    submitted: requestQueueMessage.text('columns.submitted'),
    quantity: requestQueueMessage.text('columns.quantity'),
    actions: requestQueueMessage.text('columns.actions'),
  },
  filters: {
    statusLabel: requestQueueMessage.text('filters.statusLabel'),
    statusTriage: requestQueueMessage.text('filters.statusTriage'),
    subjectLabel: requestQueueMessage.text('filters.subjectLabel'),
    subjectAll: requestQueueMessage.text('filters.subjectAll'),
    reset: requestQueueMessage.text('filters.reset'),
  },
  status: {
    new: requestQueueMessage.text('status.new'),
    underReview: requestQueueMessage.text('status.underReview'),
    needsClarification: requestQueueMessage.text('status.needsClarification'),
    quoted: requestQueueMessage.text('status.quoted'),
    quoteAccepted: requestQueueMessage.text('status.quoteAccepted'),
    digitizing: requestQueueMessage.text('status.digitizing'),
    designReview: requestQueueMessage.text('status.designReview'),
    approved: requestQueueMessage.text('status.approved'),
    rejected: requestQueueMessage.text('status.rejected'),
    cancelled: requestQueueMessage.text('status.cancelled'),
    unknown: requestQueueMessage.text('status.unknown'),
  },
  subject: {
    catalog: requestQueueMessage.text('subject.catalog'),
    customerOwned: requestQueueMessage.text('subject.customerOwned'),
    unknown: requestQueueMessage.text('subject.unknown'),
    /** The server reports a missing subject name rather than inventing one. */
    missingSummary: requestQueueMessage.text('subject.missingSummary'),
  },
  customer: {
    /** `customerDisplayName` is absent when the customer gave no name. */
    unnamed: requestQueueMessage.text('customer.unnamed'),
  },
  states: {
    loading: requestQueueMessage.text('states.loading'),
    emptyTitle: requestQueueMessage.text('states.emptyTitle'),
    emptyBody: requestQueueMessage.text('states.emptyBody'),
    filteredEmptyTitle: requestQueueMessage.text('states.filteredEmptyTitle'),
    filteredEmptyBody: requestQueueMessage.text('states.filteredEmptyBody'),
    errorTitle: requestQueueMessage.text('states.errorTitle'),
    errorBody: requestQueueMessage.text('states.errorBody'),
    cursorErrorTitle: requestQueueMessage.text('states.cursorErrorTitle'),
    cursorErrorBody: requestQueueMessage.text('states.cursorErrorBody'),
    loadMoreFailed: requestQueueMessage.text('states.loadMoreFailed'),
    appended: requestQueueMessage.text('states.appended'),
  },
  actions: {
    open: requestQueueMessage.text('actions.open'),
    retry: requestQueueMessage.text('actions.retry'),
    loadMore: requestQueueMessage.text('actions.loadMore'),
    loadingMore: requestQueueMessage.text('actions.loadingMore'),
  },
} as const;
