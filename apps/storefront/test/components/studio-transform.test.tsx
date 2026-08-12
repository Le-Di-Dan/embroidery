/**
 * The Studio transform controls (`APP3-S03`).
 *
 * The failure this exists to catch is a transform that looks right: a drag that
 * silently clamps back inside the safe area, a resize that quietly rewrites
 * `width` instead of `scaleX`, a candidate that is committed before it is ruled
 * on, a millimetre read-out that tracks the zoom, or a handle set that stops
 * following the artwork the moment the element is rotated.
 *
 * So the assertions are on the **persisted document** and on what `APP3-P02`
 * measures, not on how the chrome looks. The one thing checked visually is the
 * thing that can only be wrong visually: that a handle's hit target survives the
 * viewport scale.
 */
import { act } from 'react';

import { publicProductSideBackgroundGet } from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { RESIZE_HANDLES } from '../../src/features/design-studio/model/studio-transform-handles';
import { STUDIO_TRANSFORM_COPY } from '../../src/features/design-studio/model/studio-transform-copy';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import { useStudioViewportStore } from '../../src/features/design-studio/store/studio-viewport.store';
import {
  groupElement,
  makeScope,
  makeStageDocument,
  makeStageSnapshot,
  shapeElement,
  textElement,
} from '../support/studio-stage-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicDesignSessionCreate: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicProductPlacementGet: jest.fn(),
}));

const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;

const BOX_WIDTH_PX = 1000;
const BOX_HEIGHT_PX = 800;
/** Inside the fixture safe area (100,120 → 400,320) with room to be dragged out. */
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
});

/** jsdom lays nothing out; this is the size the gesture divides a delta by. */
function sizeOverlay() {
  const node = screen.queryByTestId('studio-transform-overlay');
  if (node === null) return;
  Object.defineProperty(node, 'clientWidth', { value: BOX_WIDTH_PX, configurable: true });
  Object.defineProperty(node, 'clientHeight', { value: BOX_HEIGHT_PX, configurable: true });
}

function renderStage(
  document = makeStageDocument([shapeElement('a', { transform: INSIDE })]),
  scope = makeScope(),
  areaLimits: { maxWidthMm: number | null; maxHeightMm: number | null } | null = null,
) {
  const snapshot = makeStageSnapshot(document);
  const result = renderWithProviders(
    <StudioStageScreen
      areaLimits={areaLimits}
      isResuming={false}
      onResume={jest.fn()}
      scope={scope}
      snapshot={snapshot}
    />,
  );
  return { ...result, snapshot };
}

/** Store writes are React state; outside `act` nothing re-renders and every
 * later query would be asserting against the previous frame. */
function select(id: string) {
  act(() => {
    useStudioInteractionStore.setState({ selectedElementId: id });
  });
}

function viewport(change: () => void) {
  act(change);
}

/** jsdom implements no `PointerEvent`, so `button` and `pointerType` are dropped. */
function pointerEvent(type: string, init: Record<string, unknown> = {}) {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: 0,
    clientY: 0,
    ...init,
  });
}

function drag(testId: string, deltaXPx: number, deltaYPx: number, pointerType = 'mouse') {
  sizeOverlay();
  const handle = screen.getByTestId(testId);
  const overlay = screen.getByTestId('studio-transform-overlay');
  fireEvent(handle, pointerEvent('pointerdown', { pointerType }));
  fireEvent(
    overlay,
    pointerEvent('pointermove', { pointerType, clientX: deltaXPx, clientY: deltaYPx }),
  );
  fireEvent(overlay, pointerEvent('pointerup', { pointerType }));
}

const persisted = (id: string) =>
  useStudioDocumentStore.getState().document?.elements.find((element) => element.id === id)
    ?.transform;

describe('the chrome appears for exactly one transformable element', () => {
  it('is absent until something is selected', () => {
    renderStage();
    expect(screen.queryByTestId('studio-transform-overlay')).toBeNull();
  });

  it('draws eight resize handles and one rotate affordance', () => {
    renderStage();
    select('a');

    for (const handle of RESIZE_HANDLES) {
      expect(screen.getByTestId(`studio-transform-handle-${handle}`)).toBeInTheDocument();
    }
    expect(RESIZE_HANDLES).toHaveLength(8);
    expect(screen.getByTestId('studio-transform-rotate')).toBeInTheDocument();
    expect(screen.getByTestId('studio-transform-move')).toBeInTheDocument();
  });

  it('gives every control a name that says which corner it grabs', () => {
    renderStage();
    select('a');

    expect(screen.getByTestId('studio-transform-handle-nw')).toHaveAttribute(
      'aria-label',
      STUDIO_TRANSFORM_COPY.resize('nw'),
    );
    expect(screen.getByTestId('studio-transform-rotate')).toHaveAttribute(
      'aria-label',
      STUDIO_TRANSFORM_COPY.rotate,
    );
  });

  it('refuses a locked element and says so', () => {
    renderStage(makeStageDocument([shapeElement('a', { transform: INSIDE, locked: true })]));
    select('a');

    expect(screen.queryByTestId('studio-transform-overlay')).toBeNull();
    expect(screen.getByTestId('studio-transform-locked')).toHaveTextContent(
      STUDIO_TRANSFORM_COPY.lockedElement,
    );
  });

  it('refuses a hidden element', () => {
    renderStage(makeStageDocument([shapeElement('a', { transform: INSIDE, visible: false })]));
    select('a');

    expect(screen.queryByTestId('studio-transform-overlay')).toBeNull();
  });
});

describe('move, resize and rotate write the fields IMP-D045 defines', () => {
  it('moves by the document delta and writes only x and y', () => {
    renderStage();
    select('a');

    // 100 screen px across a 1000 px box on a 1000 px canvas is 100 document px.
    drag('studio-transform-move', 40, 20);

    expect(persisted('a')).toEqual({ ...INSIDE, x: 190, y: 180 });
  });

  it('resizes by writing scale and never width or height', () => {
    renderStage();
    select('a');

    drag('studio-transform-handle-se', 20, 0);

    const after = persisted('a');
    expect(after?.width).toBe(INSIDE.width);
    expect(after?.height).toBe(INSIDE.height);
    expect(after?.x).toBe(INSIDE.x);
    expect(after?.scaleX).toBeGreaterThan(1);
  });

  it('rotates by writing only rotationDeg', () => {
    renderStage();
    select('a');

    drag('studio-transform-rotate', 30, 30);

    const after = persisted('a');
    expect(after?.rotationDeg).not.toBe(0);
    expect(after).toMatchObject({ x: 150, y: 160, width: 40, height: 20, scaleX: 1, scaleY: 1 });
  });

  it('quantizes what it persists', () => {
    renderStage();
    select('a');

    drag('studio-transform-move', 1 / 3, 0);

    const x = persisted('a')?.x ?? 0;
    expect(Number.isInteger(Math.round(x * 10_000))).toBe(true);
    expect(x * 10_000).toBeCloseTo(Math.round(x * 10_000), 9);
  });

  it('moves a grouped child in its parent frame', () => {
    const child = shapeElement('child', { transform: { ...INSIDE, x: 10, y: 10 } });
    const group = groupElement('g', ['child'], {
      transform: { x: 120, y: 130, width: 160, height: 160, rotationDeg: 90, scaleX: 1, scaleY: 1 },
    });
    renderStage(makeStageDocument([group, child]));
    select('child');

    drag('studio-transform-move', 20, 0);

    // A quarter turn in the parent: a document-space drag right is a drag *up*
    // in the child's own coordinates.
    expect(persisted('child')?.x).toBeCloseTo(10, 4);
    expect(persisted('child')?.y).toBeCloseTo(-10, 4);
  });
});

describe('an invalid candidate is refused, never repaired', () => {
  it('does not commit a move that leaves the embroidery area', () => {
    renderStage();
    select('a');
    const before = persisted('a');

    drag('studio-transform-move', -600, 0);

    // Not clamped to the edge, not translated back, not scaled down: unchanged.
    expect(persisted('a')).toEqual(before);
    expect(screen.getByTestId('studio-transform-refusal')).toHaveTextContent(
      STUDIO_TRANSFORM_COPY.outsideArea,
    );
  });

  it('does not commit a resize that leaves the embroidery area', () => {
    renderStage();
    select('a');
    const before = persisted('a');

    drag('studio-transform-handle-se', 900, 900);

    expect(persisted('a')).toEqual(before);
    expect(screen.getByTestId('studio-transform-refusal')).toBeInTheDocument();
  });

  it('does not commit a resize past the physical maximum', () => {
    // The element measures 42 px across its stroke envelope, and the fixture
    // Side is 4 px/mm — so it is already 10.5 mm wide. An 11 mm ceiling leaves
    // almost no room, and the refusal is a *physical* one rather than a
    // containment one: the element never approaches the safe-area edge.
    renderStage(undefined, makeScope(), { maxWidthMm: 11, maxHeightMm: 1_000 });
    select('a');
    const before = persisted('a');

    // Small on purpose: a large drag would leave the safe area first and the
    // refusal would be a containment one, which this case is not about.
    drag('studio-transform-handle-e', 4, 0);

    expect(persisted('a')).toEqual(before);
    expect(screen.getByTestId('studio-transform-refusal')).toHaveTextContent(
      STUDIO_TRANSFORM_COPY.tooLarge,
    );
  });

  it('keeps the last valid candidate when a gesture ends outside', () => {
    renderStage();
    select('a');

    sizeOverlay();
    const overlay = screen.getByTestId('studio-transform-overlay');
    fireEvent(screen.getByTestId('studio-transform-move'), pointerEvent('pointerdown'));
    fireEvent(overlay, pointerEvent('pointermove', { clientX: 20, clientY: 0 }));
    const valid = persisted('a');
    fireEvent(overlay, pointerEvent('pointermove', { clientX: -900, clientY: 0 }));
    fireEvent(overlay, pointerEvent('pointerup'));

    expect(persisted('a')).toEqual(valid);
  });
});

describe('the physical read-out is millimetres, not pixels', () => {
  it('states the size in text', () => {
    renderStage();
    select('a');

    expect(screen.getByTestId('studio-transform-size').textContent).toMatch(/mm/);
  });

  it('does not change when the viewport zooms', () => {
    renderStage();
    select('a');
    const before = screen.getByTestId('studio-transform-size').textContent;

    viewport(() => useStudioViewportStore.getState().zoomIn());
    viewport(() => useStudioViewportStore.getState().zoomIn());

    expect(screen.getByTestId('studio-transform-size').textContent).toBe(before);
  });

  it('does change when the element really does', () => {
    renderStage();
    select('a');
    const before = screen.getByTestId('studio-transform-size').textContent;

    drag('studio-transform-handle-se', 20, 20);

    expect(screen.getByTestId('studio-transform-size').textContent).not.toBe(before);
  });
});

describe('the viewport and the document stay separate', () => {
  it('moves by the same document delta at 400 % as at 100 %', () => {
    const first = renderStage();
    select('a');
    drag('studio-transform-move', 40, 0);
    const atFit = persisted('a')?.x;
    first.unmount();

    useStudioDocumentStore.getState().reset();
    useStudioViewportStore.getState().resetViewport();
    renderStage();
    select('a');
    for (let n = 0; n < 5; n += 1) viewport(() => useStudioViewportStore.getState().zoomIn());
    // Four times the screen distance, because the layer is drawn four times
    // larger — and therefore the same document move.
    drag('studio-transform-move', 160, 0);

    expect(persisted('a')?.x).toBeCloseTo(atFit ?? 0, 4);
  });

  it('keeps the document transform when the viewport is refitted', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', 40, 20);
    const moved = persisted('a');

    viewport(() => useStudioViewportStore.getState().zoomIn());
    viewport(() => useStudioViewportStore.getState().fitViewport());

    expect(persisted('a')).toEqual(moved);
  });

  it('counter-scales the handles so the hit target survives the zoom', () => {
    renderStage();
    select('a');
    const atFit = screen.getByTestId('studio-transform-handle-nw').style.transform;

    viewport(() => useStudioViewportStore.getState().zoomIn());

    expect(atFit).toContain('scale(1)');
    expect(screen.getByTestId('studio-transform-handle-nw').style.transform).toContain(
      'scale(0.8)',
    );
  });
});

describe('the capabilities S03 must not grow', () => {
  it('never transforms from a touch pointer', () => {
    renderStage();
    select('a');
    const before = persisted('a');

    drag('studio-transform-move', 60, 60, 'touch');

    expect(persisted('a')).toEqual(before);
  });

  it('issues no request for any transform', () => {
    renderStage();
    select('a');
    backgroundMock.mockClear();

    drag('studio-transform-move', 20, 10);
    drag('studio-transform-handle-se', 10, 10);
    drag('studio-transform-rotate', 15, 15);

    expect(backgroundMock).not.toHaveBeenCalled();
  });

  it('grows no undo, upload or save affordance', () => {
    const { container } = renderStage();
    select('a');

    const markup = container.innerHTML.toLowerCase();
    for (const absent of ['undo', 'redo', 'hoàn tác', 'đã lưu', 'tải lên', 'watermark']) {
      expect(markup).not.toContain(absent.toLowerCase());
    }
  });

  /*
   * The layer panel exists from `APP3-S04` and the transform chrome is not it.
   *
   * Scoped to the overlay rather than dropped: the thing this rule was written
   * to prevent is a capability appearing *on the transform chrome*, and that is
   * as forbidden as it ever was.
   */
  it('puts no layer control on the transform chrome', () => {
    renderStage();
    select('a');

    const overlay = screen.getByTestId('studio-transform-move').closest('div');
    expect(overlay?.querySelector('[data-testid="studio-layer-list"]')).toBeFalsy();
    expect(screen.getAllByTestId('studio-layer-list')).toHaveLength(1);
  });

  it('leaves the drawn element itself free of pointer handlers', () => {
    renderStage(makeStageDocument([shapeElement('a', { transform: INSIDE }), textElement('b')]));
    select('a');

    // The move surface is DOM chrome in the overlay, never the SVG node — which
    // is what keeps the `APP3-S02` scene byte-identical.
    expect(screen.getByTestId('studio-transform-move').tagName.toLowerCase()).toBe('div');
    expect(screen.getByTestId('studio-element-a').closest('svg')).not.toBeNull();
    expect(screen.getByTestId('studio-transform-move').closest('svg')).toBeNull();
  });
});

describe('the working document belongs to one Session', () => {
  it('starts from the snapshot', () => {
    const { snapshot } = renderStage();
    expect(useStudioDocumentStore.getState().document).toEqual(snapshot.document);
  });

  it('keeps local edits when the same Session re-renders', () => {
    const { rerender, snapshot } = renderStage();
    select('a');
    drag('studio-transform-move', 40, 0);
    const edited = persisted('a');

    rerender(
      <StudioStageScreen
        areaLimits={null}
        isResuming={false}
        onResume={jest.fn()}
        scope={makeScope()}
        snapshot={snapshot}
      />,
    );

    expect(persisted('a')).toEqual(edited);
  });

  it('discards them for a different Session', () => {
    const { rerender } = renderStage();
    select('a');
    drag('studio-transform-move', 40, 0);

    rerender(
      <StudioStageScreen
        areaLimits={null}
        isResuming={false}
        onResume={jest.fn()}
        scope={makeScope()}
        snapshot={makeStageSnapshot(makeStageDocument([shapeElement('a', { transform: INSIDE })]), {
          sessionId: 'a-different-session',
        })}
      />,
    );

    expect(persisted('a')).toEqual(INSIDE);
  });

  it('leaves nothing connected after unmount', () => {
    const { container, unmount } = renderStage();
    select('a');
    const overlay = screen.getByTestId('studio-transform-overlay');

    unmount();

    expect(overlay.isConnected).toBe(false);
    expect(container.querySelectorAll('*')).toHaveLength(0);
  });
});
