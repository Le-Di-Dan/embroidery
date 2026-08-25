/**
 * The production queue's two approved filters, its filtered-empty state and its
 * cursor continuation (`APP8-A02`; `780:105`, `782:44`).
 *
 * Three things are being proved:
 *
 *  - the status multi-select maps **exactly** onto the repeatable `status`
 *    parameter, offers exactly the four LC-18 values, and adds no control the
 *    API cannot serve;
 *  - the order filter sends the published `orderId` and never translates a code
 *    into an id behind the operator's back;
 *  - "Tải thêm lệnh sản xuất" sends the server's own `nextCursor` and nothing
 *    derived from it, and a filter change starts the chain over.
 *
 * `next/navigation` is mocked with a *mutable* search string so a filter change
 * replays the way the App Router would — the component calls `router.replace`,
 * the URL changes, the screen re-renders. That is what makes the repeated
 * parameter assertions meaningful rather than a restatement of the query key.
 * The `APP5-A01`/`APP7-A01` convention, unchanged.
 */
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import { adminProductionJobList, AdminProductionJobListStatusItem } from '@embroidery/api-client';

import { ProductionQueueScreen } from '../../src/features/production-queue';
import { PRODUCTION_QUEUE_COPY } from '../../src/features/production-queue/model/production-queue-copy';
import {
  envelope,
  JOB_ID_STARTED,
  makeJob,
  makeQueuePage,
  ORDER_ID,
} from '../support/production-fixture';

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
    usePathname: () => '/san-xuat',
    useSearchParams: () => new URLSearchParams(state.search),
  };
});

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductionJobList: jest.fn(),
}));

import * as navigation from 'next/navigation';

const navState = (navigation as unknown as { __state: { search: string } }).__state;
const navRouter = (navigation as unknown as { __router: { replace: jest.Mock } }).__router;
const listMock = adminProductionJobList as jest.MockedFunction<typeof adminProductionJobList>;

const lastParams = () =>
  (listMock.mock.calls[listMock.mock.calls.length - 1] as unknown as [Record<string, unknown>])[0];

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  navState.search = '';
  user = createUser();
  listMock.mockResolvedValue(envelope(makeQueuePage([makeJob()])));
});

const render = () => renderWithProviders(<ProductionQueueScreen />);

type Rerender = { rerender: (ui: React.ReactElement) => void };
const replayNavigation = (view: Rerender) => {
  view.rerender(<ProductionQueueScreen />);
};

describe('the status filter', () => {
  it('offers exactly the four LC-18 states the contract publishes, and nothing else', async () => {
    render();
    await screen.findByTestId('production-queue-table');

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(Object.values(AdminProductionJobListStatusItem).length);
    expect(boxes).toHaveLength(4);
    expect(boxes.map((box) => (box as HTMLInputElement).value)).toEqual([
      'PLANNED',
      'STARTED',
      'COMPLETED',
      'CANCELLED',
    ]);

    // No invented state, and no control for a fact the production model does
    // not carry.
    expect(
      screen.queryByLabelText(/ưu tiên|thợ|máy|SLA|khoảng ngày|số lần thử/i),
    ).not.toBeInTheDocument();
  });

  it('sends no status at all while nothing is selected', async () => {
    render();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    expect('status' in lastParams()).toBe(false);
    expect(screen.getByTestId('production-filter-summary')).toHaveTextContent('Tất cả');
    // `780:176`: "tất cả" is not a value that goes on the wire, and the screen
    // says so rather than leaving it to be inferred.
    expect(screen.getByText(PRODUCTION_QUEUE_COPY.filters.vocabulary)).toBeInTheDocument();
  });

  it('sends a selection as a repeatable array, in contract order', async () => {
    const view = render();
    await screen.findByTestId('production-queue-table');

    await user.click(screen.getByTestId('production-filter-STARTED'));
    replayNavigation(view);
    await user.click(screen.getByTestId('production-filter-PLANNED'));
    replayNavigation(view);

    await waitFor(() => {
      // Declaration order, not click order: two spellings of one selection would
      // otherwise be two cache entries.
      expect(lastParams()['status']).toEqual(['PLANNED', 'STARTED']);
    });
    expect(navRouter.replace).toHaveBeenCalledWith('/san-xuat?status=PLANNED&status=STARTED', {
      scroll: false,
    });
  });

  it('reads a repeated parameter with getAll, not get', async () => {
    navState.search = 'status=PLANNED&status=STARTED';

    render();
    await screen.findByTestId('production-queue-table');

    // Both boxes are ticked. `get` would have seen only the first, and the
    // second status would have silently vanished from a bookmarked URL.
    expect(screen.getByTestId('production-filter-PLANNED')).toBeChecked();
    expect(screen.getByTestId('production-filter-STARTED')).toBeChecked();
    expect(screen.getByTestId('production-filter-COMPLETED')).not.toBeChecked();
    expect(screen.getByTestId('production-filter-summary')).toHaveTextContent('2 đã chọn');
  });

  it('drops an unrecognised URL value instead of sending it to the server', async () => {
    navState.search = 'status=RUNNING&status=COMPLETED';

    render();
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    // `RUNNING` is exactly the kind of state a production queue is tempted to
    // invent. The strict query schema would refuse the whole request, so it is
    // dropped rather than forwarded — and never echoed into the DOM.
    expect(lastParams()['status']).toEqual(['COMPLETED']);
    expect(screen.queryByText('RUNNING')).not.toBeInTheDocument();
  });

  it('starts the cursor chain over when the selection changes', async () => {
    listMock.mockResolvedValue(envelope(makeQueuePage([makeJob()], { next: 'opaque-cursor-1' })));
    const view = render();

    await user.click(await screen.findByTestId('production-queue-load-more'));
    await waitFor(() => {
      expect(lastParams()['cursor']).toBe('opaque-cursor-1');
    });

    await user.click(screen.getByTestId('production-filter-COMPLETED'));
    replayNavigation(view);

    await waitFor(() => {
      expect(lastParams()['status']).toEqual(['COMPLETED']);
    });
    // The filters are part of the cache key, so the narrowed queue is a
    // different entry and starts from its own first page. Carrying the previous
    // cursor across would page into a keyset the new filter never produced.
    expect('cursor' in lastParams()).toBe(false);
  });
});

describe('the order filter', () => {
  it('sends the exact order id and never a code lookup', async () => {
    const view = render();
    await screen.findByTestId('production-queue-table');

    await user.type(screen.getByTestId('production-filter-order'), ORDER_ID);
    replayNavigation(view);

    await waitFor(() => {
      expect(lastParams()['orderId']).toBe(ORDER_ID);
    });
    // Exactly one request per committed filter — no second, hidden query
    // resolving anything into anything.
    expect(navRouter.replace).toHaveBeenCalledWith(`/san-xuat?orderId=${ORDER_ID}`, {
      scroll: false,
    });
  });

  it('refuses an order code in place rather than translating it', async () => {
    const view = render();
    await screen.findByTestId('production-queue-table');

    await user.type(screen.getByTestId('production-filter-order'), 'ORD-K7M2Q9XR4T');
    replayNavigation(view);

    // `APP8-B03` filters on `orderId` and publishes no code filter and no
    // code-to-id resolution. The value is reported, not sent.
    expect(screen.getByText(PRODUCTION_QUEUE_COPY.filters.orderInvalid)).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledTimes(1);
    expect('orderId' in lastParams()).toBe(false);
  });

  it('drops a malformed order id from the URL rather than sending it', async () => {
    navState.search = 'orderId=not-a-uuid';

    render();
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    expect('orderId' in lastParams()).toBe(false);
  });
});

describe('the filtered-empty state', () => {
  it('says a narrowed queue found nothing, rather than that there is no work', async () => {
    navState.search = `status=CANCELLED&orderId=${ORDER_ID}`;
    listMock.mockResolvedValue(envelope(makeQueuePage([])));

    render();
    const panel = await screen.findByTestId('production-queue-filter-empty');

    expect(screen.queryByTestId('production-queue-empty')).not.toBeInTheDocument();
    expect(panel).toHaveTextContent(PRODUCTION_QUEUE_COPY.states.filteredEmptyTitle);
    // The active conditions are read back in the operator's own words, so they
    // can see what to drop.
    expect(screen.getByTestId('production-queue-filter-conditions')).toHaveTextContent(
      'trạng thái Đã huỷ, đơn hàng 019a…6081',
    );
  });

  it('offers one recovery per active filter and clears them truthfully', async () => {
    navState.search = `status=CANCELLED&orderId=${ORDER_ID}`;
    listMock.mockResolvedValue(envelope(makeQueuePage([])));

    render();
    await screen.findByTestId('production-queue-filter-empty');

    await user.click(screen.getByTestId('production-clear-status'));
    expect(navRouter.replace).toHaveBeenCalledWith(`/san-xuat?orderId=${ORDER_ID}`, {
      scroll: false,
    });

    await user.click(screen.getByTestId('production-clear-all'));
    expect(navRouter.replace).toHaveBeenCalledWith('/san-xuat', { scroll: false });
  });

  it('offers no clear-all when only one filter is on', async () => {
    navState.search = 'status=CANCELLED';
    listMock.mockResolvedValue(envelope(makeQueuePage([])));

    render();
    await screen.findByTestId('production-queue-filter-empty');

    // Clearing "everything" would do exactly what clearing the status does, so
    // the operator is not offered two controls for one outcome.
    expect(screen.getByTestId('production-clear-status')).toBeInTheDocument();
    expect(screen.queryByTestId('production-clear-order')).not.toBeInTheDocument();
    expect(screen.queryByTestId('production-clear-all')).not.toBeInTheDocument();
  });
});

describe('cursor continuation', () => {
  it('sends the server cursor verbatim and appends the page', async () => {
    listMock
      .mockResolvedValueOnce(envelope(makeQueuePage([makeJob()], { next: 'opaque-cursor-1' })))
      .mockResolvedValueOnce(
        envelope(makeQueuePage([makeJob({ jobId: JOB_ID_STARTED, status: 'STARTED' })])),
      );

    render();
    await user.click(await screen.findByTestId('production-queue-load-more'));

    await waitFor(() => {
      expect(screen.getAllByTestId('production-queue-row')).toHaveLength(2);
    });
    // Opaque: passed back exactly as issued, never parsed into a page number.
    expect(lastParams()['cursor']).toBe('opaque-cursor-1');
  });

  it('appends without duplicating a job the keyset window shifted onto two pages', async () => {
    listMock
      .mockResolvedValueOnce(envelope(makeQueuePage([makeJob()], { next: 'opaque-cursor-1' })))
      .mockResolvedValueOnce(
        envelope(makeQueuePage([makeJob(), makeJob({ jobId: JOB_ID_STARTED, status: 'STARTED' })])),
      );

    render();
    await user.click(await screen.findByTestId('production-queue-load-more'));

    await waitFor(() => {
      expect(screen.getAllByTestId('production-queue-row')).toHaveLength(2);
    });
    // First occurrence wins, and the server's order is not disturbed to do it.
    expect(
      screen.getAllByTestId('production-queue-row').map((row) => row.textContent),
    ).toHaveLength(2);
  });

  it('offers no continuation on the last page, and no page numbers or totals anywhere', async () => {
    render();
    await screen.findByTestId('production-queue-table');

    expect(screen.queryByTestId('production-queue-load-more')).not.toBeInTheDocument();
    expect(screen.getByTestId('production-queue-exhausted')).toHaveTextContent(
      PRODUCTION_QUEUE_COPY.states.exhausted,
    );
    expect(screen.queryByText(/trang \d/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ kết quả|tổng số/i)).not.toBeInTheDocument();
  });

  it('never offers a continuation from a cursor the last page did not carry', async () => {
    // `hasNext` false with a stale `nextCursor` still present: both parts of the
    // contract must hold, so this is the end of the queue.
    listMock.mockResolvedValue(
      envelope({ items: [makeJob()], hasNext: false, nextCursor: 'stale-cursor' }),
    );

    render();
    await screen.findByTestId('production-queue-table');

    expect(screen.queryByTestId('production-queue-load-more')).not.toBeInTheDocument();
  });
});
