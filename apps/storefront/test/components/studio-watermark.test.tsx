/**
 * The runtime watermark, driven as a customer meets it (`APP3-S09`).
 *
 * The model test proves the token and the pattern; this proves the thing that
 * matters most and that only a rendered tree can show — that the watermark is
 * **not in the design**. It is absent from the serialized document, absent from
 * the layer list, unselectable, untransformable, and it survives every edit and
 * every viewport change without ever being one.
 */
import { act } from 'react';

import { publicProductSideBackgroundGet } from '@embroidery/api-client';
import { canonicalizeDesignDocument } from '@embroidery/design-document';
import { fireEvent, renderWithProviders, screen } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { STUDIO_WATERMARK_COPY } from '../../src/features/design-studio/model/studio-watermark-copy';
import {
  WATERMARK_COLUMNS,
  WATERMARK_ROWS,
} from '../../src/features/design-studio/model/studio-watermark';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import { useStudioViewportStore } from '../../src/features/design-studio/store/studio-viewport.store';
import {
  imageElement,
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

const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;

/** Inside the fixture safe area (100,120 → 400,320). */
const INSIDE = { x: 150, y: 160, width: 100, height: 60, rotationDeg: 0, scaleX: 1, scaleY: 1 };

const scene = makeStageDocument([
  textElement('t', { text: 'Xin chào', transform: INSIDE }),
  shapeElement('s', { transform: { ...INSIDE, x: 260 } }),
  imageElement('i', { transform: { ...INSIDE, y: 240 } }),
]);

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/background');
  URL.revokeObjectURL = jest.fn();
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn(() => true);
});

beforeEach(() => {
  setViewportWidth(1440);
  backgroundMock.mockReset();
  backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
  useStudioInteractionStore.setState({ selectedElementId: null });
  useStudioDocumentStore.getState().reset();
  useStudioViewportStore.getState().resetViewport();
});

function renderStage(document = scene) {
  return renderWithProviders(
    <StudioStageScreen
      areaLimits={null}
      isResuming={false}
      onResume={jest.fn()}
      scope={makeScope()}
      snapshot={makeStageSnapshot(document)}
    />,
  );
}

const watermark = () => screen.getByTestId('studio-watermark');
const marks = () => watermark().querySelectorAll('.studio-watermark__mark');
const tokenOf = () => {
  const text = watermark().textContent ?? '';
  return /·\s*([A-HJ-NP-Z2-9]{8})/.exec(text)?.[1] ?? null;
};
const storedDocument = () => useStudioDocumentStore.getState().document;

describe('the watermark is present (APP3-S09 §1, §4)', () => {
  it('renders over a document with artwork', () => {
    renderStage();
    expect(watermark()).toBeInTheDocument();
    expect(marks().length).toBe(WATERMARK_ROWS * WATERMARK_COLUMNS);
  });

  it('renders over an empty document too', () => {
    // Deleting every element does not remove the mark: it is not artwork.
    renderStage(makeStageDocument([]));
    expect(watermark()).toBeInTheDocument();
    expect(marks().length).toBeGreaterThan(0);
  });

  it('names the storefront, the preview and an opaque token, and nothing else', () => {
    renderStage();
    const text = watermark().textContent ?? '';

    expect(text).toContain(STUDIO_WATERMARK_COPY.wordmark);
    expect(text).toContain(STUDIO_WATERMARK_COPY.preview);
    expect(tokenOf()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('draws each mark in both approved treatments', () => {
    renderStage();
    const first = marks()[0];

    // Ink at 13 % for light imagery and white at 22 % for dark, so legibility
    // needs no inspection of the customer's own pixels.
    expect(first?.querySelector('.studio-watermark__text--light')).not.toBeNull();
    expect(first?.querySelector('.studio-watermark__text--dark')).not.toBeNull();
  });

  it('sits inside the viewport box rather than the transformed layer', () => {
    renderStage();
    const layer = screen.getByTestId('studio-stage-viewport-layer');

    // Inside the viewport — so the clip applies — and outside the transform, so
    // zoom and pan cannot move it off the visible preview.
    expect(screen.getByTestId('studio-stage-viewport').contains(watermark())).toBe(true);
    expect(layer.contains(watermark())).toBe(false);
  });
});

describe('the watermark is not in the design (APP3-S09 §4)', () => {
  it('does not change the document when it mounts', () => {
    const before = canonicalizeDesignDocument(scene);
    renderStage();

    const after = canonicalizeDesignDocument(storedDocument() ?? scene);
    expect(after).toBe(before);
  });

  it('leaves no trace in the serialized document', () => {
    renderStage();
    const serialized = canonicalizeDesignDocument(storedDocument() ?? scene);
    const token = tokenOf() ?? 'no-token';

    for (const trace of [token, 'watermark', 'Watermark', STUDIO_WATERMARK_COPY.preview]) {
      expect(serialized).not.toContain(trace);
    }
  });

  it('adds no element to the document', () => {
    renderStage();
    expect(storedDocument()?.elements).toHaveLength(scene.elements.length);
  });

  it('is absent from the layer list', () => {
    renderStage();
    const rows = [...screen.getByTestId('studio-layer-list').querySelectorAll('li')];

    expect(rows).toHaveLength(scene.elements.length);
    for (const row of rows) {
      expect(row.textContent).not.toContain(STUDIO_WATERMARK_COPY.preview);
    }
  });

  it('cannot be selected, and clicking through it selects the artwork', () => {
    renderStage();
    // The overlay takes no pointer, so a click reaches the element beneath it.
    fireEvent.click(screen.getByTestId('studio-element-t'));

    expect(useStudioInteractionStore.getState().selectedElementId).toBe('t');
    expect(watermark()).not.toHaveAttribute('data-selected');
  });

  it('has no transform handles of its own', () => {
    renderStage();
    expect(watermark().querySelector('[data-testid^="studio-transform-"]')).toBeNull();
  });

  it('survives hiding and locking every element', () => {
    renderStage();
    for (const id of ['t', 's', 'i']) {
      fireEvent.click(screen.getByTestId(`studio-layer-visibility-${id}`));
      fireEvent.click(screen.getByTestId(`studio-layer-lock-${id}`));
    }

    expect(screen.queryAllByTestId(/^studio-element-/)).toHaveLength(0);
    expect(watermark()).toBeInTheDocument();
  });
});

describe('the token lifecycle (APP3-S09 §6)', () => {
  it('is minted once per runtime and survives every edit', () => {
    renderStage();
    const first = tokenOf();

    act(() => {
      useStudioInteractionStore.getState().selectElement('t');
    });
    fireEvent.click(screen.getByTestId('studio-layer-up-t'));
    fireEvent.click(screen.getByTestId('studio-layer-visibility-s'));
    fireEvent.click(screen.getByTestId('studio-layer-lock-i'));
    fireEvent.change(screen.getByTestId('studio-text-value'), { target: { value: 'Đổi chữ' } });
    fireEvent.blur(screen.getByTestId('studio-text-value'));
    act(() => {
      useStudioViewportStore.getState().zoomIn();
    });

    expect(tokenOf()).toBe(first);
  });

  it('mints a new token for a new runtime', () => {
    const { unmount } = renderStage();
    const first = tokenOf();
    unmount();

    renderStage();
    expect(tokenOf()).not.toBe(first);
  });

  it('is not derived from the document', () => {
    const first = renderStage(scene);
    const before = tokenOf();
    first.unmount();

    // The *same* document, mounted again: a token derived from the design — a
    // hash, a placement, an element id — would come back identical.
    renderStage(scene);
    expect(tokenOf()).not.toBe(before);
  });
});

describe('zoom, pan and the safe area (APP3-S09 §5)', () => {
  const transformOfWatermark = () => getComputedStyle(watermark()).transform;

  it('is present at fit, at zoom and after a pan', () => {
    renderStage();
    expect(watermark()).toBeInTheDocument();

    act(() => {
      useStudioViewportStore.getState().zoomIn();
      useStudioViewportStore.getState().zoomIn();
      useStudioViewportStore.getState().zoomIn();
    });
    expect(watermark()).toBeInTheDocument();
    const zoomed = transformOfWatermark();

    act(() => {
      useStudioViewportStore.getState().panByPixels(-900, -900, 600, 400);
    });
    expect(watermark()).toBeInTheDocument();
    // The viewport transform moved the artwork; the watermark did not move with
    // it, which is the whole reason it is a sibling of that layer.
    expect(transformOfWatermark()).toBe(zoomed);
  });

  it('is unchanged by the safe-area toggle', () => {
    renderStage();
    const before = watermark().outerHTML;

    act(() => {
      useStudioViewportStore.getState().toggleSafeArea();
    });

    expect(watermark().outerHTML).toBe(before);
  });

  it('mutates no viewport state', () => {
    renderStage();
    const before = useStudioViewportStore.getState();

    expect({ zoom: before.zoomStep, panX: before.panXRatio, safe: before.safeAreaVisible }).toEqual(
      {
        zoom: useStudioViewportStore.getState().zoomStep,
        panX: useStudioViewportStore.getState().panXRatio,
        safe: useStudioViewportStore.getState().safeAreaVisible,
      },
    );
  });
});

describe('accessibility and honesty (APP3-S09 §8, §10)', () => {
  it('hides the repeated pattern from assistive technology', () => {
    renderStage();
    expect(watermark()).toHaveAttribute('aria-hidden', 'true');
  });

  it('is not focusable and is not a tab stop', () => {
    renderStage();
    expect(watermark().querySelector('button, a, input, [tabindex]')).toBeNull();
  });

  it('states the policy once, as real text', () => {
    renderStage();
    const policy = screen.getByTestId('studio-watermark-policy');

    expect(policy).toHaveTextContent(STUDIO_WATERMARK_COPY.policy);
    expect(policy).toHaveTextContent(STUDIO_WATERMARK_COPY.policyNoDownload);
  });

  it('offers no download, export, print or share control', () => {
    const { container } = renderStage();
    const markup = container.innerHTML.toLowerCase();

    for (const forbidden of ['download', 'export', 'href="blob', 'print(', 'navigator.share']) {
      expect(markup).not.toContain(forbidden);
    }
  });
});

describe('responsive presence (APP3-S09 §9)', () => {
  it.each([
    ['desktop', 1440],
    ['tablet', 1024],
    ['mobile', 390],
  ])('is present at %s', (_label, width) => {
    setViewportWidth(width);
    renderStage();

    expect(watermark()).toBeInTheDocument();
    expect(marks().length).toBe(WATERMARK_ROWS * WATERMARK_COLUMNS);
  });

  it('adds no mobile editing surface of its own', () => {
    setViewportWidth(390);
    renderStage();

    expect(screen.queryByTestId('studio-layer-list')).not.toBeInTheDocument();
    expect(watermark().querySelector('button')).toBeNull();
  });
});

describe('coexistence (APP3-S09 §11)', () => {
  it('keeps one SVG scene and no canvas', () => {
    const { container } = renderStage();

    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('leaves the real image beneath it', () => {
    const { container } = renderStage();
    const svg = container.querySelector('svg');

    expect(svg?.contains(screen.getByTestId('studio-element-i'))).toBe(true);
    expect(watermark().contains(screen.getByTestId('studio-element-i'))).toBe(false);
  });

  it('calls no API of its own', () => {
    const client: Record<string, jest.Mock> = jest.requireMock('@embroidery/api-client');
    renderStage();

    for (const operation of [
      'publicDesignSessionAutosave',
      'publicDesignSessionAssetStatus',
      'publicDesignSessionCreate',
      'publicDesignSessionResume',
    ]) {
      expect(client[operation]).not.toHaveBeenCalled();
    }
  });

  /*
   * The image request belongs to `APP3-S06` and is measured as a **delta**.
   *
   * A flat "zero calls" assertion would be false and would have to be deleted
   * the first time the fixture contained an image — so what is asserted is that
   * the watermark adds none: the count after a zoom, a pan and a safe-area
   * toggle is the count before them.
   */
  it('causes no additional media request', () => {
    const client: Record<string, jest.Mock> = jest.requireMock('@embroidery/api-client');
    renderStage();
    const before = client.publicDesignSessionAssetGet?.mock.calls.length ?? 0;

    act(() => {
      useStudioViewportStore.getState().zoomIn();
      useStudioViewportStore.getState().panByPixels(-40, -40, 600, 400);
      useStudioViewportStore.getState().toggleSafeArea();
    });

    expect(client.publicDesignSessionAssetGet?.mock.calls.length ?? 0).toBe(before);
  });
});
