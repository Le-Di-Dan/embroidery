/**
 * The Admin production queue — the generated boundary, the rows, and the four
 * states the queue can be in without an operator touching a filter
 * (`APP8-A02`; `780:3`, `782:3`, `782:89`, `782:206`).
 *
 * The assertions that matter are about truthfulness, because each is a sentence
 * the operator would act on:
 *
 *  - the queue reads through the generated operation with only the parameters
 *    `APP8-B03` publishes;
 *  - a row states ids, a status and timestamps, and nothing the contract does
 *    not carry — no `ORD-…` code, no product, no priority, no operator;
 *  - server order is what is rendered;
 *  - a load failure is a failure, never an empty queue;
 *  - a server message, code or stack never reaches the screen as the copy;
 *  - the queue offers entry into one job and no production mutation at all.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminProductionJobList } from '@embroidery/api-client';

import { ProductionQueueScreen } from '../../src/features/production-queue';
import { PRODUCTION_QUEUE_COPY } from '../../src/features/production-queue/model/production-queue-copy';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import {
  APPROVAL_SNAPSHOT_ID,
  envelope,
  JOB_ID,
  JOB_ID_CANCELLED,
  JOB_ID_COMPLETED,
  JOB_ID_STARTED,
  makeJob,
  makeQueuePage,
  ORDER_ID,
} from '../support/production-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/san-xuat').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductionJobList: jest.fn(),
}));

const listMock = adminProductionJobList as jest.MockedFunction<typeof adminProductionJobList>;

beforeEach(() => {
  jest.clearAllMocks();
  listMock.mockResolvedValue(envelope(makeQueuePage([makeJob()])));
});

const render = () => renderWithProviders(<ProductionQueueScreen />);

describe('the generated boundary', () => {
  it('reads the queue through the generated operation with a bounded page size', async () => {
    render();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    const [params] = listMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params['limit']).toBe(20);
    // Nothing is selected, so no `status` is sent and B03 answers with every
    // LC-18 state. A sentinel the API does not define is never invented.
    expect('status' in params).toBe(false);
    expect('orderId' in params).toBe(false);
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
    // The query schema is `.strict()`, so Axios's default `status[0]` form would
    // not merely be dropped — it is an unknown parameter and the whole request
    // is refused with a 400.
    expect(options.config?.paramsSerializer?.indexes).toBeNull();
  });

  it('issues exactly one request per load — there is no polling and no retry loop', async () => {
    render();
    await screen.findByTestId('production-queue-table');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60);
    });
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('reaches no production mutation and no second read from this screen', () => {
    const actual = jest.requireActual<Record<string, unknown>>('@embroidery/api-client');
    // The queue's service seam exposes one function, and the public api-client
    // boundary does not publish the three mutations to this app at all — so
    // "the queue cannot start, complete or cancel a job" is a fact of the module
    // graph rather than a convention.
    const queueService = jest.requireActual<Record<string, unknown>>(
      '../../src/features/production-queue/services/production-queue.service',
    );
    expect(Object.keys(queueService)).toEqual(['fetchProductionQueuePage']);
    expect(actual['adminProductionJobList']).toBeDefined();
    for (const forbidden of [
      'adminProductionJobCreate',
      'adminProductionJobGet',
      'adminProductionJobTransition',
    ]) {
      expect(actual[forbidden]).toBeUndefined();
    }
  });
});

describe('loading', () => {
  it('shows the skeleton first and never flashes the empty state', () => {
    listMock.mockReturnValue(new Promise(() => undefined) as never);

    render();

    expect(screen.getByTestId('production-queue-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('production-queue-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('production-queue-table')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(PRODUCTION_QUEUE_COPY.states.loading);
    // `782:205`: no count and no emptiness is claimed while nothing is known —
    // the skeleton keeps the table's geometry and says so.
    expect(screen.queryByText(PRODUCTION_QUEUE_COPY.states.emptyTitle)).not.toBeInTheDocument();
    expect(screen.getByText(PRODUCTION_QUEUE_COPY.states.loadingNote)).toBeInTheDocument();
  });
});

describe('rows', () => {
  it('renders the published B03 fields for one job, shortened with the full id in title', async () => {
    render();
    const row = within(await screen.findByTestId('production-queue-row'));

    const jobCell = row.getByRole('rowheader');
    expect(jobCell).toHaveTextContent('019a…6091');
    expect(jobCell).toHaveAttribute('title', JOB_ID);
    expect(row.getByTitle(ORDER_ID)).toHaveTextContent('019a…6081');
    expect(row.getByTitle(APPROVAL_SNAPSHOT_ID)).toHaveTextContent('019a…6031');
    expect(row.getByTestId('production-queue-status')).toHaveTextContent('Đã lên lệnh');
    expect(row.getByTestId('production-queue-status')).toHaveAttribute('data-status', 'PLANNED');
    expect(row.getByRole('link')).toHaveAttribute('href', `/san-xuat/${JOB_ID}`);
  });

  it('renders a PLANNED job with no milestone rather than an invented one', async () => {
    render();
    const row = within(await screen.findByTestId('production-queue-row'));

    expect(row.getByText(PRODUCTION_QUEUE_COPY.milestones.none)).toBeInTheDocument();
    expect(row.queryByText(/bắt đầu|xong|huỷ/)).not.toBeInTheDocument();
  });

  it('selects the milestone by lifecycle precedence, not by comparing instants', async () => {
    listMock.mockResolvedValue(
      envelope(
        makeQueuePage([
          makeJob({
            jobId: JOB_ID_STARTED,
            status: 'STARTED',
            startedAt: '2026-08-25T01:30:00.000Z',
          }),
          makeJob({
            jobId: JOB_ID_COMPLETED,
            status: 'COMPLETED',
            startedAt: '2026-08-23T01:00:00.000Z',
            completedAt: '2026-08-24T10:02:00.000Z',
          }),
          makeJob({
            jobId: JOB_ID_CANCELLED,
            status: 'CANCELLED',
            // A job cancelled after it started keeps both timestamps; the
            // cancellation is the milestone, and the later instant is not what
            // decides that.
            startedAt: '2026-08-24T09:00:00.000Z',
            cancelledAt: '2026-08-22T03:11:00.000Z',
          }),
        ]),
      ),
    );

    render();
    const rows = await screen.findAllByTestId('production-queue-row');

    expect(within(rows[0] as HTMLElement).getByText(/^bắt đầu/)).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText(/^xong/)).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText(/^huỷ/)).toBeInTheDocument();
  });

  it('preserves the server order and never re-sorts', async () => {
    listMock.mockResolvedValue(
      envelope(
        makeQueuePage([
          // Deliberately not newest-first and not status-grouped: whatever the
          // server sent is what is rendered, because the cursor pages by the
          // same key the order comes from.
          makeJob({
            jobId: JOB_ID_CANCELLED,
            status: 'CANCELLED',
            createdAt: '2026-08-21T16:45:00.000Z',
          }),
          makeJob({ jobId: JOB_ID, createdAt: '2026-08-25T02:00:00.000Z' }),
          makeJob({
            jobId: JOB_ID_STARTED,
            status: 'STARTED',
            createdAt: '2026-08-24T07:10:00.000Z',
          }),
        ]),
      ),
    );

    render();
    const rows = await screen.findAllByTestId('production-queue-row');

    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      '019a…6095',
      '019a…6091',
      '019a…6092',
    ]);
  });

  it('renders exactly the six published columns and invents none', async () => {
    render();
    await screen.findByTestId('production-queue-table');

    const table = within(screen.getByTestId('production-queue-table'));
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual([
      PRODUCTION_QUEUE_COPY.columns.jobId,
      PRODUCTION_QUEUE_COPY.columns.orderId,
      PRODUCTION_QUEUE_COPY.columns.approvalSnapshotId,
      PRODUCTION_QUEUE_COPY.columns.status,
      PRODUCTION_QUEUE_COPY.columns.createdAt,
      PRODUCTION_QUEUE_COPY.columns.milestone,
      // The action column's header is a screen-reader label, drawn blank.
      PRODUCTION_QUEUE_COPY.columns.open,
    ]);
    // The queue publishes no order code and no frozen specification, so no
    // column offers a place to put one. Scoped to the table: the filter bar's
    // scope line deliberately *names* the absent filters in prose (`780:39`),
    // and that sentence is the opposite of inventing them.
    expect(table.queryByText(/ORD-/)).not.toBeInTheDocument();
    expect(
      table.queryByText(/sản phẩm|mẫu mã|kích thước|số lượng|ưu tiên|thợ|máy|SLA/i),
    ).not.toBeInTheDocument();
  });

  it('offers no production mutation control anywhere on the screen', async () => {
    render();
    await screen.findByTestId('production-queue-table');

    expect(
      screen.queryByRole('button', { name: /bắt đầu|hoàn tất|huỷ lệnh|tạo lệnh/i }),
    ).not.toBeInTheDocument();
  });
});

describe('the unfiltered empty state', () => {
  it('says the workshop has no jobs, and offers navigation rather than creation', async () => {
    listMock.mockResolvedValue(envelope(makeQueuePage([])));

    render();
    const empty = within(await screen.findByTestId('production-queue-empty'));

    expect(empty.getByText(PRODUCTION_QUEUE_COPY.states.emptyTitle)).toBeInTheDocument();
    // Not a failure, and not a filter: this is the workshop being idle.
    expect(screen.queryByTestId('production-queue-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('production-queue-filter-empty')).not.toBeInTheDocument();
    // `782:42`: creation is nested under an order and needs that order's exact
    // approval and a satisfied deposit, so the queue links to the order list
    // instead of offering a form with no order to submit against.
    expect(
      empty.getByRole('link', { name: PRODUCTION_QUEUE_COPY.actions.openOrders }),
    ).toHaveAttribute('href', '/orders');
    expect(empty.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('read failures', () => {
  it('reports a server failure as a failure, never as an empty queue', async () => {
    listMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));

    render();
    const panel = within(await screen.findByTestId('production-queue-error'));

    expect(panel.getByText(PRODUCTION_QUEUE_COPY.states.errorTitle)).toBeInTheDocument();
    expect(screen.queryByTestId('production-queue-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('production-queue-table')).not.toBeInTheDocument();
    expect(panel.getByTestId('production-queue-retry')).toBeInTheDocument();
  });

  it('retries a server failure on the operator command, and only then', async () => {
    listMock.mockRejectedValueOnce(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));
    const user = createUser();

    render();
    const retry = await screen.findByTestId('production-queue-retry');
    // The failure sat there: `retry: false`, so nothing retried on its own.
    expect(listMock).toHaveBeenCalledTimes(1);

    await user.click(retry);

    await screen.findByTestId('production-queue-table');
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('names the rejected cursor and offers the first page instead of a retry', async () => {
    listMock.mockRejectedValue(
      makeApiClientError({ status: 400, code: 'PRODUCTION_CURSOR_INVALID' }),
    );

    render();
    const panel = within(await screen.findByTestId('production-queue-error'));

    expect(panel.getByText(PRODUCTION_QUEUE_COPY.states.cursorErrorTitle)).toBeInTheDocument();
    // Retrying the same cursor cannot succeed, so it is not what is offered.
    expect(panel.getByTestId('production-queue-first-page')).toBeInTheDocument();
    expect(panel.queryByTestId('production-queue-retry')).not.toBeInTheDocument();
  });

  it('offers a sign-in and no retry when the session has expired', async () => {
    listMock.mockRejectedValue(makeApiClientError({ status: 401, code: 'UNAUTHORIZED' }));

    render();
    const panel = within(await screen.findByTestId('production-queue-error'));

    expect(panel.getByText(PRODUCTION_QUEUE_COPY.states.unauthenticatedTitle)).toBeInTheDocument();
    expect(panel.getByRole('link', { name: PRODUCTION_QUEUE_COPY.actions.signIn })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(panel.queryByTestId('production-queue-retry')).not.toBeInTheDocument();
  });

  it('treats a transport failure with no status line as retryable', async () => {
    listMock.mockRejectedValue(makeNetworkError());

    render();
    const panel = within(await screen.findByTestId('production-queue-error'));

    // A GET changed nothing, so there is no ambiguous band here — retrying is
    // safe and is what is offered.
    expect(panel.getByText(PRODUCTION_QUEUE_COPY.states.errorTitle)).toBeInTheDocument();
    expect(panel.getByTestId('production-queue-retry')).toBeInTheDocument();
  });

  it('never renders a server message, code or requestId as the operator copy', async () => {
    listMock.mockRejectedValue(
      makeApiClientError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'relation "production_jobs" does not exist',
      }),
    );

    render();
    await screen.findByTestId('production-queue-error');

    expect(screen.queryByText(/production_jobs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/req-test-0001/)).not.toBeInTheDocument();
  });
});
