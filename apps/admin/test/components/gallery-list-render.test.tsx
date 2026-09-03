/**
 * The Admin gallery list — the generated boundary, the rows, and the four
 * states the list can be in without an operator touching the filter
 * (`APP11-A01`; `866:905`, `867:907`).
 *
 * The assertions that matter are about truthfulness, because each is a sentence
 * the operator would act on:
 *
 *  - the list reads through the generated operation with only the parameters
 *    `APP11-B01` publishes;
 *  - a row states a title, a slug, an order, a linked-product *signal* and a
 *    status, and nothing the contract does not carry — no category, no product
 *    name, no internal UUID, no storage fact;
 *  - server order is what is rendered;
 *  - a load failure is a failure, never an empty list;
 *  - a server message, code, status number or request id never reaches the
 *    screen as the copy;
 *  - the list creates, edits and publishes nothing at all.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminGalleryEntryList } from '@embroidery/api-client';

import { GalleryListScreen } from '../../src/features/gallery-list';
import { GALLERY_LIST_COPY } from '../../src/features/gallery-list/model/gallery-list-copy';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import {
  COVER_ASSET_ID,
  ENTRY_ID,
  ENTRY_ID_ARCHIVED,
  ENTRY_ID_PUBLISHED,
  LINKED_PRODUCT_ID,
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

beforeEach(() => {
  jest.clearAllMocks();
  listMock.mockResolvedValue(envelope(makeListPage([makeEntry()])));
});

const render = () => renderWithProviders(<GalleryListScreen />);

describe('the generated boundary', () => {
  it('reads the list through the generated operation with a bounded page size', async () => {
    render();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    const [params] = listMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params['limit']).toBe(20);
    // Nothing is selected, so no `status` is sent and B01 answers with every
    // state. A sentinel the API does not define is never invented.
    expect('status' in params).toBe(false);
    expect('cursor' in params).toBe(false);
  });

  it('issues exactly one request per load — there is no polling and no retry loop', async () => {
    render();
    await screen.findByTestId('gallery-list-table');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60);
    });
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('reaches no gallery mutation and no second read from this screen', () => {
    const actual = jest.requireActual<Record<string, unknown>>('@embroidery/api-client');
    // The list's service seam exposes exactly two functions — the list read and
    // the authenticated cover preview — so "this screen cannot create, edit or
    // publish an entry" is a fact of the module graph rather than a convention.
    const service = jest.requireActual<Record<string, unknown>>(
      '../../src/features/gallery-list/services/gallery-list.service',
    );
    expect(Object.keys(service).sort()).toEqual([
      'GALLERY_COVER_RENDITION',
      'fetchGalleryCover',
      'fetchGalleryListPage',
    ]);
    expect(actual['adminGalleryEntryList']).toBeDefined();
    expect(actual['adminGalleryAssetPreview']).toBeDefined();
    // The editor's operations now exist on the curated boundary — APP11-A02
    // consumes them — so the guarantee moves from "the package does not export
    // them" to "this feature does not import them". That is the guarantee that
    // was ever really about the list, and the boundary suite asserts it against
    // the feature's own source.
    //
    // The same move now applies to the storefront's own read. `APP11-S02` put
    // `publicGalleryEntryList` on the boundary for the public gallery feed, so
    // the package can no longer be the thing that keeps it away from an Admin
    // screen — one package root serves both applications. What stays absolute is
    // the rule itself: an Admin screen reading the storefront's unauthenticated
    // view of the same rows would be a second source of truth. That is asserted
    // where it is actually true, against this feature's own source, in
    // `test/boundary/gallery-list-source.test.ts` ("names no public gallery or
    // sitemap operation").
    //
    // `publicGalleryEntryDetail` has since joined the boundary: `APP11-S03`
    // delivered /bo-suu-tap/[slug], so the storefront read it performs is a
    // consumed operation like the list. It moves to the same guarantee the list
    // has — asserted against this feature's own source in
    // `test/boundary/gallery-list-source.test.ts`, which forbids any
    // `publicGallery*` name here — rather than against the package both apps
    // import.
    //
    // What remains absent from the package is asserted here, because for these
    // the absence is not a scheduling accident: no gallery media-byte operation
    // is exported at all, and the sitemap family has no delivered surface.
    // `publicSitemapEntryList` left this list at `APP12-H01`: `APP11-B04`
    // delivered it and the Storefront's `sitemap.ts` is its approved consumer,
    // so its presence on the shared package is scheduling, not an escape. That
    // this screen does not reach it is asserted against this feature's own
    // source, in `test/boundary/gallery-list-source.test.ts`.
    for (const neverExported of ['publicGalleryEntryAsset', 'publicGalleryEntryMediaGet']) {
      expect(actual[neverExported]).toBeUndefined();
    }
  });
});

describe('loading', () => {
  it('shows the skeleton first and never flashes the empty state', () => {
    listMock.mockReturnValue(new Promise(() => undefined) as never);

    render();

    expect(screen.getByTestId('gallery-list-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('gallery-list-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gallery-list-table')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(GALLERY_LIST_COPY.states.loading);
    // No count and no emptiness is claimed while nothing is known.
    expect(screen.queryByText(GALLERY_LIST_COPY.states.emptyTitle)).not.toBeInTheDocument();
  });
});

describe('rows', () => {
  it('renders the published B01 fields for one entry', async () => {
    listMock.mockResolvedValue(
      envelope(
        makeListPage([
          makeEntry({ assetCount: 3, coverAssetId: COVER_ASSET_ID, displayOrder: 40 }),
        ]),
      ),
    );

    render();
    const row = within(await screen.findByTestId('gallery-list-row'));

    expect(row.getByRole('rowheader')).toHaveTextContent('Áo thun thêu hoa sen');
    expect(row.getByRole('rowheader')).toHaveTextContent('/ao-thun-theu-hoa-sen');
    expect(row.getByRole('rowheader')).toHaveTextContent('3 ảnh');
    expect(row.getByTestId('gallery-list-order')).toHaveTextContent('40');
    expect(row.getByTestId('gallery-list-status')).toHaveTextContent('Bản nháp');
  });

  it('never renders an internal identifier', async () => {
    listMock.mockResolvedValue(
      envelope(
        makeListPage([
          makeEntry({ coverAssetId: COVER_ASSET_ID, linkedProductId: LINKED_PRODUCT_ID }),
        ]),
      ),
    );

    render();
    await screen.findByTestId('gallery-list-table');

    // The entry id, the linked product id and the cover asset id are all
    // identities the operator has no use for and the design never draws.
    for (const id of [ENTRY_ID, LINKED_PRODUCT_ID, COVER_ASSET_ID]) {
      expect(document.body.textContent).not.toContain(id);
    }
  });

  it('shows the linked product as a signal, never as an id or a name', async () => {
    listMock.mockResolvedValue(
      envelope(
        makeListPage([
          makeEntry({ linkedProductId: LINKED_PRODUCT_ID }),
          makeEntry({ galleryEntryId: ENTRY_ID_PUBLISHED, title: 'Khăn thêu tay' }),
        ]),
      ),
    );

    render();
    const rows = await screen.findAllByTestId('gallery-list-row');

    expect(within(rows[0] as HTMLElement).getByText('Đã liên kết')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Chưa liên kết')).toBeInTheDocument();
  });

  it('renders the server order and does not re-sort it', async () => {
    listMock.mockResolvedValue(
      envelope(
        makeListPage([
          makeEntry({ displayOrder: 30, title: 'Ba' }),
          makeEntry({ galleryEntryId: ENTRY_ID_PUBLISHED, displayOrder: 10, title: 'Một' }),
          makeEntry({ galleryEntryId: ENTRY_ID_ARCHIVED, displayOrder: 20, title: 'Hai' }),
        ]),
      ),
    );

    render();
    const rows = await screen.findAllByTestId('gallery-list-row');

    // The server's curated order is the rendered order, even when the numbers
    // are out of sequence: a client-side sort would put the visible list out of
    // step with the cursor that paged it.
    expect(rows.map((row) => row.textContent?.includes('Ba'))).toEqual([true, false, false]);
    expect(within(rows[1] as HTMLElement).getByTestId('gallery-list-order')).toHaveTextContent(
      '10',
    );
  });

  it('renders the three lifecycle states with a label, not only a colour', async () => {
    listMock.mockResolvedValue(
      envelope(
        makeListPage([
          makeEntry({ status: 'DRAFT' }),
          makeEntry({ galleryEntryId: ENTRY_ID_PUBLISHED, status: 'PUBLISHED' }),
          makeEntry({ galleryEntryId: ENTRY_ID_ARCHIVED, status: 'ARCHIVED' }),
        ]),
      ),
    );

    render();
    const badges = await screen.findAllByTestId('gallery-list-status');

    expect(badges.map((badge) => badge.textContent)).toEqual([
      expect.stringContaining('Bản nháp'),
      expect.stringContaining('Đã xuất bản'),
      expect.stringContaining('Đã lưu trữ'),
    ]);
  });
});

describe('the unfiltered empty state', () => {
  it('states that entries come from the editor and offers no create action', async () => {
    listMock.mockResolvedValue(envelope(makeListPage([])));

    render();
    const empty = await screen.findByTestId('gallery-list-empty');

    expect(empty).toHaveTextContent(GALLERY_LIST_COPY.states.emptyTitle);
    expect(empty).toHaveTextContent(GALLERY_LIST_COPY.states.emptyBody);
    // The approved frame draws "Tạo mục mới"; A02 owns it, so shipping it here
    // would be a button with nowhere to go.
    expect(screen.queryByRole('button', { name: /Tạo mục/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tạo mục/ })).not.toBeInTheDocument();
    // A filtered-empty sentence must not appear when nothing is filtered.
    expect(screen.queryByText(GALLERY_LIST_COPY.states.filteredEmptyTitle)).not.toBeInTheDocument();
  });
});

describe('read failures', () => {
  it('renders a failure as a failure, never as an empty list', async () => {
    listMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));

    render();
    const error = await screen.findByTestId('gallery-list-error');

    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent(GALLERY_LIST_COPY.states.errorTitle);
    expect(screen.queryByTestId('gallery-list-empty')).not.toBeInTheDocument();
    expect(screen.queryByText(GALLERY_LIST_COPY.states.emptyTitle)).not.toBeInTheDocument();
  });

  it('offers sign-in and no retry when the session has expired', async () => {
    listMock.mockRejectedValue(makeApiClientError({ status: 401, code: 'UNAUTHENTICATED' }));

    render();
    const error = await screen.findByTestId('gallery-list-error');

    expect(error).toHaveTextContent(GALLERY_LIST_COPY.states.unauthenticatedTitle);
    expect(screen.getByRole('link', { name: GALLERY_LIST_COPY.actions.signIn })).toHaveAttribute(
      'href',
      '/login',
    );
    // No retry is offered: none could succeed.
    expect(screen.queryByTestId('gallery-list-retry')).not.toBeInTheDocument();
  });

  it('classifies a transport failure as retryable', async () => {
    listMock.mockRejectedValue(makeNetworkError());

    render();

    expect(await screen.findByTestId('gallery-list-retry')).toBeInTheDocument();
    expect(screen.getByTestId('gallery-list-error')).toHaveTextContent(
      GALLERY_LIST_COPY.states.errorTitle,
    );
  });

  it('leaks no server message, code, status number or request id', async () => {
    listMock.mockRejectedValue(
      makeApiClientError({
        status: 500,
        code: 'GALLERY_LIST_EXPLODED',
        message: 'relation "gallery_entries" does not exist',
      }),
    );

    render();
    await screen.findByTestId('gallery-list-error');

    const text = document.body.textContent ?? '';
    expect(text).not.toContain('GALLERY_LIST_EXPLODED');
    expect(text).not.toContain('gallery_entries');
    expect(text).not.toContain('req-test-0001');
    expect(text).not.toContain('500');
  });
});

describe('page structure', () => {
  it('has exactly one H1', async () => {
    render();
    await screen.findByTestId('gallery-list-table');

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      GALLERY_LIST_COPY.page.title,
    );
  });

  it('puts no engineering commentary on screen', async () => {
    // The screen is for an operator looking for a gallery entry. An endpoint,
    // a contract field, a checkpoint identifier or a note explaining why the
    // screen is built the way it is is noise to them — those facts live in the
    // source comments and the completion report, where their audience is.
    listMock.mockResolvedValue(envelope(makeListPage([makeEntry()], { next: 'cursor-page-2' })));

    render();
    await screen.findByTestId('gallery-list-table');

    const text = document.body.textContent ?? '';
    for (const jargon of [
      '/api/',
      'GET ',
      'APP11',
      'hasNext',
      'nextCursor',
      'display_order',
      'keyset',
      'gallery_entries',
      'status.',
      'ALL',
    ]) {
      expect(text).not.toContain(jargon);
    }
  });
});
