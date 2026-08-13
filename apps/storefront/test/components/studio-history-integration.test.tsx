/**
 * Undo and redo across the other three capabilities, and what they must never
 * touch (`APP3-S08`).
 *
 * The companion to `studio-history.test.tsx`: the layer commands, the image
 * placement and its Asset side effects, the state history is forbidden to
 * restore, the keyboard path and its editable-field boundary, and the Session
 * and responsive boundaries. Split from that suite when the one file crossed the
 * 600-line test ceiling; the harness is shared so neither can drift.
 */
import { act } from 'react';

import { fireEvent, screen } from '@embroidery/frontend-testing';

import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import { useStudioViewportStore } from '../../src/features/design-studio/store/studio-viewport.store';
import {
  ASSET_ID,
  DERIVATIVE_ID,
  cursor,
  drag,
  entries,
  imageElements,
  installStudioHistoryHarness,
  paintedIds,
  redoButton,
  renderStage,
  rerenderStage,
  scene,
  select,
  statusMock,
  stored,
  studioClient,
  tick,
  undoButton,
  uploadMock,
} from '../support/studio-history-harness';
import { setViewportWidth } from '../support/studio-stage-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicDesignSessionCreate: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicProductPlacementGet: jest.fn(),
  publicDesignSessionAutosave: jest.fn(),
  publicDesignSessionAssetCreate: jest.fn(),
  publicDesignSessionAssetGet: jest.fn(),
  publicDesignSessionAssetStatus: jest.fn(),
}));

installStudioHistoryHarness();

describe('the layer commands (APP3-S08 §12)', () => {
  it('records one entry per reorder and restores the paint order', () => {
    renderStage();
    const before = paintedIds();

    fireEvent.click(screen.getByTestId('studio-layer-up-a'));
    expect(entries()).toHaveLength(1);
    expect(paintedIds()).not.toEqual(before);

    fireEvent.click(undoButton());
    expect(paintedIds()).toEqual(before);

    fireEvent.click(redoButton());
    expect(paintedIds()).not.toEqual(before);
  });

  it('records one entry per lock, and takes it back', () => {
    renderStage();

    fireEvent.click(screen.getByTestId('studio-layer-lock-a'));
    expect(stored('a')?.locked).toBe(true);
    expect(entries()).toHaveLength(1);

    fireEvent.click(undoButton());
    expect(stored('a')?.locked).toBe(false);
  });

  it('records one entry per hide, and takes it back', () => {
    renderStage();

    fireEvent.click(screen.getByTestId('studio-layer-visibility-a'));
    expect(stored('a')?.visible).toBe(false);
    expect(entries()).toHaveLength(1);

    fireEvent.click(undoButton());
    expect(stored('a')?.visible).toBe(true);
  });

  it('carries no group action, because there is no group capability', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-layer-up-a'));

    for (const entry of entries()) {
      expect(entry.action.kind).not.toContain('group');
    }
  });
});

describe('the image capability (APP3-S08 §12, §8)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function accepted() {
    return {
      data: {
        assetId: ASSET_ID,
        designSessionAssetId: 'association',
        sessionRevision: 9,
        assetStatus: 'INSPECTING',
        mediaType: 'image/png',
        byteSize: 2_048,
      },
    } as never;
  }

  function ready() {
    return {
      data: {
        assetId: ASSET_ID,
        state: 'READY',
        derivativeId: DERIVATIVE_ID,
        widthPx: 400,
        heightPx: 240,
        mediaType: 'image/webp',
        byteSize: 51_200,
      },
    } as never;
  }

  function pngFile(): File {
    const handle = new File([new Uint8Array(8)], 'anh.png', { type: 'image/png' });
    Object.defineProperty(handle, 'size', { value: 2_048 });
    return handle;
  }

  async function place() {
    uploadMock.mockResolvedValue(accepted());
    statusMock.mockResolvedValue(ready());
    await act(async () => {
      fireEvent.change(screen.getByTestId('studio-image-file'), {
        target: { files: [pngFile()] },
      });
      await Promise.resolve();
    });
    await tick(2);
  }

  it('records one entry for a placement, and none for the upload before it', async () => {
    renderStage();
    await place();

    expect(entries()).toHaveLength(1);
    expect(entries()[0]?.action.kind).toBe('image-place');
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it('removes only the local element on undo, deleting no Asset and re-uploading nothing', async () => {
    renderStage();
    await place();
    expect(imageElements()).toHaveLength(1);

    await act(async () => {
      fireEvent.click(undoButton());
      await Promise.resolve();
    });

    expect(imageElements()).toHaveLength(0);
    // No delete operation exists on the boundary at all, and no second upload
    // was made — the redo below restores a document, not a file.
    expect(uploadMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(redoButton());
      await Promise.resolve();
    });

    const restored = imageElements();
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ assetId: ASSET_ID, derivativeId: DERIVATIVE_ID });
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it('keeps no Blob or object URL in an entry', async () => {
    renderStage();
    await place();

    const serialized = JSON.stringify(entries());
    expect(serialized).not.toContain('blob:');
    expect(serialized).not.toContain('Blob');
  });
});

describe('what history never touches (APP3-S08 §9, §13)', () => {
  it('calls no autosave and no operation at all when history moves', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[60, 0]]);

    studioClient().publicDesignSessionAutosave.mockClear();
    fireEvent.click(undoButton());
    fireEvent.click(redoButton());

    expect(studioClient().publicDesignSessionAutosave).not.toHaveBeenCalled();
    expect(studioClient().publicDesignSessionCreate).not.toHaveBeenCalled();
    expect(studioClient().publicDesignSessionResume).not.toHaveBeenCalled();
  });

  it('leaves the zoom and pan exactly where they were', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    const zoom = useStudioViewportStore.getState().zoomStep;

    select('a');
    drag('studio-transform-move', [[60, 0]]);
    fireEvent.click(undoButton());
    fireEvent.click(redoButton());

    expect(useStudioViewportStore.getState().zoomStep).toBe(zoom);
    expect(useStudioViewportStore.getState().panXRatio).toBe(0);
  });

  it('leaves the watermark token unchanged', () => {
    renderStage();
    const before = screen.getAllByTestId('studio-watermark')[0]?.textContent;

    select('a');
    drag('studio-transform-move', [[60, 0]]);
    fireEvent.click(undoButton());
    fireEvent.click(redoButton());

    expect(screen.getAllByTestId('studio-watermark')[0]?.textContent).toBe(before);
  });

  it('snapshots no selection, and clears one an undo left pointing at nothing', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[60, 0]]);

    expect(JSON.stringify(entries())).not.toContain('selectedElementId');

    // Selecting something else and undoing must not restore the old selection.
    select('b');
    fireEvent.click(undoButton());
    expect(useStudioInteractionStore.getState().selectedElementId).toBe('b');
  });
});

describe('a new edit after an undo (APP3-S08 §8)', () => {
  it('clears the redo', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[60, 0]]);

    fireEvent.click(undoButton());
    expect(redoButton()).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('studio-layer-lock-a'));
    expect(redoButton()).toBeDisabled();
    expect(entries()).toHaveLength(1);
  });

  it('leaves the redo alone when the new attempt was refused', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[60, 0]]);
    fireEvent.click(undoButton());

    drag('studio-transform-move', [[900, 700]]);

    expect(redoButton()).not.toBeDisabled();
    expect(cursor()).toBe(0);
  });
});

describe('the keyboard path (APP3-S08 §14)', () => {
  it('undoes and redoes from the two bound combinations', () => {
    renderStage();
    select('a');
    const before = stored('a')?.transform.x;
    drag('studio-transform-move', [[60, 0]]);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(stored('a')?.transform.x).toBe(before);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(stored('a')?.transform.x).not.toBe(before);
  });

  it('leaves a keystroke inside a text field to the platform', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[60, 0]]);
    const after = stored('a')?.transform.x;

    select('b');
    const field = screen.getByTestId('studio-text-value');
    fireEvent.focus(field);
    fireEvent.keyDown(field, { key: 'z', ctrlKey: true });

    // The design is untouched: the field's own undo owns that keystroke.
    expect(stored('a')?.transform.x).toBe(after);
  });

  it('ignores a keystroke another handler has already answered', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[60, 0]]);
    const after = stored('a')?.transform.x;

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    window.dispatchEvent(event);

    expect(stored('a')?.transform.x).toBe(after);
  });

  it('binds no third combination', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[60, 0]]);
    fireEvent.click(undoButton());
    const undoneX = stored('a')?.transform.x;

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });

    expect(stored('a')?.transform.x).toBe(undoneX);
  });

  it('removes the listener when the Studio goes away', () => {
    const view = renderStage();
    select('a');
    drag('studio-transform-move', [[60, 0]]);
    const after = stored('a')?.transform.x;

    view.unmount();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    expect(useStudioDocumentStore.getState().document?.elements[0]?.transform.x).toBe(after);
  });
});

describe('the Session boundary and the responsive compositions (APP3-S08 §15, §16)', () => {
  it('starts a different Session with nothing to undo', () => {
    const view = renderStage(scene, { sessionId: 'session-one' });
    select('a');
    drag('studio-transform-move', [[60, 0]]);
    expect(entries()).toHaveLength(1);

    rerenderStage(view, 'session-two');

    expect(entries()).toHaveLength(0);
    expect(undoButton()).toBeDisabled();
  });

  it('starts a reloaded Studio with an empty history', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[60, 0]]);

    // A reload is a fresh runtime over the persisted Session document.
    act(() => {
      useStudioDocumentStore.getState().reset();
    });
    renderStage();

    expect(entries()).toHaveLength(0);
    expect(screen.getAllByTestId('studio-history-undo')[0]).toBeDisabled();
  });

  it('keeps the controls in the persistent rail at 1024, not in the drawer', () => {
    setViewportWidth(1024);
    renderStage();

    // `618:140`: "Thanh công cụ trái giữ nguyên và luôn hiện." The rail is
    // there before the drawer is opened, and the controls are in it.
    const rail = screen.getByTestId('studio-history-rail');
    expect(rail).toContainElement(undoButton());
    expect(rail).toContainElement(redoButton());
    expect(screen.queryByTestId('studio-text-drawer')?.contains(undoButton())).not.toBe(true);
  });

  it('shares the one existing drawer for the history detail at 1024', () => {
    setViewportWidth(1024);
    renderStage();
    fireEvent.click(screen.getByTestId('studio-text-drawer-trigger'));

    // One drawer, still — the history list is a section of it, never a second
    // drawer over the same stage edge.
    expect(screen.getAllByTestId('studio-text-drawer')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-history-list')).toHaveLength(1);
    expect(
      screen.getByTestId('studio-text-drawer').contains(screen.getByTestId('studio-history-list')),
    ).toBe(true);
  });

  /*
   * The 390 boundary moved with the world (`APP3-S11`).
   *
   * The rail, the list and the shortcut hint are still absent — none of them is
   * drawn by any of the six approved mobile frames. What exists now is the
   * toolbar's own `↶` and `↷` from `610:242`, driving the same controller, and
   * there is still no mobile history *list* because no frame draws one.
   */
  it('renders undo only in the mobile toolbar at 390', () => {
    setViewportWidth(390);
    renderStage();

    expect(screen.queryByTestId('studio-history-rail')).toBeNull();
    expect(screen.queryByTestId('studio-history-undo')).toBeNull();
    expect(screen.queryByTestId('studio-history-redo')).toBeNull();
    expect(screen.queryByTestId('studio-history-list')).toBeNull();
    expect(screen.queryByTestId('studio-history-shortcuts')).toBeNull();
    expect(screen.queryByTestId('studio-history-mobile-notice')).toBeNull();

    expect(screen.getByTestId('studio-mobile-undo')).toBeInTheDocument();
    expect(screen.getByTestId('studio-mobile-redo')).toBeInTheDocument();
  });

  it('delivers no APP3-S11 bottom sheet or touch affordance early', () => {
    for (const width of [1440, 1024, 390]) {
      setViewportWidth(width);
      const view = renderStage();
      expect(screen.queryByTestId('studio-history-sheet')).toBeNull();
      expect(document.querySelector('[class*="bottom-sheet"]')).toBeNull();
      view.unmount();
    }
  });
});
