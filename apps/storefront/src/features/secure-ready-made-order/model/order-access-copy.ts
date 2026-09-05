/**
 * Every user-facing string on `/truy-cap/don-hang` (`APP12-S03`).
 *
 * Read from the approved `APP12-D01` frames, never written here; the node id
 * sits beside each entry so a copy change is traceable to the design that
 * authorized it. Centralised because `CLAUDE.md` §5 forbids hard-coded
 * user-facing copy inside components.
 *
 * Design source: file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_12`, section
 * `910:257` / `911:304`, approved under `FIG-APPROVAL-APP12-D01-PO-001`:
 *
 * | registry id | node |
 * |---|---|
 * | `FIG-APP12-S03-ORDER-ACCESS-DESKTOP` | `910:258` |
 * | `FIG-APP12-S03-ORDER-ACCESS-STATES` | `911:305` |
 * | `FIG-APP12-S03-ORDER-ACCESS-MOBILE` | `911:366` |
 *
 * ### Three rules govern what may be said here
 *
 * **No internal vocabulary reaches a customer.** `917:348`'s copy-density board
 * is explicit: `FULL`, `ORDER_ACCESS`, `origin`, `reservation`, `superseded`
 * and `AWAITING_SHIPPING_FEE` appear in Admin frames and annotations only. The
 * state board prints each stored token in a caption labelled *not rendered to
 * the customer* (`911:314`, `911:321`, …) — which is precisely why none of them
 * is in this file. Nothing below was derived from a DTO field name or an enum
 * member.
 *
 * **No deposit vocabulary.** A Ready-Made order carries exactly one obligation
 * (`BR-029`), so there is no *đặt cọc*, no *phần còn lại* and no 40/60 split
 * anywhere in this feature. The transport still travels an APP7 `deposit`-named
 * evidence path (`FU-APP9-B02-01`); that is a URL, and the customer reads *ảnh
 * xác nhận chuyển khoản*.
 *
 * **Nothing a customer does may read as payment confirmed.** `917:596` removes
 * the *tôi đã chuyển khoản* button outright, and there is no sentence below
 * that a scan, a transfer or an uploaded image could make true. Only an Admin
 * verification produces settled copy.
 */

/**
 * The one heading, and why it does not vary with the state.
 *
 * `911:305` states the variance rule in the design itself — *Chỉ ba khối thay
 * đổi: pill trạng thái, khối hành động kế tiếp, khối thanh toán/giao hàng* —
 * and the heading is deliberately not among the three. So the approved package
 * draws exactly one `h1` (`910:285` desktop, `911:370` mobile) and this
 * implementation renders exactly that one rather than inventing seven more.
 *
 * The observation that it reads as payment-specific on the three terminal
 * states is recorded as `FU-APP12-S03-01` for the Product Owner rather than
 * resolved here: writing eight headings would be redesign, and `FIGMA_DELTA`
 * is 0 for this checkpoint. The *substance* of each state is carried truthfully
 * by the pill and the next-action sentence beside it, which are the two blocks
 * the design does vary.
 */
import { VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';
import { BRAND_NAME } from '@embroidery/ui';

import { ORDER_ACCESS_EVIDENCE_COPY } from './order-access-evidence-copy';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/orders.json`, under `orderAccess`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const orderAccessMessage = messageView(
  hydrateMessages(VI_MESSAGES.orders, { brand: BRAND_NAME }),
  'orderAccess',
);

export const ORDER_ACCESS_COPY = {
  /** `910:285` / `911:370`. */
  title: orderAccessMessage.text('title'),

  /**
   * `910:289` / `911:374` — the order line.
   *
   * The order code is display and support context, never an authorization
   * input (`CST-026`). Split around it so the code is interpolated rather than
   * embedded in a sentence a translator could reorder.
   */
  order: {
    prefix: orderAccessMessage.text('order.prefix'),
    suffix: orderAccessMessage.text('order.suffix'),
  },

  /**
   * The eight approved state variants (`911:308` … `911:365`).
   *
   * Each carries the pill label the design drew and the next-action sentence
   * beneath it. `note` is the second line where the frame drew one; the frames
   * that drew a single line have none, and no second line was invented to make
   * the shape uniform.
   */
  states: {
    /** `911:309` … `911:313`. */
    AWAITING_SHIPPING_FEE: {
      pill: orderAccessMessage.text('states.AWAITING_SHIPPING_FEE.pill'),
      body: orderAccessMessage.text('states.AWAITING_SHIPPING_FEE.body'),
      note: orderAccessMessage.text('states.AWAITING_SHIPPING_FEE.note'),
    },
    /** `911:316` … `911:320`. */
    AWAITING_PAYMENT: {
      pill: orderAccessMessage.text('states.AWAITING_PAYMENT.pill'),
      body: orderAccessMessage.text('states.AWAITING_PAYMENT.body'),
      note: undefined,
    },
    /** `911:324` … `911:328`. */
    PAYMENT_UNDER_REVIEW: {
      pill: orderAccessMessage.text('states.PAYMENT_UNDER_REVIEW.pill'),
      body: orderAccessMessage.text('states.PAYMENT_UNDER_REVIEW.body'),
      note: orderAccessMessage.text('states.PAYMENT_UNDER_REVIEW.note'),
    },
    /** `911:331` … `911:335`. */
    READY_FOR_DELIVERY: {
      pill: orderAccessMessage.text('states.READY_FOR_DELIVERY.pill'),
      body: orderAccessMessage.text('states.READY_FOR_DELIVERY.body'),
      note: undefined,
    },
    /** `911:339` … `911:343`. */
    DELIVERED: {
      pill: orderAccessMessage.text('states.DELIVERED.pill'),
      body: orderAccessMessage.text('states.DELIVERED.body'),
      note: undefined,
    },
    /** `911:346` … `911:350`. */
    COMPLETED: {
      pill: orderAccessMessage.text('states.COMPLETED.pill'),
      body: orderAccessMessage.text('states.COMPLETED.body'),
      note: undefined,
    },
    /** `911:353` … `911:357`. */
    CANCELLED: {
      pill: orderAccessMessage.text('states.CANCELLED.pill'),
      body: orderAccessMessage.text('states.CANCELLED.body'),
      note: undefined,
    },
    /** `911:360` … `911:364`. */
    EXPIRED: {
      pill: orderAccessMessage.text('states.EXPIRED.pill'),
      body: orderAccessMessage.text('states.EXPIRED.body'),
      note: orderAccessMessage.text('states.EXPIRED.note'),
    },
    /**
     * A stored order state the approved package drew no frame for.
     *
     * `ON_HOLD` and `CANCELLING` are published by the contract and drawn
     * nowhere in `911:305`. `APP7-D01` `751:174` settled the rule for exactly
     * this case — *show it neutrally rather than guess at its meaning* — and
     * `APP9-S01` reused it as `OTHER_STATE`. This reuses that approved rule
     * rather than inventing a ninth variant: falling through to the payment
     * frame would offer a control the server refuses, and falling through to a
     * terminal frame would claim an ending that has not happened.
     */
    OTHER_STATE: {
      pill: orderAccessMessage.text('states.OTHER_STATE.pill'),
      body: orderAccessMessage.text('states.OTHER_STATE.body'),
      note: orderAccessMessage.text('states.OTHER_STATE.note'),
    },
  },

  /** `910:294` … `910:305` — the amount card. */
  amount: {
    title: orderAccessMessage.text('amount.title'),
    /** `910:296` — the label above the exact figure. */
    highlightLabel: orderAccessMessage.text('amount.highlightLabel'),
    /** `910:299` — the frozen merchandise subtotal row. */
    merchandiseLabel: orderAccessMessage.text('amount.merchandiseLabel'),
    /** `910:303` — the exact shipping fee row. */
    feeLabel: orderAccessMessage.text('amount.feeLabel'),
    /**
     * Shown in place of the highlight while no fee is set.
     *
     * `911:313` states the rule the customer half of `BR-027` needs: before the
     * fee there is no total at all. The contract agrees physically — `payment`
     * and `delivery.feeAmount` are **absent**, not zero — so there is nothing
     * to render and this line says why.
     */
    pendingFee: orderAccessMessage.text('amount.pendingFee'),
  },

  /** `910:307` … `910:324` — the bank-transfer card. */
  transfer: {
    title: orderAccessMessage.text('transfer.title'),
    bankLabel: orderAccessMessage.text('transfer.bankLabel'),
    accountNameLabel: orderAccessMessage.text('transfer.accountNameLabel'),
    accountNumberLabel: orderAccessMessage.text('transfer.accountNumberLabel'),
    referenceLabel: orderAccessMessage.text('transfer.referenceLabel'),
    /** `910:324` — the one supporting line `917:595` allows this surface. */
    referenceNote: orderAccessMessage.text('transfer.referenceNote'),
  },

  /** `910:326` … `910:329` desktop, `911:416` … `911:419` mobile. */
  qr: {
    title: orderAccessMessage.text('qr.title'),
    /**
     * `910:329` / `911:419` — the QR's own textual fallback, and the reason §57
     * is satisfied by the layout rather than by a promise: every datum the image
     * encodes is printed as readable text in the transfer card.
     *
     * The two frames differ by one word — the desktop code sits *bên cạnh* the
     * details (`910:329`), the mobile one *bên dưới* them (`911:419`) — because
     * the panel moves between the aside and the stack. The implementation mounts
     * **one** QR panel and places it with CSS rather than mounting two and
     * hiding one, so there is no breakpoint at which a component could choose
     * between the two sentences without putting both in the DOM: two text nodes
     * for one fact, one of them wrong at any given width.
     *
     * So the direction is dropped and the sentence names the destination
     * instead, which is true at both sizes and is a smaller deviation than
     * rendering a sentence that points the wrong way. Recorded as
     * `FU-APP12-S03-04`.
     */
    hint: orderAccessMessage.text('qr.hint'),
    /**
     * Describes what the code is for, not what it looks like. "A QR code" tells
     * a screen-reader user nothing they can act on.
     */
    alt: orderAccessMessage.text('qr.alt'),
    loading: orderAccessMessage.text('qr.loading'),
    failed: orderAccessMessage.text('qr.failed'),
    retry: orderAccessMessage.text('qr.retry'),
    download: orderAccessMessage.text('qr.download'),
    /**
     * The disclaimer the approved package places *inside* the panel the
     * customer is looking at while they scan, following `APP9-D01` `816:222`.
     * Scanning is not paying, and no webhook will change that.
     */
    truth: orderAccessMessage.text('qr.truth'),
  },

  /**
   * The optional transfer-evidence control (`order-access-evidence-copy.ts`).
   *
   * Spread rather than nested so `ORDER_ACCESS_COPY.evidence`,
   * `.evidenceStatus` and `.evidenceFailure` keep the paths every component
   * already reads. The split is `APP12-V02` §41 file-size governance and
   * changes no key and no sentence.
   */
  ...ORDER_ACCESS_EVIDENCE_COPY,

  /** `910:336` / `911:421` — the access-expiry note. */
  access: {
    /**
     * Split so the instant is interpolated. This is the **secure link's**
     * expiry and is deliberately worded as such: §25 forbids conflating it with
     * the payment deadline, which is the reserved stock's own release time and
     * is a different fact with a different sentence below.
     */
    expiryPrefix: orderAccessMessage.text('access.expiryPrefix'),
    expirySuffix: orderAccessMessage.text('access.expirySuffix'),
  },

  /**
   * The payment deadline — the reserved stock's own release instant.
   *
   * A different fact from the access expiry above and never labelled as it. The
   * value is read from `paymentDeadline`, which the contract states is taken
   * from the reservation itself and never recomputed; it disappears once no
   * live reservation stands, which is exactly when a deadline must stop being
   * shown. Nothing on this route counts down (`APP9-S01` §9's rule, kept).
   */
  deadline: {
    prefix: orderAccessMessage.text('deadline.prefix'),
    suffix: orderAccessMessage.text('deadline.suffix'),
  },

  /** The FULL-payment initiation control and its refusals. */
  attempt: {
    /**
     * The customer's own explicit request to open a payment attempt. It is what
     * `917:594` names the primary action of this surface, and it is never fired
     * on mount — opening an attempt because a route rendered is not something a
     * page may do on a customer's behalf.
     */
    start: orderAccessMessage.text('attempt.start'),
    starting: orderAccessMessage.text('attempt.starting'),
    /** Shown once an attempt is open, so the control is not offered twice. */
    opened: orderAccessMessage.text('attempt.opened'),
    /**
     * A shipping-fee correction superseded the obligation this session's
     * attempt was opened against (§24). The old attempt is not migrated and is
     * not presented as the current one; the customer is told the amount moved.
     */
    superseded: orderAccessMessage.text('attempt.superseded'),
  },

  /** The refusals a failed initiation may show over a screen that still works. */
  attemptFailure: {
    FULL_PAYMENT_NOT_PAYABLE: orderAccessMessage.text('attemptFailure.FULL_PAYMENT_NOT_PAYABLE'),
    DUPLICATE_OPERATION: orderAccessMessage.text('attemptFailure.DUPLICATE_OPERATION'),
    IDEMPOTENCY_CONFLICT: orderAccessMessage.text('attemptFailure.IDEMPOTENCY_CONFLICT'),
    FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE: orderAccessMessage.text(
      'attemptFailure.FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE',
    ),
    TRANSIENT: orderAccessMessage.text('attemptFailure.TRANSIENT'),
  },

  /** The step-up overlay, reusing the APP4 verification machine unchanged. */
  stepUp: {
    title: orderAccessMessage.text('stepUp.title'),
    body: orderAccessMessage.text('stepUp.body'),
    stay: orderAccessMessage.text('stepUp.stay'),
    safety: orderAccessMessage.text('stepUp.safety'),
    verified: orderAccessMessage.text('stepUp.verified'),
    cancel: orderAccessMessage.text('stepUp.cancel'),
  },

  /** The copy controls beside each exact server value. */
  copy: {
    short: orderAccessMessage.text('copy.short'),
    amount: orderAccessMessage.text('copy.amount'),
    accountNumber: orderAccessMessage.text('copy.accountNumber'),
    reference: orderAccessMessage.text('copy.reference'),
    doneAmount: orderAccessMessage.text('copy.doneAmount'),
    doneAccountNumber: orderAccessMessage.text('copy.doneAccountNumber'),
    doneReference: orderAccessMessage.text('copy.doneReference'),
    failed: orderAccessMessage.text('copy.failed'),
  },

  /**
   * The polite live-region announcements.
   *
   * This page changes without the customer acting — an Admin sets a fee, the
   * link settles, a QR arrives — and a screen reader would otherwise experience
   * each as nothing at all. `authorized` is what the secure shell announces the
   * moment the link opens.
   */
  live: {
    authorized: orderAccessMessage.text('live.authorized'),
    qrLoading: orderAccessMessage.text('live.qrLoading'),
    qrReady: orderAccessMessage.text('live.qrReady'),
    initiating: orderAccessMessage.text('live.initiating'),
    stepUp: orderAccessMessage.text('live.stepUp'),
    evidenceUploaded: orderAccessMessage.text('live.evidenceUploaded'),
  },

  /** The document title. Names the surface, and carries no order fact. */
  pageTitle: orderAccessMessage.text('pageTitle'),
  pageDescription: orderAccessMessage.text('pageDescription'),
} as const;
