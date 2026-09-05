/**
 * Every customer-facing string on `/truy-cap/duyet-thiet-ke` (`APP6-S02`).
 *
 * One catalog, so no component hard-codes a sentence (`CLAUDE.md` §5) and the
 * approved copy from `707:3`, `709:3`, `709:84`, `709:164`, `710:3`, `710:109`,
 * `710:203`, `711:3`, `713:3` and `713:61` has exactly one spelling.
 *
 * ### The four things nothing here is allowed to say
 *
 * **No payment, no order, no stock, no production.** Approving a design freezes
 * an Approval Snapshot and nothing else. APP6 stops there; the deposit, the
 * order, the inventory hold and the machine file are APP7/APP8. So no sentence
 * below claims money moved, an order exists, stock was reserved, stitching
 * started or a file was generated.
 *
 * **No claim about the request when a revision is asked for.** `APP6-B11`'s
 * revision path moves the *design version* only: no transition row is written,
 * the custom request stays where it was, and the next draft does not yet exist.
 * The outcome copy therefore reports what was recorded and predicts nothing.
 *
 * **No agreement text.** The policies are rendered from B10's own `content`,
 * verbatim. There is no summary, no paraphrase and no house boilerplate here,
 * because a screen that restated the terms would be showing the customer
 * something other than the text whose hash their approval binds.
 *
 * **No screenshot claim.** The watermark notice says the preview is marked and
 * that there is nothing to download. `docs/09-SECURITY-AND-ABUSE-PREVENTION.md`
 * §6 ends with "do not claim absolute screenshot prevention", and a promise a
 * build cannot keep is worse than no promise.
 *
 * The three access states — bootstrap (`712:3`), the single non-enumerating
 * unavailable card and the transient card (`712:31`) — are **not here**. They
 * belong to `APP4-S02`'s `SECURE_LINK_COPY` and are reused rather than
 * redrawn: a second copy of a security state is a second authority for the one
 * behaviour that must never vary.
 */

import { BRAND_NAME, VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/custom.json`, under `designReview`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const designReviewMessage = messageView(
  hydrateMessages(VI_MESSAGES.custom, { brand: BRAND_NAME }),
  'designReview',
);

export const DESIGN_REVIEW_COPY = {
  /** The document title. Reused as the accessible page name. */
  pageTitle: designReviewMessage.text('pageTitle'),

  /** `707:12` … `710:210` — the card headline, one per drawn state. */
  titles: {
    review: designReviewMessage.text('titles.review'),
    approved: designReviewMessage.text('titles.approved'),
    revisionRequested: designReviewMessage.text('titles.revisionRequested'),
    versionMismatch: designReviewMessage.text('titles.versionMismatch'),
  },

  /** `707:13` … `710:211` — the line under the headline. */
  subtitles: {
    review: (version: number, sentAt: string) =>
      designReviewMessage.text('subtitles.review', { version, sentAt }),
    approved: (version: number) => designReviewMessage.text('subtitles.approved', { version }),
    revisionRequested: (version: number) =>
      designReviewMessage.text('subtitles.revisionRequested', { version }),
    versionMismatch: (version: number) =>
      designReviewMessage.text('subtitles.versionMismatch', { version }),
  },

  /** `707:11` — the status pill. Never colour alone. */
  badges: {
    review: designReviewMessage.text('badges.review'),
    approving: designReviewMessage.text('badges.approving'),
    approved: designReviewMessage.text('badges.approved'),
    revisionRequested: designReviewMessage.text('badges.revisionRequested'),
    versionMismatch: designReviewMessage.text('badges.versionMismatch'),
  },

  /** `707:30` — the exact version the decision binds, printed beside the artwork. */
  exactVersion: {
    legend: designReviewMessage.text('exactVersion.legend'),
    version: (version: number) => designReviewMessage.text('exactVersion.version', { version }),
    schema: (schemaVersion: number) =>
      designReviewMessage.text('exactVersion.schema', { schemaVersion }),
    hashLabel: designReviewMessage.text('exactVersion.hashLabel'),
    note: designReviewMessage.text('exactVersion.note'),
  },

  /** `707:40` — the browser-side preview. */
  preview: {
    label: designReviewMessage.text('preview.label'),
    /** The repeated mark's two fixed words, ahead of the runtime token. */
    watermarkWordmark: designReviewMessage.text('preview.watermarkWordmark'),
    watermarkTag: designReviewMessage.text('preview.watermarkTag'),
    /** `609:371`, reused verbatim: marked, and no download exists. */
    watermarkPolicy: designReviewMessage.text('preview.watermarkPolicy'),
    /** Image elements have no bytes on this surface; the frame is honest about it. */
    imagePlaceholder: designReviewMessage.text('preview.imagePlaceholder'),
    failure: designReviewMessage.text('preview.failure'),
    failureNote: designReviewMessage.text('preview.failureNote'),
  },

  /** `711:3` — the effective agreement set, rendered verbatim. */
  agreements: {
    legend: designReviewMessage.text('agreements.legend'),
    intro: designReviewMessage.text('agreements.intro'),
    accept: designReviewMessage.text('agreements.accept'),
    versionLabel: (version: number) =>
      designReviewMessage.text('agreements.versionLabel', { version }),
    /** `709:3` — why the approve control is unavailable. */
    outstanding: (remaining: number) =>
      designReviewMessage.text('agreements.outstanding', { remaining }),
    changed: designReviewMessage.text('agreements.changed'),
  },

  /** `707:55`, `710:109` — the two customer actions. */
  actions: {
    approve: designReviewMessage.text('actions.approve'),
    approving: designReviewMessage.text('actions.approving'),
    requestRevision: designReviewMessage.text('actions.requestRevision'),
    reviewLatest: designReviewMessage.text('actions.reviewLatest'),
  },

  /** `709:84` — the in-progress frame. */
  approving: {
    title: designReviewMessage.text('approving.title'),
    body: designReviewMessage.text('approving.body'),
  },

  /** `710:3` — the approval confirmation, before the decision leaves the browser. */
  approveConfirm: {
    title: designReviewMessage.text('approveConfirm.title'),
    body: designReviewMessage.text('approveConfirm.body'),
    binds: (version: number) => designReviewMessage.text('approveConfirm.binds', { version }),
    terms: designReviewMessage.text('approveConfirm.terms'),
    noPayment: designReviewMessage.text('approveConfirm.noPayment'),
    confirm: designReviewMessage.text('approveConfirm.confirm'),
    cancel: designReviewMessage.text('approveConfirm.cancel'),
  },

  /** `710:3` — step-up re-verification, run inside this route. */
  stepUp: {
    title: designReviewMessage.text('stepUp.title'),
    body: designReviewMessage.text('stepUp.body'),
    stay: designReviewMessage.text('stepUp.stay'),
    safety: designReviewMessage.text('stepUp.safety'),
    verified: designReviewMessage.text('stepUp.verified'),
    cancel: designReviewMessage.text('stepUp.cancel'),
    live: designReviewMessage.text('stepUp.live'),
  },

  /** `710:109` — the revision form. */
  revision: {
    title: designReviewMessage.text('revision.title'),
    body: designReviewMessage.text('revision.body'),
    label: designReviewMessage.text('revision.label'),
    placeholder: designReviewMessage.text('revision.placeholder'),
    required: designReviewMessage.text('revision.required'),
    tooLong: (max: number) => designReviewMessage.text('revision.tooLong', { max }),
    counter: (used: number, max: number) =>
      designReviewMessage.text('revision.counter', { used, max }),
    noStepUp: designReviewMessage.text('revision.noStepUp'),
    submit: designReviewMessage.text('revision.submit'),
    submitting: designReviewMessage.text('revision.submitting'),
    cancel: designReviewMessage.text('revision.cancel'),
  },

  /** `709:164`, `713:61` — the committed approval. */
  approved: {
    heading: designReviewMessage.text('approved.heading'),
    approvedAt: (at: string) => designReviewMessage.text('approved.approvedAt', { at }),
    versionLabel: (version: number) =>
      designReviewMessage.text('approved.versionLabel', { version }),
    hashLabel: designReviewMessage.text('approved.hashLabel'),
    snapshotLabel: designReviewMessage.text('approved.snapshotLabel'),
    acceptedTerms: designReviewMessage.text('approved.acceptedTerms'),
    /** Nothing beyond the snapshot is claimed. */
    scope: designReviewMessage.text('approved.scope'),
    replayed: designReviewMessage.text('approved.replayed'),
    live: designReviewMessage.text('approved.live'),
  },

  /** The committed revision request. */
  revisionRequested: {
    heading: designReviewMessage.text('revisionRequested.heading'),
    decidedAt: (at: string) => designReviewMessage.text('revisionRequested.decidedAt', { at }),
    versionLabel: (version: number) =>
      designReviewMessage.text('revisionRequested.versionLabel', { version }),
    /** Truthful: no new draft exists, and the request did not move. */
    scope: designReviewMessage.text('revisionRequested.scope'),
    live: designReviewMessage.text('revisionRequested.live'),
  },

  /** `710:203` — the exact-version race. */
  mismatch: {
    title: designReviewMessage.text('mismatch.title'),
    body: designReviewMessage.text('mismatch.body'),
    live: designReviewMessage.text('mismatch.live'),
  },

  /** The terms race — a change of terms only, never called a version mismatch. */
  termsChanged: {
    title: designReviewMessage.text('termsChanged.title'),
    body: designReviewMessage.text('termsChanged.body'),
    live: designReviewMessage.text('termsChanged.live'),
  },

  /**
   * One-shot banners for the refusals that leave the customer on the review.
   *
   * Chosen by the classified failure, never by a server `message`: those are
   * English operator prose on a surface anyone holding a link can reach.
   */
  notices: {
    TRANSIENT: {
      title: designReviewMessage.text('notices.TRANSIENT.title'),
      body: designReviewMessage.text('notices.TRANSIENT.body'),
    },
    INVALID_TRANSITION: {
      title: designReviewMessage.text('notices.INVALID_TRANSITION.title'),
      body: designReviewMessage.text('notices.INVALID_TRANSITION.body'),
    },
    DUPLICATE_OPERATION: {
      title: designReviewMessage.text('notices.DUPLICATE_OPERATION.title'),
      body: designReviewMessage.text('notices.DUPLICATE_OPERATION.body'),
    },
    IDEMPOTENCY_CONFLICT: {
      title: designReviewMessage.text('notices.IDEMPOTENCY_CONFLICT.title'),
      body: designReviewMessage.text('notices.IDEMPOTENCY_CONFLICT.body'),
    },
    POLICY_UNAVAILABLE: {
      title: designReviewMessage.text('notices.POLICY_UNAVAILABLE.title'),
      body: designReviewMessage.text('notices.POLICY_UNAVAILABLE.body'),
    },
  },

  /** Polite live-region announcements. */
  live: {
    authorized: designReviewMessage.text('live.authorized'),
    approving: designReviewMessage.text('live.approving'),
    revisionSubmitting: designReviewMessage.text('live.revisionSubmitting'),
    reconciling: designReviewMessage.text('live.reconciling'),
  },
} as const;
