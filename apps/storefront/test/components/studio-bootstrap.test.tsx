/**
 * The Studio bootstrap screen — placement, Template list and B05A preview
 * (`APP3-S01`).
 *
 * These cover what a picker over three coupled server contracts gets wrong in
 * production: fetching Templates for a Product the server will not vouch for,
 * showing a Side's Templates after the visitor moved to another Side, reading a
 * detail per listed row, and leaving one Template's artwork on screen under
 * another Template's name.
 */
import {
  publicDesignTemplateAssetGet,
  publicDesignTemplateDetail,
  publicDesignTemplateList,
  publicProductPlacementGet,
} from '@embroidery/api-client';
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { StudioScreen } from '../../src/features/design-studio/components/studio-screen';
import { STUDIO_COPY } from '../../src/features/design-studio/model/studio-copy';
import {
  apiFailure,
  envelopeOf,
  makeArea,
  makeDocument,
  makePlacement,
  makeSide,
  makeTemplate,
  makeTemplateDetail,
  makeTemplatePage,
  PRODUCT_ID,
  PRODUCT_SLUG,
} from '../support/studio-fixture';

/**
 * Indexed access that fails loudly when the entry is absent.
 *
 * `noUncheckedIndexedAccess` is on, and an assertion made against a silently
 * `undefined` element would be asserting nothing at all.
 */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no entry at index ${String(index)}`);
  return item;
}

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductPlacementGet: jest.fn(),
  publicDesignTemplateList: jest.fn(),
  publicDesignTemplateDetail: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
}));

const placementMock = publicProductPlacementGet as jest.MockedFunction<
  typeof publicProductPlacementGet
>;
const listMock = publicDesignTemplateList as jest.MockedFunction<typeof publicDesignTemplateList>;
const detailMock = publicDesignTemplateDetail as jest.MockedFunction<
  typeof publicDesignTemplateDetail
>;
const assetMock = publicDesignTemplateAssetGet as jest.MockedFunction<
  typeof publicDesignTemplateAssetGet
>;

/** jsdom implements neither half of the object-URL API. */
const createdUrls: Blob[] = [];
const revokedUrls: string[] = [];

beforeAll(() => {
  URL.createObjectURL = jest.fn((blob: Blob) => {
    createdUrls.push(blob);
    return `blob:studio/${String(createdUrls.length)}`;
  });
  URL.revokeObjectURL = jest.fn((url: string) => {
    revokedUrls.push(url);
  });
});

beforeEach(() => {
  placementMock.mockReset();
  listMock.mockReset();
  detailMock.mockReset();
  assetMock.mockReset();
  createdUrls.length = 0;
  revokedUrls.length = 0;
});

function renderStudio() {
  return renderWithProviders(<StudioScreen productName="Gấu bông" productSlug={PRODUCT_SLUG} />);
}

const TWO_SIDES = makePlacement({
  sides: [
    makeSide({ id: 'side-1', areas: [makeArea({ id: 'area-1' })] }),
    makeSide({
      id: 'side-2',
      code: 'mat-sau',
      name: 'Mặt sau',
      displayOrder: 2,
      areas: [makeArea({ id: 'area-2', code: 'lung', name: 'Lưng' })],
    }),
  ],
});

describe('placement and Studio eligibility', () => {
  it('asks only the public placement manifest for Sides and Areas', async () => {
    placementMock.mockResolvedValue(envelopeOf(makePlacement()));
    listMock.mockResolvedValue(envelopeOf(makeTemplatePage([])));

    renderStudio();

    await waitFor(() => {
      expect(placementMock).toHaveBeenCalledWith(PRODUCT_SLUG, expect.anything());
    });
  });

  it('fetches no Template and opens no Session when studioEligible is false', async () => {
    placementMock.mockResolvedValue(envelopeOf(makePlacement({ studioEligible: false })));

    renderStudio();

    expect(await screen.findByText(STUDIO_COPY.ineligibleHeading)).toBeInTheDocument();
    expect(listMock).not.toHaveBeenCalled();
    // No Blank affordance either: a Session cannot be opened on a placement the
    // server will not vouch for, so offering one would be offering a refusal.
    expect(screen.queryByRole('button', { name: STUDIO_COPY.startBlank })).not.toBeInTheDocument();
  });

  it('states a single Side and Area instead of offering a choice of one', async () => {
    placementMock.mockResolvedValue(envelopeOf(makePlacement()));
    listMock.mockResolvedValue(envelopeOf(makeTemplatePage([])));

    renderStudio();

    expect(await screen.findByText(STUDIO_COPY.singleSideNote)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: STUDIO_COPY.sideLabel })).not.toBeInTheDocument();
  });

  it('offers a labelled native control when several Sides exist', async () => {
    placementMock.mockResolvedValue(envelopeOf(TWO_SIDES));
    listMock.mockResolvedValue(envelopeOf(makeTemplatePage([])));

    renderStudio();

    const select = await screen.findByRole('combobox', { name: STUDIO_COPY.sideLabel });
    expect(select).toHaveValue('side-1');
  });
});

describe('a first Side that carries no Embroidery Area (IMP-D041 PO-04)', () => {
  const EMPTY_FIRST = makePlacement({
    sides: [
      makeSide({ id: 'side-empty', code: 'a', name: 'Mặt trước', displayOrder: 1, areas: [] }),
      makeSide({
        id: 'side-real',
        code: 'b',
        name: 'Mặt sau',
        displayOrder: 2,
        areas: [makeArea({ id: 'area-9', code: 'lung', name: 'Lưng' })],
      }),
    ],
  });

  beforeEach(() => {
    placementMock.mockResolvedValue(envelopeOf(EMPTY_FIRST));
    listMock.mockResolvedValue(envelopeOf(makeTemplatePage([makeTemplate()])));
  });

  it('lands on the canonical first Side rather than the first usable one', async () => {
    renderStudio();

    const select = await screen.findByRole('combobox', { name: STUDIO_COPY.sideLabel });
    expect(select).toHaveValue('side-empty');
    expect(await screen.findByText(STUDIO_COPY.sideWithoutArea)).toBeInTheDocument();
  });

  it('requests no Template, no detail and no preview while no Area is selected', async () => {
    renderStudio();
    await screen.findByText(STUDIO_COPY.sideWithoutArea);

    expect(listMock).not.toHaveBeenCalled();
    expect(detailMock).not.toHaveBeenCalled();
    expect(assetMock).not.toHaveBeenCalled();
    expect(screen.queryByText(STUDIO_COPY.templateHeading)).not.toBeInTheDocument();
  });

  it('offers no Blank and no Clone bootstrap, so no Session can be created', async () => {
    renderStudio();
    await screen.findByText(STUDIO_COPY.sideWithoutArea);

    // Absent, not disabled: there is no affordance to press and no triple to
    // address a request with.
    expect(screen.queryByRole('button', { name: STUDIO_COPY.startBlank })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: STUDIO_COPY.startClone })).not.toBeInTheDocument();
  });

  it('does not declare the whole Product unavailable', async () => {
    renderStudio();
    await screen.findByText(STUDIO_COPY.sideWithoutArea);

    expect(screen.queryByText(STUDIO_COPY.ineligibleHeading)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: STUDIO_COPY.sideLabel })).toBeEnabled();
    // The "only one Area" sentence would be a claim the manifest never made.
    expect(screen.queryByText(STUDIO_COPY.singleAreaNote)).not.toBeInTheDocument();
  });

  it('auto-selects the Area and queries the exact triple once the customer moves', async () => {
    const user = createUser();
    renderStudio();
    await screen.findByText(STUDIO_COPY.sideWithoutArea);

    await user.selectOptions(
      screen.getByRole('combobox', { name: STUDIO_COPY.sideLabel }),
      'side-real',
    );

    await waitFor(() => {
      expect(listMock).toHaveBeenCalled();
    });
    const params = nth(listMock.mock.calls, 0)[0];
    expect(params.productSideId).toBe('side-real');
    expect(params.embroideryAreaId).toBe('area-9');
    expect(screen.getByRole('button', { name: STUDIO_COPY.startBlank })).toBeEnabled();
  });

  it('stays on the empty Side when the customer deliberately goes back to it', async () => {
    const user = createUser();
    renderStudio();
    const select = await screen.findByRole('combobox', { name: STUDIO_COPY.sideLabel });

    await user.selectOptions(select, 'side-real');
    await screen.findByRole('button', { name: STUDIO_COPY.startBlank });
    await user.selectOptions(select, 'side-empty');

    expect(await screen.findByText(STUDIO_COPY.sideWithoutArea)).toBeInTheDocument();
    // No auto-jump back to the usable Side.
    expect(select).toHaveValue('side-empty');
  });
});

describe('placement read failure', () => {
  it('reports a failed manifest read as retryable', async () => {
    placementMock.mockRejectedValue(apiFailure(503));

    renderStudio();

    expect(await screen.findByText(STUDIO_COPY.placementError)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STUDIO_COPY.retry })).toBeInTheDocument();
  });
});

describe('exact-triple Template compatibility', () => {
  it('sends all three ids and no fabricated pagination parameter', async () => {
    placementMock.mockResolvedValue(envelopeOf(makePlacement()));
    listMock.mockResolvedValue(envelopeOf(makeTemplatePage([makeTemplate()])));

    renderStudio();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalled();
    });
    const params = nth(listMock.mock.calls, 0)[0];
    expect(params.productId).toBe(PRODUCT_ID);
    expect(params.productSideId).toBe('side-1');
    expect(params.embroideryAreaId).toBe('area-1');
    for (const invented of ['offset', 'page', 'total', 'search', 'sort']) {
      expect(params).not.toHaveProperty(invented);
    }
  });

  it('re-queries under the new triple when the Side changes', async () => {
    const user = createUser();
    placementMock.mockResolvedValue(envelopeOf(TWO_SIDES));
    listMock.mockResolvedValue(envelopeOf(makeTemplatePage([makeTemplate()])));

    renderStudio();
    await screen.findByRole('combobox', { name: STUDIO_COPY.sideLabel });

    await user.selectOptions(
      screen.getByRole('combobox', { name: STUDIO_COPY.sideLabel }),
      'side-2',
    );

    await waitFor(() => {
      expect(listMock.mock.calls.length).toBeGreaterThan(1);
    });
    const latest = nth(listMock.mock.calls, listMock.mock.calls.length - 1)[0];
    expect(latest.productSideId).toBe('side-2');
    expect(latest.embroideryAreaId).toBe('area-2');
    // The cursor sequence restarts because the new triple addresses a different
    // query, not because anything reset a page counter.
    expect(latest.cursor).toBeUndefined();
  });

  it('cannot show a previous placement’s late response', async () => {
    const user = createUser();
    placementMock.mockResolvedValue(envelopeOf(TWO_SIDES));

    let releaseSideOne = (): void => undefined;
    listMock.mockImplementation((params) => {
      if (params.productSideId === 'side-1') {
        return new Promise((resolve) => {
          releaseSideOne = () => {
            resolve(envelopeOf(makeTemplatePage([makeTemplate({ slug: 'cu', name: 'Mẫu cũ' })])));
          };
        });
      }
      return Promise.resolve(
        envelopeOf(makeTemplatePage([makeTemplate({ slug: 'moi', name: 'Mẫu mới' })])),
      );
    });

    renderStudio();
    await screen.findByRole('combobox', { name: STUDIO_COPY.sideLabel });
    await user.selectOptions(
      screen.getByRole('combobox', { name: STUDIO_COPY.sideLabel }),
      'side-2',
    );
    expect(await screen.findByText('Mẫu mới')).toBeInTheDocument();

    // Side 1's request now lands. It is keyed to a query nothing renders.
    releaseSideOne();
    await waitFor(() => {
      expect(screen.getByText('Mẫu mới')).toBeInTheDocument();
    });
    expect(screen.queryByText('Mẫu cũ')).not.toBeInTheDocument();
  });

  it('keeps the explicit Blank path when the compatible list is empty', async () => {
    placementMock.mockResolvedValue(envelopeOf(makePlacement()));
    listMock.mockResolvedValue(envelopeOf(makeTemplatePage([])));

    renderStudio();

    expect(await screen.findByText(STUDIO_COPY.templateEmpty)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STUDIO_COPY.startBlank })).toBeEnabled();
    expect(screen.queryByRole('button', { name: STUDIO_COPY.startClone })).not.toBeInTheDocument();
  });

  it('continues with the opaque cursor and never restarts from the first page', async () => {
    const user = createUser();
    placementMock.mockResolvedValue(envelopeOf(makePlacement()));
    listMock
      .mockResolvedValueOnce(
        envelopeOf(makeTemplatePage([makeTemplate({ slug: 'a', name: 'Mẫu A' })], 'cur-1')),
      )
      .mockResolvedValueOnce(
        envelopeOf(makeTemplatePage([makeTemplate({ slug: 'b', name: 'Mẫu B' })])),
      );

    renderStudio();
    await screen.findByText('Mẫu A');

    await user.click(screen.getByRole('button', { name: STUDIO_COPY.templateMore }));

    expect(await screen.findByText('Mẫu B')).toBeInTheDocument();
    expect(nth(listMock.mock.calls, 1)[0].cursor).toBe('cur-1');
    expect(screen.getByText('Mẫu A')).toBeInTheDocument();
  });

  it('reads no detail for a listed row that was not selected', async () => {
    placementMock.mockResolvedValue(envelopeOf(makePlacement()));
    listMock.mockResolvedValue(
      envelopeOf(
        makeTemplatePage([
          makeTemplate({ slug: 'a', name: 'Mẫu A' }),
          makeTemplate({ slug: 'b', name: 'Mẫu B' }),
        ]),
      ),
    );

    renderStudio();
    await screen.findByText('Mẫu A');

    expect(detailMock).not.toHaveBeenCalled();
  });
});

describe('the B05A preview', () => {
  function seedSelectableTemplate() {
    placementMock.mockResolvedValue(envelopeOf(makePlacement()));
    listMock.mockResolvedValue(
      envelopeOf(
        makeTemplatePage([
          makeTemplate({ slug: 'hoa-sen', name: 'Hoa sen' }),
          makeTemplate({ slug: 'song-bien', name: 'Sóng biển' }),
        ]),
      ),
    );
  }

  it('fetches the asset by Template slug, published version and asset id', async () => {
    const user = createUser();
    seedSelectableTemplate();
    detailMock.mockResolvedValue(
      envelopeOf(makeTemplateDetail({ document: makeDocument(['asset-7']) })),
    );
    assetMock.mockResolvedValue(new Blob(['a']));

    renderStudio();
    await user.click(await screen.findByRole('button', { name: /Hoa sen/ }));

    await waitFor(() => {
      expect(assetMock).toHaveBeenCalledWith('hoa-sen', 2, 'asset-7', expect.anything());
    });
    // The address is contextual. No storage URL, bucket, key or presign is
    // involved, and there is no generic asset operation to reach instead.
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:studio/1');
  });

  it('revokes the object URL when another Template is chosen', async () => {
    const user = createUser();
    seedSelectableTemplate();
    detailMock.mockImplementation((slug) =>
      Promise.resolve(
        envelopeOf(
          makeTemplateDetail({
            slug: String(slug),
            name: String(slug),
            document: makeDocument([`asset-${String(slug)}`]),
          }),
        ),
      ),
    );
    assetMock.mockResolvedValue(new Blob(['a']));

    renderStudio();
    await user.click(await screen.findByRole('button', { name: /Hoa sen/ }));
    await screen.findByRole('img');

    await user.click(screen.getByRole('button', { name: /Sóng biển/ }));

    await waitFor(() => {
      expect(revokedUrls).toContain('blob:studio/1');
    });
    // The replacement is a different handle; the first one no longer exists.
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:studio/2');
  });

  it('revokes the object URL on unmount', async () => {
    const user = createUser();
    seedSelectableTemplate();
    detailMock.mockResolvedValue(envelopeOf(makeTemplateDetail()));
    assetMock.mockResolvedValue(new Blob(['a']));

    const view = renderStudio();
    await user.click(await screen.findByRole('button', { name: /Hoa sen/ }));
    await screen.findByRole('img');

    view.unmount();

    expect(revokedUrls).toContain('blob:studio/1');
  });

  it('shows a text-only Template as valid rather than broken', async () => {
    const user = createUser();
    seedSelectableTemplate();
    detailMock.mockResolvedValue(envelopeOf(makeTemplateDetail({ document: makeDocument([]) })));

    renderStudio();
    await user.click(await screen.findByRole('button', { name: /Hoa sen/ }));

    expect(await screen.findByText(STUDIO_COPY.previewTextOnly)).toBeInTheDocument();
    expect(assetMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: STUDIO_COPY.startClone })).toBeEnabled();
  });

  it('treats a 404 as bounded unavailability and never retries it', async () => {
    const user = createUser();
    seedSelectableTemplate();
    detailMock.mockResolvedValue(envelopeOf(makeTemplateDetail()));
    assetMock.mockRejectedValue(apiFailure(404));

    renderStudio();
    await user.click(await screen.findByRole('button', { name: /Hoa sen/ }));

    expect(await screen.findByText(STUDIO_COPY.previewUnavailable)).toBeInTheDocument();
    expect(assetMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: STUDIO_COPY.retry })).not.toBeInTheDocument();
  });

  it('treats a 503 as retryable', async () => {
    const user = createUser();
    seedSelectableTemplate();
    detailMock.mockResolvedValue(envelopeOf(makeTemplateDetail()));
    assetMock.mockRejectedValue(apiFailure(503));

    renderStudio();
    await user.click(await screen.findByRole('button', { name: /Hoa sen/ }));

    expect(await screen.findByText(STUDIO_COPY.previewRetryable)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STUDIO_COPY.retry })).toBeInTheDocument();
  });

  it('withdraws a selection whose Template disappeared between list and detail', async () => {
    const user = createUser();
    seedSelectableTemplate();
    detailMock.mockRejectedValue(apiFailure(404));

    renderStudio();
    await user.click(await screen.findByRole('button', { name: /Hoa sen/ }));

    expect(await screen.findByText(STUDIO_COPY.detailUnavailable)).toBeInTheDocument();
    // The choice authorises nothing further, and it is not silently converted
    // into a blank start: Blank stays a separate action the visitor must take.
    expect(screen.queryByRole('button', { name: STUDIO_COPY.startClone })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: STUDIO_COPY.startBlank })).toBeEnabled();
  });

  it('clears the preview when the Side changes', async () => {
    const user = createUser();
    placementMock.mockResolvedValue(envelopeOf(TWO_SIDES));
    listMock.mockResolvedValue(
      envelopeOf(makeTemplatePage([makeTemplate({ slug: 'hoa-sen', name: 'Hoa sen' })])),
    );
    detailMock.mockResolvedValue(envelopeOf(makeTemplateDetail()));
    assetMock.mockResolvedValue(new Blob(['a']));

    renderStudio();
    await user.click(await screen.findByRole('button', { name: /Hoa sen/ }));
    await screen.findByRole('img');

    await user.selectOptions(
      screen.getByRole('combobox', { name: STUDIO_COPY.sideLabel }),
      'side-2',
    );

    await waitFor(() => {
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
    expect(revokedUrls).toContain('blob:studio/1');
  });
});
