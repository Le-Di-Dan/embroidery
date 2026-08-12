/**
 * The Studio viewport — zoom, pan and safe area (`APP3-S07`).
 *
 * The failure these exist to catch is the one that looks right on screen: a
 * zoom that quietly multiplies every element's transform, a pan that moves the
 * artwork instead of the camera, a safe-area toggle that recomputes the
 * rectangle instead of withholding it, a selection outline that drifts out of
 * register at 3×, a viewport carried into the next Session, or a background
 * refetched because the view changed. Every one of those still draws something
 * plausible.
 *
 * So the assertions are on the shape of what happened, not on how it looks:
 * the element `<g>` transforms are compared **before and after** each viewport
 * action, the document object is compared by identity, and the network is
 * counted rather than trusted.
 */
import { publicProductSideBackgroundGet } from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { STUDIO_VIEWPORT_COPY } from '../../src/features/design-studio/model/studio-viewport-copy';
import {
  FIT_STEP,
  ZOOM_STEPS,
  zoomAt,
} from '../../src/features/design-studio/model/studio-viewport';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import { useStudioViewportStore } from '../../src/features/design-studio/store/studio-viewport.store';
import {
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

const VIEWPORT_WIDTH_PX = 1000;
const VIEWPORT_HEIGHT_PX = 800;

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/background');
  URL.revokeObjectURL = jest.fn();
  // jsdom implements neither half of the pointer-capture API.
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn(() => true);
});

beforeEach(() => {
  backgroundMock.mockReset();
  backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
  useStudioInteractionStore.setState({ selectedElementId: null });
  useStudioDocumentStore.getState().reset();
  // Both stores outlive a mount by design, so every case starts fitted.
  useStudioViewportStore.getState().resetViewport();
});

function renderStage(
  document = makeStageDocument([shapeElement('a'), textElement('b')]),
  scope = makeScope(),
) {
  const snapshot = makeStageSnapshot(document);
  const result = renderWithProviders(
    <StudioStageScreen
      areaLimits={null}
      isResuming={false}
      onResume={jest.fn()}
      scope={scope}
      snapshot={snapshot}
    />,
  );
  // jsdom lays nothing out, so the element a pan is measured against reports
  // zero. These are the sizes the gesture divides by; nothing stores them.
  const node = screen.getByTestId('studio-stage-viewport');
  Object.defineProperty(node, 'clientWidth', { value: VIEWPORT_WIDTH_PX, configurable: true });
  Object.defineProperty(node, 'clientHeight', { value: VIEWPORT_HEIGHT_PX, configurable: true });
  return { ...result, snapshot };
}

const layer = () => screen.getByTestId('studio-stage-viewport-layer');
const transform = () => layer().style.transform;

/** Every drawn element's own transform, which a viewport must never touch. */
function elementTransforms(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-element-type]')].map(
    (node) => node.getAttribute('transform') ?? '',
  );
}

/**
 * A pointer event carrying the fields the gesture actually reads.
 *
 * jsdom implements no `PointerEvent`, so Testing Library falls back to a plain
 * `Event` and silently drops `button` and `pointerType` from the init. A pan
 * driven that way never starts — the production guard rejects a non-primary
 * button — and every assertion about panning would then pass while proving
 * nothing at all. The fields are assigned onto a real bubbling event instead.
 */
function pointerEvent(type: string, init: Record<string, unknown>) {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: 0,
    clientY: 0,
    ...init,
  });
}

function pan(deltaXPx: number, deltaYPx: number, pointerType = 'mouse') {
  const node = screen.getByTestId('studio-stage-viewport');
  fireEvent(node, pointerEvent('pointerdown', { pointerType }));
  fireEvent(
    node,
    pointerEvent('pointermove', { pointerType, clientX: deltaXPx, clientY: deltaYPx }),
  );
  fireEvent(node, pointerEvent('pointerup', { pointerType }));
  // The trailing click a browser synthesises at the end of a drag. Omitting it
  // would leave the harness testing a gesture no browser produces.
  fireEvent.click(node);
}

describe('the controls the approved design draws', () => {
  it('offers zoom out, a zoom value, zoom in, fit and the safe-area toggle', () => {
    renderStage();

    expect(screen.getByTestId('studio-zoom-out')).toBeInTheDocument();
    expect(screen.getByTestId('studio-zoom-in')).toBeInTheDocument();
    expect(screen.getByTestId('studio-zoom-fit')).toBeInTheDocument();
    expect(screen.getByTestId('studio-safe-area-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('studio-zoom-value')).toHaveTextContent(
      STUDIO_VIEWPORT_COPY.zoomValue(100),
    );
  });

  it('offers no control the design does not contain', () => {
    const { container } = renderStage();

    expect(container.querySelector('input[type="range"]')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
  });

  it('states the zoom in text rather than only by how large the artwork looks', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));

    expect(screen.getByTestId('studio-zoom-value')).toHaveTextContent(
      STUDIO_VIEWPORT_COPY.zoomValue(Math.round(zoomAt(1) * 100)),
    );
  });

  it('exposes both ends of the range as disabled rather than as a dead button', () => {
    renderStage();
    expect(screen.getByTestId('studio-zoom-out')).toBeDisabled();
    expect(screen.getByTestId('studio-zoom-fit')).toBeDisabled();

    for (let n = 0; n < ZOOM_STEPS.length; n += 1) {
      fireEvent.click(screen.getByTestId('studio-zoom-in'));
    }

    expect(screen.getByTestId('studio-zoom-in')).toBeDisabled();
    expect(screen.getByTestId('studio-zoom-out')).toBeEnabled();
  });

  it('gives every control a real accessible name', () => {
    renderStage();

    for (const testId of ['studio-zoom-out', 'studio-zoom-in', 'studio-zoom-fit']) {
      expect(screen.getByTestId(testId).textContent?.trim()).not.toBe('');
    }
    expect(
      screen.getByRole('group', { name: STUDIO_VIEWPORT_COPY.toolbarLabel }),
    ).toBeInTheDocument();
  });
});

describe('zoom changes the view and nothing else', () => {
  it('scales one wrapper outside the SVG', () => {
    renderStage();
    expect(transform()).toContain('scale(1)');

    fireEvent.click(screen.getByTestId('studio-zoom-in'));

    expect(transform()).toContain(`scale(${String(zoomAt(1))})`);
  });

  it('leaves the viewBox at the document placement canvas', () => {
    renderStage();
    const before = screen.getByTestId('studio-stage-canvas').getAttribute('viewBox');

    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    fireEvent.click(screen.getByTestId('studio-zoom-in'));

    expect(screen.getByTestId('studio-stage-canvas').getAttribute('viewBox')).toBe(before);
  });

  it('leaves every element transform byte-identical', () => {
    const { container } = renderStage();
    const before = elementTransforms(container);

    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    pan(-120, -80);

    expect(elementTransforms(container)).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });

  it('leaves the Session document object untouched, by identity', () => {
    const { snapshot } = renderStage();
    const document = snapshot.document;
    const serialized = JSON.stringify(document);

    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    fireEvent.click(screen.getByTestId('studio-safe-area-toggle'));
    pan(-50, -50);
    fireEvent.click(screen.getByTestId('studio-zoom-fit'));

    expect(snapshot.document).toBe(document);
    expect(JSON.stringify(snapshot.document)).toBe(serialized);
    expect(snapshot.revision).toBe(makeStageSnapshot(makeStageDocument([])).revision);
  });

  it('renders exactly one scene at every zoom', () => {
    const { container } = renderStage();

    for (let n = 0; n < 3; n += 1) fireEvent.click(screen.getByTestId('studio-zoom-in'));

    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
    expect(container.querySelectorAll('[data-element-type="shape"]')).toHaveLength(1);
  });
});

describe('fit is the one recovery, and it recovers only the view', () => {
  it('returns to the canonical fitted viewport', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    pan(-200, -200);
    expect(transform()).not.toBe('translate(0.0000%, 0.0000%) scale(1)');

    fireEvent.click(screen.getByTestId('studio-zoom-fit'));

    expect(transform()).toBe('translate(0.0000%, 0.0000%) scale(1)');
    expect(useStudioViewportStore.getState().zoomStep).toBe(FIT_STEP);
  });

  it('keeps the current selection', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-element-a'));
    fireEvent.click(screen.getByTestId('studio-zoom-in'));

    fireEvent.click(screen.getByTestId('studio-zoom-fit'));

    expect(useStudioInteractionStore.getState().selectedElementId).toBe('a');
  });
});

describe('panning moves the view, never an element', () => {
  it('translates the wrapper by the drag as a fraction of it', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));

    pan(-100, -80);

    // -100 / 1000 and -80 / 800 — a plain division, with no scale factor.
    expect(transform()).toContain('translate(-10.0000%, -10.0000%)');
  });

  it('cannot be dragged out of its own frame', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));

    for (let n = 0; n < 20; n += 1) pan(-1000, -1000);

    const limit = ((zoomAt(1) - 1) * 100).toFixed(4);
    expect(transform()).toContain(`translate(-${limit}%, -${limit}%)`);
  });

  it('does nothing at the fitted step, where there is nowhere to pan', () => {
    renderStage();

    pan(-300, -300);

    expect(transform()).toBe('translate(0.0000%, 0.0000%) scale(1)');
    expect(screen.queryByTestId('studio-stage-pan-hint')).toBeNull();
  });

  it('does not select or deselect an element', () => {
    const { container } = renderStage();
    fireEvent.click(screen.getByTestId('studio-element-a'));
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    const before = elementTransforms(container);

    pan(-60, -60);

    expect(useStudioInteractionStore.getState().selectedElementId).toBe('a');
    expect(elementTransforms(container)).toEqual(before);
  });

  it('never starts from a touch pointer, which APP3-S11 owns', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));

    pan(-200, -200, 'touch');

    expect(transform()).toContain('translate(0.0000%, 0.0000%)');
    // The identical gesture from a mouse does move the view, so the assertion
    // above is about the pointer type and not about the gesture being inert.
    pan(-200, -200, 'mouse');
    expect(transform()).not.toContain('translate(0.0000%, 0.0000%)');
  });

  it('ignores a non-primary button, so a context menu is not a pan', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    const node = screen.getByTestId('studio-stage-viewport');

    fireEvent(node, pointerEvent('pointerdown', { button: 2 }));
    fireEvent(node, pointerEvent('pointermove', { clientX: -200, clientY: -200 }));
    fireEvent(node, pointerEvent('pointerup', {}));

    expect(transform()).toContain('translate(0.0000%, 0.0000%)');
  });

  it('does not pan when the gesture starts on a drawn element', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    const element = screen.getByTestId('studio-element-a');

    // Bubbles to the viewport, but its target is artwork — and an element is
    // never a pan handle, because `APP3-S03` owns dragging one.
    fireEvent(element, pointerEvent('pointerdown', {}));
    fireEvent(
      screen.getByTestId('studio-stage-viewport'),
      pointerEvent('pointermove', { clientX: -200, clientY: -200 }),
    );
    fireEvent(screen.getByTestId('studio-stage-viewport'), pointerEvent('pointerup', {}));

    expect(transform()).toContain('translate(0.0000%, 0.0000%)');
  });

  it('does not swallow the selection click after the drag, even with no trailing click', () => {
    // A browser does not always deliver the click that ends a captured drag. If
    // the suppression outlived the gesture, the customer's next click would be
    // eaten — an element that refuses to be selected exactly once.
    renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    const node = screen.getByTestId('studio-stage-viewport');
    fireEvent(node, pointerEvent('pointerdown', {}));
    fireEvent(node, pointerEvent('pointermove', { clientX: -120, clientY: -120 }));
    fireEvent(node, pointerEvent('pointerup', {}));

    // The next click, dispatched the way a browser does it: a `pointerdown` on
    // the element first, which bubbles to the viewport and is what clears the
    // stale suppression.
    const element = screen.getByTestId('studio-element-b');
    fireEvent(element, pointerEvent('pointerdown', {}));
    fireEvent.click(element);

    expect(useStudioInteractionStore.getState().selectedElementId).toBe('b');
  });

  it('does swallow the trailing click of the drag itself', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-element-a'));
    fireEvent.click(screen.getByTestId('studio-zoom-in'));

    pan(-120, -120);

    expect(useStudioInteractionStore.getState().selectedElementId).toBe('a');
  });

  it('leaves a plain click on the empty stage clearing the selection', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-element-a'));

    fireEvent.click(screen.getByTestId('studio-stage-canvas'));

    expect(useStudioInteractionStore.getState().selectedElementId).toBeNull();
  });
});

describe('selection stays correct under the viewport transform', () => {
  it('selects the element that was clicked, at a non-fitted zoom', () => {
    renderStage();
    for (let n = 0; n < 3; n += 1) fireEvent.click(screen.getByTestId('studio-zoom-in'));
    pan(-50, -50);

    fireEvent.click(screen.getByTestId('studio-element-b'));

    expect(useStudioInteractionStore.getState().selectedElementId).toBe('b');
  });

  it('draws the outline from the document bounds, unchanged by the zoom', () => {
    const { container } = renderStage();
    fireEvent.click(screen.getByTestId('studio-element-a'));
    const outline = container.querySelector('.studio-stage__selection');
    const before = outline?.getAttribute('x');

    fireEvent.click(screen.getByTestId('studio-zoom-in'));

    expect(container.querySelector('.studio-stage__selection')?.getAttribute('x')).toBe(before);
    expect(before).not.toBeNull();
  });

  it('does not change the selected id when the viewport changes', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-element-a'));

    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    fireEvent.click(screen.getByTestId('studio-zoom-out'));
    fireEvent.click(screen.getByTestId('studio-safe-area-toggle'));

    expect(useStudioInteractionStore.getState().selectedElementId).toBe('a');
  });
});

describe('the safe area toggles its visibility and nothing else', () => {
  it('hides and restores the same canonical rectangle', () => {
    renderStage();
    const before = ['x', 'y', 'width', 'height'].map((name) =>
      screen.getByTestId('studio-stage-area').getAttribute(name),
    );

    fireEvent.click(screen.getByTestId('studio-safe-area-toggle'));
    expect(screen.queryByTestId('studio-stage-area')).toBeNull();

    fireEvent.click(screen.getByTestId('studio-safe-area-toggle'));

    expect(
      ['x', 'y', 'width', 'height'].map((name) =>
        screen.getByTestId('studio-stage-area').getAttribute(name),
      ),
    ).toEqual(before);
  });

  it('carries its state on the control, not only in the picture', () => {
    renderStage();
    const toggle = screen.getByTestId('studio-safe-area-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggle);

    expect(screen.getByTestId('studio-safe-area-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  it('draws exactly one boundary, never a second derived one', () => {
    const { container } = renderStage();

    expect(container.querySelectorAll('.studio-stage__area')).toHaveLength(1);
  });

  it('keeps the boundary inside the transformed scene', () => {
    const { container } = renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));

    // Inside the one `<svg>`, therefore inside the one transformed layer: it
    // cannot drift from the artwork, because it is the same layer.
    expect(container.querySelector('svg')?.contains(screen.getByTestId('studio-stage-area'))).toBe(
      true,
    );
  });
});

describe('the viewport touches no network and no later capability', () => {
  it('issues no request for any viewport action', async () => {
    backgroundMock.mockReset();
    backgroundMock.mockResolvedValue(new Blob(['x']));
    renderStage();
    await waitFor(() => {
      expect(backgroundMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    pan(-100, -100);
    fireEvent.click(screen.getByTestId('studio-zoom-fit'));
    fireEvent.click(screen.getByTestId('studio-safe-area-toggle'));

    // The background query key contains no viewport state, so the view moving
    // cannot be a reason to fetch the Side's bytes a second time.
    expect(backgroundMock).toHaveBeenCalledTimes(1);
  });

  it('grows no transform handle, history or save affordance', () => {
    const { container } = renderStage();
    for (let n = 0; n < 2; n += 1) fireEvent.click(screen.getByTestId('studio-zoom-in'));

    const markup = container.innerHTML;
    for (const absent of ['handle', 'undo', 'redo', 'Hoàn tác', 'Đã lưu']) {
      expect(markup.toLowerCase()).not.toContain(absent.toLowerCase());
    }
  });

  /*
   * The watermark exists from `APP3-S09`, and the viewport is not it.
   *
   * The rule was "no watermark anywhere" while S09 had not opened. Now the test
   * asserts the thing it was really protecting: there is exactly one watermark,
   * the viewport does not build it, and — the property this suite is uniquely
   * placed to check — it is a **sibling** of the transformed layer, so zoom and
   * pan cannot carry it off the visible preview.
   */
  it('keeps the one watermark outside its transformed layer', () => {
    renderStage();
    for (let n = 0; n < 2; n += 1) fireEvent.click(screen.getByTestId('studio-zoom-in'));

    const marks = screen.getAllByTestId('studio-watermark');
    expect(marks).toHaveLength(1);
    expect(screen.getByTestId('studio-stage-viewport-layer').contains(marks[0] ?? null)).toBe(
      false,
    );
    expect(screen.getByTestId('studio-stage-viewport').contains(marks[0] ?? null)).toBe(true);
  });
});

describe('the viewport belongs to one Session', () => {
  it('opens fitted for a Session that has just been bootstrapped', () => {
    renderStage();

    expect(transform()).toBe('translate(0.0000%, 0.0000%) scale(1)');
    expect(useStudioViewportStore.getState().safeAreaVisible).toBe(true);
  });

  it('does not carry a zoom and pan into a different Session', () => {
    const { rerender } = renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    fireEvent.click(screen.getByTestId('studio-safe-area-toggle'));
    pan(-100, -100);

    rerender(
      <StudioStageScreen
        areaLimits={null}
        isResuming={false}
        onResume={jest.fn()}
        scope={makeScope()}
        snapshot={makeStageSnapshot(makeStageDocument([shapeElement('a')]), {
          sessionId: 'a-different-session',
        })}
      />,
    );

    expect(transform()).toBe('translate(0.0000%, 0.0000%) scale(1)');
    expect(useStudioViewportStore.getState().safeAreaVisible).toBe(true);
  });

  it('keeps the viewport across a re-render of the same Session', () => {
    const { rerender, snapshot } = renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    const zoomed = transform();

    rerender(
      <StudioStageScreen
        areaLimits={null}
        isResuming={false}
        onResume={jest.fn()}
        scope={makeScope()}
        snapshot={snapshot}
      />,
    );

    expect(transform()).toBe(zoomed);
  });

  it('leaves nothing of the scene connected after unmount', () => {
    const { container, unmount } = renderStage();
    fireEvent.click(screen.getByTestId('studio-zoom-in'));
    const svg = container.querySelector('svg');

    unmount();

    expect(svg?.isConnected).toBe(false);
    expect(container.querySelectorAll('*')).toHaveLength(0);
  });
});
