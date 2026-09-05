/**
 * Every operator-facing string on the Admin design-case workbench (`APP6-A02`).
 *
 * One catalog, so no component hard-codes a sentence (`CLAUDE.md` §5) and the
 * approved copy from `692:3`, `694:3`, `694:111`, `695:3`, `695:138`, `695:266`,
 * `696:3`, `696:113`, `697:3`, `698:3`, `698:63`, `698:97` and `698:143` has
 * exactly one spelling.
 *
 * ### The failure copy never interpolates a server value
 *
 * Every operation behind this screen is a private Admin endpoint. A server
 * `message`, business `code`, SQL fragment, constraint name, request id or
 * provider string has no operator value and is a disclosure, so the
 * *classification* alone picks the sentence. Nothing in this catalog takes a
 * string that came from an error.
 *
 * ### The wording never claims an authority this screen lacks
 *
 * The Admin sends a design version for the customer to review. `APP6-B09` may
 * project the request to `DESIGN_REVIEW` as a consequence, but that is the
 * server's move, and no sentence here tells the operator they are setting a
 * request status. Nothing offers to approve a design or to request a revision
 * either: those are the customer's decisions, through `APP6-B11`.
 *
 * ### "Số hoá" here means authoring the formal Design Document
 *
 * It does not mean machine stitch digitizing. No sentence in this catalog
 * mentions a DST or PES file, a stitch count, a production job or a machine —
 * `APP6` produces none of them, and copy that implied otherwise would promise a
 * capability the system does not have.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-wave2.json`, under `requestDesignCase`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const requestDesignCaseMessage = messageView(VI_MESSAGES.adminWave2, 'requestDesignCase');

export const REQUEST_DESIGN_CASE_COPY = {
  page: {
    /** Interpolates the request *code*, which is display-only and authorizes nothing. */
    title: (code: string) => requestDesignCaseMessage.text('page.title', { code }),
    subtitle: requestDesignCaseMessage.text('page.subtitle'),
    backToRequest: requestDesignCaseMessage.text('page.backToRequest'),
  },
  sections: {
    source: requestDesignCaseMessage.text('sections.source'),
    versions: requestDesignCaseMessage.text('sections.versions'),
    selected: requestDesignCaseMessage.text('sections.selected'),
    reviews: requestDesignCaseMessage.text('sections.reviews'),
    approval: requestDesignCaseMessage.text('sections.approval'),
    context: requestDesignCaseMessage.text('sections.context'),
  },
  context: {
    status: requestDesignCaseMessage.text('context.status'),
    customer: requestDesignCaseMessage.text('context.customer'),
    quantity: requestDesignCaseMessage.text('context.quantity'),
    branch: requestDesignCaseMessage.text('context.branch'),
    branchCatalog: requestDesignCaseMessage.text('context.branchCatalog'),
    branchCustomerOwned: requestDesignCaseMessage.text('context.branchCustomerOwned'),
    unknown: requestDesignCaseMessage.text('context.unknown'),
  },
  /** `692:3` and `694:3` — the Catalog submitted Design Session. */
  source: {
    catalogTitle: requestDesignCaseMessage.text('source.catalogTitle'),
    catalogHint: requestDesignCaseMessage.text('source.catalogHint'),
    loading: requestDesignCaseMessage.text('source.loading'),
    /** `694:3`. An honest absence, never reported as a network error. */
    absentTitle: requestDesignCaseMessage.text('source.absentTitle'),
    absentBody: requestDesignCaseMessage.text('source.absentBody'),
    /** `694:111` — the customer-owned branch. */
    copTitle: requestDesignCaseMessage.text('source.copTitle'),
    copBody: requestDesignCaseMessage.text('source.copBody'),
    copEmpty: requestDesignCaseMessage.text('source.copEmpty'),
    evidenceLoading: requestDesignCaseMessage.text('source.evidenceLoading'),
    evidenceFailed: requestDesignCaseMessage.text('source.evidenceFailed'),
    evidenceRetry: requestDesignCaseMessage.text('source.evidenceRetry'),
    evidenceAlt: (index: number) => requestDesignCaseMessage.text('source.evidenceAlt', { index }),
    previewLabel: requestDesignCaseMessage.text('source.previewLabel'),
    previewEmpty: requestDesignCaseMessage.text('source.previewEmpty'),
  },
  /** `698:97` — the pre-digitizing gate. */
  gate: {
    title: requestDesignCaseMessage.text('gate.title'),
    body: requestDesignCaseMessage.text('gate.body'),
    /** The `DIGITIZING` command lives on the request detail screen, not here. */
    quoteAcceptedHint: requestDesignCaseMessage.text('gate.quoteAcceptedHint'),
    goToRequest: requestDesignCaseMessage.text('gate.goToRequest'),
  },
  /** `698:3` and `698:63`. */
  states: {
    loading: requestDesignCaseMessage.text('states.loading'),
    errorTitle: requestDesignCaseMessage.text('states.errorTitle'),
    errorRetryable: requestDesignCaseMessage.text('states.errorRetryable'),
    errorMissing: requestDesignCaseMessage.text('states.errorMissing'),
    errorUnresolvable: requestDesignCaseMessage.text('states.errorUnresolvable'),
    errorUnauthenticated: requestDesignCaseMessage.text('states.errorUnauthenticated'),
    retry: requestDesignCaseMessage.text('states.retry'),
  },
  /** The version history table. */
  history: {
    empty: requestDesignCaseMessage.text('history.empty'),
    loading: requestDesignCaseMessage.text('history.loading'),
    columnVersion: requestDesignCaseMessage.text('history.columnVersion'),
    columnStatus: requestDesignCaseMessage.text('history.columnStatus'),
    columnCurrent: requestDesignCaseMessage.text('history.columnCurrent'),
    columnReview: requestDesignCaseMessage.text('history.columnReview'),
    columnSentAt: requestDesignCaseMessage.text('history.columnSentAt'),
    select: requestDesignCaseMessage.text('history.select'),
    /**
     * The design case's own pointer. Deliberately *not* called "bản khách đang
     * duyệt": a newer DRAFT can be current while an older version is still the
     * one awaiting a decision, and one label for both would hide that.
     */
    currentYes: requestDesignCaseMessage.text('history.currentYes'),
    currentNo: requestDesignCaseMessage.text('history.currentNo'),
    reviewNone: requestDesignCaseMessage.text('history.reviewNone'),
    awaitingReview: requestDesignCaseMessage.text('history.awaitingReview'),
  },
  versionStatus: {
    DRAFT: requestDesignCaseMessage.text('versionStatus.DRAFT'),
    SENT_FOR_REVIEW: requestDesignCaseMessage.text('versionStatus.SENT_FOR_REVIEW'),
    REVISION_REQUESTED: requestDesignCaseMessage.text('versionStatus.REVISION_REQUESTED'),
    APPROVED: requestDesignCaseMessage.text('versionStatus.APPROVED'),
    SUPERSEDED: requestDesignCaseMessage.text('versionStatus.SUPERSEDED'),
    VOID: requestDesignCaseMessage.text('versionStatus.VOID'),
    unknown: requestDesignCaseMessage.text('versionStatus.unknown'),
  },
  reviewOutcome: {
    APPROVE: requestDesignCaseMessage.text('reviewOutcome.APPROVE'),
    REQUEST_REVISION: requestDesignCaseMessage.text('reviewOutcome.REQUEST_REVISION'),
    unknown: requestDesignCaseMessage.text('reviewOutcome.unknown'),
  },
  /** The selected-version card and its action matrix (§23). */
  selected: {
    none: requestDesignCaseMessage.text('selected.none'),
    loading: requestDesignCaseMessage.text('selected.loading'),
    version: (version: number) => requestDesignCaseMessage.text('selected.version', { version }),
    documentHash: requestDesignCaseMessage.text('selected.documentHash'),
    documentHashAbsent: requestDesignCaseMessage.text('selected.documentHashAbsent'),
    schemaVersion: requestDesignCaseMessage.text('selected.schemaVersion'),
    parent: requestDesignCaseMessage.text('selected.parent'),
    parentNone: requestDesignCaseMessage.text('selected.parentNone'),
    placement: requestDesignCaseMessage.text('selected.placement'),
    dimensions: requestDesignCaseMessage.text('selected.dimensions'),
    dimensionsValue: (width: string, height: string) =>
      requestDesignCaseMessage.text('selected.dimensionsValue', { width, height }),
    openAuthoring: requestDesignCaseMessage.text('selected.openAuthoring'),
    createFromThis: requestDesignCaseMessage.text('selected.createFromThis'),
    send: requestDesignCaseMessage.text('selected.send'),
    /** `696:3`. */
    awaitingTitle: requestDesignCaseMessage.text('selected.awaitingTitle'),
    awaitingBody: requestDesignCaseMessage.text('selected.awaitingBody'),
    /** `696:113`. */
    revisionTitle: requestDesignCaseMessage.text('selected.revisionTitle'),
    revisionBody: requestDesignCaseMessage.text('selected.revisionBody'),
    immutableTitle: requestDesignCaseMessage.text('selected.immutableTitle'),
    immutableBody: requestDesignCaseMessage.text('selected.immutableBody'),
    approvedTitle: requestDesignCaseMessage.text('selected.approvedTitle'),
    approvedBody: requestDesignCaseMessage.text('selected.approvedBody'),
  },
  /** `696:113` — the review-history card. */
  reviews: {
    empty: requestDesignCaseMessage.text('reviews.empty'),
    decidedAt: requestDesignCaseMessage.text('reviews.decidedAt'),
    feedbackLabel: requestDesignCaseMessage.text('reviews.feedbackLabel'),
    feedbackNone: requestDesignCaseMessage.text('reviews.feedbackNone'),
  },
  /** `695:3` — the create-DRAFT dialog. */
  create: {
    open: requestDesignCaseMessage.text('create.open'),
    title: requestDesignCaseMessage.text('create.title'),
    body: requestDesignCaseMessage.text('create.body'),
    sourceLabel: requestDesignCaseMessage.text('create.sourceLabel'),
    sourceSubmitted: requestDesignCaseMessage.text('create.sourceSubmitted'),
    sourcePredecessor: (version: number, statusLabel: string) =>
      requestDesignCaseMessage.text('create.sourcePredecessor', {
        version,
        statusLabel,
      }),
    sourceWorking: requestDesignCaseMessage.text('create.sourceWorking'),
    sourceAbsent: requestDesignCaseMessage.text('create.sourceAbsent'),
    branchLabel: requestDesignCaseMessage.text('create.branchLabel'),
    catalogNote: requestDesignCaseMessage.text('create.catalogNote'),
    sideLabel: requestDesignCaseMessage.text('create.sideLabel'),
    areaLabel: requestDesignCaseMessage.text('create.areaLabel'),
    widthLabel: requestDesignCaseMessage.text('create.widthLabel'),
    heightLabel: requestDesignCaseMessage.text('create.heightLabel'),
    copNote: requestDesignCaseMessage.text('create.copNote'),
    submit: requestDesignCaseMessage.text('create.submit'),
    cancel: requestDesignCaseMessage.text('create.cancel'),
    submitting: requestDesignCaseMessage.text('create.submitting'),
    errorRejected: requestDesignCaseMessage.text('create.errorRejected'),
    errorIneligible: requestDesignCaseMessage.text('create.errorIneligible'),
    errorMissing: requestDesignCaseMessage.text('create.errorMissing'),
    errorRetryable: requestDesignCaseMessage.text('create.errorRetryable'),
    errorUnauthenticated: requestDesignCaseMessage.text('create.errorUnauthenticated'),
    requiredField: requestDesignCaseMessage.text('create.requiredField'),
    positiveNumber: requestDesignCaseMessage.text('create.positiveNumber'),
  },
  /** `695:138` — the send confirmation. */
  send: {
    title: requestDesignCaseMessage.text('send.title'),
    /** Names the exact version, so the dialog cannot be about a different one. */
    body: (version: number) => requestDesignCaseMessage.text('send.body', { version }),
    note: requestDesignCaseMessage.text('send.note'),
    confirm: requestDesignCaseMessage.text('send.confirm'),
    cancel: requestDesignCaseMessage.text('send.cancel'),
    sending: requestDesignCaseMessage.text('send.sending'),
    replayNote: requestDesignCaseMessage.text('send.replayNote'),
    errorStale: requestDesignCaseMessage.text('send.errorStale'),
    errorRetryable: requestDesignCaseMessage.text('send.errorRetryable'),
    errorUnauthenticated: requestDesignCaseMessage.text('send.errorUnauthenticated'),
  },
  /** `695:266` — the `REVIEW_ALREADY_ACTIVE` reconciliation. */
  reviewActive: {
    title: requestDesignCaseMessage.text('reviewActive.title'),
    body: requestDesignCaseMessage.text('reviewActive.body'),
    guidance: requestDesignCaseMessage.text('reviewActive.guidance'),
    dismiss: requestDesignCaseMessage.text('reviewActive.dismiss'),
  },
  /** `697:3` — the immutable Approval Snapshot card. */
  approval: {
    title: requestDesignCaseMessage.text('approval.title'),
    note: requestDesignCaseMessage.text('approval.note'),
    documentHash: requestDesignCaseMessage.text('approval.documentHash'),
    approvedAt: requestDesignCaseMessage.text('approval.approvedAt'),
    customer: requestDesignCaseMessage.text('approval.customer'),
    customerUnknown: requestDesignCaseMessage.text('approval.customerUnknown'),
    contacts: requestDesignCaseMessage.text('approval.contacts'),
    contactsNone: requestDesignCaseMessage.text('approval.contactsNone'),
    reverified: requestDesignCaseMessage.text('approval.reverified'),
    reverifiedYes: requestDesignCaseMessage.text('approval.reverifiedYes'),
    reverifiedNo: requestDesignCaseMessage.text('approval.reverifiedNo'),
    product: requestDesignCaseMessage.text('approval.product'),
    variant: requestDesignCaseMessage.text('approval.variant'),
    variantNone: requestDesignCaseMessage.text('approval.variantNone'),
    side: requestDesignCaseMessage.text('approval.side'),
    area: requestDesignCaseMessage.text('approval.area'),
    dimensions: requestDesignCaseMessage.text('approval.dimensions'),
    quantity: requestDesignCaseMessage.text('approval.quantity'),
    agreements: requestDesignCaseMessage.text('approval.agreements'),
    agreementsNone: requestDesignCaseMessage.text('approval.agreementsNone'),
    agreementHash: requestDesignCaseMessage.text('approval.agreementHash'),
    /**
     * `APP7` has not run. The card is handoff readiness, never a claim that an
     * order, a deposit, a machine file or a production job exists.
     */
    scopeNote: requestDesignCaseMessage.text('approval.scopeNote'),
  },
  /** The in-browser DesignDocument authoring surface (§17). */
  authoring: {
    title: requestDesignCaseMessage.text('authoring.title'),
    hint: requestDesignCaseMessage.text('authoring.hint'),
    /** Says plainly what this is not, so nobody expects a stitch file. */
    scopeNote: requestDesignCaseMessage.text('authoring.scopeNote'),
    unsaved: requestDesignCaseMessage.text('authoring.unsaved'),
    close: requestDesignCaseMessage.text('authoring.close'),
    reset: requestDesignCaseMessage.text('authoring.reset'),
    elements: requestDesignCaseMessage.text('authoring.elements'),
    elementsEmpty: requestDesignCaseMessage.text('authoring.elementsEmpty'),
    addText: requestDesignCaseMessage.text('authoring.addText'),
    addTextValue: requestDesignCaseMessage.text('authoring.addTextValue'),
    remove: requestDesignCaseMessage.text('authoring.remove'),
    limitReached: requestDesignCaseMessage.text('authoring.limitReached'),
    selectElement: requestDesignCaseMessage.text('authoring.selectElement'),
    moveX: requestDesignCaseMessage.text('authoring.moveX'),
    moveY: requestDesignCaseMessage.text('authoring.moveY'),
    invalidTitle: requestDesignCaseMessage.text('authoring.invalidTitle'),
    invalidBody: requestDesignCaseMessage.text('authoring.invalidBody'),
    saveAsVersion: requestDesignCaseMessage.text('authoring.saveAsVersion'),
  },
} as const;
