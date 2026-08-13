/**
 * `FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01` — the investigation `APP3-E01` owns.
 *
 * `APP3-S10`'s browser run measured a failing streak that begins with a
 * **customer edit** performing one attempt at the debounce, a second one a
 * debounce later, and only then the locked `[5000, 15000]` ladder: attempts at
 * +2.53 s, +5.10 s, +10.13 s and +25.17 s. A streak that begins with a pressed
 * `Thử lưu lại` produced the ladder alone. The checkpoint recorded the numbers,
 * did not isolate the mechanism, and routed it here.
 *
 * The S10 suites never reproduced it because none of them has a **live dirty
 * streak at the moment a save fails**: they drive one edit, let it fail, and
 * advance. This file reproduces the customer's shape exactly — an edit, a
 * failure, and the timers that follow — on the same fake clock, and reads the
 * answer off the attempt timeline rather than off the source.
 *
 * The verdict is recorded in the `APP3-E01` completion report. Whichever way it
 * falls, the two properties `APP3-S10` §16 fixes must hold in every case here:
 * the ladder is **bounded** and it **stops**.
 */
import { act } from 'react';

import { normalizeApiClientError } from '@embroidery/api-client';

import {
  advance,
  autosaveMock,
  edit,
  installStudioAutosaveHarness,
  renderStage,
  resumeMock,
  resumedResponse,
  saveState,
  scene,
  settle,
  START_REVISION,
} from '../support/studio-autosave-harness';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicDesignSessionAutosave: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicDesignSessionCreate: jest.fn(),
  publicProductPlacementGet: jest.fn(),
}));

installStudioAutosaveHarness();

/**
 * A transport failure with **no HTTP status** — the ambiguous case.
 *
 * The same shape `normalizeApiClientError` produces for a timeout, a reset
 * connection or an offline radio, which is what the customer's run intercepted.
 */
function transportFailure() {
  return Object.assign(new Error('net::ERR_CONNECTION_RESET'), {
    normalized: normalizeApiClientError(new Error('net::ERR_CONNECTION_RESET')),
  });
}

describe('the attempt timeline of a failing streak that begins with an edit', () => {
  it('is bounded and stops, and its shape is recorded', async () => {
    // Every save fails without a status; every reconciliation read answers with
    // the revision unmoved, which is "nothing was written" and therefore the one
    // outcome that is safe to replay.
    autosaveMock.mockRejectedValue(transportFailure());
    resumeMock.mockResolvedValue(resumedResponse(scene, START_REVISION));

    renderStage();
    await settle();

    const started = Date.now();
    const at = () => Date.now() - started;
    const attempts: number[] = [];
    autosaveMock.mockImplementation(() => {
      attempts.push(at());
      return Promise.reject(transportFailure());
    });

    edit(200);
    // Well past the whole locked ladder: 2500 debounce + 5000 + 15000 is 22.5 s,
    // so 40 s cannot miss an attempt the ladder would still make.
    for (let step = 0; step < 40; step += 1) await advance(1000);

    // The two properties `APP3-S10` §16 fixes, whichever shape the timeline has.
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.length).toBeLessThanOrEqual(4);
    const last = attempts[attempts.length - 1] ?? 0;
    expect(last).toBeLessThan(30_000);
    expect(saveState()).toBe('ERROR_PAUSED');

    // Every failure is reconciled before anything is replayed: one read per
    // attempt, never a bare repeat.
    expect(resumeMock.mock.calls.length).toBe(attempts.length);

    // The shape itself, recorded rather than asserted into a shape it may not
    // have. `APP3-E01` reads the verdict off this.
    console.log(`RETRY_TIMELINE_MS=${JSON.stringify(attempts)}`);
  });

  it('adds exactly one attempt per further edit, a debounce after it', async () => {
    /*
     * The hypothesis for the browser's fourth attempt.
     *
     * `APP3-S10`'s run typed into a text field, and `APP3-S05` coalesces a typing
     * burst into an edit *session* that closes on its own — so that run made two
     * document mutations, not one. A second mutation re-arms the ladder by
     * design ("a spent one from a network blip must not leave the rest of the
     * session permanently unsaved"), and produces one more attempt a debounce
     * after itself. If that is the mechanism, the timeline gains exactly one
     * attempt and stays bounded.
     */
    autosaveMock.mockRejectedValue(transportFailure());
    resumeMock.mockResolvedValue(resumedResponse(scene, START_REVISION));

    renderStage();
    await settle();

    const started = Date.now();
    const attempts: number[] = [];
    autosaveMock.mockImplementation(() => {
      attempts.push(Date.now() - started);
      return Promise.reject(transportFailure());
    });

    edit(200);
    await advance(3000);
    // A second mutation while the first streak is still failing — the shape a
    // coalescing text edit produces.
    edit(240);
    for (let step = 0; step < 40; step += 1) await advance(1000);

    console.log(`RETRY_TIMELINE_TWO_EDITS_MS=${JSON.stringify(attempts)}`);
    // One more than the single-edit shape, and still bounded and stopped.
    expect(attempts.length).toBe(4);
    expect(saveState()).toBe('ERROR_PAUSED');
    expect(resumeMock.mock.calls.length).toBe(attempts.length);
  });

  it('makes the ladder alone when the streak begins with a pressed retry', async () => {
    autosaveMock.mockRejectedValue(transportFailure());
    resumeMock.mockResolvedValue(resumedResponse(scene, START_REVISION));

    renderStage();
    await settle();

    // One edit, driven to `ERROR_PAUSED`, so the next attempt starts from the
    // customer's own press rather than from a live streak.
    edit(200);
    for (let step = 0; step < 40; step += 1) await advance(1000);
    expect(saveState()).toBe('ERROR_PAUSED');

    const started = Date.now();
    const attempts: number[] = [];
    autosaveMock.mockImplementation(() => {
      attempts.push(Date.now() - started);
      return Promise.reject(transportFailure());
    });

    act(() => {
      document.querySelector<HTMLButtonElement>('[data-testid="studio-save-retry"]')?.click();
    });
    for (let step = 0; step < 40; step += 1) await advance(1000);

    console.log(`RETRY_TIMELINE_FROM_PRESS_MS=${JSON.stringify(attempts)}`);
    expect(attempts.length).toBeLessThanOrEqual(3);
    expect(saveState()).toBe('ERROR_PAUSED');
  });
});
