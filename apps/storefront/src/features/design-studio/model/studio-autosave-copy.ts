/**
 * Every customer-visible string of the save, conflict, resume and expiry
 * surfaces (`APP3-S10`).
 *
 * The sentences are the approved frames' own — `610:3`, `610:41`, `610:77`,
 * `610:118`, `610:159` and `610:201` of section `14` (`596:20`) — not
 * paraphrases of them.
 *
 * Three rules hold across all of it.
 *
 * **Nothing here says a design is saved unless the server said so.** The
 * "saved at" time is rendered from an actual successful response, never from a
 * clock read at the moment a request was sent, and there is no optimistic
 * "đã lưu" anywhere in the failure paths.
 *
 * **Nothing here exposes a backend internal.** No revision number, no
 * `sessionId`, no HTTP status and no envelope code reaches a customer. The
 * conflict frame draws a `409 · xung đột bản sửa` eyebrow above its heading;
 * that eyebrow is a status code, and §17 forbids exposing raw backend internals,
 * so the heading below it carries the meaning instead and the code is not shown.
 * The deviation is recorded rather than taken quietly.
 *
 * **Nothing here promises recovery of a lost anonymous credential.** The Session
 * secret is an `HttpOnly` cookie this code cannot read; once it is gone the
 * design behind it is not reachable, and the expiry copy says so plainly instead
 * of offering a retry that could only fail.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `autosave`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const autosaveMessage = messageView(VI_MESSAGES.studio, 'autosave');

export const STUDIO_SAVE_COPY = {
  /** The topbar chip. One word for each state the customer can be in. */
  chipLabel: autosaveMessage.text('chipLabel'),
  chipSaved: autosaveMessage.text('chipSaved'),
  chipSavedAtPrefix: autosaveMessage.text('chipSavedAtPrefix'),
  chipSaving: autosaveMessage.text('chipSaving'),
  chipDirty: autosaveMessage.text('chipDirty'),
  chipOffline: autosaveMessage.text('chipOffline'),
  chipConflict: autosaveMessage.text('chipConflict'),
  chipFailed: autosaveMessage.text('chipFailed'),

  /** `610:3` — saved. */
  savedHeading: autosaveMessage.text('savedHeading'),
  savedBody: autosaveMessage.text('savedBody'),

  /** `610:41` — saving. Editing is explicitly not blocked. */
  savingHeading: autosaveMessage.text('savingHeading'),
  savingBody: autosaveMessage.text('savingBody'),

  /** `610:77` — failed or offline. */
  offlineHeading: autosaveMessage.text('offlineHeading'),
  offlineBody: autosaveMessage.text('offlineBody'),
  offlineNote: autosaveMessage.text('offlineNote'),
  offlineRetry: autosaveMessage.text('offlineRetry'),
  offlineDismiss: autosaveMessage.text('offlineDismiss'),

  /**
   * A save the server refused for a reason that is not the network.
   *
   * `610:77` names the connection in its own heading, and that sentence is only
   * true when the connection is what failed. A refused, throttled or broken save
   * would be misdescribed by it, so it gets the same shape — the changes are
   * still here, the tab must stay open, retry and dismiss — with the cause left
   * unnamed rather than named wrongly. No status code, no envelope code.
   */
  failedHeading: autosaveMessage.text('failedHeading'),
  failedBody: autosaveMessage.text('failedBody'),

  /** `610:118` — stale revision. Exactly two choices, and no third. */
  conflictHeading: autosaveMessage.text('conflictHeading'),
  conflictBody: autosaveMessage.text('conflictBody'),
  conflictLoadLatest: autosaveMessage.text('conflictLoadLatest'),
  conflictKeepLocal: autosaveMessage.text('conflictKeepLocal'),
  /**
   * What each choice costs, said before it is made.
   *
   * There is no automatic merge and no real-time collaboration, so one of the
   * two documents is going to be the one that survives. A customer choosing
   * between them without being told that is not choosing.
   */
  conflictLoadLatestNote: autosaveMessage.text('conflictLoadLatestNote'),
  conflictKeepLocalNote: autosaveMessage.text('conflictKeepLocalNote'),

  /** `610:159` — resume. */
  resumeHeading: autosaveMessage.text('resumeHeading'),
  resumeBody: autosaveMessage.text('resumeBody'),
  resumeContinue: autosaveMessage.text('resumeContinue'),
  resumeRestart: autosaveMessage.text('resumeRestart'),
  resuming: autosaveMessage.text('resuming'),
  resumeFailed: autosaveMessage.text('resumeFailed'),

  /** `610:201` — expired or credential lost. */
  expiredEyebrow: autosaveMessage.text('expiredEyebrow'),
  expiredHeading: autosaveMessage.text('expiredHeading'),
  expiredBody: autosaveMessage.text('expiredBody'),
  expiredPickTemplate: autosaveMessage.text('expiredPickTemplate'),

  /** The unsaved-work region, named so it can be reached and announced. */
  stateLabel: autosaveMessage.text('stateLabel'),
} as const;
