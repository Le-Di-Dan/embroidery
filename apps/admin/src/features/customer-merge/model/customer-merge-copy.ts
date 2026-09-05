/**
 * Every user-facing string in the merge workflow (CLAUDE.md §5 — no hard-coded
 * copy in components).
 *
 * The wording follows the approved `APP10-D01` A02 frames under
 * `FIG-APPROVAL-APP10-D01-PO-001`. Four rules govern what may be said here, and
 * all four are correctness rules rather than tone:
 *
 * 1. **The two roles are named, never numbered.** "Khách giữ lại" and "Khách
 *    được gộp" each carry a definition line. "Khách hàng 1 / 2" would leave the
 *    direction of an irreversible operation to be inferred from position.
 * 2. **No refusal claims more than the API published.** The open conflict names
 *    both possibilities it cannot separate; the execute participant refusal does
 *    the same. Neither picks the likelier one.
 * 3. **Nothing promises reversal.** There is no unmerge operation, so no string
 *    may suggest one, and the confirmation says so in as many words.
 * 4. **Frozen evidence is described as preserved, never as rewritten.** A merge
 *    records a decision; approval snapshots, quotation acceptances, design
 *    reviews and every append-only history keep the Customer they were taken
 *    against. Copy claiming "everything moves" would be false and would invite
 *    an operator to expect a rewrite that never happens.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-support.json`, under `merge`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const mergeMessage = messageView(VI_MESSAGES.adminSupport, 'merge');

export const CUSTOMER_MERGE_COPY = {
  page: {
    title: mergeMessage.text('page.title'),
    subtitle: mergeMessage.text('page.subtitle'),
    backToSupport: mergeMessage.text('page.backToSupport'),
  },

  selection: {
    heading: mergeMessage.text('selection.heading'),
    intro: mergeMessage.text('selection.intro'),
    survivorTitle: mergeMessage.text('selection.survivorTitle'),
    survivorMeaning: mergeMessage.text('selection.survivorMeaning'),
    loserTitle: mergeMessage.text('selection.loserTitle'),
    loserMeaning: mergeMessage.text('selection.loserMeaning'),
    kindLabel: mergeMessage.text('selection.kindLabel'),
    kindEmail: mergeMessage.text('selection.kindEmail'),
    kindPhone: mergeMessage.text('selection.kindPhone'),
    contactLabel: mergeMessage.text('selection.contactLabel'),
    placeholder: mergeMessage.text('selection.placeholder'),
    resolve: mergeMessage.text('selection.resolve'),
    resolving: mergeMessage.text('selection.resolving'),
    empty: mergeMessage.text('selection.empty'),
    replace: mergeMessage.text('selection.replace'),
    blank: mergeMessage.text('selection.blank'),
    loading: mergeMessage.text('selection.loading'),
    loadError: mergeMessage.text('selection.loadError'),
    sameCustomer: mergeMessage.text('selection.sameCustomer'),
    contactsHeading: mergeMessage.text('selection.contactsHeading'),
    verified: mergeMessage.text('selection.verified'),
    unverified: mergeMessage.text('selection.unverified'),
    primary: mergeMessage.text('selection.primary'),
    displayNameEmpty: mergeMessage.text('selection.displayNameEmpty'),
    verifiedAt: mergeMessage.text('selection.verifiedAt'),
    maskNote: mergeMessage.text('selection.maskNote'),
  },

  open: {
    heading: mergeMessage.text('open.heading'),
    reasonLabel: mergeMessage.text('open.reasonLabel'),
    reasonHint: mergeMessage.text('open.reasonHint'),
    reasonBlank: mergeMessage.text('open.reasonBlank'),
    reasonTooLong: mergeMessage.text('open.reasonTooLong'),
    submit: mergeMessage.text('open.submit'),
    submitting: mergeMessage.text('open.submitting'),
    nothingMovedNote: mergeMessage.text('open.nothingMovedNote'),
  },

  openFailure: {
    validation: mergeMessage.text('openFailure.validation'),
    participantMissing: mergeMessage.text('openFailure.participantMissing'),
    // Two causes the API does not separate, both named.
    conflict: mergeMessage.text('openFailure.conflict'),
    unauthenticated: mergeMessage.text('openFailure.unauthenticated'),
    forbidden: mergeMessage.text('openFailure.forbidden'),
    generic: mergeMessage.text('openFailure.generic'),
  },

  caseDetail: {
    heading: mergeMessage.text('caseDetail.heading'),
    caseReference: mergeMessage.text('caseDetail.caseReference'),
    loading: mergeMessage.text('caseDetail.loading'),
    loadError: mergeMessage.text('caseDetail.loadError'),
    loadErrorBody: mergeMessage.text('caseDetail.loadErrorBody'),
    notFound: mergeMessage.text('caseDetail.notFound'),
    notFoundBody: mergeMessage.text('caseDetail.notFoundBody'),
    retry: mergeMessage.text('caseDetail.retry'),
    status: mergeMessage.text('caseDetail.status'),
    statusRequested: mergeMessage.text('caseDetail.statusRequested'),
    statusExecuted: mergeMessage.text('caseDetail.statusExecuted'),
    statusRejected: mergeMessage.text('caseDetail.statusRejected'),
    requestedAt: mergeMessage.text('caseDetail.requestedAt'),
    decidedAt: mergeMessage.text('caseDetail.decidedAt'),
    openReason: mergeMessage.text('caseDetail.openReason'),
    directionNote: mergeMessage.text('caseDetail.directionNote'),
  },

  preview: {
    heading: mergeMessage.text('preview.heading'),
    intro: mergeMessage.text('preview.intro'),
    contactPoints: mergeMessage.text('preview.contactPoints'),
    activeSecureAccessGrants: mergeMessage.text('preview.activeSecureAccessGrants'),
    activeSecureAccessGrantsNote: mergeMessage.text('preview.activeSecureAccessGrantsNote'),
    customRequests: mergeMessage.text('preview.customRequests'),
    orders: mergeMessage.text('preview.orders'),
    uploadedAssets: mergeMessage.text('preview.uploadedAssets'),
    businessProfileHeading: mergeMessage.text('preview.businessProfileHeading'),
    businessProfileLoserHas: mergeMessage.text('preview.businessProfileLoserHas'),
    businessProfileSurvivorHas: mergeMessage.text('preview.businessProfileSurvivorHas'),
    yes: mergeMessage.text('preview.yes'),
    no: mergeMessage.text('preview.no'),
    frozenNote: mergeMessage.text('preview.frozenNote'),
    noPreviewAfterDecision: mergeMessage.text('preview.noPreviewAfterDecision'),
  },

  blocker: {
    title: mergeMessage.text('blocker.title'),
    body: mergeMessage.text('blocker.body'),
    resolution: mergeMessage.text('blocker.resolution'),
    executeDisabled: mergeMessage.text('blocker.executeDisabled'),
  },

  execute: {
    action: mergeMessage.text('execute.action'),
    title: mergeMessage.text('execute.title'),
    survivorLabel: mergeMessage.text('execute.survivorLabel'),
    loserLabel: mergeMessage.text('execute.loserLabel'),
    direction: mergeMessage.text('execute.direction'),
    effects: mergeMessage.text('execute.effects'),
    effectContacts: mergeMessage.text('execute.effectContacts'),
    effectOwnership: mergeMessage.text('execute.effectOwnership'),
    effectGrants: mergeMessage.text('execute.effectGrants'),
    effectFrozen: mergeMessage.text('execute.effectFrozen'),
    irreversible: mergeMessage.text('execute.irreversible'),
    confirm: mergeMessage.text('execute.confirm'),
    working: mergeMessage.text('execute.working'),
    cancel: mergeMessage.text('execute.cancel'),
    close: mergeMessage.text('execute.close'),
    successTitle: mergeMessage.text('execute.successTitle'),
    successBody: mergeMessage.text('execute.successBody'),
    alreadyTitle: mergeMessage.text('execute.alreadyTitle'),
    alreadyBody: mergeMessage.text('execute.alreadyBody'),
  },

  executeFailure: {
    businessProfile: mergeMessage.text('executeFailure.businessProfile'),
    notExecutable: mergeMessage.text('executeFailure.notExecutable'),
    // One approved frame (`841:3`) covers both causes; the copy names both.
    participantOrContact: mergeMessage.text('executeFailure.participantOrContact'),
    stale: mergeMessage.text('executeFailure.stale'),
    unauthenticated: mergeMessage.text('executeFailure.unauthenticated'),
    forbidden: mergeMessage.text('executeFailure.forbidden'),
    generic: mergeMessage.text('executeFailure.generic'),
  },

  reject: {
    action: mergeMessage.text('reject.action'),
    title: mergeMessage.text('reject.title'),
    body: mergeMessage.text('reject.body'),
    reasonLabel: mergeMessage.text('reject.reasonLabel'),
    reasonHint: mergeMessage.text('reject.reasonHint'),
    reasonBlank: mergeMessage.text('reject.reasonBlank'),
    reasonTooLong: mergeMessage.text('reject.reasonTooLong'),
    confirm: mergeMessage.text('reject.confirm'),
    working: mergeMessage.text('reject.working'),
    cancel: mergeMessage.text('reject.cancel'),
    close: mergeMessage.text('reject.close'),
    successTitle: mergeMessage.text('reject.successTitle'),
    successBody: mergeMessage.text('reject.successBody'),
  },

  rejectFailure: {
    validation: mergeMessage.text('rejectFailure.validation'),
    alreadyDecided: mergeMessage.text('rejectFailure.alreadyDecided'),
    stale: mergeMessage.text('rejectFailure.stale'),
    unauthenticated: mergeMessage.text('rejectFailure.unauthenticated'),
    forbidden: mergeMessage.text('rejectFailure.forbidden'),
    generic: mergeMessage.text('rejectFailure.generic'),
  },

  executed: {
    heading: mergeMessage.text('executed.heading'),
    body: mergeMessage.text('executed.body'),
    // Says in place why no figures and no timeline appear, so their absence
    // reads as a decision rather than as a screen that failed to load them.
    noCountsNote: mergeMessage.text('executed.noCountsNote'),
    noUndoNote: mergeMessage.text('executed.noUndoNote'),
  },

  rejected: {
    heading: mergeMessage.text('rejected.heading'),
    body: mergeMessage.text('rejected.body'),
    // The rejection reason has no column and no read operation; saying so is
    // more honest than an empty field the operator would read as missing data.
    noReasonNote: mergeMessage.text('rejected.noReasonNote'),
  },
} as const;
