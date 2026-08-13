/**
 * The 390 gestures (`APP3-S11`, `610:242`).
 *
 * The failures this exists to catch are the ones a working demo hides:
 *
 * - **A finger moves the design when the customer meant the view.** Two fingers
 *   on the stage must never reach `APP3-P01`, and one finger must never reach
 *   `APP3-S07`.
 * - **A pinch produces a scale.** `ADR-APP0-001` measured its worst frame by
 *   driving a continuous pinch, so a gesture that walks off the frozen list is
 *   the one regression the whole zoom model exists to prevent.
 * - **A drag becomes sixty history entries.** One gesture is one thing the
 *   customer did.
 * - **A gesture survives the fingers.** A pointer record left behind makes the
 *   next single tap look like the second finger of a pinch.
 *
 * So the assertions are on the **persisted document**, the viewport store and
 * the history bound — never on how the chrome looks.
 */
import { act } from 'react';

import { publicProductSideBackgroundGet } from '@embroidery/api-client';
import { renderWithProviders, screen } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import { useStudioViewportStore } from '../../src/features/design-studio/store/studio-viewport.store';
import {
  makeScope,
  makeStageDocument,
  makeStageSnapshot,
  setViewportWidth,
  shapeElement,
} from '../support/studio-stage-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicDesignSessionCreate: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicProductPlacementGet: jest.fn(),
  publicDesignSessionAutosave: jest.fn(),
}));

const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;

const BOX_PX = 1000;
/** Inside the fixture safe area (100,120 → 400,320), with room to be dragged. */
const INSIDE = { x: 150, y: 160, width: 40, height: 20, rotationDeg: 0, scaleX: 1, scaleY: 1 };

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/background');
  URL.revokeObjectURL = jest.fn();
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn(() => true);
  // jsdom runs no frames; the gesture schedules exactly one per pointer batch.
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  };
  globalThis.cancelAnimationFrame = () => undefined;
});

beforeEach(() => {
  backgroundMock.mockReset();
  backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
  useStudioInteractionStore.setState({ selectedElementId: null });
  useStudioDocumentStore.getState().reset();
  useStudioViewportStore.getState().resetViewport();
  setViewportWidth(390);
});

function renderStage() {
  const document = makeStageDocument([shapeElement('a', { transform: INSIDE })]);
  return renderWithProviders(
    <StudioStageScreen
      areaLimits={null}
      isResuming={false}
      onExpired={jest.fn()}
      onResume={jest.fn()}
      scope={makeScope()}
      snapshot={makeStageSnapshot(document)}
      templateName={null}
    />,
  );
}

function select(id: string) {
  act(() => {
    useStudioInteractionStore.setState({ selectedElementId: id });
  });
}

/** jsdom implements no `PointerEvent`, so the fields the code reads are set here. */
function touch(type: string, init: Record<string, unknown> = {}) {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId: 1,
    pointerType: 'touch',
    button: 0,
    clientX: 0,
    clientY: 0,
    ...init,
  });
}

/** jsdom lays nothing out; this is the size a gesture divides its delta by. */
function sizeSurfaces() {
  for (const id of ['studio-stage-viewport', 'studio-transform-overlay']) {
    const node = screen.queryByTestId(id);
    if (node === null) continue;
    Object.defineProperty(node, 'clientWidth', { value: BOX_PX, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: BOX_PX, configurable: true });
  }
}

const stored = () =>
  useStudioDocumentStore.getState().document?.elements.find((element) => element.id === 'a');
const historyLength = () => useStudioDocumentStore.getState().history.entries.length;

describe('one finger moves the design (610:242)', () => {
  it('drags the selected element through APP3-P02 and appends exactly one entry', () => {
    renderStage();
    select('a');
    sizeSurfaces();

    const before = stored()?.transform.x;
    const entriesBefore = historyLength();
    const surface = screen.getByTestId('studio-transform-move');
    const overlay = screen.getByTestId('studio-transform-overlay');

    act(() => {
      surface.dispatchEvent(touch('pointerdown', { clientX: 0, clientY: 0 }));
    });
    for (const step of [10, 20, 30, 40]) {
      act(() => {
        overlay.dispatchEvent(touch('pointermove', { clientX: step, clientY: 0 }));
      });
    }
    act(() => {
      overlay.dispatchEvent(touch('pointerup', { clientX: 40, clientY: 0 }));
    });

    // The design moved, and the four pointer frames are one thing the customer
    // did — never one entry per frame.
    expect(stored()?.transform.x).toBeGreaterThan(before ?? 0);
    expect(historyLength()).toBe(entriesBefore + 1);
  });

  it('leaves the viewport exactly where it was', () => {
    renderStage();
    select('a');
    sizeSurfaces();

    const surface = screen.getByTestId('studio-transform-move');
    const overlay = screen.getByTestId('studio-transform-overlay');
    act(() => {
      surface.dispatchEvent(touch('pointerdown', { clientX: 0, clientY: 0 }));
      overlay.dispatchEvent(touch('pointermove', { clientX: 40, clientY: 40 }));
      overlay.dispatchEvent(touch('pointerup', { clientX: 40, clientY: 40 }));
    });

    const view = useStudioViewportStore.getState();
    expect(view.zoomStep).toBe(0);
    expect(view.panXRatio).toBe(0);
    expect(view.panYRatio).toBe(0);
  });
});

describe('two fingers move the camera (610:242)', () => {
  function pinch(from: number, to: number) {
    const surface = screen.getByTestId('studio-stage-viewport');
    act(() => {
      surface.dispatchEvent(touch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      surface.dispatchEvent(touch('pointerdown', { pointerId: 2, clientX: from, clientY: 0 }));
    });
    act(() => {
      surface.dispatchEvent(touch('pointermove', { pointerId: 2, clientX: to, clientY: 0 }));
    });
    act(() => {
      surface.dispatchEvent(touch('pointerup', { pointerId: 1, clientX: 0, clientY: 0 }));
      surface.dispatchEvent(touch('pointerup', { pointerId: 2, clientX: to, clientY: 0 }));
    });
  }

  it('zooms in discrete steps and writes nothing to the document', () => {
    renderStage();
    sizeSurfaces();
    const documentBefore = useStudioDocumentStore.getState().document;
    const entriesBefore = historyLength();

    pinch(200, 600);

    expect(useStudioViewportStore.getState().zoomStep).toBeGreaterThan(0);
    // The same object, not merely an equal one: a viewport gesture may not touch
    // `APP3-P01` at all, and identity is the strongest way to say so.
    expect(useStudioDocumentStore.getState().document).toBe(documentBefore);
    expect(historyLength()).toBe(entriesBefore);
  });

  it('pans from the centroid and still writes nothing to the document', () => {
    renderStage();
    sizeSurfaces();
    act(() => {
      useStudioViewportStore.getState().setZoomStep(3);
    });
    const documentBefore = useStudioDocumentStore.getState().document;

    const surface = screen.getByTestId('studio-stage-viewport');
    act(() => {
      surface.dispatchEvent(touch('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }));
      surface.dispatchEvent(touch('pointerdown', { pointerId: 2, clientX: 300, clientY: 100 }));
    });
    act(() => {
      // Both fingers travel together: the separation is unchanged, so this is a
      // pan and not a pinch.
      surface.dispatchEvent(touch('pointermove', { pointerId: 1, clientX: 40, clientY: 100 }));
      surface.dispatchEvent(touch('pointermove', { pointerId: 2, clientX: 240, clientY: 100 }));
    });

    expect(useStudioViewportStore.getState().panXRatio).toBeLessThan(0);
    expect(useStudioDocumentStore.getState().document).toBe(documentBefore);
  });

  it('closes an element drag when the second finger lands, into one entry', () => {
    renderStage();
    select('a');
    sizeSurfaces();

    const entriesBefore = historyLength();
    const surface = screen.getByTestId('studio-transform-move');
    const overlay = screen.getByTestId('studio-transform-overlay');
    const viewportSurface = screen.getByTestId('studio-stage-viewport');

    act(() => {
      surface.dispatchEvent(touch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
    });
    act(() => {
      overlay.dispatchEvent(touch('pointermove', { pointerId: 1, clientX: 30, clientY: 0 }));
    });
    expect(stored()?.transform.x).toBeGreaterThan(INSIDE.x);
    // The second finger arrives mid-drag. The drag is over: what it had already
    // committed becomes one entry, and nothing is left half applied.
    act(() => {
      viewportSurface.dispatchEvent(
        touch('pointerdown', { pointerId: 2, clientX: 200, clientY: 0 }),
      );
    });

    expect(historyLength()).toBe(entriesBefore + 1);

    // And the drag does not resume: further movement of the first finger moves
    // the camera with the second, not the element.
    const afterHandoff = stored()?.transform.x;
    act(() => {
      viewportSurface.dispatchEvent(
        touch('pointermove', { pointerId: 1, clientX: 120, clientY: 0 }),
      );
    });
    expect(stored()?.transform.x).toBe(afterHandoff);
  });
});

describe('nothing survives the fingers', () => {
  it('forgets a cancelled contact, so the next tap is one finger again', () => {
    renderStage();
    sizeSurfaces();
    const surface = screen.getByTestId('studio-stage-viewport');

    act(() => {
      surface.dispatchEvent(touch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      surface.dispatchEvent(touch('pointerdown', { pointerId: 2, clientX: 200, clientY: 0 }));
    });
    act(() => {
      surface.dispatchEvent(touch('pointercancel', { pointerId: 1, clientX: 0, clientY: 0 }));
      surface.dispatchEvent(touch('pointercancel', { pointerId: 2, clientX: 200, clientY: 0 }));
    });

    const step = useStudioViewportStore.getState().zoomStep;
    // One finger after the cancel is an element gesture, so the camera does not
    // move however far it travels.
    act(() => {
      surface.dispatchEvent(touch('pointerdown', { pointerId: 3, clientX: 0, clientY: 0 }));
      surface.dispatchEvent(touch('pointermove', { pointerId: 3, clientX: 300, clientY: 0 }));
    });
    expect(useStudioViewportStore.getState().zoomStep).toBe(step);
  });

  it('binds no touch arbitration at 1440', () => {
    setViewportWidth(1440);
    renderStage();
    expect(screen.getByTestId('studio-stage-viewport')).not.toHaveAttribute('data-touch');
    expect(screen.queryByTestId('studio-mobile-toolbar')).not.toBeInTheDocument();
  });
});
