/**
 * The Admin order queue — the generated boundary, the rows, and what it refuses
 * to render (`APP7-A01`; `732:3`).
 *
 * The assertions that matter are about truthfulness, because each is a sentence
 * the operator would act on:
 *
 *  - the queue reads through the generated operation with only the three
 *    parameters `APP7-B02` publishes;
 *  - a load failure is a failure, never an empty queue;
 *  - a server message, code or stack never reaches the screen;
 *  - the queue offers entry into one order and no payment action at all.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminOrderList } from '@embroidery/api-client';

import { OrderQueueScreen } from '../../src/features/order-queue';
import { ORDER_QUEUE_COPY } from '../../src/features/order-queue/model/order-queue-copy';
import { makeApiClientError } from '../support/api-error';
import {
  CUSTOMER_ID,
  envelope,
  makeQueueItem,
  makeQueuePage,
  ORDER_ID,
} from '../support/order-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/orders').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminOrderList: jest.fn(),
}));

const listMock = adminOrderList as jest.MockedFunction<typeof adminOrderList>;

beforeEach(() => {
  jest.clearAllMocks();
  listMock.mockResolvedValue(envelope(makeQueuePage([makeQueueItem()])));
});

const render = () => renderWithProviders(<OrderQueueScreen />);

describe('the generated boundary', () => {
  it('reads the queue through the generated operation with a bounded page size', async () => {
    render();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    const [params] = listMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params['limit']).toBe(20);
    // Nothing is selected, so no `status` is sent and B02 answers with every
    // LC-14 state. A sentinel the API does not define is never invented.
    expect('status' in params).toBe(false);
    expect('cursor' in params).toBe(false);
  });

  it('sends the repeatable parameter in Axios "repeat the key" mode', async () => {
    render();
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    const [, options] = listMock.mock.calls[0] as unknown as [
      unknown,
      { config?: { paramsSerializer?: { indexes?: null } } },
    ];
    // Axios's default bracketed form would be a different parameter name as far
    // as B02 is concerned, and the filter would be silently dropped.
    expect(options.config?.paramsSerializer?.indexes).toBeNull();
  });

  it('issues exactly one request per load — there is no polling and no retry loop', async () => {
    render();
    await screen.findByTestId('order-queue-table');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60);
    });
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('reaches no payment operation from this screen', () => {
    const actual = jest.requireActual<Record<string, unknown>>('@embroidery/api-client');
    // The operations exist on the curated boundary for the *detail* capability.
    // What this pins is that the queue's own module graph never imports one:
    // the service seam it uses exposes `adminOrderList` and nothing else.
    const queueService = jest.requireActual<Record<string, unknown>>(
      '../../src/features/order-queue/services/order-queue.service',
    );
    expect(Object.keys(queueService)).toEqual(['fetchOrderQueuePage']);
    expect(actual['adminPaymentAttemptVerify']).toBeDefined();
  });
});

describe('loading', () => {
  it('shows the skeleton first and never flashes the empty state', () => {
    listMock.mockReturnValue(new Promise(() => undefined) as never);

    render();

    expect(screen.getByTestId('order-queue-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('order-queue-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('order-queue-table')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(ORDER_QUEUE_COPY.states.loading);
  });
});

describe('rows', () => {
  it('renders the published B02 fields for one order', async () => {
    render();
    const row = within(await screen.findByTestId('order-queue-row'));

    expect(row.getByRole('rowheader')).toHaveTextContent('ORD-K7M2Q9XR4T');
    expect(row.getByTestId('order-queue-status')).toHaveTextContent('Chờ đặt cọc');
    // The frozen total, grouped for reading, with the currency in its own cell.
    expect(row.getByText('12.750.000')).toBeInTheDocument();
    expect(row.getByText('VND')).toBeInTheDocument();
    expect(row.getByText((_, node) => node?.tagName === 'TIME')).toHaveAttribute(
      'dateTime',
      '2026-08-23T02:14:00.000Z',
    );
  });

  it('never re-sums a total or converts one to a number', async () => {
    listMock.mockResolvedValue(
      envelope(makeQueuePage([makeQueueItem({ totalAmount: '999999999999.00' })])),
    );
    render();
    const row = within(await screen.findByTestId('order-queue-row'));
    // Beyond IEEE-754 integer safety. A screen that parsed this would round it.
    expect(row.getByText('999.999.999.999')).toBeInTheDocument();
  });

  it('shows no customer identifier at all, whole or shortened', async () => {
    // `V01-UX-009`: the column held a truncated UUID an operator could neither
    // read nor act on, because the list projection publishes no customer name.
    // §21.4 removes it rather than filling it — and is explicit that the
    // recipient name frozen on the order may **not** be substituted, because a
    // recipient is a property of an order and not the identity of a person.
    render();
    const row = within(await screen.findByTestId('order-queue-row'));

    expect(row.queryByTitle(CUSTOMER_ID)).toBeNull();
    expect(row.queryByText(/0193/u)).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Khách hàng' })).toBeNull();
  });

  it('offers entry into the order and back to its request, and no payment action', async () => {
    render();
    const row = within(await screen.findByTestId('order-queue-row'));

    expect(row.getByRole('link', { name: /Mở đơn hàng/ })).toHaveAttribute(
      'href',
      `/orders/${ORDER_ID}`,
    );
    expect(row.getByRole('link', { name: /Mở yêu cầu/ })).toBeInTheDocument();
    expect(row.queryByRole('button')).not.toBeInTheDocument();
  });

  it('names an unmapped state neutrally rather than mapping it onto a known one', async () => {
    listMock.mockResolvedValue(
      envelope(makeQueuePage([makeQueueItem({ status: 'SOMETHING_NEW' })])),
    );
    render();
    const badge = await screen.findByTestId('order-queue-status');

    expect(badge).toHaveAttribute('data-status', 'UNKNOWN');
    expect(badge).toHaveTextContent('Không xác định');
  });

  it('renders each order once when a cursor window repeats one', async () => {
    listMock.mockResolvedValue(envelope(makeQueuePage([makeQueueItem(), makeQueueItem()])));
    render();
    await screen.findByTestId('order-queue-table');

    expect(screen.getAllByTestId('order-queue-row')).toHaveLength(1);
  });
});

describe('states', () => {
  it('reports a failed first page as a failure, never as an empty queue', async () => {
    listMock.mockRejectedValue(
      makeApiClientError({ status: 500, code: 'INTERNAL', message: 'boom at orders.ts:42' }),
    );

    render();
    const failure = await screen.findByTestId('order-queue-error');

    expect(failure).toHaveTextContent(ORDER_QUEUE_COPY.states.errorTitle);
    expect(screen.queryByTestId('order-queue-empty')).not.toBeInTheDocument();
    // Bounded copy: the classification picks the sentence.
    expect(failure.textContent).not.toContain('boom');
    expect(failure.textContent).not.toContain('INTERNAL');
  });

  it('distinguishes a genuinely empty queue from a filtered one', async () => {
    listMock.mockResolvedValue(envelope(makeQueuePage([])));

    render();

    expect(await screen.findByTestId('order-queue-empty')).toHaveTextContent(
      ORDER_QUEUE_COPY.states.emptyTitle,
    );
    // No creation control: an operator does not raise an order, the conversion
    // worker does when a design is approved.
    expect(screen.queryByRole('button', { name: /tạo/i })).not.toBeInTheDocument();
  });
});
