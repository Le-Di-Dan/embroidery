/**
 * The one-time initial scope assignment (`APP3-A03-C1`).
 *
 * This is the correction human review required: `APP3-A02` creates an unscoped
 * `DRAFT`, `APP3-P01` requires a placement snapshot in every Design Document, so
 * without a scope the editor had nothing to author on and no way to acquire one.
 *
 * The cases worth reading twice are the ones about *invalidation*. A Product
 * change that leaves a stale Side behind, or a Side change that leaves a stale
 * Area, would submit a triple whose parts come from different parents — the
 * partial scope `IMP-D042` PO-06 calls wrong rather than incomplete. And the
 * transition after success is asserted as an **absence**: no second detail read,
 * because the assignment response is already a full detail view.
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
  adminDesignTemplateAssignScope,
  adminDesignTemplateDetail,
  adminDesignTemplateSaveDocument,
  adminProductList,
  adminProductPlacementGet,
  adminProductSideBackgroundGet,
} from '@embroidery/api-client';

import { DesignTemplateEditorScreen } from '../../src/features/design-template-editor';
import { DESIGN_TEMPLATE_EDITOR_COPY } from '../../src/features/design-template-editor/model/design-template-editor-copy';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import { makeProduct, makeProductPage, productEnvelope } from '../support/product-fixture';
import {
  detailEnvelope,
  EDITOR_AREA_ID,
  EDITOR_PRODUCT_ID,
  EDITOR_SIDE_ID,
  EDITOR_TEMPLATE_ID,
  makePlacement,
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
  adminDesignTemplateAssignScope: jest.fn(),
  adminProductList: jest.fn(),
  adminProductPlacementGet: jest.fn(),
  adminProductSideBackgroundGet: jest.fn(),
}));

const detailMock = adminDesignTemplateDetail as jest.MockedFunction<
  typeof adminDesignTemplateDetail
>;
const assignMock = adminDesignTemplateAssignScope as jest.MockedFunction<
  typeof adminDesignTemplateAssignScope
>;
const saveMock = adminDesignTemplateSaveDocument as jest.MockedFunction<
  typeof adminDesignTemplateSaveDocument
>;
const productsMock = adminProductList as jest.MockedFunction<typeof adminProductList>;
const placementMock = adminProductPlacementGet as jest.MockedFunction<
  typeof adminProductPlacementGet
>;
const backgroundMock = adminProductSideBackgroundGet as jest.MockedFunction<
  typeof adminProductSideBackgroundGet
>;

let user: ReturnType<typeof createUser>;

const OTHER_SIDE_ID = '01920000-0000-7000-8000-0000000000a9';
const OTHER_AREA_ID = '01920000-0000-7000-8000-0000000000b9';

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

/** The seeded Product Side, plus a second live Side and a retired pair. */
function richPlacement() {
  const base = makePlacement();
  const [front] = base.sides;
  return makePlacement({
    sides: [
      {
        ...front,
        areas: [
          ...(front?.areas ?? []),
          {
            ...(front?.areas[0] ?? {}),
            id: OTHER_AREA_ID,
            code: 'retired',
            name: 'Vùng đã ngừng',
            retiredAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      },
      {
        ...front,
        id: OTHER_SIDE_ID,
        code: 'back',
        name: 'Mặt sau',
        areas: [
          { ...(front?.areas[0] ?? {}), id: OTHER_AREA_ID, code: 'back-centre', name: 'Giữa lưng' },
        ],
      },
      {
        ...front,
        id: 'retired-side',
        code: 'gone',
        name: 'Mặt đã ngừng',
        retiredAt: '2026-08-01T00:00:00.000Z',
        areas: [],
      },
    ],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  installObjectUrl('assign');
  setViewport('desktop');
  user = createUser();
  detailMock.mockResolvedValue(detailEnvelope(makeUnversionedDetail({ scope: undefined })));
  productsMock.mockResolvedValue(
    productEnvelope(
      makeProductPage([makeProduct({ productId: EDITOR_PRODUCT_ID, name: 'Áo thun thêu' })]),
    ),
  );
  placementMock.mockResolvedValue(placementEnvelope(richPlacement()));
  backgroundMock.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
  assignMock.mockResolvedValue(detailEnvelope(makeUnversionedDetail()));
  saveMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1)));
});

const render = () =>
  renderWithProviders(<DesignTemplateEditorScreen templateId={EDITOR_TEMPLATE_ID} />);

/** Opens the selector and drives it to a complete triple. */
async function selectCompleteTriple() {
  render();
  await screen.findByTestId('editor-scope-assign');
  await user.selectOptions(await screen.findByTestId('editor-scope-product'), EDITOR_PRODUCT_ID);
  await user.selectOptions(await screen.findByTestId('editor-scope-side'), EDITOR_SIDE_ID);
  await user.selectOptions(await screen.findByTestId('editor-scope-area'), EDITOR_AREA_ID);
}

// ---------------------------------------------------------------------------
describe('when the selector is offered', () => {
  it('shows it for an unscoped zero-version DRAFT', async () => {
    render();
    expect(await screen.findByTestId('editor-scope-assign')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-stage-canvas')).toBeNull();
  });

  it('does not show it for an already scoped Template', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeUnversionedDetail()));
    render();

    await screen.findByTestId('template-editor');
    expect(screen.queryByTestId('editor-scope-assign')).toBeNull();
  });

  it('does not show it for a versioned Template', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1)));
    render();

    await screen.findByTestId('template-editor');
    expect(screen.queryByTestId('editor-scope-assign')).toBeNull();
  });

  for (const status of ['PUBLISHED', 'ARCHIVED'] as const) {
    it(`does not show it for a ${status} Template, scoped or not`, async () => {
      detailMock.mockResolvedValue(
        detailEnvelope(makeUnversionedDetail({ scope: undefined, status })),
      );
      render();

      // Unscoped and no longer assignable: the bounded reason, not the selector.
      expect(await screen.findByTestId('editor-unscoped')).toBeInTheDocument();
      expect(screen.queryByTestId('editor-scope-assign')).toBeNull();
    });
  }

  it('does not mount it on a small viewport, and fetches no editing context', async () => {
    setViewport('mobile');
    render();

    expect(await screen.findByTestId('editor-mobile-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-scope-assign')).toBeNull();
    expect(productsMock).not.toHaveBeenCalled();
    expect(placementMock).not.toHaveBeenCalled();
    expect(backgroundMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('selecting the triple', () => {
  it('lists Products through the accepted Admin Product operation', async () => {
    render();
    await screen.findByTestId('editor-scope-assign');

    await waitFor(() => {
      expect(productsMock).toHaveBeenCalled();
    });
    expect(
      within(await screen.findByTestId('editor-scope-product')).getByText('Áo thun thêu'),
    ).toBeInTheDocument();
  });

  it('loads the Product placement only once a Product is chosen', async () => {
    render();
    await screen.findByTestId('editor-scope-assign');
    expect(placementMock).not.toHaveBeenCalled();

    await user.selectOptions(await screen.findByTestId('editor-scope-product'), EDITOR_PRODUCT_ID);

    await waitFor(() => {
      expect(placementMock).toHaveBeenCalledWith(EDITOR_PRODUCT_ID, expect.anything());
    });
  });

  it('offers no retired Side and no retired Area', async () => {
    render();
    await screen.findByTestId('editor-scope-assign');
    await user.selectOptions(await screen.findByTestId('editor-scope-product'), EDITOR_PRODUCT_ID);

    const sides = await screen.findByTestId('editor-scope-side');
    expect(within(sides).queryByText('Mặt đã ngừng')).toBeNull();

    await user.selectOptions(sides, EDITOR_SIDE_ID);
    const areas = await screen.findByTestId('editor-scope-area');
    expect(within(areas).queryByText('Vùng đã ngừng')).toBeNull();
  });

  it('offers only Areas belonging to the chosen Side', async () => {
    render();
    await screen.findByTestId('editor-scope-assign');
    await user.selectOptions(await screen.findByTestId('editor-scope-product'), EDITOR_PRODUCT_ID);
    await user.selectOptions(await screen.findByTestId('editor-scope-side'), OTHER_SIDE_ID);

    const areas = await screen.findByTestId('editor-scope-area');
    expect(within(areas).getByText('Giữa lưng')).toBeInTheDocument();
    expect(within(areas).queryByText('Ngực trái')).toBeNull();
  });

  it('clears the Side and the Area when the Product changes', async () => {
    await selectCompleteTriple();
    expect(screen.getByTestId('editor-scope-submit')).toBeEnabled();

    await user.selectOptions(await screen.findByTestId('editor-scope-product'), '');

    // Both dependents are gone, so no stale pair can be submitted.
    expect(screen.queryByTestId('editor-scope-side')).toBeNull();
    expect(screen.queryByTestId('editor-scope-area')).toBeNull();
    expect(screen.getByTestId('editor-scope-submit')).toBeDisabled();
  });

  it('clears the Area when the Side changes', async () => {
    await selectCompleteTriple();

    await user.selectOptions(screen.getByTestId('editor-scope-side'), OTHER_SIDE_ID);

    expect(screen.getByTestId('editor-scope-area')).toHaveValue('');
    expect(screen.getByTestId('editor-scope-submit')).toBeDisabled();
  });

  it('keeps confirm disabled until all three are chosen, and says why', async () => {
    render();
    await screen.findByTestId('editor-scope-assign');
    const submit = screen.getByTestId('editor-scope-submit');
    expect(submit).toBeDisabled();
    expect(screen.getByText(DESIGN_TEMPLATE_EDITOR_COPY.assign.incomplete)).toBeInTheDocument();

    await user.selectOptions(await screen.findByTestId('editor-scope-product'), EDITOR_PRODUCT_ID);
    expect(submit).toBeDisabled();

    await user.selectOptions(await screen.findByTestId('editor-scope-side'), EDITOR_SIDE_ID);
    expect(submit).toBeDisabled();

    await user.selectOptions(await screen.findByTestId('editor-scope-area'), EDITOR_AREA_ID);
    expect(submit).toBeEnabled();
  });

  it('never submits a partial scope', async () => {
    render();
    await screen.findByTestId('editor-scope-assign');
    await user.selectOptions(await screen.findByTestId('editor-scope-product'), EDITOR_PRODUCT_ID);

    await user.click(screen.getByTestId('editor-scope-submit'));

    expect(assignMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('assigning', () => {
  function assignBody(): Record<string, unknown> {
    const call = assignMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    return call[1];
  }

  it('sends exactly the three ids', async () => {
    await selectCompleteTriple();
    await user.click(screen.getByTestId('editor-scope-submit'));

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledTimes(1);
    });
    expect(assignMock.mock.calls[0]?.[0]).toBe(EDITOR_TEMPLATE_ID);
    expect(assignBody()).toEqual({
      productId: EDITOR_PRODUCT_ID,
      productSideId: EDITOR_SIDE_ID,
      embroideryAreaId: EDITOR_AREA_ID,
    });
  });

  it('sends no document, version, status or name field', async () => {
    await selectCompleteTriple();
    await user.click(screen.getByTestId('editor-scope-submit'));
    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledTimes(1);
    });

    for (const forbidden of [
      'document',
      'version',
      'currentVersion',
      'expectedCurrentVersion',
      'status',
      'slug',
      'name',
      'description',
    ]) {
      expect(forbidden in assignBody()).toBe(false);
    }
  });

  it('reports the assigning state', async () => {
    let release: (value: unknown) => void = () => undefined;
    assignMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    await selectCompleteTriple();
    await user.click(screen.getByTestId('editor-scope-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('editor-scope-submit')).toHaveAttribute('aria-busy', 'true');
    });
    release(detailEnvelope(makeUnversionedDetail()));
  });

  it('keeps the selection when a retryable failure happens', async () => {
    assignMock.mockRejectedValue(makeNetworkError());
    await selectCompleteTriple();
    await user.click(screen.getByTestId('editor-scope-submit'));

    expect(await screen.findByTestId('editor-scope-error')).toBeInTheDocument();
    expect(await screen.findByTestId('editor-scope-product')).toHaveValue(EDITOR_PRODUCT_ID);
    expect(screen.getByTestId('editor-scope-side')).toHaveValue(EDITOR_SIDE_ID);
    expect(screen.getByTestId('editor-scope-area')).toHaveValue(EDITOR_AREA_ID);
    expect(screen.getByTestId('editor-scope-submit')).toBeEnabled();
  });

  it('reports an invalid triple without blaming the operator for a server rule', async () => {
    assignMock.mockRejectedValue(makeApiClientError({ status: 400, code: 'BAD_REQUEST' }));
    await selectCompleteTriple();
    await user.click(screen.getByTestId('editor-scope-submit'));

    expect(await screen.findByTestId('editor-scope-error')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.assign.invalidTitle,
    );
  });
});

// ---------------------------------------------------------------------------
describe('the transition into the editor', () => {
  it('enters the editor in place, with no navigation and no second detail read', async () => {
    await selectCompleteTriple();
    const readsBefore = detailMock.mock.calls.length;

    await user.click(screen.getByTestId('editor-scope-submit'));

    // The assignment response is a full detail view; the cache is written from
    // it, so the editor simply appears.
    expect(await screen.findByTestId('template-editor')).toBeInTheDocument();
    expect(screen.getByTestId('editor-stage-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-scope-assign')).toBeNull();
    expect(detailMock.mock.calls.length).toBe(readsBefore);
  });

  it('opens on the canonical empty document at version zero', async () => {
    await selectCompleteTriple();
    await user.click(screen.getByTestId('editor-scope-submit'));
    await screen.findByTestId('template-editor');

    expect(screen.getByTestId('editor-current-version')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.version.none,
    );
    expect(screen.getByTestId('editor-stage-empty')).toBeInTheDocument();
    expect(screen.getByTestId('editor-save')).toBeDisabled();
  });

  it('builds the stage from the scope the server returned', async () => {
    await selectCompleteTriple();
    await user.click(screen.getByTestId('editor-scope-submit'));
    await screen.findByTestId('template-editor');

    // The area rectangle and the safe boundary come from the assigned Side.
    expect(screen.getByTestId('editor-stage-area')).toBeInTheDocument();
    const panel = screen.getByTestId('editor-scope');
    expect(within(panel).getByText(/Mặt trước/)).toBeInTheDocument();
  });

  it('fetches the Side background only after the scope exists', async () => {
    render();
    await screen.findByTestId('editor-scope-assign');
    await user.selectOptions(await screen.findByTestId('editor-scope-product'), EDITOR_PRODUCT_ID);
    await user.selectOptions(await screen.findByTestId('editor-scope-side'), EDITOR_SIDE_ID);
    await user.selectOptions(await screen.findByTestId('editor-scope-area'), EDITOR_AREA_ID);

    // Browsing choices must not stream protected media.
    expect(backgroundMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('editor-scope-submit'));
    await screen.findByTestId('template-editor');

    await waitFor(() => {
      expect(backgroundMock).toHaveBeenCalledWith(
        EDITOR_PRODUCT_ID,
        EDITOR_SIDE_ID,
        expect.anything(),
      );
    });
  });

  it('saves the first version through the existing flow at expectedCurrentVersion 0', async () => {
    await selectCompleteTriple();
    await user.click(screen.getByTestId('editor-scope-submit'));
    await screen.findByTestId('template-editor');

    await user.click(screen.getByTestId('editor-add-text'));
    await waitFor(() => {
      expect(screen.getByTestId('editor-save')).toBeEnabled();
    });
    await user.click(screen.getByTestId('editor-save'));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
    const body = saveMock.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
    expect(body['expectedCurrentVersion']).toBe(0);
    await waitFor(() => {
      expect(screen.getByTestId('editor-current-version')).toHaveTextContent('v1');
    });
  });

  it('offers no way to change or clear the scope afterwards', async () => {
    await selectCompleteTriple();
    await user.click(screen.getByTestId('editor-scope-submit'));
    await screen.findByTestId('template-editor');

    const panel = screen.getByTestId('editor-scope');
    expect(within(panel).queryByRole('button')).toBeNull();
    expect(within(panel).queryByRole('combobox')).toBeNull();
    for (const label of [/đổi phạm vi/i, /xoá phạm vi/i, /gán lại/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
describe('losing the race', () => {
  it('never retries, and accepts the winner scope', async () => {
    assignMock.mockRejectedValue(makeApiClientError({ status: 409, code: 'CONFLICT' }));
    await selectCompleteTriple();
    // The winner bound a *different* Side; the re-read is what reveals it.
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeUnversionedDetail({
          scope: {
            productId: EDITOR_PRODUCT_ID,
            productSideId: OTHER_SIDE_ID,
            embroideryAreaId: OTHER_AREA_ID,
          },
        }),
      ),
    );

    await user.click(screen.getByTestId('editor-scope-submit'));

    expect(await screen.findByTestId('template-editor')).toBeInTheDocument();
    // One attempt. A retry would send the same triple and earn the same refusal.
    expect(assignMock).toHaveBeenCalledTimes(1);
    const panel = screen.getByTestId('editor-scope');
    expect(within(panel).getByText(/Mặt sau/)).toBeInTheDocument();
  });

  it('re-reads exactly once and reports a Template that stopped being assignable', async () => {
    assignMock.mockRejectedValue(makeApiClientError({ status: 409, code: 'CONFLICT' }));
    await selectCompleteTriple();
    const readsBefore = detailMock.mock.calls.length;
    detailMock.mockResolvedValue(detailEnvelope(makeUnversionedDetail({ scope: undefined })));

    await user.click(screen.getByTestId('editor-scope-submit'));

    expect(await screen.findByTestId('editor-scope-error')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.assign.notAssignableTitle,
    );
    expect(detailMock.mock.calls.length).toBe(readsBefore + 1);
    expect(assignMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
describe('accessibility and layout', () => {
  it('labels every control', async () => {
    render();
    await screen.findByTestId('editor-scope-assign');
    await user.selectOptions(await screen.findByTestId('editor-scope-product'), EDITOR_PRODUCT_ID);
    await user.selectOptions(await screen.findByTestId('editor-scope-side'), EDITOR_SIDE_ID);

    for (const label of [
      DESIGN_TEMPLATE_EDITOR_COPY.assign.productLabel,
      DESIGN_TEMPLATE_EDITOR_COPY.assign.sideLabel,
      DESIGN_TEMPLATE_EDITOR_COPY.assign.areaLabel,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('ties the disabled confirm to its stated reason', async () => {
    render();
    await screen.findByTestId('editor-scope-assign');

    const submit = screen.getByTestId('editor-scope-submit');
    const describedBy = submit.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.assign.incomplete,
    );
  });

  it('announces a failed Product load and offers a retry', async () => {
    productsMock.mockRejectedValue(makeNetworkError());
    render();

    const notice = await screen.findByTestId('editor-scope-products-failed');
    expect(notice).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('editor-scope-products-failed-action')).toBeInTheDocument();
  });

  it('states why a Side list is empty rather than showing an empty control', async () => {
    placementMock.mockResolvedValue(placementEnvelope(makePlacement({ sides: [] })));
    render();
    await screen.findByTestId('editor-scope-assign');
    await user.selectOptions(await screen.findByTestId('editor-scope-product'), EDITOR_PRODUCT_ID);

    expect(await screen.findByTestId('editor-scope-side-empty')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.assign.sideEmpty,
    );
  });
});
