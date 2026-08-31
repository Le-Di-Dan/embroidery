/**
 * The one approved list filter, its URL ownership and the filtered-empty state
 * (`APP11-A01`; `866:905`, `867:907`).
 *
 * `next/navigation` is mocked with a *mutable* search string so a filter change
 * replays the way the App Router would: the component calls `router.replace`,
 * the URL changes, the screen re-renders. That is what makes the reset, the
 * reload and the continuation-reset assertions meaningful rather than a
 * restatement of the query key.
 */
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import { adminGalleryEntryList } from '@embroidery/api-client';

import { GalleryListScreen } from '../../src/features/gallery-list';
import { GALLERY_LIST_COPY } from '../../src/features/gallery-list/model/gallery-list-copy';
import { ENTRY_ID_PUBLISHED, envelope, makeEntry, makeListPage } from '../support/gallery-fixture';

// The factory owns its own state so it can be referenced before the test module
// body has evaluated (jest.mock is hoisted above every import).
jest.mock('next/navigation', () => {
  const state = { search: '' };
  const router = {
    replace: jest.fn((url: string) => {
      const query = url.split('?')[1];
      state.search = query ?? '';
    }),
    push: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  };
  return {
    __state: state,
    __router: router,
    useRouter: () => router,
    usePathname: () => '/gallery',
    useSearchParams: () => new URLSearchParams(state.search),
  };
});

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminGalleryEntryList: jest.fn(),
  adminGalleryAssetPreview: jest.fn(),
}));

import * as navigation from 'next/navigation';

const navState = (navigation as unknown as { __state: { search: string } }).__state;
const navRouter = (navigation as unknown as { __router: { replace: jest.Mock } }).__router;
const listMock = adminGalleryEntryList as jest.MockedFunction<typeof adminGalleryEntryList>;

const statusSelect = () => screen.getByLabelText(GALLERY_LIST_COPY.filters.statusLabel);
const lastParams = () =>
  (listMock.mock.calls[listMock.mock.calls.length - 1] as unknown as [Record<string, unknown>])[0];

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  navState.search = '';
  user = createUser();
  listMock.mockResolvedValue(envelope(makeListPage([makeEntry()])));
});

const render = () => renderWithProviders(<GalleryListScreen />);

/**
 * Replays what the App Router would do after `router.replace`: the mocked
 * `replace` has already rewritten the search string, so the screen only needs to
 * re-render to observe the new URL. The `APP2-A02` convention, unchanged.
 */
type Rerender = { rerender: (ui: React.ReactElement) => void };
const replayNavigation = (view: Rerender) => {
  view.rerender(<GalleryListScreen />);
};

describe('the wire mapping', () => {
  it('omits the parameter for "Tất cả trạng thái" rather than inventing a token', async () => {
    render();
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });

    expect('status' in lastParams()).toBe(false);
    expect(statusSelect()).toHaveValue('all');
    // The presentation value never reaches the wire: `ALL` is not a value the
    // contract defines, so sending it would be a 400 nobody asked for.
    expect(JSON.stringify(lastParams())).not.toContain('ALL');
  });

  it('sends exactly one canonical status when one is chosen', async () => {
    const view = render();
    await screen.findByTestId('gallery-list-table');

    await user.selectOptions(statusSelect(), 'PUBLISHED');
    replayNavigation(view);

    await waitFor(() => {
      expect(lastParams()['status']).toBe('PUBLISHED');
    });
  });

  it('offers the whole vocabulary and nothing else', () => {
    render();

    const options = Array.from(statusSelect().querySelectorAll('option')).map((option) =>
      option.getAttribute('value'),
    );
    expect(options).toEqual(['all', 'DRAFT', 'PUBLISHED', 'ARCHIVED']);
  });
});

describe('URL ownership', () => {
  it('writes the chosen status to the URL with replace and no scroll', async () => {
    render();
    await screen.findByTestId('gallery-list-table');

    await user.selectOptions(statusSelect(), 'ARCHIVED');

    await waitFor(() => {
      expect(navState.search).toBe('status=ARCHIVED');
    });
    expect(navRouter.replace).toHaveBeenLastCalledWith('/gallery?status=ARCHIVED', {
      scroll: false,
    });
  });

  it('drops the parameter entirely when the filter returns to the default', async () => {
    navState.search = 'status=DRAFT';
    const view = render();
    await screen.findByTestId('gallery-list-table');

    await user.selectOptions(statusSelect(), 'all');
    replayNavigation(view);

    await waitFor(() => {
      expect(navState.search).toBe('');
    });
    // One URL per list state: the default filter and a bare `/gallery` are the
    // same address, not two.
    expect(navRouter.replace).toHaveBeenLastCalledWith('/gallery', { scroll: false });
  });

  it('restores the filter from the URL on reload', async () => {
    navState.search = 'status=PUBLISHED';

    render();

    await waitFor(() => {
      expect(lastParams()['status']).toBe('PUBLISHED');
    });
    expect(statusSelect()).toHaveValue('PUBLISHED');
  });

  it('never puts the cursor in the URL', async () => {
    listMock.mockResolvedValue(envelope(makeListPage([makeEntry()], { next: 'cursor-page-2' })));

    render();
    await user.click(await screen.findByTestId('gallery-list-load-more'));

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(2);
    });
    // A bookmarked address always reads from the first page, and a stale cursor
    // cannot be pasted into one.
    expect(navState.search).toBe('');
    expect(navRouter.replace).not.toHaveBeenCalled();
  });

  it('discards an unknown URL token safely and never reflects it', async () => {
    navState.search = 'status=DROP%20TABLE%20gallery_entries';

    render();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    // Not sent to the API…
    expect('status' in lastParams()).toBe(false);
    // …and not rendered anywhere either.
    expect(document.body.textContent).not.toContain('DROP TABLE');
    expect(statusSelect()).toHaveValue('all');
  });

  it('treats a repeated status parameter as no filter at all', async () => {
    // The contract accepts one status. A URL naming two has named none this
    // screen can honour, so it normalizes to the default rather than silently
    // picking a winner the operator did not choose.
    navState.search = 'status=DRAFT&status=PUBLISHED';

    render();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    expect('status' in lastParams()).toBe(false);
  });
});

describe('the filtered-empty state', () => {
  beforeEach(() => {
    navState.search = 'status=ARCHIVED';
    listMock.mockResolvedValue(envelope(makeListPage([])));
  });

  it('names the active condition back and does not claim the gallery is empty', async () => {
    render();

    const empty = await screen.findByTestId('gallery-list-filter-empty');
    expect(empty).toHaveTextContent(GALLERY_LIST_COPY.states.filteredEmptyTitle);
    expect(screen.getByTestId('gallery-list-filter-condition')).toHaveTextContent('Đã lưu trữ');
    // The two empty states may not share a sentence.
    expect(screen.queryByText(GALLERY_LIST_COPY.states.emptyTitle)).not.toBeInTheDocument();
    expect(screen.queryByTestId('gallery-list-empty')).not.toBeInTheDocument();
  });

  it('clears the filter from the empty state itself', async () => {
    const view = render();
    await user.click(await screen.findByTestId('gallery-list-clear-filter'));
    replayNavigation(view);

    await waitFor(() => {
      expect(navState.search).toBe('');
    });
  });
});

describe('changing the filter resets the continuation', () => {
  it('starts again from the first page rather than reusing the cursor chain', async () => {
    listMock.mockResolvedValue(envelope(makeListPage([makeEntry()], { next: 'cursor-page-2' })));

    const view = render();
    await user.click(await screen.findByTestId('gallery-list-load-more'));
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(2);
    });
    expect(lastParams()['cursor']).toBe('cursor-page-2');

    listMock.mockResolvedValue(
      envelope(makeListPage([makeEntry({ galleryEntryId: ENTRY_ID_PUBLISHED })])),
    );
    await user.selectOptions(statusSelect(), 'DRAFT');
    replayNavigation(view);

    await waitFor(() => {
      expect(lastParams()['status']).toBe('DRAFT');
    });
    // A different filter addresses a different cache entry, so the previous
    // cursor chain is unreachable rather than merely unused.
    expect('cursor' in lastParams()).toBe(false);
  });
});
