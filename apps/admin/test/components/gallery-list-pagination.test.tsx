/**
 * Keyset continuation and the cover thumbnail (`APP11-A01`; `866:905`).
 *
 * Two capabilities that share one property worth proving: neither may destroy
 * what is already on screen. A continuation failure keeps the accumulated rows
 * and retries the *same* cursor; a cover failure stays inside its own cell and
 * leaves the list intact.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { adminGalleryAssetPreview, adminGalleryEntryList } from '@embroidery/api-client';

import { GalleryListScreen } from '../../src/features/gallery-list';
import { GALLERY_LIST_COPY } from '../../src/features/gallery-list/model/gallery-list-copy';
import { makeApiClientError } from '../support/api-error';
import { installObjectUrl } from '../support/object-url';
import {
  COVER_ASSET_ID,
  ENTRY_ID,
  ENTRY_ID_ARCHIVED,
  ENTRY_ID_PUBLISHED,
  envelope,
  makeEntry,
  makeListPage,
} from '../support/gallery-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/gallery').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminGalleryEntryList: jest.fn(),
  adminGalleryAssetPreview: jest.fn(),
}));

const listMock = adminGalleryEntryList as jest.MockedFunction<typeof adminGalleryEntryList>;
const previewMock = adminGalleryAssetPreview as jest.MockedFunction<
  typeof adminGalleryAssetPreview
>;

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  installObjectUrl('gallery');
  listMock.mockResolvedValue(envelope(makeListPage([makeEntry()])));
  previewMock.mockResolvedValue(new Blob(['cover-bytes'], { type: 'image/webp' }));
});

const render = () => renderWithProviders(<GalleryListScreen />);

const lastParams = () =>
  (listMock.mock.calls[listMock.mock.calls.length - 1] as unknown as [Record<string, unknown>])[0];

describe('continuation', () => {
  it('offers the control only when both hasNext and a usable cursor exist', async () => {
    render();
    await screen.findByTestId('gallery-list-table');

    expect(screen.queryByTestId('gallery-list-load-more')).not.toBeInTheDocument();
    expect(screen.getByTestId('gallery-list-exhausted')).toHaveTextContent(
      GALLERY_LIST_COPY.states.exhausted,
    );
  });

  it('does not offer a continuation when hasNext is true but the cursor is empty', async () => {
    listMock.mockResolvedValue(
      envelope({ items: [makeEntry()], hasNext: true, nextCursor: '' } as never),
    );

    render();
    await screen.findByTestId('gallery-list-table');

    expect(screen.queryByTestId('gallery-list-load-more')).not.toBeInTheDocument();
  });

  it('appends the next page without replacing the rows already loaded', async () => {
    listMock.mockResolvedValueOnce(
      envelope(makeListPage([makeEntry({ title: 'Trang một' })], { next: 'cursor-page-2' })),
    );
    listMock.mockResolvedValueOnce(
      envelope(
        makeListPage([makeEntry({ galleryEntryId: ENTRY_ID_PUBLISHED, title: 'Trang hai' })]),
      ),
    );

    render();
    await user.click(await screen.findByTestId('gallery-list-load-more'));

    await waitFor(() => {
      expect(screen.getAllByTestId('gallery-list-row')).toHaveLength(2);
    });
    expect(screen.getAllByText('Trang một').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Trang hai').length).toBeGreaterThan(0);
    expect(lastParams()['cursor']).toBe('cursor-page-2');
  });

  it('dedupes by entry id, keeping the first occurrence', async () => {
    // A concurrent create or reorder can shift the keyset window and put one
    // entry on two pages. Rendering it twice would be a lie about the gallery.
    listMock.mockResolvedValueOnce(
      envelope(
        makeListPage(
          [makeEntry({ title: 'Bản đầu' }), makeEntry({ galleryEntryId: ENTRY_ID_ARCHIVED })],
          {
            next: 'cursor-page-2',
          },
        ),
      ),
    );
    listMock.mockResolvedValueOnce(
      envelope(makeListPage([makeEntry({ galleryEntryId: ENTRY_ID, title: 'Bản lặp' })])),
    );

    render();
    await user.click(await screen.findByTestId('gallery-list-load-more'));

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getAllByTestId('gallery-list-row')).toHaveLength(2);
    expect(screen.getAllByText('Bản đầu').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Bản lặp')).toHaveLength(0);
  });

  it('keeps the loaded rows on a continuation failure and retries the same cursor', async () => {
    listMock.mockResolvedValueOnce(
      envelope(makeListPage([makeEntry({ title: 'Trang một' })], { next: 'cursor-page-2' })),
    );
    listMock.mockRejectedValueOnce(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));

    render();
    await user.click(await screen.findByTestId('gallery-list-load-more'));

    await waitFor(() => {
      expect(screen.getByText(GALLERY_LIST_COPY.states.loadMoreFailed)).toBeInTheDocument();
    });
    // The accumulated collection survives, and the failure is not the
    // full-page error state.
    expect(screen.getAllByText('Trang một').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('gallery-list-error')).not.toBeInTheDocument();

    listMock.mockResolvedValueOnce(
      envelope(
        makeListPage([makeEntry({ galleryEntryId: ENTRY_ID_PUBLISHED, title: 'Trang hai' })]),
      ),
    );
    await user.click(screen.getByTestId('gallery-list-load-more'));

    await waitFor(() => {
      expect(screen.getAllByText('Trang hai').length).toBeGreaterThan(0);
    });
    // The retry asks for the page that failed, not for the first one.
    expect(lastParams()['cursor']).toBe('cursor-page-2');
  });

  it('disables the control natively while a page is in flight', async () => {
    listMock.mockResolvedValueOnce(
      envelope(makeListPage([makeEntry()], { next: 'cursor-page-2' })),
    );
    listMock.mockReturnValueOnce(new Promise(() => undefined) as never);

    render();
    await user.click(await screen.findByTestId('gallery-list-load-more'));

    await waitFor(() => {
      expect(screen.getByTestId('gallery-list-load-more')).toBeDisabled();
    });
    expect(screen.getByTestId('gallery-list-load-more')).toHaveAttribute('aria-busy', 'true');
  });

  it('computes no page number, offset or total', async () => {
    listMock.mockResolvedValue(envelope(makeListPage([makeEntry()], { next: 'cursor-page-2' })));

    render();
    await screen.findByTestId('gallery-list-table');

    const params = lastParams();
    expect('offset' in params).toBe(false);
    expect('page' in params).toBe(false);
    expect(screen.queryByText(/Trang 1/)).not.toBeInTheDocument();
  });
});

describe('the cover thumbnail', () => {
  it('requests the thumbnail rendition through the authenticated preview', async () => {
    listMock.mockResolvedValue(
      envelope(makeListPage([makeEntry({ coverAssetId: COVER_ASSET_ID, assetCount: 2 })])),
    );

    render();
    await waitFor(() => {
      expect(previewMock).toHaveBeenCalled();
    });

    const [assetId, rendition] = previewMock.mock.calls[0] as unknown as [string, string];
    expect(assetId).toBe(COVER_ASSET_ID);
    expect(rendition).toBe('thumbnail');
  });

  it('renders the bytes from an object URL with alt derived from the title', async () => {
    listMock.mockResolvedValue(
      envelope(makeListPage([makeEntry({ coverAssetId: COVER_ASSET_ID })])),
    );

    render();
    const images = await screen.findAllByTestId('gallery-cover-image');

    expect(images[0]).toHaveAttribute('src', expect.stringMatching(/^blob:gallery\//));
    // `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED`: the contract publishes no
    // `altText`, so the accessible name comes from the entry's own title.
    expect(images[0]).toHaveAttribute('alt', 'Ảnh bìa của mục “Áo thun thêu hoa sen”');
  });

  it('renders the neutral placeholder and requests nothing when there is no cover', async () => {
    render();
    await screen.findByTestId('gallery-list-table');

    expect(screen.getAllByTestId('gallery-cover-placeholder').length).toBeGreaterThan(0);
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('keeps a failed cover local: the row and the list survive it', async () => {
    listMock.mockResolvedValue(
      envelope(makeListPage([makeEntry({ coverAssetId: COVER_ASSET_ID })])),
    );
    previewMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'ASSET_NOT_FOUND' }));

    render();
    await screen.findByTestId('gallery-list-table');

    await waitFor(() => {
      expect(screen.getAllByTestId('gallery-cover-placeholder').length).toBeGreaterThan(0);
    });
    // The list is intact and the failure is not an alert: a missing image must
    // never read as a missing entry.
    expect(screen.getAllByTestId('gallery-list-row')).toHaveLength(1);
    expect(screen.queryByTestId('gallery-list-error')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('never exposes a storage key, bucket or signed URL', async () => {
    listMock.mockResolvedValue(
      envelope(makeListPage([makeEntry({ coverAssetId: COVER_ASSET_ID })])),
    );

    render();
    await screen.findAllByTestId('gallery-cover-image');

    const html = document.body.innerHTML;
    expect(html).not.toContain(COVER_ASSET_ID);
    expect(html).not.toMatch(/minio|s3\.|X-Amz-Signature|\.amazonaws\./i);
  });
});
