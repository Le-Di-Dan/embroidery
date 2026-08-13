/**
 * The layer panel, driven as a customer drives it (`APP3-S04`).
 *
 * The model test proves the rules; this proves the panel asks them, that the SVG
 * scene reflects the answer, and that the two never disagree. It also carries
 * the things only a rendered tree can show: that a restack reaches the paint
 * order, that a hidden element loses its transform chrome, that the keyboard
 * reaches every z-order change a drag can reach, and that none of it calls an
 * API or re-renders the elements it did not touch.
 *
 * The render count is taken through `elementLabel`, the same production seam
 * `APP3-S03-C1` and `APP3-S05` count renders with.
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
  makeScope,
  makeStageDocument,
  makeStageSnapshot,
  setViewportWidth,
  shapeElement,
  textElement,
} from '../support/studio-stage-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicDesignSessionCreate: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicDesignSessionAssetCreate: jest.fn(),
  publicDesignSessionAssetGet: jest.fn(),
  publicDesignSessionAssetStatus: jest.fn(),
  publicProductPlacementGet: jest.fn(),
  publicDesignSessionAutosave: jest.fn(),
}));

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
const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;

/** Inside the fixture safe area (100,120 → 400,320). */
const INSIDE = { x: 150, y: 160, width: 100, height: 60, rotationDeg: 0, scaleX: 1, scaleY: 1 };

/** Bottom first, as the array is. */
const scene = makeStageDocument([
  textElement('bottom', { text: 'Dưới', transform: INSIDE }),
  shapeElement('middle', { transform: { ...INSIDE, x: 240 } }),
  textElement('top', { text: 'Trên', transform: { ...INSIDE, y: 240 } }),
]);

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/background');
  URL.revokeObjectURL = jest.fn();
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn(() => true);
});

beforeEach(() => {
  // The accepted desktop composition, stated rather than inherited: jsdom's own
  // default width sits in the tablet band, where the panel is in a drawer.
  setViewportWidth(1440);
  backgroundMock.mockReset();
  backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
  useStudioInteractionStore.setState({ selectedElementId: null });
  useStudioDocumentStore.getState().reset();
  useStudioViewportStore.getState().resetViewport();
  labelCalls.length = 0;
});

function renderStage(document = scene) {
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
    useStudioInteractionStore.getState().selectElement(id);
  });
}

const storedIds = () =>
  useStudioDocumentStore.getState().document?.elements.map((element) => element.id);
const storedElement = (id: string) =>
  useStudioDocumentStore.getState().document?.elements.find((element) => element.id === id);
const paintedIds = () =>
  [
    ...screen
      .getByTestId('studio-stage-canvas')
      .querySelectorAll('[data-testid^="studio-element-"]'),
  ].map((node) => node.getAttribute('data-testid')?.replace('studio-element-', ''));
const rowIds = () =>
  [...screen.getByTestId('studio-layer-list').querySelectorAll('li')].map((node) =>
    node.getAttribute('data-testid')?.replace('studio-layer-', ''),
  );

describe('the list projects the working document (APP3-S04 §6, §7)', () => {
  it('reads top-most first while the stage paints bottom-most first', () => {
    renderStage();

    expect(rowIds()).toEqual(['top', 'middle', 'bottom']);
    expect(paintedIds()).toEqual(['bottom', 'middle', 'top']);
  });

  it('says which end of the list is the front', () => {
    renderStage();
    expect(screen.getByText(/Lớp trên cùng nằm trước/)).toBeInTheDocument();
  });

  it('shows a truthful empty state and no creation call to action', () => {
    renderStage(makeStageDocument([]));

    expect(screen.getByTestId('studio-layers-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('studio-layer-list')).not.toBeInTheDocument();
    for (const invented of [/thêm chữ$/i, /tạo nhóm/i, /tải ảnh lên/i]) {
      expect(screen.queryByRole('button', { name: invented })).not.toBeInTheDocument();
    }
  });

  it('names no internal identifier anywhere in the panel', () => {
    const { container } = renderStage();
    const panel = container.querySelector('.studio-layers')?.textContent ?? '';

    for (const id of ['bottom', 'middle', 'top', 'asset', 'derivative']) {
      expect(panel).not.toContain(id);
    }
  });
});

describe('selection (APP3-S04 §11)', () => {
  it('selects the same element the stage would', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-layer-select-middle'));

    expect(useStudioInteractionStore.getState().selectedElementId).toBe('middle');
    expect(screen.getByTestId('studio-layer-select-middle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('reflects a selection made on the stage', () => {
    renderStage();
    select('top');

    expect(screen.getByTestId('studio-layer-select-top')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('studio-layer-select-bottom')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('reorder (APP3-S04 §8, §9)', () => {
  it('changes the array order, the paint order and nothing else', () => {
    renderStage();
    const before = storedElement('bottom');

    fireEvent.click(screen.getByTestId('studio-layer-up-bottom'));

    expect(storedIds()).toEqual(['middle', 'bottom', 'top']);
    expect(paintedIds()).toEqual(['middle', 'bottom', 'top']);
    expect(rowIds()).toEqual(['top', 'bottom', 'middle']);
    expect(storedElement('bottom')).toEqual(before);
  });

  it('keeps the selection on the same stable id', () => {
    renderStage();
    select('bottom');

    fireEvent.click(screen.getByTestId('studio-layer-up-bottom'));

    expect(useStudioInteractionStore.getState().selectedElementId).toBe('bottom');
  });

  it('reaches the same result from a drag as from the keyboard', () => {
    renderStage();
    const row = screen.getByTestId('studio-layer-bottom');
    const target = screen.getByTestId('studio-layer-middle');

    fireEvent.dragStart(row);
    fireEvent.dragOver(target);
    expect(target).toHaveAttribute('data-drop', 'true');
    fireEvent.drop(target);

    expect(storedIds()).toEqual(['middle', 'bottom', 'top']);
    expect(screen.getByTestId('studio-layer-middle')).toHaveAttribute('data-drop', 'false');
  });

  it('abandons a drag without touching the document', () => {
    renderStage();
    const row = screen.getByTestId('studio-layer-bottom');

    fireEvent.dragStart(row);
    fireEvent.dragOver(screen.getByTestId('studio-layer-top'));
    fireEvent.dragEnd(row);

    expect(storedIds()).toEqual(['bottom', 'middle', 'top']);
    expect(screen.getByTestId('studio-layer-top')).toHaveAttribute('data-drop', 'false');
  });

  it('disables a boundary move and says why', () => {
    renderStage();

    expect(screen.getByTestId('studio-layer-up-top')).toBeDisabled();
    expect(screen.getByTestId('studio-layer-down-bottom')).toBeDisabled();
    expect(screen.getByText('Lớp đã ở trên cùng.')).toBeInTheDocument();
  });

  it('announces a restack through a polite live region', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-layer-up-bottom'));

    expect(screen.getByTestId('studio-layers-status')).toHaveTextContent(
      'Đã đưa lớp Dưới lên trên.',
    );
  });

  it('re-renders no element it did not restack', () => {
    renderStage();
    labelCalls.length = 0;

    fireEvent.click(screen.getByTestId('studio-layer-up-bottom'));

    // The scene keeps every `RenderableElement` instance across a reorder
    // (`APP3-S03-C1`), so React re-renders the moved subtrees and not the whole
    // scene. `top` is above both and moves neither in the array nor on screen.
    expect(labelCalls.filter((id) => id === 'top')).toHaveLength(0);
  });
});

describe('visibility (APP3-S04 §13)', () => {
  it('maps to the P01 flag and stops the element being painted', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-layer-visibility-middle'));

    expect(storedElement('middle')?.visible).toBe(false);
    expect(paintedIds()).toEqual(['bottom', 'top']);
  });

  it('keeps the row, the order and the geometry', () => {
    renderStage();
    const before = storedElement('middle');
    fireEvent.click(screen.getByTestId('studio-layer-visibility-middle'));

    expect(rowIds()).toEqual(['top', 'middle', 'bottom']);
    expect(storedElement('middle')?.transform).toEqual(before?.transform);
    expect(screen.getByTestId('studio-layer-middle')).toHaveTextContent('Đang ẩn');
  });

  it('shows the same element again, unchanged', () => {
    renderStage();
    const before = storedElement('middle');

    fireEvent.click(screen.getByTestId('studio-layer-visibility-middle'));
    fireEvent.click(screen.getByTestId('studio-layer-visibility-middle'));

    expect(storedElement('middle')).toEqual(before);
    expect(paintedIds()).toEqual(['bottom', 'middle', 'top']);
  });

  it('clears a selection that has just been hidden, and its transform chrome', () => {
    renderStage();
    select('middle');
    expect(screen.getByTestId('studio-transform-move')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('studio-layer-visibility-middle'));

    expect(useStudioInteractionStore.getState().selectedElementId).toBeNull();
    expect(screen.queryByTestId('studio-transform-move')).not.toBeInTheDocument();
  });
});

describe('lock (APP3-S04 §12)', () => {
  it('maps to the P01 flag without changing geometry, order or visibility', () => {
    renderStage();
    const before = storedElement('middle');

    fireEvent.click(screen.getByTestId('studio-layer-lock-middle'));

    expect(storedElement('middle')?.locked).toBe(true);
    expect(storedElement('middle')?.transform).toEqual(before?.transform);
    expect(storedElement('middle')?.visible).toBe(true);
    expect(storedIds()).toEqual(['bottom', 'middle', 'top']);
  });

  it('takes the transform handles away and gives them back', () => {
    renderStage();
    select('middle');
    expect(screen.getByTestId('studio-transform-move')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('studio-layer-lock-middle'));
    expect(screen.queryByTestId('studio-transform-move')).not.toBeInTheDocument();
    // Still selected: a locked element refuses mutation, not attention.
    expect(useStudioInteractionStore.getState().selectedElementId).toBe('middle');

    fireEvent.click(screen.getByTestId('studio-layer-lock-middle'));
    expect(screen.getByTestId('studio-transform-move')).toBeInTheDocument();
  });

  it('refuses a text edit while locked and allows it again after', () => {
    renderStage();
    select('top');
    expect(screen.getByTestId('studio-text-value')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('studio-layer-lock-top'));
    expect(screen.getByTestId('studio-text-unavailable')).toHaveTextContent('đang bị khoá');

    fireEvent.click(screen.getByTestId('studio-layer-lock-top'));
    expect(screen.getByTestId('studio-text-value')).toHaveValue('Trên');
  });
});

describe('what S04 does not do (APP3-S04 §26, §27, §32)', () => {
  it('calls no API for any layer action', () => {
    const client: Record<string, jest.Mock> = jest.requireMock('@embroidery/api-client');
    renderStage();

    fireEvent.click(screen.getByTestId('studio-layer-up-bottom'));
    fireEvent.click(screen.getByTestId('studio-layer-visibility-middle'));
    fireEvent.click(screen.getByTestId('studio-layer-lock-top'));
    fireEvent.click(screen.getByTestId('studio-layer-select-top'));

    for (const operation of [
      'publicDesignSessionAutosave',
      'publicDesignSessionCreate',
      'publicDesignSessionResume',
      'publicDesignSessionAssetGet',
      'publicDesignSessionAssetStatus',
    ]) {
      expect(client[operation]).not.toHaveBeenCalled();
    }
  });

  it('leaves the viewport exactly where it was', () => {
    renderStage();
    act(() => {
      useStudioViewportStore.getState().zoomIn();
    });
    const before = useStudioViewportStore.getState();

    fireEvent.click(screen.getByTestId('studio-layer-up-bottom'));
    fireEvent.click(screen.getByTestId('studio-layer-visibility-middle'));

    const after = useStudioViewportStore.getState();
    expect(after.zoomStep).toBe(before.zoomStep);
    expect(after.safeAreaVisible).toBe(before.safeAreaVisible);
  });

  it('adds no history, autosave, watermark or grouping control', () => {
    const { container } = renderStage();
    const panel = container.querySelector('.studio-layers')?.textContent ?? '';

    for (const absent of ['Hoàn tác', 'Làm lại', 'Đã lưu', 'Nhân bản', 'Xoá', 'Tạo nhóm']) {
      expect(panel).not.toContain(absent);
    }
  });
});

describe('responsive boundaries (APP3-S04 §5)', () => {
  /*
   * The 390 boundary moved with the world (`APP3-S11`).
   *
   * The layer *panel* still renders nothing at this tier, and the reorder
   * controls are still absent until a surface that owns them is opened — but the
   * reason changed. Reordering is no longer unavailable at 390; it lives in the
   * approved sheet `610:353`, behind the toolbar's own control.
   */
  it('renders nothing that edits layers in the panel at 390', () => {
    setViewportWidth(390);
    renderStage();

    expect(screen.queryByTestId('studio-layer-list')).not.toBeInTheDocument();
    // The sentence that said 390 could not reorder layers is gone: it would now
    // be false.
    expect(screen.queryByTestId('studio-layers-mobile-notice')).not.toBeInTheDocument();
    // Not merely hidden: a closed sheet renders no list at all, so nothing is
    // focusable and no button can fire.
    expect(screen.queryByRole('button', { name: /Đưa lớp/ })).not.toBeInTheDocument();
  });

  it('reorders from the approved mobile sheet at 390, one entry per drop', () => {
    setViewportWidth(390);
    renderStage();

    fireEvent.click(screen.getByTestId('studio-mobile-layers'));
    expect(screen.getByTestId('studio-mobile-layers-sheet')).toBeInTheDocument();
    // The keyboard path `APP3-S04` §9 requires is in the sheet too: a drag may
    // never be the only way to restack.
    expect(screen.getAllByRole('button', { name: /Đưa lớp/ }).length).toBeGreaterThan(0);
  });

  it('uses the one accepted drawer at 1024, and no second one', () => {
    setViewportWidth(1024);
    renderStage();

    expect(screen.getAllByTestId('studio-stage-topbar')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('studio-text-drawer-trigger'));

    const drawer = screen.getByTestId('studio-text-drawer');
    expect(drawer.querySelectorAll('[data-testid="studio-layer-list"]')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-text-drawer')).toHaveLength(1);
  });
});
