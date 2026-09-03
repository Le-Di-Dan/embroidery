/**
 * The order queue's one approved filter and its cursor continuation
 * (`APP7-A01`; `732:110`).
 *
 * Two things are being proved:
 *
 *  - the status multi-select maps **exactly** onto the repeatable `status`
 *    parameter, offers exactly the eleven values `APP7-B02` publishes, and adds
 *    no control the API cannot serve;
 *  - "Tải thêm đơn hàng" sends the server's own `nextCursor` and nothing derived
 *    from it.
 *
 * `next/navigation` is mocked with a *mutable* search string so a filter change
 * replays the way the App Router would — the component calls `router.replace`,
 * the URL changes, the screen re-renders. That is what makes the repeated
 * parameter assertions meaningful rather than a restatement of the query key.
 * The `APP5-A01` convention, unchanged.
 */
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import {
  adminOrderList,
  AdminOrderListOriginItem,
  AdminOrderListStatusItem,
} from '@embroidery/api-client';

import { OrderQueueScreen } from '../../src/features/order-queue';
import { envelope, makeQueueItem, makeQueuePage, ORDER_ID_PAID } from '../support/order-fixture';

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
    usePathname: () => '/orders',
    useSearchParams: () => new URLSearchParams(state.search),
  };
});

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminOrderList: jest.fn(),
}));

import * as navigation from 'next/navigation';

const navState = (navigation as unknown as { __state: { search: string } }).__state;
const navRouter = (navigation as unknown as { __router: { replace: jest.Mock } }).__router;
const listMock = adminOrderList as jest.MockedFunction<typeof adminOrderList>;

const lastParams = () =>
  (listMock.mock.calls[listMock.mock.calls.length - 1] as unknown as [Record<string, unknown>])[0];

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  navState.search = '';
  user = createUser();
  listMock.mockResolvedValue(envelope(makeQueuePage([makeQueueItem()])));
});

const render = () => renderWithProviders(<OrderQueueScreen />);

type Rerender = { rerender: (ui: React.ReactElement) => void };
const replayNavigation = (view: Rerender) => {
  view.rerender(<OrderQueueScreen />);
};

describe('the status filter', () => {
  it('offers exactly the states and origins the contract publishes, and nothing else', async () => {
    render();
    await screen.findByTestId('order-queue-table');

    // Thirteen states plus two origins (`APP12-A02-C1`). Both counts are taken
    // from the generated enums as well as spelled out, so a contract that
    // gained or lost a value fails here rather than leaving a stale checkbox.
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(
      Object.values(AdminOrderListStatusItem).length +
        Object.values(AdminOrderListOriginItem).length,
    );
    expect(Object.values(AdminOrderListStatusItem)).toHaveLength(13);
    expect(Object.values(AdminOrderListOriginItem)).toHaveLength(2);

    // The two Ready-Made states an operator has to triage by are offered.
    expect(screen.getByTestId('order-filter-AWAITING_SHIPPING_FEE')).toBeInTheDocument();
    expect(screen.getByTestId('order-filter-AWAITING_PAYMENT')).toBeInTheDocument();
    expect(screen.getByTestId('order-origin-filter-READY_MADE')).toBeInTheDocument();
    expect(screen.getByTestId('order-origin-filter-CUSTOM')).toBeInTheDocument();

    // No speculative control the API could not serve: the list publishes
    // status, origin, limit and cursor and nothing else.
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/từ ngày|đến ngày|sku|nhà cung cấp/i)).not.toBeInTheDocument();
  });

  it('sends the origin to the server rather than filtering rows in the browser', async () => {
    const view = render();
    await screen.findByTestId('order-queue-table');

    await user.click(screen.getByTestId('order-origin-filter-READY_MADE'));
    replayNavigation(view);

    // The parameter goes on the wire. A keyset-paginated queue filtered in the
    // browser would return short pages and a cursor that skips whatever the
    // predicate removed, so the origin has to be the server's predicate.
    await waitFor(() => {
      expect(lastParams()['origin']).toEqual(['READY_MADE']);
    });
    expect(navRouter.replace).toHaveBeenCalledWith('/orders?origin=READY_MADE', { scroll: false });
  });

  it('carries both filters in one URL, each as its own repeatable parameter', async () => {
    const view = render();
    await screen.findByTestId('order-queue-table');

    await user.click(screen.getByTestId('order-filter-AWAITING_SHIPPING_FEE'));
    replayNavigation(view);
    await user.click(screen.getByTestId('order-origin-filter-READY_MADE'));
    replayNavigation(view);

    await waitFor(() => {
      expect(lastParams()['status']).toEqual(['AWAITING_SHIPPING_FEE']);
    });
    expect(lastParams()['origin']).toEqual(['READY_MADE']);
    expect(navRouter.replace).toHaveBeenLastCalledWith(
      '/orders?status=AWAITING_SHIPPING_FEE&origin=READY_MADE',
      { scroll: false },
    );
  });

  it('reads a repeated origin with getAll, so a bookmarked URL survives', async () => {
    navState.search = 'origin=CUSTOM&origin=READY_MADE';

    render();
    await screen.findByTestId('order-queue-table');

    expect(screen.getByTestId('order-origin-filter-CUSTOM')).toBeChecked();
    expect(screen.getByTestId('order-origin-filter-READY_MADE')).toBeChecked();
    expect(screen.getByTestId('order-origin-filter-summary')).toHaveTextContent('2 đã chọn');
  });

  it('drops an origin the contract does not publish rather than sending it', async () => {
    navState.search = 'origin=READYMADE&origin=READY_MADE';

    render();
    await screen.findByTestId('order-queue-table');

    // The queue must never send the server a value it does not publish, and a
    // hand-edited URL is exactly where one would come from.
    await waitFor(() => {
      expect(lastParams()['origin']).toEqual(['READY_MADE']);
    });
  });

  it('sends no origin at all while nothing is selected', async () => {
    render();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    expect('origin' in lastParams()).toBe(false);
    expect(screen.getByTestId('order-origin-filter-summary')).toHaveTextContent('Tất cả');
  });

  it('sends no status at all while nothing is selected', async () => {
    render();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    expect('status' in lastParams()).toBe(false);
    expect(screen.getByTestId('order-filter-summary')).toHaveTextContent('Tất cả');
  });

  it('sends a selection as a repeatable array, in contract order', async () => {
    const view = render();
    await screen.findByTestId('order-queue-table');

    await user.click(screen.getByTestId('order-filter-DEPOSIT_PAID'));
    replayNavigation(view);
    await user.click(screen.getByTestId('order-filter-AWAITING_DEPOSIT'));
    replayNavigation(view);

    await waitFor(() => {
      // Declaration order, not click order: two spellings of one selection would
      // otherwise be two cache entries.
      expect(lastParams()['status']).toEqual(['AWAITING_DEPOSIT', 'DEPOSIT_PAID']);
    });
    expect(navRouter.replace).toHaveBeenCalledWith(
      '/orders?status=AWAITING_DEPOSIT&status=DEPOSIT_PAID',
      { scroll: false },
    );
  });

  it('reads a repeated parameter with getAll, not get', async () => {
    navState.search = 'status=AWAITING_DEPOSIT&status=DEPOSIT_PAID';

    render();
    await screen.findByTestId('order-queue-table');

    // Both boxes are ticked. `get` would have seen only the first, and the
    // second status would have silently vanished from a bookmarked URL.
    expect(screen.getByTestId('order-filter-AWAITING_DEPOSIT')).toBeChecked();
    expect(screen.getByTestId('order-filter-DEPOSIT_PAID')).toBeChecked();
    expect(screen.getByTestId('order-filter-IN_PRODUCTION')).not.toBeChecked();
    expect(screen.getByTestId('order-filter-summary')).toHaveTextContent('2 đã chọn');
  });

  it('drops an unrecognised URL value instead of sending it to the server', async () => {
    navState.search = 'status=NOT_A_STATE&status=DEPOSIT_PAID';

    render();
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    expect(lastParams()['status']).toEqual(['DEPOSIT_PAID']);
  });

  it('clears the query string entirely when the selection is reset', async () => {
    navState.search = 'status=DEPOSIT_PAID';

    render();
    await screen.findByTestId('order-queue-table');
    await user.click(screen.getByTestId('order-filter-reset'));

    expect(navRouter.replace).toHaveBeenCalledWith('/orders', { scroll: false });
  });

  it('offers no reset while nothing is filtered', async () => {
    render();
    await screen.findByTestId('order-queue-table');

    expect(screen.queryByTestId('order-filter-reset')).not.toBeInTheDocument();
  });
});

describe('cursor continuation', () => {
  it('sends the server cursor verbatim and appends the page', async () => {
    listMock
      .mockResolvedValueOnce(
        envelope(makeQueuePage([makeQueueItem()], { next: 'opaque-cursor-1' })),
      )
      .mockResolvedValueOnce(
        envelope(
          makeQueuePage([makeQueueItem({ orderId: ORDER_ID_PAID, code: 'ORD-T9RC3MJW7Q' })]),
        ),
      );

    render();
    await user.click(await screen.findByTestId('order-queue-load-more'));

    await waitFor(() => {
      expect(screen.getAllByTestId('order-queue-row')).toHaveLength(2);
    });
    // Opaque: passed back exactly as issued, never parsed into a page number.
    expect(lastParams()['cursor']).toBe('opaque-cursor-1');
  });

  it('offers no continuation on the last page, and no page numbers anywhere', async () => {
    render();
    await screen.findByTestId('order-queue-table');

    expect(screen.queryByTestId('order-queue-load-more')).not.toBeInTheDocument();
    expect(screen.queryByText(/trang \d/i)).not.toBeInTheDocument();
  });

  it('says a narrowed queue found nothing, rather than that there are no orders', async () => {
    navState.search = 'status=CANCELLED';
    listMock.mockResolvedValue(envelope(makeQueuePage([])));

    render();

    expect(await screen.findByTestId('order-queue-filter-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('order-queue-empty')).not.toBeInTheDocument();
  });
});
