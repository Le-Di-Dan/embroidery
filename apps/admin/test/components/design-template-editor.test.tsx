/**
 * The editor's load and save journey (`APP3-A03`).
 *
 * The save assertions carry the weight. What the request body contains — and
 * what it must never contain — is not visible in a rendered DOM, and neither is
 * the absence of a second detail read after a successful save.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminDesignTemplateDetail,
  adminDesignTemplateSaveDocument,
  adminProductPlacementGet,
  adminProductSideBackgroundGet,
} from '@embroidery/api-client';

import { DesignTemplateEditorScreen } from '../../src/features/design-template-editor';
import { DESIGN_TEMPLATE_EDITOR_COPY } from '../../src/features/design-template-editor/model/design-template-editor-copy';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import {
  detailEnvelope,
  EDITOR_PRODUCT_ID,
  EDITOR_SIDE_ID,
  EDITOR_TEMPLATE_ID,
  makeDocument,
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

beforeEach(() => {
  jest.clearAllMocks();
  installObjectUrl('editor');
  user = createUser();
  detailMock.mockResolvedValue(detailEnvelope(makeUnversionedDetail()));
  placementMock.mockResolvedValue(placementEnvelope(makePlacement()));
  backgroundMock.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
  saveMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1)));
});

const render = () =>
  renderWithProviders(<DesignTemplateEditorScreen templateId={EDITOR_TEMPLATE_ID} />);

async function openEditor() {
  render();
  return screen.findByTestId('template-editor');
}

function lastSaveBody(): Record<string, unknown> {
  const call = saveMock.mock.calls[saveMock.mock.calls.length - 1] as unknown as [
    string,
    Record<string, unknown>,
  ];
  return call[1];
}

describe('loading the template', () => {
  it('consumes the detail operation for exactly this template', async () => {
    await openEditor();

    expect(detailMock).toHaveBeenCalled();
    expect(detailMock.mock.calls[0]?.[0]).toBe(EDITOR_TEMPLATE_ID);
  });

  it('reports a template that does not exist', async () => {
    detailMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'DESIGN_TEMPLATE_NOT_FOUND' }),
    );
    render();

    expect(await screen.findByTestId('editor-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-stage-canvas')).toBeNull();
  });

  it('offers a retry when the read fails for another reason', async () => {
    detailMock.mockRejectedValue(makeNetworkError());
    render();

    expect(await screen.findByTestId('editor-load-failed')).toBeInTheDocument();
    expect(screen.getByTestId('editor-load-failed-action')).toBeInTheDocument();
  });

  it('opens a never-saved template on an empty document with no version', async () => {
    await openEditor();

    expect(screen.getByTestId('editor-current-version')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.version.none,
    );
    expect(screen.getByTestId('editor-stage-empty')).toBeInTheDocument();
    expect(screen.getByTestId('editor-save-chip')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.save.chipSaved,
    );
  });

  it('shows the version the server reported, never a fabricated one', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(4)));
    await openEditor();

    expect(screen.getByTestId('editor-current-version')).toHaveTextContent('v4');
    expect(screen.getByTestId('editor-current-version')).not.toHaveTextContent('v5');
  });

  it('renders the exact elements the stored document carries', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeVersionedDetail(2, makeDocument([makeTextElement({ text: 'Từ máy chủ' })])),
      ),
    );
    await openEditor();

    expect(await screen.findByTestId('editor-element-element-1')).toHaveTextContent('Từ máy chủ');
  });

  it('draws the scoped Side background inside the SVG coordinate space', async () => {
    await openEditor();

    const background = await screen.findByTestId('editor-stage-background');
    expect(background.tagName.toLowerCase()).toBe('image');
    // The bytes came from the authorized Admin operation for this exact pair.
    expect(backgroundMock).toHaveBeenCalledWith(
      EDITOR_PRODUCT_ID,
      EDITOR_SIDE_ID,
      expect.anything(),
    );
  });

  it('draws the embroidery area and its safe boundary from placement truth', async () => {
    await openEditor();

    expect(screen.getByTestId('editor-stage-area')).toBeInTheDocument();
    expect(screen.getByTestId('editor-stage-safe-boundary')).toBeInTheDocument();
  });
});

describe('editing', () => {
  it('marks the draft unsaved after a text edit and enables the save', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1)));
    await openEditor();

    await user.click(screen.getByTestId('editor-layer-element-1'));
    await user.type(screen.getByTestId('editor-text-value'), 'x');

    await waitFor(() => {
      expect(screen.getByTestId('editor-save-chip')).toHaveTextContent(
        DESIGN_TEMPLATE_EDITOR_COPY.save.chipUnsaved,
      );
    });
    expect(screen.getByTestId('editor-save')).toBeEnabled();
  });

  it('keeps the save disabled while nothing has changed', async () => {
    await openEditor();
    expect(screen.getByTestId('editor-save')).toBeDisabled();
  });

  it('adds text into the document, selected and ready to edit', async () => {
    await openEditor();

    await user.click(screen.getByTestId('editor-add-text'));

    expect(await screen.findByTestId('editor-layer-list')).toBeInTheDocument();
    expect(screen.getByTestId('editor-text-value')).toBeInTheDocument();
  });
});

describe('saving', () => {
  async function editAndSave() {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1)));
    await openEditor();
    await user.click(screen.getByTestId('editor-layer-element-1'));
    await user.type(screen.getByTestId('editor-text-value'), '!');
    await waitFor(() => {
      expect(screen.getByTestId('editor-save')).toBeEnabled();
    });
    await user.click(screen.getByTestId('editor-save'));
    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
  }

  it('sends exactly the two members the contract declares', async () => {
    await editAndSave();

    const body = lastSaveBody();
    expect(Object.keys(body).sort()).toEqual(['document', 'expectedCurrentVersion']);
    expect(body['expectedCurrentVersion']).toBe(1);
  });

  it('sends no lifecycle, scope, slug or storage field', async () => {
    await editAndSave();

    const body = lastSaveBody();
    for (const forbidden of [
      'status',
      'scope',
      'productId',
      'productSideId',
      'embroideryAreaId',
      'slug',
      'publishedAt',
      'version',
      'documentSchemaVersion',
      'assetUrl',
      'bucket',
      'storageKey',
    ]) {
      expect(forbidden in body).toBe(false);
    }
  });

  it('sends 0 for a template that has never been saved', async () => {
    await openEditor();
    await user.click(screen.getByTestId('editor-add-text'));
    await waitFor(() => {
      expect(screen.getByTestId('editor-save')).toBeEnabled();
    });
    await user.click(screen.getByTestId('editor-save'));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
    expect(lastSaveBody()['expectedCurrentVersion']).toBe(0);
  });

  it('reports the version from the response and clears the draft', async () => {
    saveMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(2)));
    await editAndSave();

    await waitFor(() => {
      expect(screen.getByTestId('editor-current-version')).toHaveTextContent('v2');
    });
    expect(screen.getByTestId('editor-save-chip')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.save.chipSaved,
    );
    expect(screen.getByTestId('editor-save')).toBeDisabled();
  });

  it('issues no second detail read after a successful save', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1)));
    await openEditor();
    const readsBefore = detailMock.mock.calls.length;

    await user.click(screen.getByTestId('editor-layer-element-1'));
    await user.type(screen.getByTestId('editor-text-value'), '!');
    await waitFor(() => {
      expect(screen.getByTestId('editor-save')).toBeEnabled();
    });
    await user.click(screen.getByTestId('editor-save'));
    await waitFor(() => {
      expect(screen.getByTestId('editor-current-version')).toHaveTextContent('v1');
    });

    // The save response is a full detail view; asking again would be asking a
    // question already answered.
    expect(detailMock.mock.calls.length).toBe(readsBefore);
  });

  it('adopts the canonical document the server returned, not the one sent', async () => {
    saveMock.mockResolvedValue(
      detailEnvelope(
        makeVersionedDetail(2, makeDocument([makeTextElement({ text: 'Đã chuẩn hoá' })])),
      ),
    );
    await editAndSave();

    // Quantization moves values, so the returned document is authoritative and
    // the local copy is replaced by it rather than assumed equal.
    await waitFor(() => {
      expect(screen.getByTestId('editor-element-element-1')).toHaveTextContent('Đã chuẩn hoá');
    });
  });

  it('keeps the draft and says so when the save fails', async () => {
    saveMock.mockRejectedValue(makeNetworkError());
    await editAndSave();

    expect(await screen.findByTestId('editor-save-error')).toBeInTheDocument();
    expect(screen.getByTestId('editor-save-chip')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.save.chipUnsaved,
    );
    expect(screen.getByTestId('editor-save')).toBeEnabled();
  });

  it('never renders an internal message from a failed save', async () => {
    saveMock.mockRejectedValue(
      makeApiClientError({
        status: 500,
        code: 'INTERNAL',
        message:
          'relation "design_template_versions" violates constraint bucket=embroidery-private',
      }),
    );
    await editAndSave();

    await screen.findByTestId('editor-save-error');
    expect(document.body.textContent).not.toContain('design_template_versions');
    expect(document.body.textContent).not.toContain('embroidery-private');
  });
});
