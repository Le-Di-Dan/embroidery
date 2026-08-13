/**
 * The conflict decision, the failure surface, and what `APP3-S10` must not have
 * disturbed.
 *
 * The companion to `studio-autosave.test.tsx`: that suite proves how the loop
 * behaves, this one proves what the customer is shown and what they can do about
 * it — plus the `APP3-S08` carry-forward boundary and the predecessor capability
 * regressions. Split so neither file crosses the 600-line test ceiling; the
 * harness is shared so neither can drift.
 */
import { act } from 'react';

import { fireEvent, screen } from '@embroidery/frontend-testing';

import { STUDIO_SAVE_COPY } from '../../src/features/design-studio/model/studio-autosave-copy';
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
  settle,
  START_REVISION,
  tone,
  working,
} from '../support/studio-autosave-harness';
import { apiFailure } from '../support/studio-fixture';
import { setViewportWidth } from '../support/studio-stage-fixture';

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

const networkFailure = {
  isAxiosError: true,
  name: 'AxiosError',
  message: 'Network Error',
  code: 'ERR_NETWORK',
  toJSON: () => ({}),
};

const SERVER_X = 900;
const LATEST_REVISION = 12;

/** Drives one save into the `409` conflict state, with a real local edit. */
async function intoConflict(): Promise<void> {
  autosaveMock.mockRejectedValue(apiFailure(409));
  resumeMock.mockResolvedValue(resumedResponse(movedScene(SERVER_X), LATEST_REVISION));
  renderStage();

  edit(200);
  await advance(2500);
  await settle();
}

async function press(testId: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
    await Promise.resolve();
  });
}

describe('the two conflict choices (APP3-S10 §14)', () => {
  it('replaces the local document when the customer loads the latest', async () => {
    await intoConflict();

    await press('studio-save-load-latest');

    expect(placedX()).toBe(SERVER_X);
    expect(tone()).toBe('saved');
  });

  it('discards the local past with the local branch it described', async () => {
    await intoConflict();
    expect(entries().length).toBeGreaterThan(0);

    await press('studio-save-load-latest');

    // An undo that reached back into the discarded branch would restore a design
    // the customer explicitly chose to abandon.
    expect(entries()).toHaveLength(0);
    expect(cursor()).toBe(0);
  });

  it('never saves the local document until the customer says to keep it', async () => {
    await intoConflict();

    // One request has been made — the one that was refused — and nothing has
    // overwritten the server since.
    expect(autosaveMock).toHaveBeenCalledTimes(1);
    await advance(600_000);
    expect(autosaveMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the local document, its past, and saves it against the latest revision', async () => {
    await intoConflict();
    const past = entries().length;
    autosaveMock.mockReset();
    autosaveMock.mockResolvedValue(savedResponse(movedScene(200), LATEST_REVISION + 1));

    await press('studio-save-keep-local');
    await settle();

    expect(placedX()).toBe(200);
    expect(entries()).toHaveLength(past);
    expect(autosaveMock).toHaveBeenCalledTimes(1);
    // The CAS base is the revision the server actually holds, not the stale one
    // the refused save presented.
    expect(autosaveMock.mock.calls[0]?.[1].expectedRevision).toBe(LATEST_REVISION);
  });

  it('re-enters the conflict on a second race, without looping', async () => {
    await intoConflict();
    autosaveMock.mockReset();
    autosaveMock.mockRejectedValue(apiFailure(409));
    resumeMock.mockResolvedValue(resumedResponse(movedScene(950), LATEST_REVISION + 1));

    await press('studio-save-keep-local');
    await settle();

    expect(tone()).toBe('conflict');
    // Nothing tries again by itself. The next attempt needs another click.
    await advance(600_000);
    expect(autosaveMock).toHaveBeenCalledTimes(1);
  });

  it('merges nothing and blends no element from the two documents', async () => {
    await intoConflict();

    expect(working()?.elements).toHaveLength(1);
    expect(placedX()).toBe(200);
    expect(screen.getByText(STUDIO_SAVE_COPY.conflictBody)).toBeInTheDocument();
  });
});

describe('a failure the customer can act on (APP3-S10 §16)', () => {
  beforeEach(async () => {
    autosaveMock.mockRejectedValue(networkFailure);
    resumeMock.mockResolvedValue(resumedResponse(movedScene(150), START_REVISION));
    renderStage();
    edit(200);
    await advance(2500);
    await settle();
  });

  it('saves again when the customer asks it to', async () => {
    // The ladder is spent, so nothing is armed; the button is the only way on.
    await advance(5000);
    await settle();
    await advance(15_000);
    await settle();
    expect(tone()).toBe('offline');
    const spent = autosaveMock.mock.calls.length;

    await press('studio-save-retry');
    await settle();

    expect(autosaveMock.mock.calls.length).toBe(spent + 1);
  });

  it('never reports the design as saved when the message is dismissed', async () => {
    expect(screen.getByTestId('studio-save-state')).toBeInTheDocument();

    await press('studio-save-dismiss');

    // The message is gone; the truth is not. The chip still says so, and the
    // document is still on screen.
    expect(screen.queryByTestId('studio-save-state')).not.toBeInTheDocument();
    expect(tone()).toBe('offline');
    expect(placedX()).toBe(200);
  });

  it('keeps warning about closing the tab while work is unsaved', () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe('what the customer is told (APP3-S10 §18)', () => {
  it('shows a time only from a save that really happened', async () => {
    jest.setSystemTime(new Date(2026, 7, 13, 14, 3, 0));
    autosaveMock.mockResolvedValue(savedResponse(movedScene(200), 5));
    renderStage();

    // A Session that has not saved since it opened is genuinely saved, and
    // carries no time rather than an invented one.
    expect(tone()).toBe('saved');
    expect(screen.queryByTestId('studio-save-chip-at')).not.toBeInTheDocument();

    edit(200);
    await advance(2500);

    expect(screen.getByTestId('studio-save-chip-at')).toHaveTextContent(
      `${STUDIO_SAVE_COPY.chipSavedAtPrefix} 14:03`,
    );
  });

  it('never puts a revision number in front of a customer', async () => {
    // A fixed clock, so the only digits the chip can carry are the ones the
    // approved frame draws — and the revision the server returned is not
    // among them.
    jest.setSystemTime(new Date(2026, 7, 13, 14, 3, 0));
    autosaveMock.mockResolvedValue(savedResponse(movedScene(200), 57));
    renderStage();

    edit(200);
    await advance(2500);

    expect(screen.getByTestId('studio-save-chip')).toHaveTextContent(
      `${STUDIO_SAVE_COPY.chipSaved}${STUDIO_SAVE_COPY.chipSavedAtPrefix} 14:03`,
    );
    /*
     * Scoped to the two surfaces `APP3-S10` owns rather than to the whole
     * container: the watermark's own tiling percentages contain almost every
     * two-digit run there is, so a document-wide substring ban would fire on
     * `103.57142857%` and prove nothing about the revision.
     */
    for (const surface of ['studio-stage-topbar', 'studio-save-state']) {
      expect(screen.getByTestId(surface).innerHTML).not.toContain('57');
    }
  });

  it('warns about leaving only while there is something to lose', async () => {
    autosaveMock.mockResolvedValue(savedResponse(movedScene(200), 5));
    renderStage();

    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    edit(200);
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);

    await advance(2500);
    const saved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
  });
});

describe('the APP3-S08 carry-forward boundary (APP3-S10 §6)', () => {
  it('has one topbar, one rail, one drawer and one stage at 1024', async () => {
    setViewportWidth(1024);
    renderStage();
    await settle();

    expect(screen.getAllByTestId('studio-stage-topbar')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-history-rail')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-text-drawer')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-stage-canvas')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-text-drawer-trigger')).toHaveLength(1);
  });

  it('keeps the rail outside the drawer, and the save state outside it too', async () => {
    setViewportWidth(1024);
    renderStage();
    await settle();
    const drawer = screen.getByTestId('studio-text-drawer');

    // `618:140`: the left rail persists at 1024 and is always visible. A
    // decision about unsaved work may not be behind the drawer toggle either.
    expect(drawer.contains(screen.getByTestId('studio-history-rail'))).toBe(false);
    expect(drawer.contains(screen.getByTestId('studio-save-chip'))).toBe(false);
  });

  it('duplicates no accepted control', async () => {
    setViewportWidth(1024);
    renderStage();
    await settle();

    expect(screen.getAllByTestId('studio-history-undo')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-history-redo')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-save-chip')).toHaveLength(1);
  });

  it('leaves the history engine exactly as APP3-S08 accepted it', async () => {
    autosaveMock.mockResolvedValue(savedResponse(movedScene(200), 5));
    renderStage();

    edit(200);
    expect(entries()).toHaveLength(1);
    expect(cursor()).toBe(1);
    await advance(2500);

    // A save moves neither the cursor nor the past, and the baseline row is
    // still a projection rather than an entry.
    expect(entries()).toHaveLength(1);
    expect(cursor()).toBe(1);
    expect(screen.getAllByTestId('studio-history-baseline')).toHaveLength(1);
  });
});

describe('APP3-S10 pulls nothing forward', () => {
  it('renders no save surface and no S11 control on a phone', async () => {
    setViewportWidth(390);
    const { container } = renderStage();
    await settle();

    // The chip is truthful lifecycle state and stays; every editing surface the
    // phone must not have is still absent.
    expect(screen.getAllByTestId('studio-save-chip')).toHaveLength(1);
    expect(screen.queryByTestId('studio-history-rail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('studio-text-drawer')).not.toBeInTheDocument();
    for (const sheet of ['bottom-sheet', 'sheet-handle', 'pinch']) {
      expect(container.innerHTML).not.toContain(sheet);
    }
  });

  it('changes no viewport, watermark or media behaviour', async () => {
    autosaveMock.mockResolvedValue(savedResponse(movedScene(200), 5));
    const { container } = renderStage();

    edit(200);
    await advance(2500);

    expect(screen.getAllByTestId('studio-watermark')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-stage-controls')).toHaveLength(1);
    // No object URL, blob or storage address is anywhere near a save.
    expect(JSON.stringify(autosaveMock.mock.calls)).not.toContain('blob:');
    expect(container.innerHTML).not.toContain('storageKey');
  });

  it('persists no document, revision or expiry in the browser', async () => {
    autosaveMock.mockResolvedValue(savedResponse(movedScene(200), 5));
    renderStage();

    edit(200);
    await advance(2500);

    // The stage screen holds no resume handle at all — that is the bootstrap
    // screen's, keyed by placement — and nothing else may be stored.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});
