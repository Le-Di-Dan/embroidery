/**
 * Status, scope, the Template-image limitation, responsive behaviour and
 * accessibility.
 *
 * Three of these are absences, and an absence is exactly what a rendered test
 * is good at proving: no save control on a published Template, no Product
 * request for an unscoped one, and no background request at 390.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import {
  adminDesignTemplateDetail,
  adminDesignTemplateSaveDocument,
  adminProductPlacementGet,
  adminProductSideBackgroundGet,
} from '@embroidery/api-client';

import { DesignTemplateEditorScreen } from '../../src/features/design-template-editor';
import { DESIGN_TEMPLATE_EDITOR_COPY } from '../../src/features/design-template-editor/model/design-template-editor-copy';
import {
  detailEnvelope,
  EDITOR_TEMPLATE_ID,
  makeDocument,
  makeImageElement,
  makePlacement,
  makeTextElement,
  makeUnversionedDetail,
  makeVersionedDetail,
  placementEnvelope,
} from '../support/design-template-editor-fixture';
import { installObjectUrl } from '../support/object-url';

jest.mock('next/navigation', () => mockCreateNavigationMock('/design-templates/x').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminDesignTemplateDetail: jest.fn(),
  adminDesignTemplateSaveDocument: jest.fn(),
  adminProductPlacementGet: jest.fn(),
  adminProductSideBackgroundGet: jest.fn(),
}));

const detailMock = adminDesignTemplateDetail as jest.MockedFunction<
  typeof adminDesignTemplateDetail
>;
const saveMock = adminDesignTemplateSaveDocument as jest.MockedFunction<
  typeof adminDesignTemplateSaveDocument
>;
const placementMock = adminProductPlacementGet as jest.MockedFunction<
  typeof adminProductPlacementGet
>;
const backgroundMock = adminProductSideBackgroundGet as jest.MockedFunction<
  typeof adminProductSideBackgroundGet
>;

let user: ReturnType<typeof createUser>;
let objectUrls: ReturnType<typeof installObjectUrl>;

/**
 * `matchMedia` decides whether the editor mounts at all, so it is installed per
 * test rather than globally: at 390 the read-only notice must *replace* the
 * editor, and a hidden editor would still hold focusable controls and still
 * issue the background request.
 */
function setViewport(mode: 'desktop' | 'mobile'): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: mode === 'desktop',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  objectUrls = installObjectUrl('states');
  setViewport('desktop');
  user = createUser();
  detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1)));
  placementMock.mockResolvedValue(placementEnvelope(makePlacement()));
  backgroundMock.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
  saveMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(2)));
});

const render = () =>
  renderWithProviders(<DesignTemplateEditorScreen templateId={EDITOR_TEMPLATE_ID} />);

describe('non-DRAFT templates', () => {
  for (const status of ['PUBLISHED', 'ARCHIVED'] as const) {
    it(`presents a ${status} template read-only with no save`, async () => {
      detailMock.mockResolvedValue(
        detailEnvelope(makeVersionedDetail(1, makeDocument(), { status })),
      );
      render();

      expect(await screen.findByTestId('editor-read-only')).toBeInTheDocument();
      expect(screen.queryByTestId('editor-save')).toBeNull();
      expect(screen.queryByTestId('editor-add-text')).toBeNull();
    });
  }

  it('offers no lifecycle control anywhere', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(1, makeDocument(), { status: 'PUBLISHED' })),
    );
    render();
    await screen.findByTestId('editor-read-only');

    for (const label of [/xuất bản/i, /gỡ xuất bản/i, /lưu trữ/i, /khôi phục/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('names archive and publish differently rather than collapsing them', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(1, makeDocument(), { status: 'ARCHIVED' })),
    );
    render();

    expect(await screen.findByTestId('editor-read-only')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.readOnly.archivedTitle,
    );
  });
});

describe('scope', () => {
  it('states an unscoped template truthfully and requests no Product', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeUnversionedDetail({ scope: undefined })));
    render();

    expect(await screen.findByTestId('editor-unscoped')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.scope.none,
    );
    expect(placementMock).not.toHaveBeenCalled();
    expect(backgroundMock).not.toHaveBeenCalled();
  });

  it('resolves the Side and Area by the exact ids the scope names', async () => {
    render();
    await screen.findByTestId('template-editor');

    const panel = screen.getByTestId('editor-scope');
    expect(within(panel).getByText(/Mặt trước/)).toBeInTheDocument();
    expect(within(panel).getByText(/Ngực trái/)).toBeInTheDocument();
  });

  it('reports an unresolved Side instead of silently choosing another', async () => {
    placementMock.mockResolvedValue(placementEnvelope(makePlacement({ sides: [] })));
    render();
    await screen.findByTestId('template-editor');

    // The draft survives — only the context is gone.
    expect(screen.getByTestId('editor-scope-unresolved')).toBeInTheDocument();
    expect(screen.getByTestId('editor-stage-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-stage-area')).toBeNull();
  });

  it('offers no scope control, because no operation changes a scope', async () => {
    render();
    await screen.findByTestId('template-editor');

    const panel = screen.getByTestId('editor-scope');
    expect(within(panel).queryByRole('button')).toBeNull();
    expect(within(panel).queryByRole('combobox')).toBeNull();
  });
});

describe('the Template image limitation', () => {
  it('shows the add-image control disabled with its reason, never hidden', async () => {
    render();
    await screen.findByTestId('template-editor');

    const add = screen.getByTestId('editor-add-image');
    expect(add).toBeVisible();
    expect(add).toBeDisabled();
    expect(screen.getByText(new RegExp('TEMPLATE_SOURCE'))).toBeInTheDocument();
  });

  it('preserves an existing image element and draws an honest placeholder', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(1, makeDocument([makeTextElement(), makeImageElement()]))),
    );
    render();
    await screen.findByTestId('template-editor');

    // The element is still in the document and still selectable…
    expect(screen.getByTestId('editor-layer-element-image')).toBeInTheDocument();
    // …and drawn as a frame, not as pixels fetched from somewhere.
    expect(screen.getByTestId('editor-image-placeholder')).toBeInTheDocument();
    expect(document.querySelectorAll('image')).toHaveLength(1); // the Side background only
  });

  it('never uses the raw Asset id as the friendly label', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(1, makeDocument([makeImageElement()]))),
    );
    render();
    await screen.findByTestId('template-editor');

    expect(document.body.textContent).not.toContain('01920000-0000-7000-8000-0000000000f1');
  });
});

describe('layers and selection', () => {
  it('keeps the layer list in document order, top first', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeVersionedDetail(
          1,
          makeDocument([
            makeTextElement({ id: 'element-1', text: 'Dưới' }),
            makeTextElement({ id: 'element-2', text: 'Trên' }),
          ]),
        ),
      ),
    );
    render();
    await screen.findByTestId('editor-layer-list');

    const buttons = screen.getAllByTestId(/^editor-layer-element-/);
    // The array is z-order bottom first; the panel reads top first.
    expect(buttons[0]).toHaveTextContent('Trên');
    expect(buttons[1]).toHaveTextContent('Dưới');
  });

  it('selects from the layer list by keyboard alone', async () => {
    render();
    await screen.findByTestId('editor-layer-list');

    const layer = screen.getByTestId('editor-layer-element-1');
    layer.focus();
    await user.keyboard('{Enter}');

    expect(layer).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('editor-text-value')).toBeInTheDocument();
  });

  it('synchronises selection between the stage and the inspector', async () => {
    render();
    await screen.findByTestId('template-editor');
    expect(screen.getByTestId('editor-inspector-empty')).toBeInTheDocument();

    await user.click(screen.getByTestId('editor-element-element-1'));

    expect(screen.getByTestId('editor-text-value')).toBeInTheDocument();
    expect(screen.getByTestId('editor-layer-element-1')).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers no font outside the controlled registry', async () => {
    render();
    await screen.findByTestId('template-editor');
    await user.click(screen.getByTestId('editor-layer-element-1'));

    const select = screen.getByTestId('editor-font-id');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveValue('inter');
  });
});

describe('geometry feedback', () => {
  it('reports an out-of-bounds element without blocking the save', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeVersionedDetail(
          1,
          makeDocument([
            makeTextElement({
              transform: {
                x: 900,
                y: 900,
                width: 400,
                height: 200,
                rotationDeg: 0,
                scaleX: 1,
                scaleY: 1,
              },
            }),
          ]),
        ),
      ),
    );
    render();
    await screen.findByTestId('template-editor');
    await user.click(screen.getByTestId('editor-layer-element-1'));

    expect(await screen.findByTestId('editor-out-of-bounds')).toBeInTheDocument();

    // A draft may sit outside the area — `APP3-B04` owns the publication guard,
    // and refusing here would be a second, weaker definition of publishable.
    await user.type(screen.getByTestId('editor-text-value'), '!');
    await waitFor(() => {
      expect(screen.getByTestId('editor-save')).toBeEnabled();
    });
  });

  it('renders the stage as SVG and nothing else', async () => {
    render();
    await screen.findByTestId('template-editor');

    expect(screen.getByTestId('editor-stage-canvas').tagName.toLowerCase()).toBe('svg');
    expect(document.querySelector('canvas')).toBeNull();
  });
});

describe('the background object URL', () => {
  it('revokes the handle when the editor unmounts', async () => {
    const view = render();
    await screen.findByTestId('editor-stage-background');
    expect(objectUrls.created).toHaveLength(1);

    view.unmount();

    await waitFor(() => {
      expect(objectUrls.revoked).toEqual(objectUrls.created);
    });
  });
});

describe('responsive', () => {
  it('replaces the editor with a read-only notice on a small viewport', async () => {
    setViewport('mobile');
    render();

    expect(await screen.findByTestId('editor-mobile-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-stage-canvas')).toBeNull();
    expect(screen.queryByTestId('editor-save')).toBeNull();
  });

  it('issues no background request on a small viewport', async () => {
    setViewport('mobile');
    render();
    await screen.findByTestId('editor-mobile-notice');

    expect(backgroundMock).not.toHaveBeenCalled();
    expect(placementMock).not.toHaveBeenCalled();
  });
});

describe('accessibility', () => {
  it('announces the save state politely rather than by colour alone', async () => {
    render();
    const chip = await screen.findByTestId('editor-save-chip');

    expect(chip).toHaveAttribute('aria-live', 'polite');
    // The state is carried in text, so it survives a monochrome rendering.
    expect(chip.textContent?.trim()).not.toBe('');
  });

  it('labels every transform input with its unit', async () => {
    render();
    await screen.findByTestId('template-editor');
    await user.click(screen.getByTestId('editor-layer-element-1'));

    for (const label of [/X \(px\)/, /Y \(px\)/, /Chiều rộng \(px\)/, /Xoay \(độ\)/]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('does not trap focus in the stage', async () => {
    render();
    await screen.findByTestId('template-editor');

    const stage = screen.getByTestId('editor-stage-canvas');
    expect(stage).not.toHaveAttribute('tabindex');
    expect(stage.getAttribute('role')).toBe('group');
  });
});
