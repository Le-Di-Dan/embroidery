/**
 * The production S/M/L scene proof (`APP3-S02` §41).
 *
 * `APP0-R01`'s frozen benchmark measures the *architecture* on a spike harness.
 * This measures the thing that actually ships, and it measures the failure the
 * benchmark cannot see: a React tree that renders the right picture out of far
 * more nodes than the document has elements.
 *
 * Wrapper explosion, a scene rendered twice, a hidden second copy behind the
 * visible one and a detached subtree left behind after unmount all look
 * identical on screen. Each one shows up here as an arithmetic disagreement
 * between the document and the DOM, which is why the assertions are exact
 * counts rather than upper bounds — a ceiling would absorb exactly the drift it
 * is supposed to catch.
 *
 * There is no new performance score here. Node counts are structure, and
 * `APP0-R01`'s budgets remain the only performance authority.
 */
import { renderWithProviders, screen } from '@embroidery/frontend-testing';
import type { DesignElement } from '@embroidery/design-document';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { buildRenderableScene } from '../../src/features/design-studio/renderer/studio-scene';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import {
  makeScope,
  makeStageDocument,
  makeStageSnapshot,
  shapeElement,
} from '../support/studio-stage-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(() => Promise.reject(new Error('no background'))),
}));

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/scale');
  URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
  useStudioInteractionStore.setState({ selectedElementId: null });
  useStudioDocumentStore.getState().reset();
});

/**
 * A deterministic scene of `count` stroked rectangles laid out on a grid.
 *
 * Rectangles only, so the DOM arithmetic below stays exact: every element is
 * one `<g>` wrapper plus one `<rect>`. An image would add a placeholder frame
 * and a label, and a document mixing kinds would turn a precise count into an
 * estimate.
 *
 * `100` is `APP3-P01`'s own `maxElements`, so L is the largest document the
 * schema permits rather than an arbitrary large number.
 */
function scene(count: number): readonly DesignElement[] {
  return Array.from({ length: count }, (_unused, index) =>
    shapeElement(`el-${String(index)}`, {
      transform: {
        x: (index % 10) * 90,
        y: Math.floor(index / 10) * 70,
        width: 80,
        height: 60,
        rotationDeg: index % 4 === 0 ? 15 : 0,
        scaleX: 1,
        scaleY: 1,
      },
    }),
  );
}

const SIZES = [
  { label: 'S', count: 10 },
  { label: 'M', count: 50 },
  { label: 'L', count: 100 },
] as const;

/** `<g>` + `<rect>` per element, and nothing else per element. */
const NODES_PER_RECTANGLE = 2;

function renderScene(count: number) {
  const document = makeStageDocument(scene(count));
  return {
    document,
    ...renderWithProviders(
      <StudioStageScreen
        areaLimits={null}
        isResuming={false}
        onResume={jest.fn()}
        scope={makeScope()}
        snapshot={makeStageSnapshot(document)}
      />,
    ),
  };
}

describe.each(SIZES)('a $label scene of $count elements', ({ count }) => {
  it('renders exactly one stage and one node group per element', () => {
    const { container, unmount } = renderScene(count);

    // One canvas: a scene rendered twice would show as two, and a hidden second
    // copy is still a second copy.
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-stage-canvas')).toHaveLength(1);
    expect(container.querySelectorAll('[data-element-type]')).toHaveLength(count);

    unmount();
  });

  it('builds the whole scene without dropping or duplicating an element', () => {
    const { document, unmount } = renderScene(count);

    const result = buildRenderableScene(document);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scene.elements).toHaveLength(count);
      expect(new Set(result.scene.elements.map((element) => element.id)).size).toBe(count);
    }

    unmount();
  });

  it('spends no DOM node on wrapping beyond the group and the shape', () => {
    const { container, unmount } = renderScene(count);

    const canvas = container.querySelector('svg');
    // Every descendant of the canvas, minus the area rectangle the scope draws.
    const drawn = canvas === null ? 0 : canvas.querySelectorAll('*').length;
    const areaRect = container.querySelectorAll('[data-testid="studio-stage-area"]').length;

    expect(drawn - areaRect).toBe(count * NODES_PER_RECTANGLE);

    unmount();
  });

  it('leaves nothing behind when the stage unmounts', () => {
    const { container, unmount } = renderScene(count);
    const drawn = [...container.querySelectorAll('[data-element-type]')];
    expect(drawn).toHaveLength(count);

    unmount();

    expect(container.querySelector('svg')).toBeNull();
    expect(container.innerHTML).toBe('');
    // Every node that was on the stage is detached rather than still parented
    // into a tree React no longer renders.
    for (const node of drawn) expect(node.isConnected).toBe(false);
  });
});
