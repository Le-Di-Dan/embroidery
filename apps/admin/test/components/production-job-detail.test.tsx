/**
 * The Admin production job detail — what each of the five approved states puts
 * on screen, and what none of them puts there (`APP8-A03`; `784:3`, `784:129`,
 * `785:3`, `785:134`, `785:270`).
 *
 * The assertions that matter are about truthfulness, because each is a sentence
 * an operator would act on:
 *
 *  - the frozen specification renders the API's own values and nothing derived;
 *  - the reservation section is display context, and a COP-only order shows the
 *    approved neutral state rather than a fabricated row;
 *  - a mixed order shows real Catalog rows only;
 *  - the history is the server's order with no invented creation row;
 *  - the action set follows the current status, and a terminal job offers none;
 *  - no second read is opened to enrich anything.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminProductionJobGet } from '@embroidery/api-client';

import { ProductionJobScreen } from '../../src/features/production-job';
import { makeApiClientError } from '../support/api-error';
import {
  DETAIL_APPROVAL_ID,
  DETAIL_JOB_ID,
  DETAIL_ORDER_CODE,
  DETAIL_ORDER_ID,
  DETAIL_SKU_ID,
  jobEnvelope,
  makeCatalogSummary,
  makeCustomerOwnedSpecification,
  makeCustomerOwnedSummary,
  makeJobDetail,
  makeMixedSummary,
  makeReservation,
  makeTransition,
} from '../support/production-job-fixture';

// The path is a literal: a `jest.mock` factory is hoisted above the imports, so
// it cannot close over `DETAIL_JOB_ID`.
jest.mock(
  'next/navigation',
  () => mockCreateNavigationMock('/san-xuat/019a0000-0000-7000-8000-000000006091').module,
);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductionJobGet: jest.fn(),
  adminProductionJobTransition: jest.fn(),
}));

const getMock = adminProductionJobGet as jest.MockedFunction<typeof adminProductionJobGet>;

beforeEach(() => {
  jest.clearAllMocks();
  getMock.mockResolvedValue(jobEnvelope(makeJobDetail()));
});

const render = () => renderWithProviders(<ProductionJobScreen jobId={DETAIL_JOB_ID} />);

async function renderJob(job: ReturnType<typeof makeJobDetail>) {
  getMock.mockResolvedValue(jobEnvelope(job));
  render();
  await screen.findByTestId('production-job-header');
}

describe('the generated boundary', () => {
  it('reads the job through the one generated detail operation, addressed by id', async () => {
    render();

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(1);
    });
    const [jobId] = getMock.mock.calls[0] as unknown as [string];
    expect(jobId).toBe(DETAIL_JOB_ID);
  });

  it('issues exactly one request per load — there is no polling and no retry loop', async () => {
    render();
    await screen.findByTestId('production-job-header');

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});

describe('PLANNED · Catalog (`784:3`)', () => {
  it('renders the job identity, the order link and the approval it was frozen from', async () => {
    await renderJob(makeJobDetail());

    const header = screen.getByTestId('production-job-header');
    expect(within(header).getByTestId('production-job-id')).toHaveAttribute('title', DETAIL_JOB_ID);
    expect(within(header).getByText(DETAIL_ORDER_CODE)).toBeInTheDocument();
    expect(screen.getByTestId('production-job-order-link')).toHaveAttribute(
      'href',
      `/orders/${DETAIL_ORDER_ID}`,
    );
    expect(within(header).getByTitle(DETAIL_APPROVAL_ID)).toBeInTheDocument();
    // A PLANNED job has no `startedAt` at all, so the frame says so rather than
    // printing an empty or invented date.
    expect(within(header).getByText('Chưa bắt đầu')).toBeInTheDocument();
    expect(screen.getByTestId('production-job-status')).toHaveAttribute('data-status', 'PLANNED');
  });

  it('offers Start and Cancel, and nothing else', async () => {
    await renderJob(makeJobDetail());

    expect(screen.getByTestId('production-job-start')).toBeInTheDocument();
    expect(screen.getByTestId('production-job-cancel')).toBeInTheDocument();
    expect(screen.queryByTestId('production-job-complete')).not.toBeInTheDocument();
  });

  it('renders the reservation rows as informational context, never as a gate', async () => {
    await renderJob(makeJobDetail());

    const rows = within(screen.getByTestId('production-job-reservation-rows')).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-status', 'RESERVED');
    expect(screen.getByTestId('production-job-not-gate')).toBeInTheDocument();
    // The start control is not disabled by anything read from this section: the
    // server decides under the stock row lock, and the client never re-derives
    // GRD-015.
    expect(screen.getByTestId('production-job-start')).toBeEnabled();
  });
});

describe('STARTED · mixed order (`784:129`)', () => {
  it('offers Complete and Cancel, and no Start', async () => {
    await renderJob(
      makeJobDetail({
        status: 'STARTED',
        startedAt: '2026-08-25T02:42:00.000Z',
        reservationSummary: makeMixedSummary(),
        transitions: [makeTransition()],
      }),
    );

    expect(screen.getByTestId('production-job-complete')).toBeInTheDocument();
    expect(screen.getByTestId('production-job-cancel')).toBeInTheDocument();
    expect(screen.queryByTestId('production-job-start')).not.toBeInTheDocument();
  });

  it('shows the Catalog reservation only, plus the truthful mixed note', async () => {
    await renderJob(makeJobDetail({ status: 'STARTED', reservationSummary: makeMixedSummary() }));

    // Both counts are published, so both are shown — but only the Catalog
    // portion has a reservation row, and no COP row is fabricated to balance it.
    expect(screen.getByTestId('production-job-catalog-count')).toHaveTextContent('1');
    expect(screen.getByTestId('production-job-cop-count')).toHaveTextContent('1');
    const rows = within(screen.getByTestId('production-job-reservation-rows')).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-status', 'CONSUMED');
    expect(screen.getByTestId('production-job-mixed-note')).toBeInTheDocument();
  });
});

describe('COMPLETED (`785:3`)', () => {
  it('exposes no production mutation and no next-phase action', async () => {
    await renderJob(
      makeJobDetail({
        status: 'COMPLETED',
        startedAt: '2026-08-23T01:10:00.000Z',
        completedAt: '2026-08-24T10:02:00.000Z',
        reservationSummary: makeCatalogSummary({
          reservations: [makeReservation({ status: 'CONSUMED' })],
        }),
        transitions: [
          makeTransition(),
          makeTransition({ fromStatus: 'STARTED', toStatus: 'COMPLETED' }),
        ],
      }),
    );

    for (const control of ['start', 'complete', 'cancel']) {
      expect(screen.queryByTestId(`production-job-${control}`)).not.toBeInTheDocument();
    }
    // APP8's terminal state. No remaining-payment, shipping, settlement or
    // rework control exists here, before or after completion.
    expect(screen.getByTestId('production-job-actions')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('CANCELLED (`785:134`)', () => {
  it('publishes the recorded reason and states this was not an order cancellation', async () => {
    await renderJob(
      makeJobDetail({
        status: 'CANCELLED',
        cancelledAt: '2026-08-22T03:11:00.000Z',
        cancelledReason: 'Khách yêu cầu đổi vị trí thêu; bản duyệt hiện tại không còn đúng.',
        reservationSummary: makeCatalogSummary({
          reservations: [makeReservation({ status: 'RELEASED' })],
        }),
        transitions: [
          makeTransition({ toStatus: 'CANCELLED', reason: 'Khách yêu cầu đổi vị trí thêu' }),
        ],
      }),
    );

    expect(screen.getByTestId('production-job-cancelled-reason')).toHaveTextContent(
      'Khách yêu cầu đổi vị trí thêu',
    );
    expect(
      within(screen.getByTestId('production-job-cancellation')).getByText(
        /không phải huỷ đơn hàng/i,
      ),
    ).toBeInTheDocument();
    // No restart, no refund, no order cancellation.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // The terminal reservation row survives, so "held then released" stays
    // distinguishable from "never held".
    const rows = within(screen.getByTestId('production-job-reservation-rows')).getAllByRole(
      'listitem',
    );
    expect(rows[0]).toHaveAttribute('data-status', 'RELEASED');
  });
});

describe('PLANNED · customer-owned only (`785:270`)', () => {
  it('renders the neutral no-reservation state with no fabricated SKU or row', async () => {
    await renderJob(makeJobDetail({ reservationSummary: makeCustomerOwnedSummary() }));

    expect(screen.getByTestId('production-job-no-reservation')).toBeInTheDocument();
    expect(screen.queryByTestId('production-job-reservation-rows')).not.toBeInTheDocument();
    expect(screen.getByTestId('production-job-catalog-count')).toHaveTextContent('0');
    expect(screen.getByTestId('production-job-cop-count')).toHaveTextContent('1');
    // Not an error and not a warning: the absence is by design, and the start
    // control is still offered because the server decides, not this screen.
    expect(screen.queryByTestId('production-job-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('production-job-start')).toBeEnabled();
  });
});

describe('the frozen specification (`784:47`)', () => {
  it('renders the published values exactly, with no live catalog read', async () => {
    await renderJob(makeJobDetail());

    const card = screen.getByTestId('production-job-specification');
    expect(within(card).getByText('Áo thun cotton — Tee')).toBeInTheDocument();
    expect(within(card).getByText('Đen / M')).toBeInTheDocument();
    // The stored numerics are joined, never parsed or rounded.
    expect(within(card).getByText('120.00 × 80.00 mm')).toBeInTheDocument();
    expect(screen.getByTestId('production-job-document-hash')).toHaveTextContent(
      'sha256:0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0',
    );
    // Exactly one request was made for the whole page.
    expect(getMock).toHaveBeenCalledTimes(1);
    // Nothing on the card is an input: this is authority, not a catalog form.
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('states the two contract absences as absences rather than filling them in', async () => {
    await renderJob(
      makeJobDetail({
        specification: makeCustomerOwnedSpecification(),
        reservationSummary: makeCustomerOwnedSummary(),
      }),
    );

    const card = screen.getByTestId('production-job-specification');
    expect(within(card).getByText(/khách tự mang: luôn vắng/)).toBeInTheDocument();
    expect(within(card).getByText(/không ghi tham số khi tạo lệnh/)).toBeInTheDocument();
  });
});

describe('the transition history (`784:84`)', () => {
  it('preserves the server order and invents no creation row', async () => {
    await renderJob(
      makeJobDetail({
        status: 'COMPLETED',
        transitions: [
          makeTransition(),
          makeTransition({
            fromStatus: 'STARTED',
            toStatus: 'COMPLETED',
            occurredAt: '2026-08-24T10:02:00.000Z',
          }),
        ],
      }),
    );

    const rows = screen.getAllByTestId('production-job-history-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('PLANNED → STARTED');
    expect(rows[1]).toHaveTextContent('STARTED → COMPLETED');
    // Creating a job is not recorded as a transition, so no such row exists.
    expect(screen.queryByText(/\(created\)/i)).not.toBeInTheDocument();
    // Actor attribution is the role plus a shortened admin id; a customer never
    // appears, and the full id is not printed.
    expect(rows[0]).toHaveTextContent('ADMIN · 7c19…8b41');
  });

  it('renders the approved empty history for a fresh PLANNED job', async () => {
    await renderJob(makeJobDetail());

    expect(screen.getByTestId('production-job-history-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('production-job-history-row')).not.toBeInTheDocument();
  });
});

describe('read states', () => {
  it('shows the loading frame with no action control at all', async () => {
    getMock.mockImplementation(() => new Promise(() => undefined));
    render();

    expect(await screen.findByTestId('production-job-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('production-job-start')).not.toBeInTheDocument();
    expect(screen.queryByTestId('production-job-actions')).not.toBeInTheDocument();
  });

  it('reports a 404 as "not found" with a way back to the queue', async () => {
    getMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'PRODUCTION_JOB_NOT_FOUND' }),
    );
    render();

    const panel = await screen.findByTestId('production-job-error');
    expect(within(panel).getByText('Không tìm thấy lệnh sản xuất')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /hàng đợi/i })).toHaveAttribute(
      'href',
      '/san-xuat',
    );
    // A failure is never rendered as an empty job.
    expect(screen.queryByTestId('production-job-specification')).not.toBeInTheDocument();
  });

  it('reports a sanitised server failure without quoting the server message', async () => {
    getMock.mockRejectedValue(
      makeApiClientError({ status: 500, code: 'INTERNAL_ERROR', message: 'pg: deadlock detected' }),
    );
    render();

    const panel = await screen.findByTestId('production-job-error');
    expect(within(panel).getByText('Không tải được chi tiết lệnh')).toBeInTheDocument();
    expect(screen.queryByText(/deadlock/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('production-job-retry')).toBeInTheDocument();
  });
});

describe('no unsupported capability is invented', () => {
  it('renders no SKU code, priority, operator, machine or attempt anywhere', async () => {
    await renderJob(makeJobDetail());

    // The reservation contract publishes ids only, so the row is labelled by a
    // shortened id with the full value in `title` — never by a catalog code no
    // accepted operation returns.
    expect(screen.getByTitle(DETAIL_SKU_ID)).toBeInTheDocument();

    // The whole rendered page, checked for the vocabulary a production screen is
    // tempted to grow. None of these exists on any accepted contract, so any of
    // them on screen would be a capability invented here.
    const page = screen.getByTestId('production-job-page').textContent ?? '';
    for (const absent of [
      'skuCode',
      'priority',
      'Độ ưu tiên',
      'operatorId',
      'machineId',
      'attemptCount',
      'Thợ phụ trách',
      'Máy thêu',
    ]) {
      expect(page).not.toContain(absent);
    }

    // Exactly the two controls PLANNED draws — no rework, reopen, refund, order
    // cancellation, remaining payment or shipping button anywhere.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
