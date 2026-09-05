/**
 * Every operator-facing string on the production job detail screen (`784:3`,
 * `784:129`, `785:3`, `785:134`, `785:270`, `789:160`).
 *
 * One catalog, so no component hard-codes copy (CLAUDE.md §5) and the screen's
 * vocabulary can be reviewed as a whole. The **status** labels are not here —
 * they belong to `src/shared/presentation/production-status.ts`, so a job is
 * named the same thing in the queue row, in the detail pill and in a history
 * line.
 *
 * The transition dialogs have their own catalog (`production-transition-copy`),
 * because they are a different surface with a different authority: a dialog
 * states what a *write* will do, and mixing that prose in here is how a screen
 * ends up promising an effect on a page that performs none.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-wave2.json`, under `productionJob`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const productionJobMessage = messageView(VI_MESSAGES.adminWave2, 'productionJob');

export const PRODUCTION_JOB_COPY = {
  page: {
    breadcrumbRoot: productionJobMessage.text('page.breadcrumbRoot'),
    /** `784:27` — the trail names the job by its shortened id. */
    breadcrumb: (shortJobId: string) =>
      productionJobMessage.text('page.breadcrumb', { shortJobId }),
    backToQueue: productionJobMessage.text('page.backToQueue'),
    title: productionJobMessage.text('page.title'),
  },
  header: {
    jobLabel: productionJobMessage.text('header.jobLabel'),
    openOrder: productionJobMessage.text('header.openOrder'),
    /** `784:36`. The uniqueness `uq_production_jobs__order_approval_snapshot` enforces. */
    approval: (shortApprovalId: string) =>
      productionJobMessage.text('header.approval', { shortApprovalId }),
    createdAt: (at: string) => productionJobMessage.text('header.createdAt', { at }),
    startedAt: (at: string) => productionJobMessage.text('header.startedAt', { at }),
    completedAt: (at: string) => productionJobMessage.text('header.completedAt', { at }),
    cancelledAt: (at: string) => productionJobMessage.text('header.cancelledAt', { at }),
    updatedAt: (at: string) => productionJobMessage.text('header.updatedAt', { at }),
    /** `784:43` — a PLANNED job has no `startedAt` at all, and says so. */
    notStarted: productionJobMessage.text('header.notStarted'),
    /** REL-092: a redo is a new job, never a mutated one. */
    reworkedFrom: (shortJobId: string) =>
      productionJobMessage.text('header.reworkedFrom', { shortJobId }),
  },
  cancellation: {
    title: productionJobMessage.text('cancellation.title'),
    source: productionJobMessage.text('cancellation.source'),
    reasonLabel: productionJobMessage.text('cancellation.reasonLabel'),
    boundaryTitle: productionJobMessage.text('cancellation.boundaryTitle'),
    boundaryBody: productionJobMessage.text('cancellation.boundaryBody'),
  },
  specification: {
    title: productionJobMessage.text('specification.title'),
    source: productionJobMessage.text('specification.source'),
    frozenTitle: productionJobMessage.text('specification.frozenTitle'),
    frozenBody: productionJobMessage.text('specification.frozenBody'),
    productName: productionJobMessage.text('specification.productName'),
    variantLabel: productionJobMessage.text('specification.variantLabel'),
    sideName: productionJobMessage.text('specification.sideName'),
    areaName: productionJobMessage.text('specification.areaName'),
    dimensions: productionJobMessage.text('specification.dimensions'),
    quantityTotal: productionJobMessage.text('specification.quantityTotal'),
    documentHash: productionJobMessage.text('specification.documentHash'),
    documentHashNote: productionJobMessage.text('specification.documentHashNote'),
    productionParameters: productionJobMessage.text('specification.productionParameters'),
    /** `785:330` — INV-13 makes this always absent for a customer-owned product. */
    variantAbsent: productionJobMessage.text('specification.variantAbsent'),
    /** `785:350` — a job created with no machine parameters recorded. */
    parametersAbsent: productionJobMessage.text('specification.parametersAbsent'),
    /** The `specification` field is optional only as an unreachable-state fallback. */
    missingTitle: productionJobMessage.text('specification.missingTitle'),
    missingBody: productionJobMessage.text('specification.missingBody'),
  },
  reservation: {
    title: productionJobMessage.text('reservation.title'),
    source: productionJobMessage.text('reservation.source'),
    catalogItems: productionJobMessage.text('reservation.catalogItems'),
    customerOwnedItems: productionJobMessage.text('reservation.customerOwnedItems'),
    skuLabel: productionJobMessage.text('reservation.skuLabel'),
    stockLabel: productionJobMessage.text('reservation.stockLabel'),
    quantity: (value: number) => productionJobMessage.text('reservation.quantity', { value }),
    /** `785:368` — the COP-only state is ordinary and valid, never a warning. */
    copTitle: productionJobMessage.text('reservation.copTitle'),
    copBody: productionJobMessage.text('reservation.copBody'),
    copNote: productionJobMessage.text('reservation.copNote'),
    /** `784:246` — a mixed order shows its Catalog rows and never a fabricated COP row. */
    mixedTitle: productionJobMessage.text('reservation.mixedTitle'),
    mixedBody: productionJobMessage.text('reservation.mixedBody'),
    /** `785:260` — a terminal row is still shown, so "released" ≠ "never existed". */
    terminalNote: productionJobMessage.text('reservation.terminalNote'),
    /** `785:124` — consumption is one-way. */
    consumedNote: productionJobMessage.text('reservation.consumedNote'),
    /** `784:119` — the binding sentence: this section is context, never the gate. */
    notGate: productionJobMessage.text('reservation.notGate'),
    /** Catalog lines exist but the server returned no reservation row for them. */
    noneYetTitle: productionJobMessage.text('reservation.noneYetTitle'),
    noneYetBody: productionJobMessage.text('reservation.noneYetBody'),
    missingTitle: productionJobMessage.text('reservation.missingTitle'),
    missingBody: productionJobMessage.text('reservation.missingBody'),
  },
  reservationStatus: {
    RESERVED: productionJobMessage.text('reservationStatus.RESERVED'),
    CONSUMED: productionJobMessage.text('reservationStatus.CONSUMED'),
    RELEASED: productionJobMessage.text('reservationStatus.RELEASED'),
    EXPIRED: productionJobMessage.text('reservationStatus.EXPIRED'),
    unknown: productionJobMessage.text('reservationStatus.unknown'),
  },
  history: {
    title: productionJobMessage.text('history.title'),
    source: productionJobMessage.text('history.source'),
    columnTransition: productionJobMessage.text('history.columnTransition'),
    columnActor: productionJobMessage.text('history.columnActor'),
    columnAt: productionJobMessage.text('history.columnAt'),
    columnReason: productionJobMessage.text('history.columnReason'),
    /** `784:95` — a fresh PLANNED job renders an empty history, never a fake row. */
    emptyTitle: productionJobMessage.text('history.emptyTitle'),
    emptyBody: productionJobMessage.text('history.emptyBody'),
    noCreationRow: productionJobMessage.text('history.noCreationRow'),
    actorNote: productionJobMessage.text('history.actorNote'),
    /** No reason was recorded — only a cancellation carries one. */
    noReason: productionJobMessage.text('history.noReason'),
  },
  actions: {
    title: productionJobMessage.text('actions.title'),
    start: productionJobMessage.text('actions.start'),
    complete: productionJobMessage.text('actions.complete'),
    cancel: productionJobMessage.text('actions.cancel'),
    /** `784:127`. */
    plannedNote: productionJobMessage.text('actions.plannedNote'),
    /** `785:387` — a COP-only order starts normally and consumes nothing. */
    plannedCopNote: productionJobMessage.text('actions.plannedCopNote'),
    /** `784:258`. */
    startedNote: productionJobMessage.text('actions.startedNote'),
    /** `785:131` — APP8 stops here; no remaining-payment or shipping control exists. */
    completedNote: productionJobMessage.text('actions.completedNote'),
    completedOrderNote: productionJobMessage.text('actions.completedOrderNote'),
    /** `785:267` — a cancelled job cannot be restarted; a redo would be a new job. */
    cancelledNote: productionJobMessage.text('actions.cancelledNote'),
    cancelledStockNote: productionJobMessage.text('actions.cancelledStockNote'),
    /** `784:128` — the binding sentence under every action set. */
    serverOwnsLegality: productionJobMessage.text('actions.serverOwnsLegality'),
    /** `789:203` — at 1280 the aside collapses and the actions move above the fold. */
    narrowNote: productionJobMessage.text('actions.narrowNote'),
  },
  states: {
    loading: productionJobMessage.text('states.loading'),
    loadingNote: productionJobMessage.text('states.loadingNote'),
    notFoundTitle: productionJobMessage.text('states.notFoundTitle'),
    notFoundBody: productionJobMessage.text('states.notFoundBody'),
    forbiddenTitle: productionJobMessage.text('states.forbiddenTitle'),
    forbiddenBody: productionJobMessage.text('states.forbiddenBody'),
    unauthenticatedTitle: productionJobMessage.text('states.unauthenticatedTitle'),
    unauthenticatedBody: productionJobMessage.text('states.unauthenticatedBody'),
    errorTitle: productionJobMessage.text('states.errorTitle'),
    errorBody: productionJobMessage.text('states.errorBody'),
    retry: productionJobMessage.text('states.retry'),
    signIn: productionJobMessage.text('states.signIn'),
    backToQueue: productionJobMessage.text('states.backToQueue'),
    /** Announced after a transition commits and the authoritative re-read lands. */
    refreshed: (label: string) => productionJobMessage.text('states.refreshed', { label }),
  },
} as const;
