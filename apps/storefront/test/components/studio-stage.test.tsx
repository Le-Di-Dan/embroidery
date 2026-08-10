/**
 * The Studio stage and its selection foundation (`APP3-S02`).
 *
 * These cover what a drawing surface gets wrong while still looking right: a
 * renderer that re-derives its own geometry, a paint order that quietly
 * reverses, a selection outline measured from the DOM instead of from the
 * document, a stale selection left pointing at an element that is gone, and a
 * stage that grows an editing capability nobody shipped.
 *
 * They also assert the negative space. S02 draws and selects; it does not move,
 * reorder, upload, zoom, watermark or save, and each of those has an owner that
 * is not this checkpoint.
 */
import { publicProductSideBackgroundGet } from '@embroidery/api-client';
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import { localMatrix } from '@embroidery/design-engine';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { STUDIO_STAGE_COPY } from '../../src/features/design-studio/model/studio-stage-copy';
import { toSvgMatrix } from '../../src/features/design-studio/renderer/studio-svg-matrix';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import {
  freehandElement,
  groupElement,
  imageElement,
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

beforeAll(() => {
  // jsdom implements neither half of the object-URL API.
  URL.createObjectURL = jest.fn(() => 'blob:studio/background');
  URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
  backgroundMock.mockReset();
  backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
  // The interaction store outlives a mount by design, so each test starts from
  // a known selection rather than from whatever the previous one left.
  useStudioInteractionStore.setState({ selectedElementId: null });
});

function renderStage(document = makeStageDocument([shapeElement('a')]), scope = makeScope()) {
  const snapshot = makeStageSnapshot(document);
  return renderWithProviders(
    <StudioStageScreen isResuming={false} onResume={jest.fn()} scope={scope} snapshot={snapshot} />,
  );
}

function canvas(): SVGSVGElement {
  const node = screen.getByTestId('studio-stage-canvas');
  return node as unknown as SVGSVGElement;
}

describe('opening the stage from a Session snapshot', () => {
  it('draws the Session document as native SVG', () => {
    renderStage(makeStageDocument([shapeElement('a'), textElement('b')]));

    expect(canvas().tagName.toLowerCase()).toBe('svg');
    expect(screen.getByTestId('studio-element-a')).toBeInTheDocument();
    expect(screen.getByTestId('studio-element-b')).toBeInTheDocument();
  });

  it('renders no canvas element anywhere on the stage', () => {
    const { container } = renderStage(makeStageDocument([shapeElement('a')]));

    expect(container.querySelector('canvas')).toBeNull();
  });

  it('takes the document placement canvas as the viewBox, unscaled', () => {
    renderStage();

    expect(canvas().getAttribute('viewBox')).toBe('0 0 1000 800');
  });

  it('shows the approved empty state for an empty document', () => {
    renderStage(makeStageDocument([]));

    expect(screen.getByTestId('studio-stage-empty')).toHaveTextContent(STUDIO_STAGE_COPY.empty);
    // The stage itself is still there: an empty design is a design, not a failure.
    expect(canvas()).toBeInTheDocument();
  });

  it('does not re-fetch or resume the Session merely to draw it', () => {
    renderStage();

    const client = jest.requireMock<Record<string, jest.Mock>>('@embroidery/api-client');
    expect(client.publicDesignSessionResume).not.toHaveBeenCalled();
    expect(client.publicDesignSessionCreate).not.toHaveBeenCalled();
  });
});

describe('paint order and geometry', () => {
  it('paints in document array order, bottom first', () => {
    renderStage(
      makeStageDocument([shapeElement('bottom'), shapeElement('middle'), shapeElement('top')]),
    );

    const painted = [...canvas().querySelectorAll('[data-element-type]')].map((node) =>
      node.getAttribute('data-testid'),
    );
    expect(painted).toEqual([
      'studio-element-bottom',
      'studio-element-middle',
      'studio-element-top',
    ]);
  });

  it('places a pre-transformed element with the engine matrix', () => {
    const element = shapeElement('rotated', {
      transform: { x: 220, y: 90, width: 80, height: 60, rotationDeg: 30, scaleX: 2, scaleY: 1.5 },
    });
    renderStage(makeStageDocument([element]));

    expect(screen.getByTestId('studio-element-rotated')).toHaveAttribute(
      'transform',
      toSvgMatrix(localMatrix(element.transform)),
    );
  });

  it('places a grouped child by the composed matrix, not by nesting it in the group', () => {
    const child = shapeElement('child', {
      transform: { x: 10, y: 10, width: 40, height: 40, rotationDeg: 0, scaleX: 1, scaleY: 1 },
    });
    const group = groupElement('group', ['child'], {
      transform: { x: 300, y: 200, width: 200, height: 200, rotationDeg: 45, scaleX: 1, scaleY: 1 },
    });
    renderStage(makeStageDocument([child, group]));

    // The group itself paints nothing, so it is not on the stage at all.
    expect(screen.queryByTestId('studio-element-group')).not.toBeInTheDocument();
    const drawn = screen.getByTestId('studio-element-child').getAttribute('transform');
    expect(drawn).not.toBe(toSvgMatrix(localMatrix(child.transform)));
    expect(drawn).toMatch(/^matrix\(/);
  });

  it('does not paint a hidden element', () => {
    renderStage(
      makeStageDocument([shapeElement('shown'), shapeElement('hidden', { visible: false })]),
    );

    expect(screen.getByTestId('studio-element-shown')).toBeInTheDocument();
    expect(screen.queryByTestId('studio-element-hidden')).not.toBeInTheDocument();
  });

  it('draws every kind the document may hold', () => {
    renderStage(
      makeStageDocument([
        textElement('t'),
        shapeElement('rect'),
        shapeElement('oval', { shape: 'ellipse' }),
        shapeElement('diag', { shape: 'line' }),
        freehandElement('draw'),
        imageElement('img'),
      ]),
    );

    for (const id of ['t', 'rect', 'oval', 'diag', 'draw', 'img']) {
      expect(screen.getByTestId(`studio-element-${id}`)).toBeInTheDocument();
    }
  });
});

describe('a document the stage cannot vouch for', () => {
  it('shows a bounded failure and draws nothing at all', () => {
    renderStage(makeStageDocument([textElement('t', { fontId: 'not-controlled' })]));

    expect(screen.getByTestId('studio-stage-unavailable')).toHaveAttribute(
      'data-failure',
      'uncontrolled-font',
    );
    expect(screen.queryByTestId('studio-stage-canvas')).not.toBeInTheDocument();
  });

  it('never puts the document or an internal identifier on screen', () => {
    const { container } = renderStage(
      makeStageDocument([textElement('t', { fontId: 'not-controlled' })]),
    );

    expect(container.textContent).not.toContain('not-controlled');
    expect(container.textContent).not.toContain('schemaVersion');
    expect(container.textContent).not.toContain('$.elements');
  });
});

describe('single-element selection', () => {
  it('selects the element that was clicked', async () => {
    const user = createUser();
    renderStage(makeStageDocument([shapeElement('a'), shapeElement('b')]));

    await user.click(screen.getByTestId('studio-element-a'));

    expect(screen.getByTestId('studio-element-a')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('studio-stage-selection')).toBeInTheDocument();
  });

  it('replaces the selection rather than adding to it', async () => {
    const user = createUser();
    renderStage(makeStageDocument([shapeElement('a'), shapeElement('b')]));

    await user.click(screen.getByTestId('studio-element-a'));
    await user.click(screen.getByTestId('studio-element-b'));

    expect(screen.getByTestId('studio-element-a')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('studio-element-b')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('studio-stage-selection')).toHaveLength(1);
  });

  it('clears the selection on a click that hit no element', async () => {
    const user = createUser();
    renderStage(makeStageDocument([shapeElement('a')]));

    await user.click(screen.getByTestId('studio-element-a'));
    await user.click(canvas());

    expect(screen.queryByTestId('studio-stage-selection')).not.toBeInTheDocument();
    expect(screen.getByText(STUDIO_STAGE_COPY.selectionNone)).toBeInTheDocument();
  });

  it('never selects a hidden element, because it is not on the stage', () => {
    renderStage(makeStageDocument([shapeElement('hidden', { visible: false })]));

    expect(screen.queryByTestId('studio-element-hidden')).not.toBeInTheDocument();
  });

  it('announces the selection in text, not by colour alone', async () => {
    const user = createUser();
    renderStage(makeStageDocument([textElement('t', { text: 'Hoa sen' })]));

    await user.click(screen.getByTestId('studio-element-t'));

    expect(screen.getByText(`${STUDIO_STAGE_COPY.selectionPrefix}: Hoa sen`)).toBeInTheDocument();
  });

  it('is selectable by keyboard, not by pointer only', async () => {
    const user = createUser();
    renderStage(makeStageDocument([shapeElement('a')]));

    screen.getByTestId('studio-element-a').focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('studio-element-a')).toHaveAttribute('aria-pressed', 'true');
  });

  it('drops a selection whose element is gone from a replaced document', async () => {
    const user = createUser();
    const { rerender } = renderStage(makeStageDocument([shapeElement('a'), shapeElement('b')]));

    await user.click(screen.getByTestId('studio-element-b'));
    expect(screen.getByTestId('studio-stage-selection')).toBeInTheDocument();

    rerender(
      <StudioStageScreen
        isResuming={false}
        onResume={jest.fn()}
        scope={makeScope()}
        snapshot={makeStageSnapshot(makeStageDocument([shapeElement('a')]))}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('studio-stage-selection')).not.toBeInTheDocument();
    });
    expect(screen.getByText(STUDIO_STAGE_COPY.selectionNone)).toBeInTheDocument();
  });

  it('keeps the selection out of anything that could be persisted', async () => {
    const user = createUser();
    renderStage(makeStageDocument([shapeElement('a')]));

    await user.click(screen.getByTestId('studio-element-a'));

    expect(useStudioInteractionStore.getState().selectedElementId).toBe('a');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('the capabilities S02 does not have', () => {
  it('does not mutate the document when the pointer moves over an element', async () => {
    const user = createUser();
    const element = shapeElement('a', {
      transform: { x: 40, y: 40, width: 80, height: 60, rotationDeg: 0, scaleX: 1, scaleY: 1 },
    });
    const document = makeStageDocument([element]);
    const before = JSON.stringify(document);
    renderStage(document);

    const placed = screen.getByTestId('studio-element-a').getAttribute('transform');
    await user.pointer([
      { target: screen.getByTestId('studio-element-a'), coords: { x: 10, y: 10 } },
      { coords: { x: 260, y: 240 } },
    ]);

    expect(screen.getByTestId('studio-element-a')).toHaveAttribute('transform', placed ?? '');
    expect(JSON.stringify(document)).toBe(before);
  });

  it('offers no control on the stage beyond the elements themselves', () => {
    renderStage(makeStageDocument([shapeElement('a'), textElement('b')]));

    // The only `button` roles inside the canvas are the two elements. A zoom
    // control, a layer row, a transform handle or a save button would each show
    // up here as an extra one.
    const controls = [...canvas().querySelectorAll('[role="button"]')];
    expect(controls).toHaveLength(2);
    expect(screen.queryByTestId('studio-stage-background-retry')).not.toBeInTheDocument();
  });

  it('makes no request other than the Side background', async () => {
    const client = jest.requireMock<Record<string, jest.Mock>>('@embroidery/api-client');
    renderStage();

    await waitFor(() => {
      expect(client.publicProductSideBackgroundGet).toHaveBeenCalled();
    });
    expect(client.publicDesignTemplateAssetGet).not.toHaveBeenCalled();
    expect(client.publicProductPlacementGet).not.toHaveBeenCalled();
    expect(client.publicDesignSessionCreate).not.toHaveBeenCalled();
    expect(client.publicDesignSessionResume).not.toHaveBeenCalled();
  });

  it('runs no autosave timer while the stage is open', () => {
    jest.useFakeTimers();
    try {
      renderStage();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
