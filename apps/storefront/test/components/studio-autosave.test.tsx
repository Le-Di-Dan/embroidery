/**
 * The autosave loop, against the real Studio (`APP3-S10`).
 *
 * Cadence, one-in-flight, success, edits arriving during a save, and the three
 * ways a save can end badly: refused as stale, answered by nobody, or refused
 * for a reason repeating cannot fix. Every timing proof runs on a fake clock —
 * a real 2500 ms wait would be slow and a real 15 s retry ladder unrunnable.
 *
 * The conflict decision and the resume flow are the companion suites'.
 */
import { act } from 'react';

import { fireEvent, screen, waitFor } from '@embroidery/frontend-testing';

import {
  advance,
  autosaveMock,
  cursor,
  edit,
  entries,
  installStudioAutosaveHarness,
  movedScene,
  placedX,
  renderStage,
  resumeMock,
  resumedResponse,
  savedResponse,
  scene,
  settle,
  START_REVISION,
  tone,
  working,
} from '../support/studio-autosave-harness';
import { apiFailure } from '../support/studio-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignSessionAutosave: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicDesignSessionAssetCreate: jest.fn(),
  publicDesignSessionAssetGet: jest.fn(),
  publicDesignSessionAssetStatus: jest.fn(),
}));

installStudioAutosaveHarness();

/**
 * A request that never got an answer.
 *
 * An Axios error with **no `response`** — which is what a timeout, a reset
 * connection or an offline radio actually produces, and the one case where the
 * write may have arrived anyway.
 */
const networkFailure = {
  isAxiosError: true,
  name: 'AxiosError',
  message: 'Network Error',
  code: 'ERR_NETWORK',
  toJSON: () => ({}),
};

/** The document that reached the server on call `index`. */
function sentDocument(index: number) {
  const call = autosaveMock.mock.calls[index];
  if (call === undefined) throw new Error(`no autosave call at ${String(index)}`);
  return call[1];
}

describe('the cadence (APP3-S10 §8)', () => {
  it('opens clean, and saves nothing until something changes', async () => {
    renderStage();
    expect(tone()).toBe('saved');

    await advance(60_000);

    expect(autosaveMock).not.toHaveBeenCalled();
  });

  it('marks the document dirty the moment it changes', () => {
    renderStage();

    edit(200);

    expect(tone()).toBe('dirty');
    expect(autosaveMock).not.toHaveBeenCalled();
  });

  it('does not save at 2499ms of quiet, and saves once at 2500ms', async () => {
    autosaveMock.mockResolvedValue(savedResponse(movedScene(200), 5));
    renderStage();

    edit(200);
    await advance(2499);
    expect(autosaveMock).not.toHaveBeenCalled();

    await advance(1);
    expect(autosaveMock).toHaveBeenCalledTimes(1);
  });

  it('does not postpone a continuously edited document past 10000ms', async () => {
    autosaveMock.mockResolvedValue(savedResponse(movedScene(260), 5));
    renderStage();

    // An edit every 2000ms: quiet never arrives, so only the ceiling can save.
    edit(200);
    for (let step = 1; step <= 4; step += 1) {
      await advance(2000);
      edit(200 + step * 10);
    }

    expect(autosaveMock).toHaveBeenCalledTimes(0);
    await advance(2000);
    expect(autosaveMock).toHaveBeenCalledTimes(1);
  });

  it('holds exactly one request open, however much the customer edits', async () => {
    autosaveMock.mockReturnValue(new Promise(() => undefined));
    renderStage();

    edit(200);
    await advance(2500);
    expect(autosaveMock).toHaveBeenCalledTimes(1);
    expect(tone()).toBe('saving');

    edit(210);
    await advance(60_000);

    expect(autosaveMock).toHaveBeenCalledTimes(1);
  });

  it('fires no save after the Studio has gone away', async () => {
    autosaveMock.mockResolvedValue(savedResponse(movedScene(200), 5));
    const view = renderStage();
    edit(200);

    view.unmount();
    await advance(600_000);

    // A timer surviving the Studio would save a document nobody is editing into
    // a component that no longer exists.
    expect(autosaveMock).not.toHaveBeenCalled();
  });
});

describe('a save that succeeds (APP3-S10 §11)', () => {
  it('presents the revision it last read, never one it computed', async () => {
    autosaveMock.mockResolvedValue(savedResponse(movedScene(200), 9));
    renderStage();

    edit(200);
    await advance(2500);

    expect(sentDocument(0).expectedRevision).toBe(START_REVISION);

    // The next save presents 9 — the number the server returned — and not 5,
    // which is what "previous + 1" would have produced.
    edit(210);
    await advance(2500);
    expect(sentDocument(1).expectedRevision).toBe(9);
  });

  it('sends the document as it stood when the save began', async () => {
    autosaveMock.mockReturnValue(new Promise(() => undefined));
    renderStage();

    edit(200);
    await advance(2500);
    edit(300);

    // The in-flight save is answering for the document it was given, not for
    // whatever the customer has done since.
    expect(sentDocument(0).document.elements[0]?.transform.x).toBe(200);
  });

  it('becomes clean and adopts the canonical form the server returned', async () => {
    // The server persists a canonical, quantized document. Whatever it returns
    // is what is stored, so it is what the stage draws from.
    autosaveMock.mockResolvedValue(savedResponse(movedScene(201), 5));
    renderStage();

    edit(200);
    await advance(2500);

    expect(tone()).toBe('saved');
    expect(placedX()).toBe(201);
  });

  it('never overwrites a newer local edit with an older response', async () => {
    let release = (): void => undefined;
    autosaveMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(savedResponse(movedScene(200), 5));
          };
        }),
    );
    autosaveMock.mockResolvedValue(savedResponse(movedScene(300), 6));
    renderStage();

    edit(200);
    await advance(2500);
    edit(300);
    release();
    await settle();

    // The response describes x=200 and the customer is at x=300.
    expect(placedX()).toBe(300);
    expect(tone()).toBe('dirty');

    await advance(2500);
    expect(sentDocument(1).document.elements[0]?.transform.x).toBe(300);
    expect(sentDocument(1).expectedRevision).toBe(5);
  });

  it('adds no history entry for the document the server canonicalized', async () => {
    autosaveMock.mockResolvedValue(savedResponse(movedScene(201), 5));
    renderStage();

    edit(200);
    const before = entries().length;
    await advance(2500);

    // The customer did nothing, so there is nothing to undo.
    expect(entries()).toHaveLength(before);
    expect(cursor()).toBe(before);
  });
});

describe('undo and redo are document mutations (APP3-S10 §23)', () => {
  it('saves an undo on the same cadence as any other change', async () => {
    autosaveMock.mockResolvedValue(savedResponse(movedScene(200), 5));
    renderStage();

    edit(200);
    await advance(2500);
    expect(tone()).toBe('saved');
    autosaveMock.mockClear();
    autosaveMock.mockResolvedValue(savedResponse(scene, 6));

    await act(async () => {
      fireEvent.click(screen.getByTestId('studio-history-undo'));
      await Promise.resolve();
    });
    expect(tone()).toBe('dirty');
    await advance(2500);

    expect(autosaveMock).toHaveBeenCalledTimes(1);
    // The document the undo restored, at the revision the save returned.
    expect(sentDocument(0).document.elements[0]?.transform.x).toBe(150);
    expect(sentDocument(0).expectedRevision).toBe(5);
  });
});

describe('a stale revision (APP3-S10 §13)', () => {
  const serverDocument = movedScene(900);

  beforeEach(() => {
    autosaveMock.mockRejectedValue(apiFailure(409));
    resumeMock.mockResolvedValue(resumedResponse(serverDocument, 12));
  });

  it('reads the latest state once and never replays the write', async () => {
    renderStage();

    edit(200);
    await advance(2500);
    await settle();

    expect(resumeMock).toHaveBeenCalledTimes(1);
    expect(autosaveMock).toHaveBeenCalledTimes(1);

    // No timer may arm a save while the customer owes a decision.
    await advance(60_000);
    expect(autosaveMock).toHaveBeenCalledTimes(1);
  });

  it('keeps both documents and says the server was not overwritten', async () => {
    renderStage();

    edit(200);
    await advance(2500);
    await settle();

    expect(tone()).toBe('conflict');
    // The customer's document is still the one on the stage.
    expect(placedX()).toBe(200);
    await waitFor(() => {
      expect(screen.getByTestId('studio-save-load-latest')).toBeInTheDocument();
    });
    expect(screen.getByTestId('studio-save-keep-local')).toBeInTheDocument();
  });

  it('offers exactly two choices and merges nothing', async () => {
    const { container } = renderStage();

    edit(200);
    await advance(2500);
    await settle();

    const actions = container.querySelectorAll('.studio-save__actions button');
    expect(actions).toHaveLength(2);
    // No document anywhere is a blend of the two.
    expect(working()?.elements).toHaveLength(1);
    expect(placedX()).toBe(200);
  });
});

describe('an outcome nobody knows (APP3-S10 §15)', () => {
  beforeEach(() => {
    // No response at all: a timeout, a reset connection, a dropped request.
    autosaveMock.mockRejectedValue(networkFailure);
  });

  it('reconciles before it retries, rather than replaying blindly', async () => {
    resumeMock.mockResolvedValue(resumedResponse(scene, START_REVISION));
    renderStage();

    edit(200);
    await advance(2500);
    await settle();

    // The read happened, and the write was not repeated before it answered.
    expect(resumeMock).toHaveBeenCalledTimes(1);
    expect(autosaveMock).toHaveBeenCalledTimes(1);
  });

  it('treats a server that already holds the submitted document as saved', async () => {
    resumeMock.mockResolvedValue(resumedResponse(movedScene(200), START_REVISION + 1));
    renderStage();

    edit(200);
    await advance(2500);
    await settle();

    expect(tone()).toBe('saved');
    expect(autosaveMock).toHaveBeenCalledTimes(1);
  });

  it('retries, bounded, when the server is still on the base revision', async () => {
    resumeMock.mockResolvedValue(resumedResponse(scene, START_REVISION));
    renderStage();

    edit(200);
    await advance(2500);
    await settle();
    expect(tone()).toBe('offline');

    // Two automatic attempts, at 5s and 15s, and then it stops.
    await advance(5000);
    await settle();
    expect(autosaveMock).toHaveBeenCalledTimes(2);

    await advance(15_000);
    await settle();
    expect(autosaveMock).toHaveBeenCalledTimes(3);

    await advance(600_000);
    expect(autosaveMock).toHaveBeenCalledTimes(3);
  });

  it('becomes a conflict when the server diverged instead', async () => {
    resumeMock.mockResolvedValue(resumedResponse(movedScene(900), START_REVISION + 1));
    renderStage();

    edit(200);
    await advance(2500);
    await settle();

    expect(tone()).toBe('conflict');
  });
});

describe('a save the server refused (APP3-S10 §17)', () => {
  it('stops without a loop when repeating cannot help', async () => {
    autosaveMock.mockRejectedValue(apiFailure(422));
    renderStage();

    edit(200);
    await advance(2500);
    await settle();

    expect(tone()).toBe('failed');
    await advance(600_000);
    expect(autosaveMock).toHaveBeenCalledTimes(1);
    // The document is still on screen. Nothing was discarded to make a refusal
    // go away.
    expect(placedX()).toBe(200);
  });

  it('does not rapid-loop when the Session is over its mutation ceiling', async () => {
    autosaveMock.mockRejectedValue(apiFailure(429));
    renderStage();

    edit(200);
    await advance(2500);
    await settle();

    // Nothing fires again inside the first retry delay.
    await advance(4999);
    expect(autosaveMock).toHaveBeenCalledTimes(1);
  });

  it('raises expiry to the screen and stops saving for good', async () => {
    autosaveMock.mockRejectedValue(apiFailure(401));
    const { onExpired } = renderStage();

    edit(200);
    await advance(2500);
    await settle();

    expect(onExpired).toHaveBeenCalledTimes(1);
    edit(300);
    await advance(600_000);
    expect(autosaveMock).toHaveBeenCalledTimes(1);
  });
});
