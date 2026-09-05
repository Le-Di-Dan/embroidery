/**
 * Every word `APP5-S01` puts on screen, in one file.
 *
 * Design source: `FIG-APP5-S01-*` (file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_05`,
 * nodes 650:3 · 650:94 · 650:187 · 651:3 · 651:40 · 651:138 · 652:3 · 652:55 ·
 * 652:115 · 652:175 · 652:229 · 654:3 · 654:66 · 654:138 · 654:214 · 654:309 ·
 * 654:397 · 656:3 · 656:74 · 656:119 · 656:166 · 656:213 · 656:258 · 658:3 ·
 * 658:59 · 658:114 · 658:160 · 658:222), approved under
 * `FIG-APPROVAL-APP5-D01-PO-001`.
 *
 * Copy lives here and not beside the markup because `CLAUDE.md` §5 forbids
 * hard-coded user-facing strings in components, and because the rejection and
 * refusal wording is a **privacy boundary** (`APP5-S01` §12): the bounded
 * classes below are the only vocabulary this screen owns for a server refusal,
 * so widening it is an edit to one visible list rather than a string appearing
 * somewhere in a component nobody re-reads.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/custom.json`, under `request`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const requestMessage = messageView(VI_MESSAGES.custom, 'request');

export const CUSTOM_REQUEST_COPY = {
  pageTitle: requestMessage.text('pageTitle'),
  pageIntro: requestMessage.text('pageIntro'),

  steps: {
    subject: requestMessage.text('steps.subject'),
    verify: requestMessage.text('steps.verify'),
    attach: requestMessage.text('steps.attach'),
    lockedHint: requestMessage.text('steps.lockedHint'),
    // Distinct from the rail's own step labels: the rail navigates between
    // steps, this advances from step 1, and two controls sharing one accessible
    // name would be two different actions a screen reader announces identically.
    continueToVerify: requestMessage.text('steps.continueToVerify'),
  },

  chooser: {
    legend: requestMessage.text('chooser.legend'),
    catalog: requestMessage.text('chooser.catalog'),
    catalogHint: requestMessage.text('chooser.catalogHint'),
    customerOwned: requestMessage.text('chooser.customerOwned'),
    customerOwnedHint: requestMessage.text('chooser.customerOwnedHint'),
    switchWarning: requestMessage.text('chooser.switchWarning'),
  },

  catalog: {
    heading: requestMessage.text('catalog.heading'),
    contextNote: requestMessage.text('catalog.contextNote'),
    variantLegend: requestMessage.text('catalog.variantLegend'),
    variantHint: requestMessage.text('catalog.variantHint'),
    variantLoading: requestMessage.text('catalog.variantLoading'),
    variantUnnamed: requestMessage.text('catalog.variantUnnamed'),
    variantEmpty: requestMessage.text('catalog.variantEmpty'),
    variantEmptyHint: requestMessage.text('catalog.variantEmptyHint'),
    variantGone: requestMessage.text('catalog.variantGone'),
    productUnavailable: requestMessage.text('catalog.productUnavailable'),
    productUnavailableHint: requestMessage.text('catalog.productUnavailableHint'),
    loadFailed: requestMessage.text('catalog.loadFailed'),
    retry: requestMessage.text('catalog.retry'),
    sessionExpired: requestMessage.text('catalog.sessionExpired'),
    sessionExpiredHint: requestMessage.text('catalog.sessionExpiredHint'),
    sessionMissing: requestMessage.text('catalog.sessionMissing'),
  },

  customerOwned: {
    heading: requestMessage.text('customerOwned.heading'),
    nameLabel: requestMessage.text('customerOwned.nameLabel'),
    namePlaceholder: requestMessage.text('customerOwned.namePlaceholder'),
    nameRequired: requestMessage.text('customerOwned.nameRequired'),
    nameTooLong: requestMessage.text('customerOwned.nameTooLong'),
    descriptionLabel: requestMessage.text('customerOwned.descriptionLabel'),
    descriptionTooLong: requestMessage.text('customerOwned.descriptionTooLong'),
    widthLabel: requestMessage.text('customerOwned.widthLabel'),
    heightLabel: requestMessage.text('customerOwned.heightLabel'),
    dimensionInvalid: requestMessage.text('customerOwned.dimensionInvalid'),
  },

  quantity: {
    heading: requestMessage.text('quantity.heading'),
    catalogHint: requestMessage.text('quantity.catalogHint'),
    catalogHintNoVariant: requestMessage.text('quantity.catalogHintNoVariant'),
    customerOwnedHint: requestMessage.text('quantity.customerOwnedHint'),
    sizeLabel: requestMessage.text('quantity.sizeLabel'),
    sizePlaceholder: requestMessage.text('quantity.sizePlaceholder'),
    quantityLabel: requestMessage.text('quantity.quantityLabel'),
    addLine: requestMessage.text('quantity.addLine'),
    removeLine: requestMessage.text('quantity.removeLine'),
    total: requestMessage.text('quantity.total'),
    required: requestMessage.text('quantity.required'),
    invalid: requestMessage.text('quantity.invalid'),
    sizeTooLong: requestMessage.text('quantity.sizeTooLong'),
    tooManyLines: requestMessage.text('quantity.tooManyLines'),
  },

  verification: {
    heading: requestMessage.text('verification.heading'),
    intro: requestMessage.text('verification.intro'),
    verified: requestMessage.text('verification.verified'),
    required: requestMessage.text('verification.required'),
  },

  upload: {
    copHeading: requestMessage.text('upload.copHeading'),
    copHint: requestMessage.text('upload.copHint'),
    referenceHeading: requestMessage.text('upload.referenceHeading'),
    referenceHint: requestMessage.text('upload.referenceHint'),
    // Two uploaders are on screen at once on the COP branch, so the two file
    // controls need two distinct accessible names — one shared "Chọn ảnh" would
    // announce them identically and give a screen-reader user no way to tell
    // which control they are on.
    chooseCopImage: requestMessage.text('upload.chooseCopImage'),
    chooseReference: requestMessage.text('upload.chooseReference'),
    formats: requestMessage.text('upload.formats'),
    empty: requestMessage.text('upload.empty'),
    uploading: requestMessage.text('upload.uploading'),
    inspecting: requestMessage.text('upload.inspecting'),
    accepted: requestMessage.text('upload.accepted'),
    rejected: requestMessage.text('upload.rejected'),
    remove: requestMessage.text('upload.remove'),
    retry: requestMessage.text('upload.retry'),
    capReached: requestMessage.text('upload.capReached'),
    quotaReached: requestMessage.text('upload.quotaReached'),
    copRequired: requestMessage.text('upload.copRequired'),
    pending: requestMessage.text('upload.pending'),
    counter: (used: number, max: number) => requestMessage.text('upload.counter', { used, max }),
  },

  /**
   * The only refusal vocabulary this screen owns (`APP5-S01` §12).
   *
   * Bounded classes, never server prose: no scanner output, no detected MIME or
   * file signature, no bucket, key or path, no constraint name, no stack.
   */
  uploadFailure: {
    TOO_LARGE: requestMessage.text('uploadFailure.TOO_LARGE'),
    UNSUPPORTED: requestMessage.text('uploadFailure.UNSUPPORTED'),
    PROCESSING_FAILED: requestMessage.text('uploadFailure.PROCESSING_FAILED'),
    QUOTA: requestMessage.text('uploadFailure.QUOTA'),
    VERIFICATION_UNAVAILABLE: requestMessage.text('uploadFailure.VERIFICATION_UNAVAILABLE'),
    GENERIC: requestMessage.text('uploadFailure.GENERIC'),
  },

  review: {
    heading: requestMessage.text('review.heading'),
    subjectCatalog: requestMessage.text('review.subjectCatalog'),
    subjectCustomerOwned: requestMessage.text('review.subjectCustomerOwned'),
    product: requestMessage.text('review.product'),
    variant: requestMessage.text('review.variant'),
    design: requestMessage.text('review.design'),
    designAttached: requestMessage.text('review.designAttached'),
    item: requestMessage.text('review.item'),
    description: requestMessage.text('review.description'),
    dimensions: requestMessage.text('review.dimensions'),
    quantities: requestMessage.text('review.quantities'),
    itemPhotos: requestMessage.text('review.itemPhotos'),
    references: requestMessage.text('review.references'),
    contact: requestMessage.text('review.contact'),
    note: requestMessage.text('review.note'),
    noteTooLong: requestMessage.text('review.noteTooLong'),
    disclaimer: requestMessage.text('review.disclaimer'),
  },

  submit: {
    action: requestMessage.text('submit.action'),
    submitting: requestMessage.text('submit.submitting'),
    blocked: requestMessage.text('submit.blocked'),
    failed: requestMessage.text('submit.failed'),
    uncertain: requestMessage.text('submit.uncertain'),
    retry: requestMessage.text('submit.retry'),
    conflict: requestMessage.text('submit.conflict'),
    conflictAction: requestMessage.text('submit.conflictAction'),
    inProgress: requestMessage.text('submit.inProgress'),
    subjectInvalid: requestMessage.text('submit.subjectInvalid'),
    notVerified: requestMessage.text('submit.notVerified'),
    assetNotBindable: requestMessage.text('submit.assetNotBindable'),
  },

  live: {
    submitting: requestMessage.text('live.submitting'),
    inspecting: requestMessage.text('live.inspecting'),
  },
} as const;
