/**
 * Every string in the three transition dialogs (`786:3`, `786:39`, `786:70`,
 * `786:110`, `786:150`, `786:177`) and every refusal sentence the approved
 * catalog (`787:3`) fixes.
 *
 * ### Why the dialogs have their own catalog
 *
 * A dialog states what a *write* is about to do. That prose is load-bearing —
 * "reserved Catalog stock is consumed", "consumed stock is not restored",
 * "this is not the order cancellation" — and keeping it beside the read
 * screen's labels is how a page ends up promising an effect it never performs.
 *
 * ### The refusal sentences never quote the server
 *
 * Each entry carries a Vietnamese title and an action sentence chosen by the
 * published business **code**, read as a structured field. `normalized.message`
 * is never rendered and never branched on; the code rides inside the body as an
 * engineer-facing annotation, exactly as `787:5` requires. No recovery here is
 * automatic: every one of them is a human step, because the backend publishes
 * no retryable-conflict code and no compensating queue (`787:93`).
 */

/** The two moves that carry no reason, and the one that requires it. */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-wave2.json`, under `productionTransition`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const productionTransitionMessage = messageView(VI_MESSAGES.adminWave2, 'productionTransition');

export const PRODUCTION_TRANSITION_COPY = {
  common: {
    /** `786:9` — every dialog says the whole move commits together or not at all. */
    effectsTitle: productionTransitionMessage.text('common.effectsTitle'),
    rowJob: productionTransitionMessage.text('common.rowJob'),
    rowOrder: productionTransitionMessage.text('common.rowOrder'),
    rowReservation: productionTransitionMessage.text('common.rowReservation'),
    orderUnchanged: productionTransitionMessage.text('common.orderUnchanged'),
    dismiss: productionTransitionMessage.text('common.dismiss'),
    back: productionTransitionMessage.text('common.back'),
    submitting: productionTransitionMessage.text('common.submitting'),
    /** `786:181`. */
    submittingSubtitle: (shortJobId: string) =>
      productionTransitionMessage.text('common.submittingSubtitle', { shortJobId }),
    /** `786:190` — waiting on a row lock is correct behaviour, not a hang. */
    submittingLockTitle: productionTransitionMessage.text('common.submittingLockTitle'),
    submittingLockBody: productionTransitionMessage.text('common.submittingLockBody'),
    submittingDropTitle: productionTransitionMessage.text('common.submittingDropTitle'),
    submittingDropBody: productionTransitionMessage.text('common.submittingDropBody'),
    submittingOptimisticTitle: productionTransitionMessage.text('common.submittingOptimisticTitle'),
    submittingOptimisticBody: productionTransitionMessage.text('common.submittingOptimisticBody'),
    /** The job the dialog was opened against, named in its subtitle. */
    subtitleWithOrder: (shortJobId: string, orderCode: string) =>
      productionTransitionMessage.text('common.subtitleWithOrder', { shortJobId, orderCode }),
    subtitleWithStatus: (shortJobId: string, statusLabel: string) =>
      productionTransitionMessage.text('common.subtitleWithStatus', { shortJobId, statusLabel }),
  },

  start: {
    /** `786:6`. */
    title: productionTransitionMessage.text('start.title'),
    confirm: productionTransitionMessage.text('start.confirm'),
    submittingTitle: productionTransitionMessage.text('start.submittingTitle'),
    consumeTitle: productionTransitionMessage.text('start.consumeTitle'),
    consumeBody: productionTransitionMessage.text('start.consumeBody'),
    refusalTitle: productionTransitionMessage.text('start.refusalTitle'),
    refusalBody: productionTransitionMessage.text('start.refusalBody'),
    copTitle: productionTransitionMessage.text('start.copTitle'),
    copBody: productionTransitionMessage.text('start.copBody'),
  },

  complete: {
    /** `786:42`. */
    title: productionTransitionMessage.text('complete.title'),
    confirm: productionTransitionMessage.text('complete.confirm'),
    submittingTitle: productionTransitionMessage.text('complete.submittingTitle'),
    noInventoryTitle: productionTransitionMessage.text('complete.noInventoryTitle'),
    noInventoryBody: productionTransitionMessage.text('complete.noInventoryBody'),
    stopTitle: productionTransitionMessage.text('complete.stopTitle'),
    stopBody: productionTransitionMessage.text('complete.stopBody'),
    refusalTitle: productionTransitionMessage.text('complete.refusalTitle'),
    refusalBody: productionTransitionMessage.text('complete.refusalBody'),
  },

  cancel: {
    /** `786:73` and `786:113` — the heading names which state is being cancelled. */
    titleFromPlanned: productionTransitionMessage.text('cancel.titleFromPlanned'),
    titleFromStarted: productionTransitionMessage.text('cancel.titleFromStarted'),
    confirm: productionTransitionMessage.text('cancel.confirm'),
    submittingTitle: productionTransitionMessage.text('cancel.submittingTitle'),
    /** `786:76` — binding on every cancel surface. */
    scopeTitle: productionTransitionMessage.text('cancel.scopeTitle'),
    scopeBody: productionTransitionMessage.text('cancel.scopeBody'),
    /** `786:96` — from PLANNED nothing was consumed, so a live hold is released. */
    releaseTitle: productionTransitionMessage.text('cancel.releaseTitle'),
    releaseBody: productionTransitionMessage.text('cancel.releaseBody'),
    /** `786:116` — from STARTED the goods have left; nothing is restored. */
    noRestoreTitle: productionTransitionMessage.text('cancel.noRestoreTitle'),
    noRestoreBody: productionTransitionMessage.text('cancel.noRestoreBody'),
    /** `786:136`. */
    stillNotOrderTitle: productionTransitionMessage.text('cancel.stillNotOrderTitle'),
    stillNotOrderBody: productionTransitionMessage.text('cancel.stillNotOrderBody'),
    reasonLabel: productionTransitionMessage.text('cancel.reasonLabel'),
    reasonRequiredBadge: productionTransitionMessage.text('cancel.reasonRequiredBadge'),
    reasonHelp: productionTransitionMessage.text('cancel.reasonHelp'),
    /** `786:168` — blocked locally; a blank or whitespace-only reason never reaches the wire. */
    reasonMissing: productionTransitionMessage.text('cancel.reasonMissing'),
    reasonTooLong: (max: number) =>
      productionTransitionMessage.text('cancel.reasonTooLong', { max }),
    /** `786:170` — why the button is off, and why Start/Complete have no such field. */
    blockedTitle: productionTransitionMessage.text('cancel.blockedTitle'),
    blockedBody: productionTransitionMessage.text('cancel.blockedBody'),
  },

  /**
   * The refusal catalog (`787:3`), keyed by the published business code.
   *
   * Every entry is a *human* recovery. There is no automatic retry anywhere:
   * `787:184` forbids it, and a `409` means the real conditions differ — retrying
   * blind only repeats an old decision on old knowledge.
   */
  refusals: {
    depositNotSatisfied: {
      title: productionTransitionMessage.text('refusals.depositNotSatisfied.title'),
      body: productionTransitionMessage.text('refusals.depositNotSatisfied.body'),
    },
    orderOnHold: {
      title: productionTransitionMessage.text('refusals.orderOnHold.title'),
      body: productionTransitionMessage.text('refusals.orderOnHold.body'),
    },
    blocked: {
      title: productionTransitionMessage.text('refusals.blocked.title'),
      body: productionTransitionMessage.text('refusals.blocked.body'),
    },
    approvalMismatch: {
      title: productionTransitionMessage.text('refusals.approvalMismatch.title'),
      body: productionTransitionMessage.text('refusals.approvalMismatch.body'),
    },
    reservationNotActive: {
      title: productionTransitionMessage.text('refusals.reservationNotActive.title'),
      body: productionTransitionMessage.text('refusals.reservationNotActive.body'),
    },
    reservationInsufficient: {
      title: productionTransitionMessage.text('refusals.reservationInsufficient.title'),
      body: productionTransitionMessage.text('refusals.reservationInsufficient.body'),
    },
    invalidTransition: {
      title: productionTransitionMessage.text('refusals.invalidTransition.title'),
      body: productionTransitionMessage.text('refusals.invalidTransition.body'),
    },
    reasonRequired: {
      title: productionTransitionMessage.text('refusals.reasonRequired.title'),
      body: productionTransitionMessage.text('refusals.reasonRequired.body'),
    },
    notFound: {
      title: productionTransitionMessage.text('refusals.notFound.title'),
      body: productionTransitionMessage.text('refusals.notFound.body'),
    },
    unauthenticated: {
      title: productionTransitionMessage.text('refusals.unauthenticated.title'),
      body: productionTransitionMessage.text('refusals.unauthenticated.body'),
    },
    forbidden: {
      title: productionTransitionMessage.text('refusals.forbidden.title'),
      body: productionTransitionMessage.text('refusals.forbidden.body'),
    },
    /** No response line at all: committed-or-not is unknown, so nothing is concluded. */
    ambiguous: {
      title: productionTransitionMessage.text('refusals.ambiguous.title'),
      body: productionTransitionMessage.text('refusals.ambiguous.body'),
    },
    server: {
      title: productionTransitionMessage.text('refusals.server.title'),
      body: productionTransitionMessage.text('refusals.server.body'),
    },
  },

  /** `787:169` — after any refusal the screen reloads job truth and rebuilds the actions. */
  conflict: {
    reloadedNote: productionTransitionMessage.text('conflict.reloadedNote'),
    close: productionTransitionMessage.text('conflict.close'),
  },
} as const;
