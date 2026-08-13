/**
 * The autosave model, the resume handle and the resumed scope (`APP3-S10`).
 *
 * Everything here is a pure function of values, so the cadence arithmetic, the
 * error taxonomy and the reconciliation decision are proved without a clock, a
 * network or a React tree. The loop that consumes them is proved against the
 * real Studio in `studio-autosave.test.tsx`.
 */
import type { DesignDocument } from '@embroidery/design-document';

import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_DIRTY_AGE_MS,
  AUTOSAVE_RETRY_DELAYS_MS,
  classifyAmbiguousOutcome,
  classifySaveFailure,
  hasUnsavedWork,
  isRetryableFailure,
  retryDelayFor,
  SAVE_HELD_STATES,
  saveDelayFor,
  saveToneOf,
  type StudioSaveState,
} from '../../src/features/design-studio/model/studio-autosave';
import { StudioApiError } from '../../src/features/design-studio/model/studio-failure';
import {
  clearResumeHandle,
  readResumeHandle,
  resumeHandleKey,
  writeResumeHandle,
} from '../../src/features/design-studio/model/studio-resume-handle';
import { resumedScopeOf } from '../../src/features/design-studio/model/studio-resume-scope';
import { makeArea, makeSide, PRODUCT_SLUG } from '../support/studio-fixture';
import { makeStageDocument, shapeElement } from '../support/studio-stage-fixture';

function failure(httpStatus?: number): StudioApiError {
  return new StudioApiError({
    code: 'X',
    message: 'x',
    ...(httpStatus === undefined ? {} : { httpStatus }),
  });
}

describe('the cadence `APP3-S10` locks', () => {
  it('is 2500ms of quiet under a 10000ms ceiling', () => {
    expect(AUTOSAVE_DEBOUNCE_MS).toBe(2500);
    expect(AUTOSAVE_MAX_DIRTY_AGE_MS).toBe(10_000);
  });

  it('waits the full debounce after a single mutation', () => {
    expect(saveDelayFor({ since: 0, last: 0 }, 0)).toBe(2500);
    expect(saveDelayFor({ since: 0, last: 0 }, 2499)).toBe(1);
    expect(saveDelayFor({ since: 0, last: 0 }, 2500)).toBe(0);
  });

  it('never postpones a continuously edited document past the ceiling', () => {
    // Edits at 0, 2000, 4000, 6000, 8000: quiet never arrives, and the ceiling
    // from the *first* dirty mutation is what decides.
    const streak = { since: 0, last: 8000 };
    expect(saveDelayFor(streak, 8000)).toBe(2000);
    expect(8000 + saveDelayFor(streak, 8000)).toBe(AUTOSAVE_MAX_DIRTY_AGE_MS);
  });

  it('is eligible immediately rather than retroactively once past the ceiling', () => {
    expect(saveDelayFor({ since: 0, last: 11_000 }, 12_000)).toBe(0);
  });

  it('stays far under the 30-per-minute Session mutation ceiling', () => {
    // The worst case the cadence can produce is one save every 10s.
    expect(60_000 / AUTOSAVE_MAX_DIRTY_AGE_MS).toBeLessThan(30);
  });

  it('offers exactly two automatic retries and then none', () => {
    expect(AUTOSAVE_RETRY_DELAYS_MS).toEqual([5000, 15_000]);
    expect(retryDelayFor(0)).toBe(5000);
    expect(retryDelayFor(1)).toBe(15_000);
    expect(retryDelayFor(2)).toBeNull();
  });
});

describe('what a failed save means', () => {
  it('reads an absent status as ambiguous, never as a failure to replay', () => {
    // A timeout, a reset connection and a browser that dropped the request are
    // the same event from here: the PUT may have arrived and lost its answer.
    expect(classifySaveFailure(failure())).toBe('ambiguous');
    expect(classifySaveFailure(new Error('boom'))).toBe('ambiguous');
  });

  it('maps every status the API can answer with', () => {
    expect(classifySaveFailure(failure(401))).toBe('expired');
    expect(classifySaveFailure(failure(403))).toBe('refused');
    expect(classifySaveFailure(failure(409))).toBe('conflict');
    expect(classifySaveFailure(failure(413))).toBe('rejected');
    expect(classifySaveFailure(failure(422))).toBe('rejected');
    expect(classifySaveFailure(failure(429))).toBe('throttled');
    expect(classifySaveFailure(failure(500))).toBe('server');
    expect(classifySaveFailure(failure(503))).toBe('server');
    expect(classifySaveFailure(failure(418))).toBe('refused');
  });

  it('retries only what repeating could actually fix', () => {
    expect(isRetryableFailure('server')).toBe(true);
    expect(isRetryableFailure('throttled')).toBe(true);
    for (const terminal of ['expired', 'refused', 'rejected', 'conflict', 'ambiguous'] as const) {
      expect(isRetryableFailure(terminal)).toBe(false);
    }
  });
});

describe('an outcome nobody knows', () => {
  const submitted = makeStageDocument([shapeElement('a')]);
  const other = makeStageDocument([shapeElement('b')]);
  const equal = (left: DesignDocument, right: DesignDocument) =>
    JSON.stringify(left) === JSON.stringify(right);

  it('is `absent` while the server is still on the base revision', () => {
    expect(
      classifyAmbiguousOutcome({
        baseRevision: 4,
        submitted,
        latestRevision: 4,
        latestDocument: other,
        equal,
      }),
    ).toBe('absent');
  });

  it('is `persisted` when the server moved to exactly what was submitted', () => {
    expect(
      classifyAmbiguousOutcome({
        baseRevision: 4,
        submitted,
        latestRevision: 5,
        latestDocument: submitted,
        equal,
      }),
    ).toBe('persisted');
  });

  it('is `diverged` when the server moved to something else', () => {
    expect(
      classifyAmbiguousOutcome({
        baseRevision: 4,
        submitted,
        latestRevision: 5,
        latestDocument: other,
        equal,
      }),
    ).toBe('diverged');
  });
});

describe('what the customer is told', () => {
  it('gives every state a word, and only `CLEAN` the saved one', () => {
    expect(saveToneOf('CLEAN', null)).toBe('saved');
    expect(saveToneOf('SAVING', null)).toBe('saving');
    expect(saveToneOf('DIRTY', null)).toBe('dirty');
    expect(saveToneOf('CONFLICT', 'conflict')).toBe('conflict');
    expect(saveToneOf('EXPIRED', 'expired')).toBe('failed');
  });

  it('names a lost connection as one and diagnoses nothing else', () => {
    expect(saveToneOf('ERROR_PAUSED', 'ambiguous')).toBe('offline');
    expect(saveToneOf('DIRTY', 'ambiguous')).toBe('offline');
    expect(saveToneOf('ERROR_PAUSED', 'server')).toBe('failed');
    expect(saveToneOf('ERROR_PAUSED', 'rejected')).toBe('failed');
  });

  it('never reports a reconciliation as saved or as saving', () => {
    // The outcome of a write is being established. Claiming either would be a
    // statement the code cannot yet support.
    expect(saveToneOf('RECONCILING', null)).toBe('dirty');
  });

  it('warns about leaving in every state that has unsaved work, and no other', () => {
    const unsaved: StudioSaveState[] = [
      'DIRTY',
      'SAVING',
      'RECONCILING',
      'CONFLICT',
      'ERROR_PAUSED',
    ];
    for (const state of unsaved) expect(hasUnsavedWork(state)).toBe(true);
    // Nothing can be saved into a dead Session, so a warning would promise a
    // recovery this checkpoint is explicit about not having.
    expect(hasUnsavedWork('CLEAN')).toBe(false);
    expect(hasUnsavedWork('EXPIRED')).toBe(false);
  });

  it('holds the timer in every state where a save would be wrong', () => {
    expect([...SAVE_HELD_STATES].sort()).toEqual(['CONFLICT', 'EXPIRED', 'RECONCILING', 'SAVING']);
  });
});

describe('the resume handle', () => {
  const scope = { productSlug: PRODUCT_SLUG, sideCode: 'mat-truoc', areaCode: 'nguc-trai' };
  const other = { ...scope, areaCode: 'lung-giua' };
  const SESSION = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keys on the whole placement', () => {
    expect(resumeHandleKey(scope)).toBe(
      `embroidery.studio.session:${PRODUCT_SLUG}:mat-truoc:nguc-trai`,
    );
    expect(resumeHandleKey(other)).not.toBe(resumeHandleKey(scope));
  });

  it('stores the id and nothing else', () => {
    writeResumeHandle(scope, SESSION);

    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem(resumeHandleKey(scope))).toBe(SESSION);
    expect(readResumeHandle(scope)).toBe(SESSION);
  });

  it('is not found under a different placement', () => {
    writeResumeHandle(scope, SESSION);

    expect(readResumeHandle(other)).toBeNull();
  });

  it('refuses to read or write anything that is not a Session id', () => {
    // Storage is writable by anything else on this origin, and the value becomes
    // a URL path segment on the resume request.
    window.localStorage.setItem(resumeHandleKey(scope), '../../admin');
    expect(readResumeHandle(scope)).toBeNull();

    writeResumeHandle(other, 'not-an-id');
    expect(window.localStorage.getItem(resumeHandleKey(other))).toBeNull();
  });

  it('forgets one placement without sweeping the others', () => {
    writeResumeHandle(scope, SESSION);
    writeResumeHandle(other, SESSION);

    clearResumeHandle(scope);

    expect(readResumeHandle(scope)).toBeNull();
    expect(readResumeHandle(other)).toBe(SESSION);
  });
});

describe('the geometry a resumed Session draws from', () => {
  it('copies every field from the manifest rows, computing none', () => {
    const area = makeArea();
    const side = makeSide({ areas: [area] });

    const scope = resumedScopeOf(PRODUCT_SLUG, side, area);

    expect(scope).toEqual({
      productSlug: PRODUCT_SLUG,
      sideCode: side.code,
      areaCode: area.code,
      canvasWidthPx: side.imageWidthPx,
      canvasHeightPx: side.imageHeightPx,
      physicalWidthMm: side.physicalWidthMm,
      physicalHeightMm: side.physicalHeightMm,
      pxPerMm: side.pxPerMm,
      boundXPx: area.boundXPx,
      boundYPx: area.boundYPx,
      boundWidthPx: area.boundWidthPx,
      boundHeightPx: area.boundHeightPx,
    });
  });
});
