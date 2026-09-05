/**
 * Every sentence `/truy-cap/thanh-toan-con-lai` can say, transcribed from the
 * approved `APP9-D01` frames (`FIG-APPROVAL-APP9-D01-PO-001`).
 *
 * Nodes read for this catalog:
 *
 * | area                                   | node       |
 * |----------------------------------------|------------|
 * | payable — instructions + dynamic QR    | `816:4`    |
 * | payable — before the attempt is opened | `816:231`  |
 * | transfer evidence — not sent           | `817:4`    |
 * | transfer evidence — sent               | `817:31`   |
 * | order status — not yet payable         | `818:4`    |
 * | order status — paid, preparing delivery| `818:37`   |
 * | order status — DELIVERED               | `818:87`   |
 * | order status — COMPLETED               | `818:137`  |
 * | mobile 390 — payable + QR, DELIVERED   | `819:4`, `819:200` |
 * | secure link unavailable                | `819:221`  |
 * | storefront error catalog               | `819:237`  |
 * | lifecycle & label mapping              | `820:4`    |
 *
 * ### Why the catalog is private to this feature
 *
 * These are the approved words for this one route, not a shared string table.
 * `APP5-S02`, `APP6-S01` and `APP7-S01` each keep their own for the same
 * reason: a sentence that two screens import is a sentence one of them will
 * eventually be wrong about. That is not theoretical here — the deposit lane's
 * evidence copy says *tiền cọc* in four places, and importing it would put the
 * word "deposit" on the balance screen, which is precisely what `APP9-S01` §11
 * forbids.
 *
 * ### The separations this file exists to hold
 *
 * An **image** is *đang kiểm tra / đã được tiếp nhận / không hợp lệ*; an
 * **attempt** is an intention to transfer; only an **order or obligation**
 * confirmed by an Admin is *đã nhận đủ thanh toán*. No sentence in the evidence
 * group mentions a payment succeeding or failing, and there is no
 * *tôi đã chuyển khoản* control anywhere in this feature for one to attach to.
 *
 * ### What is deliberately absent
 *
 * No carrier, tracking code, courier, estimate or shipment sentence exists
 * below — `818:84` and `818:134` mark that exclusion on the approved frames
 * themselves. No cancellation, refund or return sentence exists either
 * (`818:184`, `PO-APP9-001 = OPTION A — DEFER`), and no shipping-fee
 * acknowledgement wording exists because that UI is deferred by design
 * (`FIG-APP9-FEE-ACK-DISPOSITION`). The three unavailable/loading/network
 * sentences are **not** here: they belong to `APP4-S02`'s `SECURE_LINK_COPY`,
 * and a second copy of them would be a second authority for the one behaviour
 * that must never vary.
 */
import { BRAND_NAME, VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/custom.json`, under `finalPayment`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const finalPaymentMessage = messageView(
  hydrateMessages(VI_MESSAGES.custom, { brand: BRAND_NAME }),
  'finalPayment',
);

export const SECURE_FINAL_PAYMENT_COPY = {
  /** Announcements for the shell's polite live region. */
  live: {
    authorized: finalPaymentMessage.text('live.authorized'),
    initiating: finalPaymentMessage.text('live.initiating'),
    stepUp: finalPaymentMessage.text('live.stepUp'),
    qrLoading: finalPaymentMessage.text('live.qrLoading'),
    qrReady: finalPaymentMessage.text('live.qrReady'),
    uploading: finalPaymentMessage.text('live.uploading'),
    settled: finalPaymentMessage.text('live.settled'),
  },

  /** The order line every panel prints under its heading (`816:15`). */
  order: {
    prefix: finalPaymentMessage.text('order.prefix'),
    suffix: finalPaymentMessage.text('order.suffix'),
    codeLabel: finalPaymentMessage.text('order.codeLabel'),
    /** `818:34` — the one money row the delivered contract can fill. */
    paidRemainingLabel: finalPaymentMessage.text('order.paidRemainingLabel'),
    factsTitle: finalPaymentMessage.text('order.factsTitle'),
  },

  /** `818:4` — production is not finished, or the balance is not yet open. */
  notPayable: {
    title: finalPaymentMessage.text('notPayable.title'),
    cardTitle: finalPaymentMessage.text('notPayable.cardTitle'),
    body: finalPaymentMessage.text('notPayable.body'),
    note: finalPaymentMessage.text('notPayable.note'),
  },

  /** `816:231` — the balance is payable and no attempt is open yet. */
  preAttempt: {
    title: finalPaymentMessage.text('preAttempt.title'),
    badge: finalPaymentMessage.text('preAttempt.badge'),
    summaryTitle: finalPaymentMessage.text('preAttempt.summaryTitle'),
    highlightLabel: finalPaymentMessage.text('preAttempt.highlightLabel'),
    startTitle: finalPaymentMessage.text('preAttempt.startTitle'),
    startBody: finalPaymentMessage.text('preAttempt.startBody'),
    startAction: finalPaymentMessage.text('preAttempt.startAction'),
    starting: finalPaymentMessage.text('preAttempt.starting'),
  },

  /** `816:4` / `819:4` — instructions, QR and the waiting truth. */
  instructions: {
    title: finalPaymentMessage.text('instructions.title'),
    badge: finalPaymentMessage.text('instructions.badge'),
    amountTitle: finalPaymentMessage.text('instructions.amountTitle'),
    amountNote: finalPaymentMessage.text('instructions.amountNote'),
    panelTitle: finalPaymentMessage.text('instructions.panelTitle'),
    panelLead: finalPaymentMessage.text('instructions.panelLead'),
    bankLabel: finalPaymentMessage.text('instructions.bankLabel'),
    accountNumberLabel: finalPaymentMessage.text('instructions.accountNumberLabel'),
    accountNameLabel: finalPaymentMessage.text('instructions.accountNameLabel'),
    referenceLabel: finalPaymentMessage.text('instructions.referenceLabel'),
    referenceNote: finalPaymentMessage.text('instructions.referenceNote'),
    waitingTitle: finalPaymentMessage.text('instructions.waitingTitle'),
    waitingBody: finalPaymentMessage.text('instructions.waitingBody'),
    expiryPrefix: finalPaymentMessage.text('instructions.expiryPrefix'),
    expirySuffix: finalPaymentMessage.text('instructions.expirySuffix'),
  },

  /** `816:63` / `816:221` — the QR panel and the sentence that bounds it. */
  qr: {
    title: finalPaymentMessage.text('qr.title'),
    alt: finalPaymentMessage.text('qr.alt'),
    hint: finalPaymentMessage.text('qr.hint'),
    truth: finalPaymentMessage.text('qr.truth'),
    download: finalPaymentMessage.text('qr.download'),
    loading: finalPaymentMessage.text('qr.loading'),
    fallback: finalPaymentMessage.text('qr.fallback'),
    failed: finalPaymentMessage.text('qr.failed'),
    retry: finalPaymentMessage.text('qr.retry'),
  },

  /** `816:41` — every copy control names what it copies. */
  copy: {
    amount: finalPaymentMessage.text('copy.amount'),
    reference: finalPaymentMessage.text('copy.reference'),
    accountNumber: finalPaymentMessage.text('copy.accountNumber'),
    short: finalPaymentMessage.text('copy.short'),
    doneAmount: finalPaymentMessage.text('copy.doneAmount'),
    doneReference: finalPaymentMessage.text('copy.doneReference'),
    doneAccountNumber: finalPaymentMessage.text('copy.doneAccountNumber'),
    failed: finalPaymentMessage.text('copy.failed'),
  },

  /**
   * `817:4` / `817:31` — optional transfer evidence, in the customer's words.
   *
   * Not one sentence here says *đặt cọc*. The route these calls travel is
   * deposit-named and must stay so (`FU-APP9-B02-01`); the screen is not.
   */
  evidence: {
    title: finalPaymentMessage.text('evidence.title'),
    optionalBadge: finalPaymentMessage.text('evidence.optionalBadge'),
    lead: finalPaymentMessage.text('evidence.lead'),
    dropzoneTitle: finalPaymentMessage.text('evidence.dropzoneTitle'),
    dropzoneHint: finalPaymentMessage.text('evidence.dropzoneHint'),
    constraints: finalPaymentMessage.text('evidence.constraints'),
    choose: finalPaymentMessage.text('evidence.choose'),
    more: finalPaymentMessage.text('evidence.more'),
    uploadingBadge: finalPaymentMessage.text('evidence.uploadingBadge'),
    uploadingDisabled: finalPaymentMessage.text('evidence.uploadingDisabled'),
    uploadingNote: finalPaymentMessage.text('evidence.uploadingNote'),
    notProof: finalPaymentMessage.text('evidence.notProof'),
    quotaFull: finalPaymentMessage.text('evidence.quotaFull'),
    quotaNote: finalPaymentMessage.text('evidence.quotaNote'),
    appendOnlyNote: finalPaymentMessage.text('evidence.appendOnlyNote'),
    listLabel: finalPaymentMessage.text('evidence.listLabel'),
    empty: finalPaymentMessage.text('evidence.empty'),
    loading: finalPaymentMessage.text('evidence.loading'),
  },

  /** The four contract values, as the customer reads them. */
  evidenceStatus: {
    UPLOADED: {
      label: finalPaymentMessage.text('evidenceStatus.UPLOADED.label'),
      note: finalPaymentMessage.text('evidenceStatus.UPLOADED.note'),
    },
    INSPECTING: {
      label: finalPaymentMessage.text('evidenceStatus.INSPECTING.label'),
      note: finalPaymentMessage.text('evidenceStatus.INSPECTING.note'),
    },
    ACCEPTED: {
      label: finalPaymentMessage.text('evidenceStatus.ACCEPTED.label'),
      note: finalPaymentMessage.text('evidenceStatus.ACCEPTED.note'),
    },
    REJECTED: {
      label: finalPaymentMessage.text('evidenceStatus.REJECTED.label'),
      note: finalPaymentMessage.text('evidenceStatus.REJECTED.note'),
    },
  },

  /** What a refused upload says, bounded to the codes B05 and B01 publish. */
  uploadFailure: {
    MEDIA_UNSUPPORTED: finalPaymentMessage.text('uploadFailure.MEDIA_UNSUPPORTED'),
    TOO_LARGE: finalPaymentMessage.text('uploadFailure.TOO_LARGE'),
    QUOTA_REACHED: finalPaymentMessage.text('uploadFailure.QUOTA_REACHED'),
    ATTEMPT_CLOSED: finalPaymentMessage.text('uploadFailure.ATTEMPT_CLOSED'),
    REVERIFICATION_REQUIRED: finalPaymentMessage.text('uploadFailure.REVERIFICATION_REQUIRED'),
    IN_PROGRESS: finalPaymentMessage.text('uploadFailure.IN_PROGRESS'),
    TRANSIENT: finalPaymentMessage.text('uploadFailure.TRANSIENT'),
    retry: finalPaymentMessage.text('uploadFailure.retry'),
  },

  /** `818:37` / `818:87` / `818:137` — the settled lane, in three readings. */
  settled: {
    title: finalPaymentMessage.text('settled.title'),
    progressLabel: finalPaymentMessage.text('settled.progressLabel'),
    paid: {
      cardTitle: finalPaymentMessage.text('settled.paid.cardTitle'),
      body: finalPaymentMessage.text('settled.paid.body'),
    },
    delivered: {
      cardTitle: finalPaymentMessage.text('settled.delivered.cardTitle'),
      body: finalPaymentMessage.text('settled.delivered.body'),
    },
    completed: {
      cardTitle: finalPaymentMessage.text('settled.completed.cardTitle'),
      body: finalPaymentMessage.text('settled.completed.body'),
    },
  },

  /**
   * A stored obligation state the approved package draws no frame for.
   *
   * `CANCELLED` and `SUPERSEDED` are shown neutrally rather than guessed at,
   * following the rule `APP7-D01` fixed at `751:174`. No cancellation or refund
   * action is offered here, because none exists (`PO-APP9-001`).
   */
  otherState: {
    title: finalPaymentMessage.text('otherState.title'),
    cardTitle: finalPaymentMessage.text('otherState.cardTitle'),
    body: finalPaymentMessage.text('otherState.body'),
  },

  /** Step-up runs over this page, never as a navigation. */
  stepUp: {
    title: finalPaymentMessage.text('stepUp.title'),
    body: finalPaymentMessage.text('stepUp.body'),
    stay: finalPaymentMessage.text('stepUp.stay'),
    safety: finalPaymentMessage.text('stepUp.safety'),
    verified: finalPaymentMessage.text('stepUp.verified'),
    cancel: finalPaymentMessage.text('stepUp.cancel'),
  },

  /** Refusals of the initiation itself, by the codes `APP9-B02` publishes. */
  initiateFailure: {
    FINAL_PAYMENT_NOT_PAYABLE: finalPaymentMessage.text(
      'initiateFailure.FINAL_PAYMENT_NOT_PAYABLE',
    ),
    DUPLICATE_OPERATION: finalPaymentMessage.text('initiateFailure.DUPLICATE_OPERATION'),
    IDEMPOTENCY_CONFLICT: finalPaymentMessage.text('initiateFailure.IDEMPOTENCY_CONFLICT'),
    FINAL_PAYMENT_INSTRUCTIONS_UNAVAILABLE: finalPaymentMessage.text(
      'initiateFailure.FINAL_PAYMENT_INSTRUCTIONS_UNAVAILABLE',
    ),
    TRANSIENT: finalPaymentMessage.text('initiateFailure.TRANSIENT'),
  },
} as const;
