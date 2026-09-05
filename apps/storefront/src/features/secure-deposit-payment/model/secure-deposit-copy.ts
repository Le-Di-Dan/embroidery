/**
 * Every sentence `/truy-cap/thanh-toan` can say, transcribed from the approved
 * `APP7-D01` frames (`FIG-APPROVAL-APP7-D01-PO-001`).
 *
 * Nodes read for this catalog:
 *
 * | area                              | node       |
 * |-----------------------------------|------------|
 * | deposit instructions + dynamic QR | `745:3`    |
 * | before attempt initiation         | `747:3`    |
 * | step-up composition               | `747:41`   |
 * | evidence — empty / optional       | `748:3`    |
 * | evidence — uploading              | `748:29`   |
 * | evidence — INSPECTING             | `748:57`   |
 * | evidence — ACCEPTED               | `748:86`   |
 * | evidence — REJECTED               | `748:115`  |
 * | evidence — quota reached          | `748:144`  |
 * | attempt REQUIRES_REVIEW           | `749:3`    |
 * | attempt FAILED / EXPIRED          | `749:26`   |
 * | DEPOSIT verified confirmation     | `749:50`   |
 * | mobile deposit + QR               | `750:3`    |
 * | mobile evidence                   | `750:376`  |
 * | mobile confirmation               | `750:415`  |
 * | payment state & copy matrix       | `751:3`    |
 * | accessibility specification       | `753:120`  |
 *
 * ### Why the catalog is private to this feature
 *
 * These are the approved words for this one route, not a shared string table.
 * `APP5-S02` and `APP6-S01` each keep their own for the same reason: a sentence
 * that two screens import is a sentence one of them will eventually be wrong
 * about.
 *
 * ### The separations this file exists to hold
 *
 * `751:3` and `751:175` forbid collapsing three vocabularies. An **image** is
 * *đang kiểm tra / đã được tiếp nhận / không hợp lệ*; an **attempt** is *chờ xác
 * nhận tiền cọc / đang đối chiếu / đã kết thúc*; only an **order or obligation**
 * confirmed by an Admin is *đã xác nhận tiền cọc*. There is deliberately no
 * shared "đã thanh toán" badge anywhere below, and no sentence in the evidence
 * group mentions payment succeeding or failing.
 *
 * The three unavailable/loading/network sentences are **not** here. They belong
 * to `APP4-S02`'s `SECURE_LINK_COPY`, and a second copy of them would be a
 * second authority for the one behaviour that must never vary.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/custom.json`, under `deposit`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const depositMessage = messageView(VI_MESSAGES.custom, 'deposit');

export const SECURE_DEPOSIT_COPY = {
  /** Announcements for the shell's polite live region. */
  live: {
    authorized: depositMessage.text('live.authorized'),
    initiating: depositMessage.text('live.initiating'),
    stepUp: depositMessage.text('live.stepUp'),
    qrLoading: depositMessage.text('live.qrLoading'),
    qrReady: depositMessage.text('live.qrReady'),
    uploading: depositMessage.text('live.uploading'),
    uploaded: depositMessage.text('live.uploaded'),
    confirmed: depositMessage.text('live.confirmed'),
  },

  /** `747:3` — the order is created, no attempt has been opened yet. */
  preAttempt: {
    title: depositMessage.text('preAttempt.title'),
    badge: depositMessage.text('preAttempt.badge'),
    lead: depositMessage.text('preAttempt.lead'),
    summaryTitle: depositMessage.text('preAttempt.summaryTitle'),
    orderCodeLabel: depositMessage.text('preAttempt.orderCodeLabel'),
    depositLabel: depositMessage.text('preAttempt.depositLabel'),
    currencyLabel: depositMessage.text('preAttempt.currencyLabel'),
    remainderNote: depositMessage.text('preAttempt.remainderNote'),
    startTitle: depositMessage.text('preAttempt.startTitle'),
    startBody: depositMessage.text('preAttempt.startBody'),
    startAction: depositMessage.text('preAttempt.startAction'),
    starting: depositMessage.text('preAttempt.starting'),
  },

  /** `745:3` / `750:3` — instructions, QR and the waiting truth. */
  instructions: {
    title: depositMessage.text('instructions.title'),
    badge: depositMessage.text('instructions.badge'),
    orderLine: depositMessage.text('instructions.orderLine'),
    orderPrefix: depositMessage.text('instructions.orderPrefix'),
    panelTitle: depositMessage.text('instructions.panelTitle'),
    amountLabel: depositMessage.text('instructions.amountLabel'),
    referenceLabel: depositMessage.text('instructions.referenceLabel'),
    referenceNote: depositMessage.text('instructions.referenceNote'),
    bankLabel: depositMessage.text('instructions.bankLabel'),
    accountNumberLabel: depositMessage.text('instructions.accountNumberLabel'),
    accountNameLabel: depositMessage.text('instructions.accountNameLabel'),
    expiryPrefix: depositMessage.text('instructions.expiryPrefix'),
    expirySuffix: depositMessage.text('instructions.expirySuffix'),
    waitingTitle: depositMessage.text('instructions.waitingTitle'),
    waitingBody: depositMessage.text('instructions.waitingBody'),
    waitingNoButton: depositMessage.text('instructions.waitingNoButton'),
  },

  /** `745:52` / `750:40` — the QR panel and its download. */
  qr: {
    title: depositMessage.text('qr.title'),
    alt: depositMessage.text('qr.alt'),
    download: depositMessage.text('qr.download'),
    loading: depositMessage.text('qr.loading'),
    fallback: depositMessage.text('qr.fallback'),
    failed: depositMessage.text('qr.failed'),
    retry: depositMessage.text('qr.retry'),
  },

  /** `753:134` — every copy control names what it copies. */
  copy: {
    amount: depositMessage.text('copy.amount'),
    reference: depositMessage.text('copy.reference'),
    accountNumber: depositMessage.text('copy.accountNumber'),
    short: depositMessage.text('copy.short'),
    doneAmount: depositMessage.text('copy.doneAmount'),
    doneReference: depositMessage.text('copy.doneReference'),
    doneAccountNumber: depositMessage.text('copy.doneAccountNumber'),
    failed: depositMessage.text('copy.failed'),
  },

  /** `745:365` / `750:364` — prominent, and explicitly optional. */
  reminder: {
    headline: depositMessage.text('reminder.headline'),
    body: depositMessage.text('reminder.body'),
    optional: depositMessage.text('reminder.optional'),
  },

  /** `748:*` / `750:376` — the evidence panel. */
  evidence: {
    title: depositMessage.text('evidence.title'),
    optionalBadge: depositMessage.text('evidence.optionalBadge'),
    dropzoneTitle: depositMessage.text('evidence.dropzoneTitle'),
    constraints: depositMessage.text('evidence.constraints'),
    choose: depositMessage.text('evidence.choose'),
    more: depositMessage.text('evidence.more'),
    another: depositMessage.text('evidence.another'),
    skipTitle: depositMessage.text('evidence.skipTitle'),
    skipBody: depositMessage.text('evidence.skipBody'),
    optionalNote: depositMessage.text('evidence.optionalNote'),
    uploadingBadge: depositMessage.text('evidence.uploadingBadge'),
    uploadingDisabled: depositMessage.text('evidence.uploadingDisabled'),
    uploadingNote: depositMessage.text('evidence.uploadingNote'),
    notPaymentNote: depositMessage.text('evidence.notPaymentNote'),
    quotaFull: depositMessage.text('evidence.quotaFull'),
    quotaNote: depositMessage.text('evidence.quotaNote'),
    appendOnlyNote: depositMessage.text('evidence.appendOnlyNote'),
    listLabel: depositMessage.text('evidence.listLabel'),
    empty: depositMessage.text('evidence.empty'),
    loading: depositMessage.text('evidence.loading'),
  },

  /** `751:121`…`751:168` — the four contract values, as the customer reads them. */
  evidenceStatus: {
    UPLOADED: {
      label: depositMessage.text('evidenceStatus.UPLOADED.label'),
      note: depositMessage.text('evidenceStatus.UPLOADED.note'),
    },
    INSPECTING: {
      label: depositMessage.text('evidenceStatus.INSPECTING.label'),
      note: depositMessage.text('evidenceStatus.INSPECTING.note'),
    },
    ACCEPTED: {
      label: depositMessage.text('evidenceStatus.ACCEPTED.label'),
      note: depositMessage.text('evidenceStatus.ACCEPTED.note'),
    },
    REJECTED: {
      label: depositMessage.text('evidenceStatus.REJECTED.label'),
      note: depositMessage.text('evidenceStatus.REJECTED.note'),
    },
  },

  /** What a refused upload says, bounded to the codes B05 and B01 publish. */
  uploadFailure: {
    MEDIA_UNSUPPORTED: depositMessage.text('uploadFailure.MEDIA_UNSUPPORTED'),
    TOO_LARGE: depositMessage.text('uploadFailure.TOO_LARGE'),
    QUOTA_REACHED: depositMessage.text('uploadFailure.QUOTA_REACHED'),
    ATTEMPT_CLOSED: depositMessage.text('uploadFailure.ATTEMPT_CLOSED'),
    REVERIFICATION_REQUIRED: depositMessage.text('uploadFailure.REVERIFICATION_REQUIRED'),
    IN_PROGRESS: depositMessage.text('uploadFailure.IN_PROGRESS'),
    TRANSIENT: depositMessage.text('uploadFailure.TRANSIENT'),
    retry: depositMessage.text('uploadFailure.retry'),
  },

  /** `749:3` — the attempt is being reconciled, and nothing internal is shown. */
  review: {
    badge: depositMessage.text('review.badge'),
    title: depositMessage.text('review.title'),
    body: depositMessage.text('review.body'),
    note: depositMessage.text('review.note'),
  },

  /** `749:26` — the attempt is over; a new one is the only way forward. */
  terminal: {
    badge: depositMessage.text('terminal.badge'),
    title: depositMessage.text('terminal.title'),
    expiredTitle: depositMessage.text('terminal.expiredTitle'),
    body: depositMessage.text('terminal.body'),
    warning: depositMessage.text('terminal.warning'),
    note: depositMessage.text('terminal.note'),
    action: depositMessage.text('terminal.action'),
  },

  /** `751:174` — a stored value APP7 never produces is shown, not guessed at. */
  undrawn: {
    title: depositMessage.text('undrawn.title'),
    body: depositMessage.text('undrawn.body'),
    codeLabel: depositMessage.text('undrawn.codeLabel'),
  },

  /** `749:50` / `750:415` — the one authoritative success on this route. */
  confirmed: {
    title: depositMessage.text('confirmed.title'),
    lead: depositMessage.text('confirmed.lead'),
    orderBadge: depositMessage.text('confirmed.orderBadge'),
    depositBadge: depositMessage.text('confirmed.depositBadge'),
    identityTitle: depositMessage.text('confirmed.identityTitle'),
    orderCodeLabel: depositMessage.text('confirmed.orderCodeLabel'),
    depositLabel: depositMessage.text('confirmed.depositLabel'),
    referenceLabel: depositMessage.text('confirmed.referenceLabel'),
    nextTitle: depositMessage.text('confirmed.nextTitle'),
    nextBody: depositMessage.text('confirmed.nextBody'),
    evidenceNote: depositMessage.text('confirmed.evidenceNote'),
  },

  /** `747:41` — step-up runs over this page, never as a navigation. */
  stepUp: {
    title: depositMessage.text('stepUp.title'),
    body: depositMessage.text('stepUp.body'),
    stay: depositMessage.text('stepUp.stay'),
    safety: depositMessage.text('stepUp.safety'),
    verified: depositMessage.text('stepUp.verified'),
    cancel: depositMessage.text('stepUp.cancel'),
  },

  /** Refusals of the initiation itself, by the codes `APP7-B03` publishes. */
  initiateFailure: {
    DEPOSIT_NOT_PAYABLE: depositMessage.text('initiateFailure.DEPOSIT_NOT_PAYABLE'),
    DUPLICATE_OPERATION: depositMessage.text('initiateFailure.DUPLICATE_OPERATION'),
    IDEMPOTENCY_CONFLICT: depositMessage.text('initiateFailure.IDEMPOTENCY_CONFLICT'),
    DEPOSIT_INSTRUCTIONS_UNAVAILABLE: depositMessage.text(
      'initiateFailure.DEPOSIT_INSTRUCTIONS_UNAVAILABLE',
    ),
    TRANSIENT: depositMessage.text('initiateFailure.TRANSIENT'),
  },
} as const;
