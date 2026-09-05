/**
 * Every operator-facing string on the Admin order + deposit workspace
 * (`734:3`, `736:3`, `737:3`, `740:3`, `740:56`, `740:111`, `741:3`, `741:51`,
 * `741:87`, `742:3`, `743:3`, `743:35`).
 *
 * One catalog, so no component hard-codes copy (CLAUDE.md §5) and the screen's
 * vocabulary can be reviewed as a whole against `751:3`. The **status** labels
 * are not here: order states live in `shared/presentation/order-status.ts` and
 * the payment vocabularies in `payment-vocabulary.ts`, because the one rule that
 * matters most is that the three groups never share a phrase.
 *
 * The failure sentences are chosen by classification alone. A server `message`,
 * `code` or `requestId` is never rendered — and `741:121` extends that to the
 * concurrency vocabulary: no lock, transaction, version or contention language
 * reaches an operator, only who acted, when, and what the state is now.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-orders.json`, under `detail`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const detailMessage = messageView(VI_MESSAGES.adminOrders, 'detail');

export const ORDER_DETAIL_COPY = {
  page: {
    breadcrumb: detailMessage.text('page.breadcrumb'),
    backToQueue: detailMessage.text('page.backToQueue'),
    openRequest: detailMessage.text('page.openRequest'),
    orderTotal: detailMessage.text('page.orderTotal'),
  },
  sections: {
    frozenFacts: detailMessage.text('sections.frozenFacts'),
    frozenFactsHelp: detailMessage.text('sections.frozenFactsHelp'),
    items: detailMessage.text('sections.items'),
    itemsHelp: detailMessage.text('sections.itemsHelp'),
    deposit: detailMessage.text('sections.deposit'),
    depositHelp: detailMessage.text('sections.depositHelp'),
    attempts: detailMessage.text('sections.attempts'),
    attemptsHelp: detailMessage.text('sections.attemptsHelp'),
    evidence: detailMessage.text('sections.evidence'),
    evidenceHelp: detailMessage.text('sections.evidenceHelp'),
    actions: detailMessage.text('sections.actions'),
    history: detailMessage.text('sections.history'),
    historyHelp: detailMessage.text('sections.historyHelp'),
  },
  fields: {
    code: detailMessage.text('fields.code'),
    status: detailMessage.text('fields.status'),
    total: detailMessage.text('fields.total'),
    createdAt: detailMessage.text('fields.createdAt'),
    updatedAt: detailMessage.text('fields.updatedAt'),
    request: detailMessage.text('fields.request'),
    customer: detailMessage.text('fields.customer'),
    acceptedQuotationVersion: detailMessage.text('fields.acceptedQuotationVersion'),
    approvalSnapshot: detailMessage.text('fields.approvalSnapshot'),
  },
  items: {
    position: detailMessage.text('items.position'),
    product: detailMessage.text('items.product'),
    kind: detailMessage.text('items.kind'),
    size: detailMessage.text('items.size'),
    quantity: detailMessage.text('items.quantity'),
    unitPrice: detailMessage.text('items.unitPrice'),
    lineTotal: detailMessage.text('items.lineTotal'),
    catalog: detailMessage.text('items.catalog'),
    customerOwned: detailMessage.text('items.customerOwned'),
    /** Rendered when the order froze no size. Never a label rebuilt from a variant. */
    absent: detailMessage.text('items.absent'),
    absentNote: detailMessage.text('items.absentNote'),
    customerOwnedNote: detailMessage.text('items.customerOwnedNote'),
    skuPrefix: detailMessage.text('items.skuPrefix'),
    /**
     * The one way an operator reaches `APP8-A01`'s SKU stock workspace. It is
     * offered per line rather than from the sidenav because `APP8-B01` exposes
     * stock **by SKU** and publishes no all-SKU query — there is no
     * parameterless inventory destination to navigate to.
     */
    stockLink: detailMessage.text('items.stockLink'),
    variantPrefix: detailMessage.text('items.variantPrefix'),
    sizeNote: detailMessage.text('items.sizeNote'),
  },
  deposit: {
    expectedHeading: detailMessage.text('deposit.expectedHeading'),
    expectedAmount: detailMessage.text('deposit.expectedAmount'),
    expectedReference: detailMessage.text('deposit.expectedReference'),
    expectedNote: detailMessage.text('deposit.expectedNote'),
    obligationPrefix: detailMessage.text('deposit.obligationPrefix'),
    orderPrefix: detailMessage.text('deposit.orderPrefix'),
    satisfiedAt: detailMessage.text('deposit.satisfiedAt'),
    satisfiedBy: detailMessage.text('deposit.satisfiedBy'),
  },
  attempts: {
    amount: detailMessage.text('attempts.amount'),
    createdAt: detailMessage.text('attempts.createdAt'),
    updatedAt: detailMessage.text('attempts.updatedAt'),
    expiresAt: detailMessage.text('attempts.expiresAt'),
    succeededAt: detailMessage.text('attempts.succeededAt'),
    failedAt: detailMessage.text('attempts.failedAt'),
    reviewReason: detailMessage.text('attempts.reviewReason'),
    empty: detailMessage.text('attempts.empty'),
    pendingNote: detailMessage.text('attempts.pendingNote'),
  },
  // The two sentences that named a deposit moved to `payment-terminology.ts`,
  // which branches them on the order origin (`V01-UX-006`, §24). They are not
  // duplicated here: one string, one home.
  evidence: {
    countLabel: (count: number) => detailMessage.text('evidence.countLabel', { count }),
    readOnly: detailMessage.text('evidence.readOnly'),
    empty: detailMessage.text('evidence.empty'),
    preview: detailMessage.text('evidence.preview'),
    previewChecking: detailMessage.text('evidence.previewChecking'),
    previewBlocked: detailMessage.text('evidence.previewBlocked'),
    authorityNote: detailMessage.text('evidence.authorityNote'),
    dialogTitle: detailMessage.text('evidence.dialogTitle'),
    dialogClose: detailMessage.text('evidence.dialogClose'),
    previousImage: detailMessage.text('evidence.previousImage'),
    nextImage: detailMessage.text('evidence.nextImage'),
    metadataSubmittedAt: detailMessage.text('evidence.metadataSubmittedAt'),
    metadataMediaType: detailMessage.text('evidence.metadataMediaType'),
    metadataByteSize: detailMessage.text('evidence.metadataByteSize'),
    imageAlt: (position: number) => detailMessage.text('evidence.imageAlt', { position }),
    loading: detailMessage.text('evidence.loading'),
    unavailable: detailMessage.text('evidence.unavailable'),
    temporary: detailMessage.text('evidence.temporary'),
    retry: detailMessage.text('evidence.retry'),
  },
  // `verify`, `reopenVerify` and `settledNote` likewise live in
  // `payment-terminology.ts` now — they are the controls whose words differ
  // between a deposit and a Ready-Made payment.
  actions: {
    review: detailMessage.text('actions.review'),
    reviewAgain: detailMessage.text('actions.reviewAgain'),
    note: detailMessage.text('actions.note'),
    dismiss: detailMessage.text('actions.dismiss'),
    close: detailMessage.text('actions.close'),
    viewHistory: detailMessage.text('actions.viewHistory'),
  },
  verify: {
    help: detailMessage.text('verify.help'),
    expectedBadge: detailMessage.text('verify.expectedBadge'),
    expectedBadgeNote: detailMessage.text('verify.expectedBadgeNote'),
    observedBadge: detailMessage.text('verify.observedBadge'),
    observedBadgeNote: detailMessage.text('verify.observedBadgeNote'),
    amountLabel: detailMessage.text('verify.amountLabel'),
    amountPlaceholder: detailMessage.text('verify.amountPlaceholder'),
    amountHelp: detailMessage.text('verify.amountHelp'),
    referenceLabel: detailMessage.text('verify.referenceLabel'),
    referencePlaceholder: detailMessage.text('verify.referencePlaceholder'),
    referenceHelp: detailMessage.text('verify.referenceHelp'),
    noteLabel: detailMessage.text('verify.noteLabel'),
    notePlaceholder: detailMessage.text('verify.notePlaceholder'),
    noteHelp: detailMessage.text('verify.noteHelp'),
    required: detailMessage.text('verify.required'),
    prefillWarning: detailMessage.text('verify.prefillWarning'),
    submitting: detailMessage.text('verify.submitting'),
  },
  review: {
    title: detailMessage.text('review.title'),
    help: detailMessage.text('review.help'),
    reasonLabel: detailMessage.text('review.reasonLabel'),
    reasonHelp: detailMessage.text('review.reasonHelp'),
    optional: detailMessage.text('review.optional'),
    amountLabel: detailMessage.text('review.amountLabel'),
    amountPlaceholder: detailMessage.text('review.amountPlaceholder'),
    referenceLabel: detailMessage.text('review.referenceLabel'),
    referencePlaceholder: detailMessage.text('review.referencePlaceholder'),
    optionalNote: detailMessage.text('review.optionalNote'),
  },
  comparison: {
    heading: detailMessage.text('comparison.heading'),
    expected: detailMessage.text('comparison.expected'),
    observed: detailMessage.text('comparison.observed'),
    amountRow: detailMessage.text('comparison.amountRow'),
    referenceRow: detailMessage.text('comparison.referenceRow'),
    serverJudged: detailMessage.text('comparison.serverJudged'),
  },
  outcome: {
    heading: detailMessage.text('outcome.heading'),
    attempt: detailMessage.text('outcome.attempt'),
    obligation: detailMessage.text('outcome.obligation'),
    order: detailMessage.text('outcome.order'),
    successBadge: detailMessage.text('outcome.successBadge'),
    successTitle: detailMessage.text('outcome.successTitle'),
    successBody: detailMessage.text('outcome.successBody'),
    successNote: detailMessage.text('outcome.successNote'),
    reviewBadge: detailMessage.text('outcome.reviewBadge'),
    reviewTitle: detailMessage.text('outcome.reviewTitle'),
    reviewBody: detailMessage.text('outcome.reviewBody'),
    reviewNote: detailMessage.text('outcome.reviewNote'),
    replayed: detailMessage.text('outcome.replayed'),
    reviewRecordedTitle: detailMessage.text('outcome.reviewRecordedTitle'),
    reviewRecordedBody: detailMessage.text('outcome.reviewRecordedBody'),
    otherTitle: detailMessage.text('outcome.otherTitle'),
    otherBody: detailMessage.text('outcome.otherBody'),
  },
  requiresReview: {
    title: detailMessage.text('requiresReview.title'),
    body: detailMessage.text('requiresReview.body'),
    resolveNote: detailMessage.text('requiresReview.resolveNote'),
  },
  ambiguity: {
    badge: detailMessage.text('ambiguity.badge'),
    title: detailMessage.text('ambiguity.title'),
    body: detailMessage.text('ambiguity.body'),
    checking: detailMessage.text('ambiguity.checking'),
    unchangedTitle: detailMessage.text('ambiguity.unchangedTitle'),
    unchangedBody: detailMessage.text('ambiguity.unchangedBody'),
  },
  stale: {
    badge: detailMessage.text('stale.badge'),
    title: detailMessage.text('stale.title'),
    checking: detailMessage.text('stale.checking'),
    body: detailMessage.text('stale.body'),
  },
  history: {
    at: detailMessage.text('history.at'),
    action: detailMessage.text('history.action'),
    result: detailMessage.text('history.result'),
    amount: detailMessage.text('history.amount'),
    admin: detailMessage.text('history.admin'),
    reason: detailMessage.text('history.reason'),
    bankReference: detailMessage.text('history.bankReference'),
    empty: detailMessage.text('history.empty'),
    absent: detailMessage.text('history.absent'),
    reveal: detailMessage.text('history.reveal'),
    hide: detailMessage.text('history.hide'),
  },
  validation: {
    heading: detailMessage.text('validation.heading'),
    required: detailMessage.text('validation.required'),
    amountShape: detailMessage.text('validation.amountShape'),
    tooLong: detailMessage.text('validation.tooLong'),
  },
  failure: {
    detailMissingTitle: detailMessage.text('failure.detailMissingTitle'),
    detailMissingBody: detailMessage.text('failure.detailMissingBody'),
    detailRetryTitle: detailMessage.text('failure.detailRetryTitle'),
    detailRetryBody: detailMessage.text('failure.detailRetryBody'),
    unauthenticated: detailMessage.text('failure.unauthenticated'),
    retry: detailMessage.text('failure.retry'),
    loading: detailMessage.text('failure.loading'),
    decisionInvalidTitle: detailMessage.text('failure.decisionInvalidTitle'),
    decisionInvalidBody: detailMessage.text('failure.decisionInvalidBody'),
    decisionMissingTitle: detailMessage.text('failure.decisionMissingTitle'),
    decisionMissingBody: detailMessage.text('failure.decisionMissingBody'),
    decisionRetryTitle: detailMessage.text('failure.decisionRetryTitle'),
    decisionRetryBody: detailMessage.text('failure.decisionRetryBody'),
  },
} as const;
