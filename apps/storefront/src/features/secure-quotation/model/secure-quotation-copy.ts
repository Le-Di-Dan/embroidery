/**
 * Every customer-facing string on `/truy-cap/bao-gia` (`APP6-S01`).
 *
 * One catalog, so no component hard-codes a sentence (`CLAUDE.md` §5) and the
 * approved copy from `700:3`, `701:3`, `701:88`, `701:147`, `702:3`, `702:65`,
 * `702:129`, `704:3` and `705:3` has exactly one spelling. Where a string is
 * lifted verbatim from a frame the node is named beside it.
 *
 * ### The three things nothing here is allowed to say
 *
 * **No payment, no order, no stock.** Accepting a quotation commits a price and
 * nothing else; the deposit, the order and the inventory hold are APP7/APP8.
 * The approved frames say so themselves — `701:197` prints *chấp nhận báo giá
 * không thu tiền và không tạo đơn hàng* on the live offer, and `701:207` /
 * `701:208` repeat it on the committed one — so the copy below never claims
 * money moved, an order exists, or production began.
 *
 * **No claim about the request when a price is declined.** `APP6-B05`'s
 * rejection moves the quotation only; the custom request stays in the quotation
 * stage, where the workshop may send a revised version (`702:64`).
 *
 * **No server prose, and no operator note.** Every refusal is chosen by the
 * classified failure (`secure-quotation-failure.ts`), never by a `message` from
 * the API: those are English operator text on a surface anyone holding a link
 * can reach. For the same reason the adjustment row is labelled neutrally —
 * `700:42` shows the sample text *Giảm giá khách quen*, which is exactly the
 * internal `adjustmentReason` `APP6-B04` deliberately does not return, so the
 * amount is shown and the explanation is not (§17, and the closure of
 * `FU-APP6-B04-CUSTOMER-ADJUSTMENT-EXPLANATION-01`).
 *
 * The three access states — bootstrap (`703:3`), unavailable and transient
 * (`703:36`) — are **not here**. They belong to `APP4-S02`'s `SECURE_LINK_COPY`
 * and are reused rather than redrawn, which is the `APP5-D01` ruling that a
 * second copy of a security state is a second authority for the same behaviour.
 */

import { BRAND_NAME, VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/custom.json`, under `quotation`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const quotationMessage = messageView(
  hydrateMessages(VI_MESSAGES.custom, { brand: BRAND_NAME }),
  'quotation',
);

export const SECURE_QUOTATION_COPY = {
  /** The document title. Reused as the accessible page name. */
  pageTitle: quotationMessage.text('pageTitle'),

  /** `700:12` … `702:138` — the card headline, one per drawn state. */
  titles: {
    live: quotationMessage.text('titles.live'),
    accepted: quotationMessage.text('titles.accepted'),
    rejected: quotationMessage.text('titles.rejected'),
    stale: quotationMessage.text('titles.stale'),
    expired: quotationMessage.text('titles.expired'),
  },

  /**
   * `700:13` … `702:139` — the line under the headline.
   *
   * The frames print a request code (`REQ-…`); `APP6-B04` returns the quotation
   * code and no request identifier at all, so the quotation code is what is
   * shown. Nothing here is an authorization input — both codes are display-only
   * and neither endpoint accepts one.
   */
  subtitles: {
    live: (code: string, version: number, quantity: number) =>
      quotationMessage.text('subtitles.live', { code, version, quantity }),
    accepted: (code: string) => quotationMessage.text('subtitles.accepted', { code }),
    rejected: (code: string) => quotationMessage.text('subtitles.rejected', { code }),
    stale: (code: string, version: number) =>
      quotationMessage.text('subtitles.stale', { code, version }),
    expired: (code: string) => quotationMessage.text('subtitles.expired', { code }),
  },

  /** `700:11` … `702:137` — the status pill. Never colour alone. */
  badges: {
    live: (until: string) => quotationMessage.text('badges.live', { until }),
    liveWithDays: (until: string, days: number) =>
      quotationMessage.text('badges.liveWithDays', { until, days }),
    liveUnknown: quotationMessage.text('badges.liveUnknown'),
    expired: (until: string) => quotationMessage.text('badges.expired', { until }),
    expiredUnknown: quotationMessage.text('badges.expiredUnknown'),
    accepted: (at: string) => quotationMessage.text('badges.accepted', { at }),
    rejected: (at: string) => quotationMessage.text('badges.rejected', { at }),
    /**
     * When no instant is available.
     *
     * `APP6-B04` carries no decision timestamp — only the decision responses do
     * — so a quotation found already decided (accepted in another tab, or
     * before this mount) states the fact without inventing a moment for it.
     */
    acceptedUndated: quotationMessage.text('badges.acceptedUndated'),
    rejectedUndated: quotationMessage.text('badges.rejectedUndated'),
    stale: quotationMessage.text('badges.stale'),
  },

  /** `700:14` … `700:18` — the line-item table. */
  lines: {
    heading: quotationMessage.text('lines.heading'),
    description: quotationMessage.text('lines.description'),
    quantity: quotationMessage.text('lines.quantity'),
    unitPrice: quotationMessage.text('lines.unitPrice'),
    lineTotal: quotationMessage.text('lines.lineTotal'),
    /** The mobile stack (`704:15`) prints quantity and unit price as one line. */
    quantityAndUnit: (quantity: number, unitPrice: string) =>
      quotationMessage.text('lines.quantityAndUnit', { quantity, unitPrice }),
    empty: quotationMessage.text('lines.empty'),
  },

  /**
   * The six line kinds `APP6-B04` can return.
   *
   * Spelled from the contract enum rather than from a free list, so a kind the
   * server adds later shows its raw value instead of silently disappearing.
   */
  lineKinds: {
    PRODUCT: quotationMessage.text('lineKinds.PRODUCT'),
    EMBROIDERY: quotationMessage.text('lineKinds.EMBROIDERY'),
    DIGITIZING_FEE: quotationMessage.text('lineKinds.DIGITIZING_FEE'),
    SHIPPING: quotationMessage.text('lineKinds.SHIPPING'),
    ADJUSTMENT: quotationMessage.text('lineKinds.ADJUSTMENT'),
    OTHER: quotationMessage.text('lineKinds.OTHER'),
  },

  /** `700:39` totals and `700:48` deposit split. Every figure is the server's. */
  totals: {
    heading: quotationMessage.text('totals.heading'),
    subtotal: quotationMessage.text('totals.subtotal'),
    /**
     * Deliberately neutral.
     *
     * `700:42` reads *Giảm giá khách quen* — an operator's note, which is the
     * one field `APP6-B04` withholds. The amount is the truth this screen owes
     * the customer; the reason is internal.
     */
    manualAdjustment: quotationMessage.text('totals.manualAdjustment'),
    shippingFee: quotationMessage.text('totals.shippingFee'),
    total: quotationMessage.text('totals.total'),
    /** Interpolates the share **this version was priced at**, not today's policy. */
    deposit: (percent: string) => quotationMessage.text('totals.deposit', { percent }),
    /**
     * No complementary share.
     *
     * `700:51` prints *Phần còn lại 60%*, which only exists by subtracting the
     * deposit share. The remaining **amount** is the server's own recorded
     * figure and is shown; the percentage is not, because deriving it would be
     * exactly the client-side arithmetic on money §16 forbids.
     */
    remaining: quotationMessage.text('totals.remaining'),
    note: quotationMessage.text('totals.note'),
  },

  /** `700:54` … `702:180` — the small print under the figures. */
  notes: {
    live: quotationMessage.text('notes.live'),
    accepted: quotationMessage.text('notes.accepted'),
    rejected: quotationMessage.text('notes.rejected'),
    stale: quotationMessage.text('notes.stale'),
    expired: quotationMessage.text('notes.expired'),
  },

  /** `700:55`, `700:57`, `701:140`, `702:127`. */
  actions: {
    heading: quotationMessage.text('actions.heading'),
    accept: quotationMessage.text('actions.accept'),
    reject: quotationMessage.text('actions.reject'),
    accepting: quotationMessage.text('actions.accepting'),
    rejecting: quotationMessage.text('actions.rejecting'),
    reconciling: quotationMessage.text('actions.reconciling'),
    viewLatest: quotationMessage.text('actions.viewLatest'),
  },

  /** `701:63` — the confirmation, an explicit second action before anything commits. */
  acceptConfirm: {
    title: quotationMessage.text('acceptConfirm.title'),
    body: (total: string) => quotationMessage.text('acceptConfirm.body', { total }),
    note: quotationMessage.text('acceptConfirm.note'),
    confirm: quotationMessage.text('acceptConfirm.confirm'),
    cancel: quotationMessage.text('acceptConfirm.cancel'),
  },

  rejectConfirm: {
    title: quotationMessage.text('rejectConfirm.title'),
    body: quotationMessage.text('rejectConfirm.body'),
    confirm: quotationMessage.text('rejectConfirm.confirm'),
    cancel: quotationMessage.text('rejectConfirm.cancel'),
  },

  /** `701:63` … `701:87` — step-up re-verification, run inside this page. */
  stepUp: {
    title: quotationMessage.text('stepUp.title'),
    body: quotationMessage.text('stepUp.body'),
    /** `701:83`, kept verbatim: it is the anti-phishing line. */
    safety: quotationMessage.text('stepUp.safety'),
    stay: quotationMessage.text('stepUp.stay'),
    cancel: quotationMessage.text('stepUp.cancel'),
    live: quotationMessage.text('stepUp.live'),
    /** Shown after a code is verified, while the quotation is re-read. */
    verified: quotationMessage.text('stepUp.verified'),
  },

  /** `701:206` — the committed acceptance. */
  accepted: {
    title: quotationMessage.text('accepted.title'),
    body: quotationMessage.text('accepted.body'),
    acceptedTotal: quotationMessage.text('accepted.acceptedTotal'),
    replayed: quotationMessage.text('accepted.replayed'),
    live: quotationMessage.text('accepted.live'),
  },

  /** `702:62` — the committed rejection. */
  rejected: {
    title: quotationMessage.text('rejected.title'),
    body: quotationMessage.text('rejected.body'),
    /** The declined version's own number — its terminal state *is* the record. */
    version: (version: number) => quotationMessage.text('rejected.version', { version }),
    live: quotationMessage.text('rejected.live'),
  },

  /** `702:124` — the version the decision named is no longer the one that stands. */
  stale: {
    title: quotationMessage.text('stale.title'),
    body: quotationMessage.text('stale.body'),
    live: quotationMessage.text('stale.live'),
  },

  /** `702:188` — the offer has lapsed. No acceptance control exists here. */
  expired: {
    title: quotationMessage.text('expired.title'),
    body: quotationMessage.text('expired.body'),
    live: quotationMessage.text('expired.live'),
  },

  /**
   * The refusals that keep the customer on the quotation.
   *
   * Each is chosen by classification alone. None names a request, a quotation,
   * a version, a customer, a grant, a challenge or a constraint.
   */
  notices: {
    TRANSIENT: {
      title: quotationMessage.text('notices.TRANSIENT.title'),
      body: quotationMessage.text('notices.TRANSIENT.body'),
    },
    INVALID_TRANSITION: {
      title: quotationMessage.text('notices.INVALID_TRANSITION.title'),
      body: quotationMessage.text('notices.INVALID_TRANSITION.body'),
    },
    DUPLICATE_OPERATION: {
      title: quotationMessage.text('notices.DUPLICATE_OPERATION.title'),
      body: quotationMessage.text('notices.DUPLICATE_OPERATION.body'),
    },
    IDEMPOTENCY_CONFLICT: {
      title: quotationMessage.text('notices.IDEMPOTENCY_CONFLICT.title'),
      body: quotationMessage.text('notices.IDEMPOTENCY_CONFLICT.body'),
    },
    POLICY_UNAVAILABLE: {
      title: quotationMessage.text('notices.POLICY_UNAVAILABLE.title'),
      body: quotationMessage.text('notices.POLICY_UNAVAILABLE.body'),
    },
  },

  /** Announced while a decision is in flight; these frames draw no alert. */
  live: {
    authorized: quotationMessage.text('live.authorized'),
    accepting: quotationMessage.text('live.accepting'),
    rejecting: quotationMessage.text('live.rejecting'),
    reconciling: quotationMessage.text('live.reconciling'),
  },
} as const;
