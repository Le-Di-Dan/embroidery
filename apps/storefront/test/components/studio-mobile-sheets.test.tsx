/**
 * The 390 shell and its five sheets (`APP3-S11`).
 *
 * What a rendering test can prove and a source rule cannot: that the toolbar
 * really is the only tool surface at this tier, that a sheet contains focus
 * while it covers the stage, that the conflict decision appears exactly once,
 * and that a numeric transform press goes through `APP3-P02` rather than around
 * it.
 *
 * The assertions are on the persisted document and on the accessibility tree —
 * never on how a sheet looks, which is the half a screenshot already covers.
 */
import { act } from 'react';

import { publicProductSideBackgroundGet } from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { STUDIO_MOBILE_COPY } from '../../src/features/design-studio/model/studio-mobile-copy';
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
  publicProductPlacementGet: jest.fn(),
  publicDesignSessionAutosave: jest.fn(),
}));

const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;

const INSIDE = { x: 150, y: 160, width: 40, height: 20, rotationDeg: 0, scaleX: 1, scaleY: 1 };

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/background');
  URL.revokeObjectURL = jest.fn();
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn(() => true);
});

beforeEach(() => {
  backgroundMock.mockReset();
  backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
  useStudioInteractionStore.setState({ selectedElementId: null });
  useStudioDocumentStore.getState().reset();
  useStudioViewportStore.getState().resetViewport();
  setViewportWidth(390);
});

const SCENE = makeStageDocument([
  shapeElement('a', { transform: INSIDE }),
  textElement('t', { transform: { ...INSIDE, x: 250 } }),
]);

function renderStage(width = 390, document = SCENE) {
  setViewportWidth(width);
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

const stored = (id: string) =>
  useStudioDocumentStore.getState().document?.elements.find((element) => element.id === id);
const historyLength = () => useStudioDocumentStore.getState().history.entries.length;

describe('the 390 shell (610:242)', () => {
  it('has one toolbar, one topbar, one stage and no desktop rail or drawer', () => {
    renderStage();

    expect(screen.getAllByTestId('studio-mobile-toolbar')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-stage-topbar')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-stage-viewport')).toHaveLength(1);
    expect(screen.queryByTestId('studio-history-rail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('studio-text-drawer')).not.toBeInTheDocument();
  });

  it('names every control with a word rather than a glyph', () => {
    renderStage();
    for (const label of [
      STUDIO_MOBILE_COPY.text,
      STUDIO_MOBILE_COPY.image,
      STUDIO_MOBILE_COPY.undo,
      STUDIO_MOBILE_COPY.redo,
      STUDIO_MOBILE_COPY.more,
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('says why a control is off, in text a screen reader reaches', () => {
    renderStage();
    // Nothing selected: the text tool is off, and the reason is real text the
    // control points at rather than a grey rectangle.
    const text = screen.getByTestId('studio-mobile-text');
    expect(text).toBeDisabled();
    const described = text.getAttribute('aria-describedby');
    expect(described).not.toBeNull();
    expect(document.getElementById(described ?? '')?.textContent).toBe(
      STUDIO_MOBILE_COPY.textUnavailable,
    );
  });

  it('opens at most one sheet, and closes the one that was open', () => {
    renderStage();

    fireEvent.click(screen.getByTestId('studio-mobile-layers'));
    expect(screen.getByTestId('studio-mobile-layers-sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('studio-mobile-image'));
    expect(screen.queryByTestId('studio-mobile-layers-sheet')).not.toBeInTheDocument();
    expect(screen.getByTestId('studio-mobile-image-sheet')).toBeInTheDocument();

    // Pressing the tool that is already open closes it.
    fireEvent.click(screen.getByTestId('studio-mobile-image'));
    expect(screen.queryByTestId('studio-mobile-image-sheet')).not.toBeInTheDocument();
  });
});

describe('a sheet is modal while it covers the stage', () => {
  it('takes focus, returns it, and locks the page behind', () => {
    renderStage();
    const trigger = screen.getByTestId('studio-mobile-layers');
    trigger.focus();

    fireEvent.click(trigger);
    // Focus is inside the sheet, and the page behind cannot scroll.
    expect(screen.getByTestId('studio-mobile-layers-sheet').contains(document.activeElement)).toBe(
      true,
    );
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByTestId('studio-mobile-layers-sheet-close'));
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('closes on Escape and on the scrim', () => {
    renderStage();

    fireEvent.click(screen.getByTestId('studio-mobile-layers'));
    fireEvent.keyDown(screen.getByTestId('studio-mobile-layers-sheet'), { key: 'Escape' });
    expect(screen.queryByTestId('studio-mobile-layers-sheet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('studio-mobile-layers'));
    fireEvent.click(screen.getByTestId('studio-mobile-layers-sheet-scrim'));
    expect(screen.queryByTestId('studio-mobile-layers-sheet')).not.toBeInTheDocument();
  });
});

describe('the transform sheet (610:294)', () => {
  function openTransform() {
    select('a');
    fireEvent.click(screen.getAllByTestId(/studio-transform-handle-/)[0] as HTMLElement);
  }

  it('is reached from the selection and offers the three approved controls', () => {
    renderStage();
    openTransform();

    expect(screen.getByTestId('studio-mobile-transform-sheet')).toBeInTheDocument();
    for (const id of ['studio-mobile-width', 'studio-mobile-height', 'studio-mobile-rotation']) {
      expect(screen.getByTestId(`${id}-decrease`)).toBeInTheDocument();
      expect(screen.getByTestId(`${id}-increase`)).toBeInTheDocument();
    }
    // No rotate affordance on the stage itself: `610:242` draws none.
    expect(screen.queryByTestId('studio-transform-rotate')).not.toBeInTheDocument();
    // Four corner knobs, not the eight desktop handles.
    expect(screen.getAllByTestId(/studio-transform-handle-/)).toHaveLength(4);
  });

  it('commits one accepted rotation as one history entry', () => {
    renderStage();
    openTransform();
    const before = stored('a')?.transform.rotationDeg;
    const entries = historyLength();

    fireEvent.click(screen.getByTestId('studio-mobile-rotation-increase'));

    expect(stored('a')?.transform.rotationDeg).not.toBe(before);
    expect(historyLength()).toBe(entries + 1);
  });

  it('changes nothing when APP3-P02 refuses, and appends no entry', () => {
    renderStage();
    openTransform();
    const before = stored('a')?.transform;
    const entries = historyLength();

    // Grown far past the safe area, one millimetre at a time, until P02 says no.
    for (let press = 0; press < 400; press += 1) {
      fireEvent.click(screen.getByTestId('studio-mobile-width-increase'));
    }

    expect(screen.getByTestId('studio-mobile-transform-refusal')).toBeInTheDocument();
    // The refusal is the *last* press; earlier ones were legal and did commit.
    // What matters is that the refused one changed nothing at all.
    const after = stored('a')?.transform;
    const entriesAfter = historyLength();
    fireEvent.click(screen.getByTestId('studio-mobile-width-increase'));
    expect(stored('a')?.transform).toEqual(after);
    expect(historyLength()).toBe(entriesAfter);
    expect(after).not.toEqual(before);
    expect(entriesAfter).toBeGreaterThan(entries);
  });
});

describe('the layer sheet (610:353)', () => {
  it('offers the handle and the keyboard path side by side', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-mobile-layers'));

    expect(screen.getByTestId('studio-mobile-layer-handle-a')).toBeInTheDocument();
    // A drag may never be the only way to restack (`APP3-S04` §9).
    expect(screen.getAllByRole('button', { name: /Đưa lớp/ }).length).toBeGreaterThan(0);
    expect(screen.getByText(STUDIO_MOBILE_COPY.layers.handleHint)).toBeInTheDocument();
  });

  it('offers no group or ungroup control', () => {
    renderStage();
    fireEvent.click(screen.getByTestId('studio-mobile-layers'));
    for (const forbidden of [/nhóm/i, /group/i]) {
      expect(screen.queryByRole('button', { name: forbidden })).not.toBeInTheDocument();
    }
  });
});

describe('the conflict sheet (610:514)', () => {
  it('renders no conflict surface while the save is healthy', () => {
    renderStage();
    expect(screen.queryByTestId('studio-mobile-conflict-sheet')).not.toBeInTheDocument();
  });
});

describe('nothing mobile leaks upward', () => {
  it('renders no toolbar, sheet or gesture surface at 1024 or 1440', () => {
    for (const width of [1024, 1440]) {
      const view = renderStage(width);
      expect(screen.queryByTestId('studio-mobile-toolbar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('studio-mobile-layers-sheet')).not.toBeInTheDocument();
      expect(screen.queryByTestId('studio-mobile-hint')).not.toBeInTheDocument();
      view.unmount();
    }
  });
});
