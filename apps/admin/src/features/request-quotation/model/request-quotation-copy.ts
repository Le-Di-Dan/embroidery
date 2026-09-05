/**
 * Every operator-facing string on the Admin quotation workbench (`APP6-A01`).
 *
 * One catalog, so no component hard-codes a sentence (CLAUDE.md §5) and the
 * approved copy from `682:3`, `684:3`, `684:144`, `686:3`, `686:62`, `686:104`,
 * `687:3`, `687:144`, `689:3`, `689:162`, `690:3` and `690:92` has exactly one
 * spelling.
 *
 * ### The failure copy never interpolates a server value
 *
 * Every operation behind this screen is a private Admin endpoint. A server
 * `message`, business `code`, SQL fragment, request id or provider string has no
 * operator value and is a disclosure, so the *classification* alone picks the
 * sentence. Nothing in this catalog takes a string that came from an error.
 *
 * ### The send wording says what the send does
 *
 * The Admin sends a quotation version to the customer. `APP6-B03` may project
 * the request to `QUOTED` as a consequence, but that is the server's move and
 * the operator is not told they are setting a request status — a dialog that
 * said so would describe an authority this screen does not have.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-wave2.json`, under `requestQuotation`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const requestQuotationMessage = messageView(VI_MESSAGES.adminWave2, 'requestQuotation');

export const REQUEST_QUOTATION_COPY = {
  page: {
    /** Interpolates the request *code*, which is display-only and authorizes nothing. */
    title: (code: string) => requestQuotationMessage.text('page.title', { code }),
    backToRequest: requestQuotationMessage.text('page.backToRequest'),
    subtitle: requestQuotationMessage.text('page.subtitle'),
  },
  sections: {
    context: requestQuotationMessage.text('sections.context'),
    draft: requestQuotationMessage.text('sections.draft'),
    lines: requestQuotationMessage.text('sections.lines'),
    totals: requestQuotationMessage.text('sections.totals'),
    history: requestQuotationMessage.text('sections.history'),
    versionDetail: requestQuotationMessage.text('sections.versionDetail'),
    validity: requestQuotationMessage.text('sections.validity'),
  },
  // The ten request-status labels used to live here. `APP6-A02` §11 moved them
  // to `shared/presentation/request-status`, which is now the one place the
  // Admin app spells a request status — this catalog, `APP5-A02`'s and the
  // design-case workbench's would otherwise have been three copies of one
  // vocabulary. Nothing about the wording changed; only its address did.
  context: {
    status: requestQuotationMessage.text('context.status'),
    submittedAt: requestQuotationMessage.text('context.submittedAt'),
    totalQuantity: requestQuotationMessage.text('context.totalQuantity'),
    customerNote: requestQuotationMessage.text('context.customerNote'),
    noCustomerNote: requestQuotationMessage.text('context.noCustomerNote'),
    catalogHeading: requestQuotationMessage.text('context.catalogHeading'),
    copHeading: requestQuotationMessage.text('context.copHeading'),
    productName: requestQuotationMessage.text('context.productName'),
    variant: requestQuotationMessage.text('context.variant'),
    copName: requestQuotationMessage.text('context.copName'),
    copDescription: requestQuotationMessage.text('context.copDescription'),
    copDimensions: requestQuotationMessage.text('context.copDimensions'),
    unnamedSubject: requestQuotationMessage.text('context.unnamedSubject'),
    copNotice: requestQuotationMessage.text('context.copNotice'),
  },
  empty: {
    heading: requestQuotationMessage.text('empty.heading'),
    body: requestQuotationMessage.text('empty.body'),
    action: requestQuotationMessage.text('empty.action'),
  },
  loading: {
    label: requestQuotationMessage.text('loading.label'),
  },
  error: {
    heading: requestQuotationMessage.text('error.heading'),
    missing: requestQuotationMessage.text('error.missing'),
    unauthenticated: requestQuotationMessage.text('error.unauthenticated'),
    retryable: requestQuotationMessage.text('error.retryable'),
    retry: requestQuotationMessage.text('error.retry'),
    historyHeading: requestQuotationMessage.text('error.historyHeading'),
    versionHeading: requestQuotationMessage.text('error.versionHeading'),
  },
  form: {
    quantityTotal: requestQuotationMessage.text('form.quantityTotal'),
    stitchCount: requestQuotationMessage.text('form.stitchCount'),
    stitchCountHint: requestQuotationMessage.text('form.stitchCountHint'),
    shippingFee: requestQuotationMessage.text('form.shippingFee'),
    manualAdjustment: requestQuotationMessage.text('form.manualAdjustment'),
    manualAdjustmentHint: requestQuotationMessage.text('form.manualAdjustmentHint'),
    adjustmentReason: requestQuotationMessage.text('form.adjustmentReason'),
    adjustmentReasonHint: requestQuotationMessage.text('form.adjustmentReasonHint'),
    lineKind: requestQuotationMessage.text('form.lineKind'),
    lineDescription: requestQuotationMessage.text('form.lineDescription'),
    lineQuantity: requestQuotationMessage.text('form.lineQuantity'),
    lineUnitPrice: requestQuotationMessage.text('form.lineUnitPrice'),
    addLine: requestQuotationMessage.text('form.addLine'),
    removeLine: requestQuotationMessage.text('form.removeLine'),
    submitCreate: requestQuotationMessage.text('form.submitCreate'),
    submitVersion: requestQuotationMessage.text('form.submitVersion'),
    submitting: requestQuotationMessage.text('form.submitting'),
    pendingTotalsNotice: requestQuotationMessage.text('form.pendingTotalsNotice'),
  },
  lineKinds: {
    PRODUCT: requestQuotationMessage.text('lineKinds.PRODUCT'),
    EMBROIDERY: requestQuotationMessage.text('lineKinds.EMBROIDERY'),
    DIGITIZING_FEE: requestQuotationMessage.text('lineKinds.DIGITIZING_FEE'),
    OTHER: requestQuotationMessage.text('lineKinds.OTHER'),
    SHIPPING: requestQuotationMessage.text('lineKinds.SHIPPING'),
    ADJUSTMENT: requestQuotationMessage.text('lineKinds.ADJUSTMENT'),
  },
  validation: {
    heading: requestQuotationMessage.text('validation.heading'),
    quantityTotal: requestQuotationMessage.text('validation.quantityTotal'),
    lineDescription: requestQuotationMessage.text('validation.lineDescription'),
    lineQuantity: requestQuotationMessage.text('validation.lineQuantity'),
    lineUnitPrice: requestQuotationMessage.text('validation.lineUnitPrice'),
    shippingFee: requestQuotationMessage.text('validation.shippingFee'),
    manualAdjustment: requestQuotationMessage.text('validation.manualAdjustment'),
    stitchCount: requestQuotationMessage.text('validation.stitchCount'),
    adjustmentReasonRequired: requestQuotationMessage.text('validation.adjustmentReasonRequired'),
    adjustmentReasonUnexpected: requestQuotationMessage.text(
      'validation.adjustmentReasonUnexpected',
    ),
    rejected: requestQuotationMessage.text('validation.rejected'),
    conflictExists: requestQuotationMessage.text('validation.conflictExists'),
    stale: requestQuotationMessage.text('validation.stale'),
    unauthenticated: requestQuotationMessage.text('validation.unauthenticated'),
    retryable: requestQuotationMessage.text('validation.retryable'),
  },
  totals: {
    subtotal: requestQuotationMessage.text('totals.subtotal'),
    manualAdjustment: requestQuotationMessage.text('totals.manualAdjustment'),
    shipping: requestQuotationMessage.text('totals.shipping'),
    total: requestQuotationMessage.text('totals.total'),
    depositPercent: requestQuotationMessage.text('totals.depositPercent'),
    deposit: requestQuotationMessage.text('totals.deposit'),
    remaining: requestQuotationMessage.text('totals.remaining'),
    quantityTotal: requestQuotationMessage.text('totals.quantityTotal'),
    stitchCount: requestQuotationMessage.text('totals.stitchCount'),
    adjustmentReason: requestQuotationMessage.text('totals.adjustmentReason'),
    serverComputed: requestQuotationMessage.text('totals.serverComputed'),
  },
  lines: {
    position: requestQuotationMessage.text('lines.position'),
    kind: requestQuotationMessage.text('lines.kind'),
    description: requestQuotationMessage.text('lines.description'),
    quantity: requestQuotationMessage.text('lines.quantity'),
    unitPrice: requestQuotationMessage.text('lines.unitPrice'),
    lineTotal: requestQuotationMessage.text('lines.lineTotal'),
    empty: requestQuotationMessage.text('lines.empty'),
  },
  version: {
    /** Interpolates the server-assigned version number. */
    label: (version: number) => requestQuotationMessage.text('version.label', { version }),
    createdAt: requestQuotationMessage.text('version.createdAt'),
    sentAt: requestQuotationMessage.text('version.sentAt'),
    acceptedAt: requestQuotationMessage.text('version.acceptedAt'),
    supersededAt: requestQuotationMessage.text('version.supersededAt'),
    expiredAt: requestQuotationMessage.text('version.expiredAt'),
    validFrom: requestQuotationMessage.text('version.validFrom'),
    validUntil: requestQuotationMessage.text('version.validUntil'),
    current: requestQuotationMessage.text('version.current'),
    selected: requestQuotationMessage.text('version.selected'),
    readOnlyNotice: requestQuotationMessage.text('version.readOnlyNotice'),
    selectLabel: requestQuotationMessage.text('version.selectLabel'),
  },
  versionStatus: {
    /**
     * The version-history column header. The column renders the *version*
     * status, so it cannot borrow `context.status` — that label names the
     * request's status, and the two were contradicting each other on screen.
     */
    column: requestQuotationMessage.text('versionStatus.column'),
    DRAFT: requestQuotationMessage.text('versionStatus.DRAFT'),
    SENT: requestQuotationMessage.text('versionStatus.SENT'),
    ACCEPTED: requestQuotationMessage.text('versionStatus.ACCEPTED'),
    REJECTED: requestQuotationMessage.text('versionStatus.REJECTED'),
    SUPERSEDED: requestQuotationMessage.text('versionStatus.SUPERSEDED'),
    EXPIRED: requestQuotationMessage.text('versionStatus.EXPIRED'),
    unknown: requestQuotationMessage.text('versionStatus.unknown'),
  },
  send: {
    action: requestQuotationMessage.text('send.action'),
    dialogTitle: requestQuotationMessage.text('send.dialogTitle'),
    /** Interpolates the version number being sent — the exact one, always. */
    dialogBody: (version: number) => requestQuotationMessage.text('send.dialogBody', { version }),
    dialogHint: requestQuotationMessage.text('send.dialogHint'),
    confirm: requestQuotationMessage.text('send.confirm'),
    cancel: requestQuotationMessage.text('send.cancel'),
    pending: requestQuotationMessage.text('send.pending'),
    successHeading: requestQuotationMessage.text('send.successHeading'),
    successBody: requestQuotationMessage.text('send.successBody'),
    replayHeading: requestQuotationMessage.text('send.replayHeading'),
    replayBody: requestQuotationMessage.text('send.replayBody'),
    staleHeading: requestQuotationMessage.text('send.staleHeading'),
    staleBody: requestQuotationMessage.text('send.staleBody'),
    failureHeading: requestQuotationMessage.text('send.failureHeading'),
    failureBody: requestQuotationMessage.text('send.failureBody'),
    unauthenticated: requestQuotationMessage.text('send.unauthenticated'),
  },
  accepted: {
    heading: requestQuotationMessage.text('accepted.heading'),
    body: requestQuotationMessage.text('accepted.body'),
    nextStepHeading: requestQuotationMessage.text('accepted.nextStepHeading'),
    nextStepBody: requestQuotationMessage.text('accepted.nextStepBody'),
    nextStepLink: requestQuotationMessage.text('accepted.nextStepLink'),
  },
} as const;
