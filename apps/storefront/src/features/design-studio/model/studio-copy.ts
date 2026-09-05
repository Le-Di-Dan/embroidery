/**
 * Every customer-visible string of the Studio bootstrap route (`APP3-S01`).
 *
 * Copy is data, not markup: components read from here so no user-facing
 * sentence is hard-coded at a call site (CLAUDE.md §5), and so the whole
 * vocabulary of the screen can be read in one place when it is reviewed.
 *
 * Refusal copy is deliberately uniform. `APP3-B05`, `APP3-B05A` and `APP3-B07`
 * all answer one non-disclosing 404 for every invisible state — unknown,
 * unpublished, archived, withdrawn, retired — so the screen must not invent a
 * more specific explanation than the server was willing to give.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `shell`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const shellMessage = messageView(VI_MESSAGES.studio, 'shell');

export const STUDIO_COPY = {
  heading: shellMessage.text('heading'),
  introPrefix: shellMessage.text('introPrefix'),

  loadingPlacement: shellMessage.text('loadingPlacement'),
  placementError: shellMessage.text('placementError'),
  retry: shellMessage.text('retry'),

  ineligibleHeading: shellMessage.text('ineligibleHeading'),
  ineligibleBody: shellMessage.text('ineligibleBody'),

  sideLabel: shellMessage.text('sideLabel'),
  areaLabel: shellMessage.text('areaLabel'),
  singleSideNote: shellMessage.text('singleSideNote'),
  singleAreaNote: shellMessage.text('singleAreaNote'),
  // A selected Side with no Area. The sentence is about that Side only — the
  // Product stays open, because another Side may well be usable.
  areaNone: shellMessage.text('areaNone'),
  sideWithoutArea: shellMessage.text('sideWithoutArea'),
  sideWithoutAreaHint: shellMessage.text('sideWithoutAreaHint'),

  templateHeading: shellMessage.text('templateHeading'),
  templateLoading: shellMessage.text('templateLoading'),
  templateError: shellMessage.text('templateError'),
  templateEmpty: shellMessage.text('templateEmpty'),
  templateEmptyHint: shellMessage.text('templateEmptyHint'),
  templateMore: shellMessage.text('templateMore'),
  templateMoreLoading: shellMessage.text('templateMoreLoading'),
  templateMoreError: shellMessage.text('templateMoreError'),
  templateVersionPrefix: shellMessage.text('templateVersionPrefix'),

  previewHeading: shellMessage.text('previewHeading'),
  previewLoading: shellMessage.text('previewLoading'),
  previewTextOnly: shellMessage.text('previewTextOnly'),
  previewUnavailable: shellMessage.text('previewUnavailable'),
  previewRetryable: shellMessage.text('previewRetryable'),
  previewAlt: shellMessage.text('previewAlt'),

  detailUnavailable: shellMessage.text('detailUnavailable'),

  startHeading: shellMessage.text('startHeading'),
  startBlank: shellMessage.text('startBlank'),
  startClone: shellMessage.text('startClone'),
  starting: shellMessage.text('starting'),
  startBlankError: shellMessage.text('startBlankError'),
  startCloneError: shellMessage.text('startCloneError'),

  readyHeading: shellMessage.text('readyHeading'),
  readyBody: shellMessage.text('readyBody'),
  readyExpiresPrefix: shellMessage.text('readyExpiresPrefix'),
  readyFromTemplatePrefix: shellMessage.text('readyFromTemplatePrefix'),

  resume: shellMessage.text('resume'),
  resuming: shellMessage.text('resuming'),
  /**
   * `APP3-S10` owns the expiry surface, and its heading and body are `610:201`'s
   * own words in `STUDIO_SAVE_COPY`. The two sentences that used to live here
   * were removed rather than left beside them: two ways of saying "this Session
   * is over" is how the screen and its tests end up asserting different things.
   * The action label stays, because it is the same action.
   */
  expiredRestart: shellMessage.text('expiredRestart'),

  statusBusy: shellMessage.text('statusBusy'),
} as const;
