/**
 * The editor's media section, its two pickers, and optimistic concurrency
 * (`APP11-A02`; `870:926`).
 *
 * The assertions that matter are about truthfulness, because each is a sentence
 * the operator would act on:
 *
 *  - each picker names its asset lane explicitly, so an unattachable image is
 *    never offered where an attachable one was meant;
 *  - a save sends the **whole** ordered selection, position 0 first, and never
 *    a per-image mutation;
 *  - an arrangement survives a refused save, so a retry is one click and not a
 *    rebuild;
 *  - preparation cannot choose a lane, a status or a storage fact, and its
 *    result is a new asset;
 *  - a stale source is reported with the approved sentence and never replayed;
 *  - a stale guarded write opens the reload dialog and discards nothing;
 *  - there is no alt input and no deletion control anywhere.
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
  adminAssetList,
  adminGalleryAssetCreate,
  adminGalleryAssetPreview,
  adminGalleryEntryDetail,
  adminGalleryEntryReplaceAssets,
} from '@embroidery/api-client';

import { GalleryEditorScreen } from '../../src/features/gallery-editor';
import { GALLERY_EDITOR_COPY } from '../../src/features/gallery-editor/model/gallery-editor-copy';
import { GALLERY_MEDIA_COPY } from '../../src/features/gallery-editor/model/gallery-media-copy';
import { makeApiClientError } from '../support/api-error';
import { installObjectUrl } from '../support/object-url';
import {
  CATALOG_ASSET_ID,
  EDITOR_ENTRY_ID,
  GALLERY_ASSET_ID,
  GALLERY_ASSET_ID_2,
  GALLERY_ASSET_ID_3,
  SOURCE_UPDATED_AT,
  UPDATED_AT,
  UPDATED_AT_NEXT,
  envelope,
  makeAsset,
  makeAssetPage,
  makeDetail,
  makePreparedAsset,
  makeSourceAsset,
  withAssets,
} from '../support/gallery-editor-fixture';

const mockNav = mockCreateNavigationMock(`/gallery/${EDITOR_ENTRY_ID}`);
jest.mock('next/navigation', () => ({
  useRouter: () => mockNav.router,
  usePathname: () => mockNav.module.usePathname(),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminGalleryEntryDetail: jest.fn(),
  adminGalleryEntryReplaceAssets: jest.fn(),
  adminGalleryAssetPreview: jest.fn(),
  adminGalleryAssetCreate: jest.fn(),
  adminAssetList: jest.fn(),
}));

const detailMock = adminGalleryEntryDetail as jest.MockedFunction<typeof adminGalleryEntryDetail>;
const replaceMock = adminGalleryEntryReplaceAssets as jest.MockedFunction<
  typeof adminGalleryEntryReplaceAssets
>;
const previewMock = adminGalleryAssetPreview as jest.MockedFunction<
  typeof adminGalleryAssetPreview
>;
const prepareMock = adminGalleryAssetCreate as jest.MockedFunction<typeof adminGalleryAssetCreate>;
const assetListMock = adminAssetList as jest.MockedFunction<typeof adminAssetList>;

installObjectUrl('gallery-media');

/** Answers each lane with its own rows, so a wrong scope is visible on screen. */
function laneAwareAssetList() {
  assetListMock.mockImplementation((params) => {
    const scope = (params as { scope?: string } | undefined)?.scope;
    if (scope === 'GALLERY') {
      return Promise.resolve(
        envelope(
          makeAssetPage([
            makeAsset(),
            makeAsset({ assetId: GALLERY_ASSET_ID_2 }),
            makeAsset({ assetId: GALLERY_ASSET_ID_3 }),
          ]),
        ),
      );
    }
    if (scope === 'CATALOG') {
      return Promise.resolve(envelope(makeAssetPage([makeSourceAsset()])));
    }
    // An unscoped read is a defect this suite must be able to see.
    return Promise.resolve(envelope(makeAssetPage([])));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  detailMock.mockResolvedValue(envelope(withAssets([GALLERY_ASSET_ID, GALLERY_ASSET_ID_2])));
  previewMock.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
  laneAwareAssetList();
});

const render = () => renderWithProviders(<GalleryEditorScreen entryId={EDITOR_ENTRY_ID} />);

/**
 * The alt text of each rendered image, in on-screen order.
 *
 * Only a loaded image carries one: while the bytes are in flight the tile is a
 * labelled placeholder instead, which is the point of it. So this reads the
 * `<img>` elements, and the caller waits for them.
 */
function renderedAltText(): string[] {
  return screen
    .getAllByTestId('gallery-media-thumb')
    .filter((node) => node.tagName === 'IMG')
    .map((node) => node.getAttribute('alt') ?? '');
}

describe('the attached images', () => {
  it('renders the persisted order with position 0 marked as the cover', async () => {
    render();
    await screen.findAllByTestId('gallery-media-row');
    const rows = screen.getAllByTestId('gallery-media-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByTestId('gallery-media-cover')).toHaveTextContent(
      GALLERY_MEDIA_COPY.row.cover,
    );
    expect(within(rows[1] as HTMLElement).queryByTestId('gallery-media-cover')).toBeNull();
  });

  it('derives every alt from the entry and its position, with no field to store one', async () => {
    render();
    await screen.findAllByTestId('gallery-media-thumb');
    await waitFor(() => {
      expect(renderedAltText()).toEqual([
        'Ảnh 1 của mục “Áo thun thêu hoa sen”',
        'Ảnh 2 của mục “Áo thun thêu hoa sen”',
      ]);
    });
    // And no control anywhere offers to change it.
    expect(screen.queryByLabelText(/alt/i)).toBeNull();
  });

  it('reaches image bytes only through the authenticated preview', async () => {
    render();
    await screen.findAllByTestId('gallery-media-thumb');
    await waitFor(() => {
      expect(previewMock).toHaveBeenCalled();
    });
    expect(previewMock.mock.calls[0]).toEqual([GALLERY_ASSET_ID, 'thumbnail', expect.anything()]);
    // No storage fact is anywhere in the DOM.
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/minio|s3\.|storageKey|bucket|X-Amz/i);
  });

  it('keeps a failed preview local, leaving the row and its controls usable', async () => {
    previewMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'GALLERY_ASSET_NOT_FOUND' }),
    );
    render();
    const rows = await screen.findAllByTestId('gallery-media-row');
    expect(rows).toHaveLength(2);
    await screen.findAllByLabelText(GALLERY_MEDIA_COPY.row.previewFailed);
    // The editor around it is untouched.
    expect(screen.getByTestId('gallery-media-add')).toBeEnabled();
    expect(screen.queryByTestId('gallery-editor-unavailable')).toBeNull();
  });

  it('offers no deletion control, because no delivered operation deletes an image', async () => {
    render();
    await screen.findAllByTestId('gallery-media-row');
    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent ?? '').not.toMatch(/Xoá|Xóa/);
    }
  });
});

describe('reordering and saving', () => {
  it('sends the whole ordered selection with the latest token, once', async () => {
    replaceMock.mockResolvedValue(
      envelope(withAssets([GALLERY_ASSET_ID_2, GALLERY_ASSET_ID], { updatedAt: UPDATED_AT_NEXT })),
    );
    const user = createUser();
    render();
    await screen.findAllByTestId('gallery-media-row');
    await user.click(screen.getByRole('button', { name: /Di chuyển trước: Ảnh 2/ }));
    await user.click(screen.getByTestId('gallery-media-save'));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1);
    });
    const [entryId, body] = replaceMock.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(entryId).toBe(EDITOR_ENTRY_ID);
    expect(body).toEqual({
      assetIds: [GALLERY_ASSET_ID_2, GALLERY_ASSET_ID],
      expectedUpdatedAt: UPDATED_AT,
    });
  });

  it('makes "set as cover" a move to the front and nothing else', async () => {
    const user = createUser();
    render();
    await screen.findAllByTestId('gallery-media-row');
    await user.click(screen.getByRole('button', { name: /Đặt làm ảnh bìa: Ảnh 2/ }));

    const rows = screen.getAllByTestId('gallery-media-row');
    expect(within(rows[0] as HTMLElement).getByTestId('gallery-media-cover')).toBeInTheDocument();
    // Nothing was persisted by the reorder itself.
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('disables the move that would go nowhere', async () => {
    render();
    await screen.findAllByTestId('gallery-media-row');
    expect(screen.getByRole('button', { name: /Di chuyển trước: Ảnh 1/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Di chuyển sau: Ảnh 2/ })).toBeDisabled();
  });

  it('offers no save until the arrangement actually differs', async () => {
    render();
    await screen.findAllByTestId('gallery-media-row');
    expect(screen.queryByTestId('gallery-media-save')).toBeNull();
  });

  it('allows an empty selection while the entry is a draft', async () => {
    replaceMock.mockResolvedValue(envelope(makeDetail({ updatedAt: UPDATED_AT_NEXT })));
    const user = createUser();
    render();
    await screen.findAllByTestId('gallery-media-row');
    await user.click(screen.getByRole('button', { name: /Gỡ ảnh: Ảnh 2/ }));
    await user.click(screen.getByRole('button', { name: /Gỡ ảnh: Ảnh 1/ }));
    await user.click(screen.getByTestId('gallery-media-save'));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1);
    });
    expect(replaceMock.mock.calls[0]?.[1]).toEqual({
      assetIds: [],
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(await screen.findByTestId('gallery-media-empty')).toBeInTheDocument();
  });

  it('keeps the arrangement after a refused save, so a retry is one click', async () => {
    replaceMock.mockRejectedValue(
      makeApiClientError({ status: 400, code: 'GALLERY_ENTRY_ASSET_NOT_ELIGIBLE' }),
    );
    const user = createUser();
    render();
    await screen.findAllByTestId('gallery-media-row');
    await user.click(screen.getByRole('button', { name: /Di chuyển trước: Ảnh 2/ }));
    await user.click(screen.getByTestId('gallery-media-save'));

    expect(await screen.findByTestId('gallery-media-failure')).toHaveTextContent(
      GALLERY_MEDIA_COPY.failure.save.notEligible.title,
    );
    // Still two rows, still reordered, still savable.
    expect(screen.getAllByTestId('gallery-media-row')).toHaveLength(2);
    expect(screen.getByTestId('gallery-media-save')).toBeEnabled();
  });
});

describe('the gallery image picker', () => {
  it('names the GALLERY lane explicitly rather than relying on the default', async () => {
    const user = createUser();
    render();
    await user.click(await screen.findByTestId('gallery-media-add'));
    await screen.findByTestId('gallery-asset-picker');

    await waitFor(() => {
      expect(assetListMock).toHaveBeenCalled();
    });
    const params = assetListMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params['scope']).toBe('GALLERY');
  });

  it('does not offer an image the entry already holds', async () => {
    const user = createUser();
    render();
    await user.click(await screen.findByTestId('gallery-media-add'));
    const dialog = await screen.findByTestId('gallery-asset-picker');

    // Three exist in the lane; two are already attached, so exactly one is left.
    await waitFor(() => {
      expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1);
    });
  });

  it('stages a selection and applies it only on confirm', async () => {
    const user = createUser();
    render();
    await user.click(await screen.findByTestId('gallery-media-add'));
    const dialog = await screen.findByTestId('gallery-asset-picker');
    await user.click(within(dialog).getAllByRole('checkbox')[0] as HTMLElement);
    await user.click(screen.getByTestId('gallery-picker-confirm'));

    // Appended locally, at the end, and nothing was persisted.
    await waitFor(() => {
      expect(screen.getAllByTestId('gallery-media-row')).toHaveLength(3);
    });
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('gallery-media-dirty')).toBeInTheDocument();
  });
});

describe('preparing an image from a catalog source', () => {
  async function openSourcePicker() {
    const user = createUser();
    render();
    await user.click(await screen.findByTestId('gallery-media-prepare'));
    await screen.findByTestId('gallery-source-picker');
    return user;
  }

  it('names the CATALOG lane explicitly', async () => {
    await openSourcePicker();
    await waitFor(() => {
      expect(assetListMock).toHaveBeenCalled();
    });
    const scopes = assetListMock.mock.calls.map(
      (call) => (call[0] as Record<string, unknown>)['scope'],
    );
    expect(scopes).toContain('CATALOG');
    // And never leaves the parameter off, which would silently mean CATALOG.
    for (const call of assetListMock.mock.calls) {
      expect((call[0] as Record<string, unknown>)['scope']).toBeDefined();
    }
  });

  it('sends only the source and its token — never a lane, status or storage fact', async () => {
    prepareMock.mockResolvedValue(envelope(makePreparedAsset()));
    const user = await openSourcePicker();
    await user.click(screen.getAllByRole('radio')[0] as HTMLElement);
    await user.click(screen.getByTestId('gallery-source-confirm'));

    await waitFor(() => {
      expect(prepareMock).toHaveBeenCalledTimes(1);
    });
    const [body] = prepareMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(body).toEqual({
      sourceAssetId: CATALOG_ASSET_ID,
      expectedSourceUpdatedAt: SOURCE_UPDATED_AT,
    });
    for (const forbidden of ['kind', 'classification', 'status', 'storageKey', 'renditions']) {
      expect(body[forbidden]).toBeUndefined();
    }
  });

  it('selects the returned new asset, not the source it was copied from', async () => {
    prepareMock.mockResolvedValue(envelope(makePreparedAsset({ assetId: GALLERY_ASSET_ID_3 })));
    const user = await openSourcePicker();
    await user.click(screen.getAllByRole('radio')[0] as HTMLElement);
    await user.click(screen.getByTestId('gallery-source-confirm'));

    await waitFor(() => {
      expect(screen.getAllByTestId('gallery-media-row')).toHaveLength(3);
    });
    // The source never becomes an attachment.
    await waitFor(() => {
      expect(previewMock.mock.calls.map((call) => call[0])).toContain(GALLERY_ASSET_ID_3);
    });
    expect(previewMock.mock.calls.map((call) => call[0])).not.toContain(CATALOG_ASSET_ID);
    // And it is still only local until the media save runs.
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('reports a stale source with the approved sentence and never retries', async () => {
    prepareMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'GALLERY_ASSET_SOURCE_VERSION_CONFLICT' }),
    );
    const user = await openSourcePicker();
    await user.click(screen.getAllByRole('radio')[0] as HTMLElement);
    await user.click(screen.getByTestId('gallery-source-confirm'));

    expect(await screen.findByTestId('gallery-prepare-failure')).toHaveTextContent(
      GALLERY_MEDIA_COPY.failure.prepare.staleSource.body,
    );
    // One attempt, and nothing was attached.
    expect(prepareMock).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByTestId('gallery-media-row')).toHaveLength(2);
  });

  it('reports a storage outage as retryable, with nothing created', async () => {
    prepareMock.mockRejectedValue(
      makeApiClientError({ status: 503, code: 'INTERNAL_SERVER_ERROR' }),
    );
    const user = await openSourcePicker();
    await user.click(screen.getAllByRole('radio')[0] as HTMLElement);
    await user.click(screen.getByTestId('gallery-source-confirm'));

    expect(await screen.findByTestId('gallery-prepare-failure')).toHaveTextContent(
      GALLERY_MEDIA_COPY.failure.prepare.unavailable.title,
    );
    expect(prepareMock).toHaveBeenCalledTimes(1);
  });
});

describe('optimistic concurrency', () => {
  it('opens the reload dialog for a stale token and replays nothing', async () => {
    replaceMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'GALLERY_ENTRY_VERSION_CONFLICT' }),
    );
    const user = createUser();
    render();
    await screen.findAllByTestId('gallery-media-row');
    await user.click(screen.getByRole('button', { name: /Di chuyển trước: Ảnh 2/ }));
    await user.click(screen.getByTestId('gallery-media-save'));

    const dialog = await screen.findByTestId('gallery-conflict-dialog');
    // The operator has unsaved work, so the copy says what reloading costs.
    expect(dialog).toHaveTextContent(GALLERY_EDITOR_COPY.conflict.bodyWithChanges);
    expect(replaceMock).toHaveBeenCalledTimes(1);
    // Their arrangement is still on screen, and nothing was overwritten.
    expect(screen.getAllByTestId('gallery-media-row')).toHaveLength(2);
  });

  it('refetches on reload, and the next command uses the token that came back', async () => {
    replaceMock.mockRejectedValueOnce(
      makeApiClientError({ status: 409, code: 'GALLERY_ENTRY_VERSION_CONFLICT' }),
    );
    const user = createUser();
    render();
    await screen.findAllByTestId('gallery-media-row');
    await user.click(screen.getByRole('button', { name: /Di chuyển trước: Ảnh 2/ }));
    await user.click(screen.getByTestId('gallery-media-save'));
    await screen.findByTestId('gallery-conflict-dialog');

    // Somebody else's change is what a reload now returns.
    detailMock.mockResolvedValue(
      envelope(withAssets([GALLERY_ASSET_ID, GALLERY_ASSET_ID_2], { updatedAt: UPDATED_AT_NEXT })),
    );
    replaceMock.mockResolvedValue(
      envelope(withAssets([GALLERY_ASSET_ID_2, GALLERY_ASSET_ID], { updatedAt: UPDATED_AT_NEXT })),
    );
    await user.click(screen.getByTestId('gallery-conflict-reload'));

    await waitFor(() => {
      expect(detailMock).toHaveBeenCalledTimes(2);
    });
    await user.click(await screen.findByRole('button', { name: /Di chuyển trước: Ảnh 2/ }));
    await user.click(screen.getByTestId('gallery-media-save'));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(2);
    });
    expect(replaceMock.mock.calls[1]?.[1]).toMatchObject({
      expectedUpdatedAt: UPDATED_AT_NEXT,
    });
  });
});
