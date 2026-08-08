/**
 * The save path and the conflict it can produce.
 *
 * Every failure case asserts the operator's edits survive, because that is the
 * property each failure actually threatens. The conflict cases additionally
 * assert what does *not* happen: no second attempt, no silent overwrite, and no
 * automatic discard of the local tree.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminProductDetail,
  adminProductPlacementGet,
  adminProductPlacementReplace,
} from '@embroidery/api-client';

import { ProductPlacementScreen } from '../../src/features/product-placement';
import { PLACEMENT_COPY } from '../../src/features/product-placement/model/placement-copy';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import { makeProductDetail, productDetailEnvelope } from '../support/product-fixture';
import {
  makePlacement,
  placementEnvelope,
  setViewportWidth,
  PLACEMENT_PRODUCT_ID,
  PLACEMENT_TOKEN,
} from '../support/placement-fixture';

jest.mock(
  'next/navigation',
  () => mockCreateNavigationMock('/products/01920000-0000-7000-8000-000000000001/placement').module,
);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductPlacementGet: jest.fn(),
  adminProductPlacementReplace: jest.fn(),
  adminProductDetail: jest.fn(),
  adminAssetList: jest.fn(),
}));

const getMock = adminProductPlacementGet as jest.MockedFunction<typeof adminProductPlacementGet>;
const replaceMock = adminProductPlacementReplace as jest.MockedFunction<
  typeof adminProductPlacementReplace
>;
const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;

const NEXT_TOKEN = '2026-08-01T11:00:00.000Z';
const EDITED_NAME = 'Mặt trước (đã sửa)';

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  setViewportWidth(1440);
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
  getMock.mockResolvedValue(placementEnvelope(makePlacement()));
});

/** Renders, selects the front side and renames it, leaving the draft dirty. */
async function renderAndEdit() {
  renderWithProviders(<ProductPlacementScreen productId={PLACEMENT_PRODUCT_ID} />);
  await user.click(await screen.findByText('Mặt trước'));

  const name = screen.getByLabelText(PLACEMENT_COPY.fields.name);
  await user.clear(name);
  await user.type(name, EDITED_NAME);
  return name;
}

function saveButton() {
  return screen.getByTestId('placement-save');
}

describe('successful save', () => {
  it('sends the generated replacement shape with the current token', async () => {
    replaceMock.mockResolvedValue(placementEnvelope(makePlacement({ updatedAt: NEXT_TOKEN })));

    await renderAndEdit();
    await user.click(saveButton());

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1);
    });
    const [productId, body] = replaceMock.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(productId).toBe(PLACEMENT_PRODUCT_ID);
    expect(body['expectedUpdatedAt']).toBe(PLACEMENT_TOKEN);
    expect(Array.isArray(body['sides'])).toBe(true);
  });

  it('adopts the returned server truth without a second read', async () => {
    replaceMock.mockResolvedValue(placementEnvelope(makePlacement({ updatedAt: NEXT_TOKEN })));

    await renderAndEdit();
    const readsBefore = getMock.mock.calls.length;
    await user.click(saveButton());

    await waitFor(() => {
      expect(screen.getByText(PLACEMENT_COPY.save.saved)).toBeInTheDocument();
    });
    // The replace answer is canonical; refetching would race the next token.
    expect(getMock.mock.calls.length).toBe(readsBefore);
  });

  it('clears dirty state and re-seeds from the fresh token', async () => {
    replaceMock.mockResolvedValue(placementEnvelope(makePlacement({ updatedAt: NEXT_TOKEN })));

    await renderAndEdit();
    await user.click(saveButton());

    await waitFor(() => {
      expect(screen.getByText(PLACEMENT_COPY.save.saved)).toBeInTheDocument();
    });
    expect(saveButton()).toBeDisabled();

    // A second edit must now carry the *new* token, not the one just consumed.
    await user.click(screen.getByText('Mặt trước'));
    const name = screen.getByLabelText(PLACEMENT_COPY.fields.name);
    await user.clear(name);
    await user.type(name, 'Lần hai');
    await user.click(saveButton());

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(2);
    });
    const [, second] = replaceMock.mock.calls[1] as unknown as [string, Record<string, unknown>];
    expect(second['expectedUpdatedAt']).toBe(NEXT_TOKEN);
  });
});

describe('version conflict', () => {
  const conflict = () => makeApiClientError({ status: 409, code: 'PLACEMENT_VERSION_CONFLICT' });

  it('does not retry and does not overwrite', async () => {
    replaceMock.mockRejectedValue(conflict());

    await renderAndEdit();
    await user.click(saveButton());

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
    // Exactly one attempt: a blind retry would re-send the same stale token.
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it('preserves the local draft', async () => {
    replaceMock.mockRejectedValue(conflict());

    await renderAndEdit();
    await user.click(saveButton());

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
    expect(screen.getByLabelText(PLACEMENT_COPY.fields.name)).toHaveValue(EDITED_NAME);
  });

  it('says plainly that the server was not overwritten', async () => {
    replaceMock.mockRejectedValue(conflict());

    await renderAndEdit();
    await user.click(saveButton());

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(PLACEMENT_COPY.conflict.body);
    expect(dialog).toHaveTextContent(PLACEMENT_COPY.conflict.keepNote);
  });

  it('reload fetches a fresh snapshot and adopts its token', async () => {
    replaceMock.mockRejectedValue(conflict());
    await renderAndEdit();
    await user.click(saveButton());
    await screen.findByRole('alertdialog');

    getMock.mockResolvedValue(placementEnvelope(makePlacement({ updatedAt: NEXT_TOKEN })));
    await user.click(screen.getByTestId('placement-conflict-reload'));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    // The reload replaced the baseline, so the edit is gone and the screen is clean.
    expect(screen.queryByText(EDITED_NAME)).toBeNull();
    expect(saveButton()).toBeDisabled();
  });

  it('keeping the draft closes the dialog but not the conflict', async () => {
    replaceMock.mockRejectedValue(conflict());

    await renderAndEdit();
    await user.click(saveButton());
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: PLACEMENT_COPY.conflict.keep }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    // The token is still stale, so saving again could only fail the same way.
    expect(screen.getByText(PLACEMENT_COPY.conflict.banner)).toBeInTheDocument();
    expect(screen.getByLabelText(PLACEMENT_COPY.fields.name)).toHaveValue(EDITED_NAME);
    expect(saveButton()).toBeDisabled();
  });

  it('does not open the conflict dialog for a different 409', async () => {
    replaceMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PLACEMENT_REFERENCED_IMMUTABLE' }),
    );

    await renderAndEdit();
    await user.click(saveButton());

    await waitFor(() => {
      expect(screen.getByText(PLACEMENT_COPY.failure.immutableTitle)).toBeInTheDocument();
    });
    // Reloading would discard the edits and fix nothing.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByLabelText(PLACEMENT_COPY.fields.name)).toHaveValue(EDITED_NAME);
  });
});

describe('other save failures', () => {
  it('preserves the draft on a network failure', async () => {
    replaceMock.mockRejectedValue(makeNetworkError());

    await renderAndEdit();
    await user.click(saveButton());

    await waitFor(() => {
      expect(screen.getByText(PLACEMENT_COPY.failure.genericTitle)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(PLACEMENT_COPY.fields.name)).toHaveValue(EDITED_NAME);
    // Still dirty, so the operator can simply try again.
    expect(saveButton()).toBeEnabled();
  });

  it('maps a server geometry refusal to safe copy', async () => {
    replaceMock.mockRejectedValue(
      makeApiClientError({ status: 400, code: 'PLACEMENT_AREA_OUTSIDE_CANVAS' }),
    );

    await renderAndEdit();
    await user.click(saveButton());

    expect(await screen.findByText(PLACEMENT_COPY.failure.geometryTitle)).toBeInTheDocument();
  });

  it('maps an ineligible background to safe copy', async () => {
    replaceMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PLACEMENT_BACKGROUND_NOT_ELIGIBLE' }),
    );

    await renderAndEdit();
    await user.click(saveButton());

    expect(await screen.findByText(PLACEMENT_COPY.failure.backgroundTitle)).toBeInTheDocument();
  });

  it('never renders the server message, code or request id', async () => {
    replaceMock.mockRejectedValue(
      makeApiClientError({
        status: 400,
        code: 'PLACEMENT_GEOMETRY_INVALID',
        message: 'relation "embroidery_areas" violates check constraint CST_126',
      }),
    );

    await renderAndEdit();
    await user.click(saveButton());

    await screen.findByText(PLACEMENT_COPY.failure.geometryTitle);
    expect(document.body.textContent).not.toContain('embroidery_areas');
    expect(document.body.textContent).not.toContain('CST_126');
    expect(document.body.textContent).not.toContain('req-test-0001');
  });
});
