/**
 * Every operator-facing string on the Admin request detail screen (`APP5-A02`).
 *
 * One catalog, so no component hard-codes a sentence (CLAUDE.md §5) and the
 * approved copy from `665:3` / `665:115` / `667:3` / `667:30` / `669:3` /
 * `669:60` / `669:119` / `669:173` / `670:3` / `670:46` / `670:104` / `670:148`
 * has exactly one spelling.
 *
 * ### Two reasons, never one string
 *
 * `internal` and `customerVisible` are labelled separately everywhere they
 * appear — the field labels, the history entries and the dialog help text. An
 * operator has to be able to tell, at a glance, which of the two texts the
 * customer will read. Collapsing them into one "reason" label is how an internal
 * note about a suspected fraud ends up believed to be private while `APP5-B03`
 * publishes the other field to the customer's status page.
 *
 * ### The failure copy is bounded on purpose
 *
 * The detail, the evidence and both mutations read private Admin endpoints. A
 * server `message`, `code`, SQL fragment or provider string has no operator
 * value and is a disclosure, so the classification alone picks the sentence.
 * Nothing in this catalog interpolates a value that came from an error.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-wave2.json`, under `requestDetail`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const requestDetailMessage = messageView(VI_MESSAGES.adminWave2, 'requestDetail');

export const CUSTOM_REQUEST_DETAIL_COPY = {
  page: {
    /** Interpolates the request *code*, which is display-only and authorizes nothing. */
    title: (code: string) => requestDetailMessage.text('page.title', { code }),
    backToQueue: requestDetailMessage.text('page.backToQueue'),
  },
  sections: {
    subject: requestDetailMessage.text('sections.subject'),
    customer: requestDetailMessage.text('sections.customer'),
    quantity: requestDetailMessage.text('sections.quantity'),
    evidence: requestDetailMessage.text('sections.evidence'),
    history: requestDetailMessage.text('sections.history'),
    notes: requestDetailMessage.text('sections.notes'),
    actions: requestDetailMessage.text('sections.actions'),
  },
  status: {
    // The ten status labels and the neutral fallback moved to
    // `shared/presentation/request-status` (`APP6-A02` §11), which is now the
    // one place the Admin app spells a request status. Only the section heading
    // stays here: it names this screen's card, not a status.
    label: requestDetailMessage.text('status.label'),
  },
  request: {
    submittedAt: requestDetailMessage.text('request.submittedAt'),
    updatedAt: requestDetailMessage.text('request.updatedAt'),
    customerNote: requestDetailMessage.text('request.customerNote'),
    noCustomerNote: requestDetailMessage.text('request.noCustomerNote'),
  },
  reason: {
    internal: requestDetailMessage.text('reason.internal'),
    customerVisible: requestDetailMessage.text('reason.customerVisible'),
    /** Shown where a status legitimately carries no text at all. */
    none: requestDetailMessage.text('reason.none'),
    currentHeading: requestDetailMessage.text('reason.currentHeading'),
  },
  subject: {
    catalog: requestDetailMessage.text('subject.catalog'),
    customerOwned: requestDetailMessage.text('subject.customerOwned'),
    unknown: requestDetailMessage.text('subject.unknown'),
    productName: requestDetailMessage.text('subject.productName'),
    productSlug: requestDetailMessage.text('subject.productSlug'),
    variantColor: requestDetailMessage.text('subject.variantColor'),
    variantSize: requestDetailMessage.text('subject.variantSize'),
    designSession: requestDetailMessage.text('subject.designSession'),
    itemName: requestDetailMessage.text('subject.itemName'),
    itemDescription: requestDetailMessage.text('subject.itemDescription'),
    width: requestDetailMessage.text('subject.width'),
    height: requestDetailMessage.text('subject.height'),
    millimetres: requestDetailMessage.text('subject.millimetres'),
    /**
     * `APP5-B04` omits a label it can no longer resolve rather than filling it
     * in, so the screen says the label is gone instead of naming a product the
     * request may not have.
     */
    unavailableLabel: requestDetailMessage.text('subject.unavailableLabel'),
    noDescription: requestDetailMessage.text('subject.noDescription'),
    /** A customer-owned item has no design session and no design document. */
    copHasNoDesign: requestDetailMessage.text('subject.copHasNoDesign'),
  },
  designPreview: {
    heading: requestDetailMessage.text('designPreview.heading'),
    /**
     * `FU-APP5-B04-DESIGN-PREVIEW-01`. There is no authorized way for this
     * surface to open a Catalog design session, so the screen states that
     * plainly. It does not offer a control that would fail, and it does not
     * imply the artwork is missing — only that it is not viewable here yet.
     */
    unavailable: requestDetailMessage.text('designPreview.unavailable'),
    provenanceHelp: requestDetailMessage.text('designPreview.provenanceHelp'),
  },
  customer: {
    displayName: requestDetailMessage.text('customer.displayName'),
    unnamed: requestDetailMessage.text('customer.unnamed'),
    verifiedAt: requestDetailMessage.text('customer.verifiedAt'),
    contacts: requestDetailMessage.text('customer.contacts'),
    /** Only the deterministic mask is ever published; there is no raw value. */
    maskedNote: requestDetailMessage.text('customer.maskedNote'),
    primary: requestDetailMessage.text('customer.primary'),
    verified: requestDetailMessage.text('customer.verified'),
    unverified: requestDetailMessage.text('customer.unverified'),
    email: requestDetailMessage.text('customer.email'),
    phone: requestDetailMessage.text('customer.phone'),
    missing: requestDetailMessage.text('customer.missing'),
    noContacts: requestDetailMessage.text('customer.noContacts'),
  },
  quantity: {
    total: requestDetailMessage.text('quantity.total'),
    lines: requestDetailMessage.text('quantity.lines'),
    sizeLabel: requestDetailMessage.text('quantity.sizeLabel'),
    units: requestDetailMessage.text('quantity.units'),
    noSize: requestDetailMessage.text('quantity.noSize'),
    empty: requestDetailMessage.text('quantity.empty'),
    /** Read-only on this surface: A02 owns no quantity edit. */
    readOnly: requestDetailMessage.text('quantity.readOnly'),
  },
  evidence: {
    roleCopImage: requestDetailMessage.text('evidence.roleCopImage'),
    roleReference: requestDetailMessage.text('evidence.roleReference'),
    roleUnknown: requestDetailMessage.text('evidence.roleUnknown'),
    /** Position within its role group, so no asset id is ever a visible label. */
    altText: (role: string, position: number) =>
      requestDetailMessage.text('evidence.altText', { role, position }),
    linkedAt: requestDetailMessage.text('evidence.linkedAt'),
    size: requestDetailMessage.text('evidence.size'),
    loading: requestDetailMessage.text('evidence.loading'),
    empty: requestDetailMessage.text('evidence.empty'),
    /**
     * One bounded sentence for every unavailable reason. The server answers the
     * same way for an asset that belongs elsewhere, failed inspection, was
     * deleted or has an unsupported type — a screen that split them would
     * rebuild the enumeration oracle `APP5-B06` refuses to be.
     */
    unavailable: requestDetailMessage.text('evidence.unavailable'),
    retryable: requestDetailMessage.text('evidence.retryable'),
    retry: requestDetailMessage.text('evidence.retry'),
    open: requestDetailMessage.text('evidence.open'),
    close: requestDetailMessage.text('evidence.close'),
    viewerLabel: requestDetailMessage.text('evidence.viewerLabel'),
  },
  history: {
    empty: requestDetailMessage.text('history.empty'),
    movedTo: requestDetailMessage.text('history.movedTo'),
    movedFrom: requestDetailMessage.text('history.movedFrom'),
    occurredAt: requestDetailMessage.text('history.occurredAt'),
    actor: requestDetailMessage.text('history.actor'),
    actorAdmin: requestDetailMessage.text('history.actorAdmin'),
    actorCustomer: requestDetailMessage.text('history.actorCustomer'),
    actorSystem: requestDetailMessage.text('history.actorSystem'),
    actorUnknown: requestDetailMessage.text('history.actorUnknown'),
    sequence: requestDetailMessage.text('history.sequence'),
  },
  notes: {
    empty: requestDetailMessage.text('notes.empty'),
    kindSpam: requestDetailMessage.text('notes.kindSpam'),
    kindReject: requestDetailMessage.text('notes.kindReject'),
    kindPause: requestDetailMessage.text('notes.kindPause'),
    kindClarify: requestDetailMessage.text('notes.kindClarify'),
    kindNote: requestDetailMessage.text('notes.kindNote'),
    kindUnknown: requestDetailMessage.text('notes.kindUnknown'),
    /** Append-only: the screen offers no edit and no delete, and says so. */
    appendOnly: requestDetailMessage.text('notes.appendOnly'),
    internalOnly: requestDetailMessage.text('notes.internalOnly'),
    addHeading: requestDetailMessage.text('notes.addHeading'),
    addLabel: requestDetailMessage.text('notes.addLabel'),
    addSubmit: requestDetailMessage.text('notes.addSubmit'),
    addSubmitting: requestDetailMessage.text('notes.addSubmitting'),
    added: requestDetailMessage.text('notes.added'),
    author: requestDetailMessage.text('notes.author'),
  },
  actions: {
    startReview: requestDetailMessage.text('actions.startReview'),
    resumeReview: requestDetailMessage.text('actions.resumeReview'),
    needsClarification: requestDetailMessage.text('actions.needsClarification'),
    reject: requestDetailMessage.text('actions.reject'),
    cancel: requestDetailMessage.text('actions.cancel'),
    /** Every state APP5 owns no move from, including the APP6 ones. */
    none: requestDetailMessage.text('actions.none'),
    confirm: requestDetailMessage.text('actions.confirm'),
    dismiss: requestDetailMessage.text('actions.dismiss'),
  },
  dialog: {
    clarifyTitle: requestDetailMessage.text('dialog.clarifyTitle'),
    clarifyHelp: requestDetailMessage.text('dialog.clarifyHelp'),
    rejectTitle: requestDetailMessage.text('dialog.rejectTitle'),
    rejectHelp: requestDetailMessage.text('dialog.rejectHelp'),
    cancelTitle: requestDetailMessage.text('dialog.cancelTitle'),
    cancelHelp: requestDetailMessage.text('dialog.cancelHelp'),
    noteLabel: requestDetailMessage.text('dialog.noteLabel'),
    noteOptionalLabel: requestDetailMessage.text('dialog.noteOptionalLabel'),
    noteKindLabel: requestDetailMessage.text('dialog.noteKindLabel'),
    rejectKindReject: requestDetailMessage.text('dialog.rejectKindReject'),
    rejectKindSpam: requestDetailMessage.text('dialog.rejectKindSpam'),
    submitting: requestDetailMessage.text('dialog.submitting'),
  },
  validation: {
    heading: requestDetailMessage.text('validation.heading'),
    internalRequired: requestDetailMessage.text('validation.internalRequired'),
    customerRequired: requestDetailMessage.text('validation.customerRequired'),
    noteRequired: requestDetailMessage.text('validation.noteRequired'),
    tooLong: requestDetailMessage.text('validation.tooLong'),
  },
  outcome: {
    successHeading: requestDetailMessage.text('outcome.successHeading'),
    successBody: requestDetailMessage.text('outcome.successBody'),
    conflictHeading: requestDetailMessage.text('outcome.conflictHeading'),
    /** No "apply anyway": the operator decides again against the new state. */
    conflictBody: requestDetailMessage.text('outcome.conflictBody'),
    failureHeading: requestDetailMessage.text('outcome.failureHeading'),
    failureBody: requestDetailMessage.text('outcome.failureBody'),
    unauthenticated: requestDetailMessage.text('outcome.unauthenticated'),
  },
  states: {
    loading: requestDetailMessage.text('states.loading'),
    notFoundTitle: requestDetailMessage.text('states.notFoundTitle'),
    notFoundBody: requestDetailMessage.text('states.notFoundBody'),
    errorTitle: requestDetailMessage.text('states.errorTitle'),
    errorBody: requestDetailMessage.text('states.errorBody'),
    retry: requestDetailMessage.text('states.retry'),
  },
} as const;
