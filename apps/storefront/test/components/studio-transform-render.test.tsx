/**
 * What a transform frame re-renders (`APP3-S03-C1`).
 *
 * The delivered S03 was correct and too expensive on WebKit: a gesture replaces
 * the whole working document once per frame, so every element in the scene
 * re-rendered to redraw the one being dragged. The fix is structural reuse in
 * the adapter plus a memoized element component, and the only way to prove it
 * did what it claims is to count renders of an element nobody touched.
 *
 * ## The seam
 *
 * `StudioStageElement` labels itself on every render, so counting calls to
 * `elementLabel` counts renders. That is a real production call rather than a
 * counter added to the component: no telemetry ships, and the seam cannot drift
 * away from what it measures. The screen also labels the *selected* element once
 * for the status line, which is why the load-bearing assertions are about the
 * siblings.
 */
import { act } from 'react';

import { publicProductSideBackgroundGet } from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import type * as StageLabelModule from '../../src/features/design-studio/model/studio-stage-label';
import * as stageLabel from '../../src/features/design-studio/model/studio-stage-label';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import { useStudioViewportStore } from '../../src/features/design-studio/store/studio-viewport.store';
import {
  groupElement,
  makeScope,
  makeStageDocument,
  makeStageSnapshot,
  shapeElement,
} from '../support/studio-stage-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicDesignSessionCreate: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicProductPlacementGet: jest.fn(),
}));

/*
 * The counter lives inside the factory rather than in module scope: a
 * `jest.mock` factory is hoisted above every `const`, so a factory that closed
 * over one would read it in its temporal dead zone the moment the component
 * tree is imported.
 */
jest.mock('../../src/features/design-studio/model/studio-stage-label', () => {
  const actual = jest.requireActual<typeof StageLabelModule>(
    '../../src/features/design-studio/model/studio-stage-label',
  );
  const calls: string[] = [];
  return {
    ...actual,
    __calls: calls,
    elementLabel: (element: Parameters<typeof actual.elementLabel>[0]) => {
      calls.push(element.id);
      return actual.elementLabel(element);
    },
  };
});

const labelCalls = (stageLabel as unknown as { __calls: string[] }).__calls;
const rendersOf = (id: string) => labelCalls.filter((called) => called === id).length;

const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;

const BOX_WIDTH_PX = 1000;
const BOX_HEIGHT_PX = 800;
/** All inside the fixture safe area (100,120 → 400,320). */
const at = (x: number) => ({
  x,
  y: 160,
  width: 30,
  height: 20,
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
});

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/background');
  URL.revokeObjectURL = jest.fn();
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn(() => true);
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
  labelCalls.length = 0;
});

function renderStage(document = flatScene) {
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

const flatScene = makeStageDocument([
  shapeElement('a', { transform: at(150) }),
  shapeElement('b', { transform: at(220) }),
  shapeElement('c', { transform: at(290) }),
]);

const groupedScene = makeStageDocument([
  groupElement('g', ['child'], { transform: at(150) }),
  shapeElement('child', { transform: at(150) }),
  shapeElement('loner', { transform: at(290) }),
]);

function select(id: string) {
  act(() => {
    useStudioInteractionStore.setState({ selectedElementId: id });
  });
}

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

/** One gesture frame on the move surface, the production path end to end. */
function dragSelected(deltaXPx: number, deltaYPx: number, testId = 'studio-transform-move') {
  const overlay = screen.getByTestId('studio-transform-overlay');
  Object.defineProperty(overlay, 'clientWidth', { value: BOX_WIDTH_PX, configurable: true });
  Object.defineProperty(overlay, 'clientHeight', { value: BOX_HEIGHT_PX, configurable: true });
  fireEvent(screen.getByTestId(testId), pointerEvent('pointerdown'));
  fireEvent(overlay, pointerEvent('pointermove', { clientX: deltaXPx, clientY: deltaYPx }));
  fireEvent(overlay, pointerEvent('pointerup'));
}

const persisted = (id: string) =>
  useStudioDocumentStore.getState().document?.elements.find((element) => element.id === id)
    ?.transform;

describe('a transform frame renders the element it changed and nothing else', () => {
  it('leaves untouched siblings unrendered while the moved one updates', () => {
    renderStage();
    select('a');
    labelCalls.length = 0;

    dragSelected(20, 0);

    expect(persisted('a')?.x).toBeGreaterThan(150);
    expect(rendersOf('a')).toBeGreaterThan(0);
    expect(rendersOf('b')).toBe(0);
    expect(rendersOf('c')).toBe(0);
  });

  it('leaves untouched siblings unrendered while the resized one updates', () => {
    renderStage();
    select('a');
    labelCalls.length = 0;

    dragSelected(20, 20, 'studio-transform-handle-se');

    expect(persisted('a')?.scaleX).not.toBe(1);
    expect(rendersOf('a')).toBeGreaterThan(0);
    expect(rendersOf('b')).toBe(0);
    expect(rendersOf('c')).toBe(0);
  });

  it('leaves untouched siblings unrendered while the rotated one updates', () => {
    renderStage();
    select('a');
    labelCalls.length = 0;

    dragSelected(0, 30, 'studio-transform-rotate');

    expect(persisted('a')?.rotationDeg).not.toBe(0);
    expect(rendersOf('a')).toBeGreaterThan(0);
    expect(rendersOf('b')).toBe(0);
    expect(rendersOf('c')).toBe(0);
  });

  it('renders a descendant of a moved group, and still not the unrelated element', () => {
    /*
     * Driven through the working document rather than a gesture, because a
     * group paints nothing and therefore cannot be selected — `APP3-S04` owns
     * group selection. What matters here is the render path: a change that
     * leaves a child's own record untouched and moves where it lands must
     * still re-render that child.
     */
    renderStage(groupedScene);
    labelCalls.length = 0;

    act(() => {
      useStudioDocumentStore.getState().commit(
        {
          ...groupedScene,
          elements: groupedScene.elements.map((element) =>
            element.id === 'g'
              ? { ...element, transform: { ...element.transform, x: element.transform.x + 20 } }
              : element,
          ),
        },
        // Every commit names itself to `APP3-S08`. This one is a move.
        { kind: 'move', label: null },
      );
    });

    expect(persisted('child')?.x).toBe(150);
    expect(rendersOf('child')).toBeGreaterThan(0);
    expect(rendersOf('loner')).toBe(0);
  });

  it('does not render the scene at all when a candidate is refused', () => {
    renderStage();
    select('a');
    labelCalls.length = 0;

    // Far outside the safe area: `IMP-D045` PO-09 blocks, so nothing commits.
    dragSelected(4000, 0);

    expect(persisted('a')?.x).toBe(150);
    expect(rendersOf('b')).toBe(0);
    expect(rendersOf('c')).toBe(0);
    expect(screen.getByTestId('studio-transform-refusal')).toBeInTheDocument();
  });

  it('renders every element again when the selection moves to another one', () => {
    renderStage();
    select('a');
    labelCalls.length = 0;

    // Selection is a per-element prop, so the two elements whose selected state
    // changed must re-render — and the third still must not.
    select('b');

    expect(rendersOf('a')).toBeGreaterThan(0);
    expect(rendersOf('b')).toBeGreaterThan(0);
    expect(rendersOf('c')).toBe(0);
  });
});
