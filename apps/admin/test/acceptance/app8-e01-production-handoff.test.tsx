/**
 * `APP8-E01` — the Admin half of journeys `J3` and `J4`.
 *
 * Three cases, each the frontend boundary of an API journey proved against a
 * real database earlier in the checkpoint:
 *
 * ```text
 * E01-08 (UI part)  /san-xuat renders the returned job from published fields only
 * E01-11            a committed start refreshes to authoritative STARTED truth
 * E01-14            cancellation is a production-job action, not an order one
 * ```
 *
 * The payload values are the ones the `J3`/`J4` acceptance runs committed — a
 * `PLANNED` Catalog job, a start whose receipt reports `STARTED` /
 * `IN_PRODUCTION` / one consumed reservation, and a `PLANNED` cancellation.
 *
 * Deliberately **not** re-proved here (accepted `APP8-A02`/`A03` evidence,
 * unchanged): the full queue filter matrix, keyset load-more, the cursor
 * recovery, every dialog permutation, the refusal catalog and the duplicate
 * submit guard.
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
  adminProductionJobGet,
  adminProductionJobList,
  adminProductionJobTransition,
} from '@embroidery/api-client';

import { ProductionJobScreen } from '../../src/features/production-job';
import { PRODUCTION_TRANSITION_COPY } from '../../src/features/production-job/model/production-transition-copy';
import { ProductionQueueScreen } from '../../src/features/production-queue';
import { productionQueueKeys } from '../../src/features/production-queue';
import {
  DETAIL_JOB_ID,
  jobEnvelope,
  makeJobDetail,
  makeTransition,
  makeTransitionResult,
} from '../support/production-job-fixture';
import { envelope, makeJob, makeQueuePage } from '../support/production-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/san-xuat').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductionJobList: jest.fn(),
  adminProductionJobGet: jest.fn(),
  adminProductionJobTransition: jest.fn(),
}));

const listMock = adminProductionJobList as jest.MockedFunction<typeof adminProductionJobList>;
const getMock = adminProductionJobGet as jest.MockedFunction<typeof adminProductionJobGet>;
const transitionMock = adminProductionJobTransition as jest.MockedFunction<
  typeof adminProductionJobTransition
>;

/** The job `E01-07` created and `E01-08` read back off the queue. */
const PLANNED_JOB = makeJob();

/** The detail `E01-10` produced: STARTED, one transition, reservation consumed. */
const STARTED_DETAIL = makeJobDetail({
  status: 'STARTED',
  startedAt: '2026-08-25T02:42:00.000Z',
  updatedAt: '2026-08-25T02:42:00.000Z',
  transitions: [makeTransition()],
});

const CANCELLATION_REASON = 'Máy thêu hỏng, chuyển đơn sang xưởng khác';

beforeEach(() => {
  jest.clearAllMocks();
  listMock.mockResolvedValue(envelope(makeQueuePage([PLANNED_JOB])));
  getMock.mockResolvedValue(jobEnvelope(makeJobDetail()));
  transitionMock.mockResolvedValue(jobEnvelope(makeTransitionResult()));
});

// -----------------------------------------------------------------------------
// E01-08 (UI part) — the queue shows the created job, from published fields only.
// -----------------------------------------------------------------------------
describe('E01-08 — the production queue renders the returned job', () => {
  it('shows the created job using only fields the queue contract publishes', async () => {
    renderWithProviders(<ProductionQueueScreen />);

    const rows = await screen.findAllByTestId('production-queue-row');
    expect(rows).toHaveLength(1);

    // The full identifiers are carried on `title`; the cells abbreviate them.
    const titles = Array.from((rows[0] as HTMLElement).querySelectorAll('[title]')).map((cell) =>
      cell.getAttribute('title'),
    );
    expect(titles).toEqual(
      expect.arrayContaining([
        PLANNED_JOB.jobId,
        PLANNED_JOB.orderId,
        PLANNED_JOB.approvalSnapshotId,
      ]),
    );
    expect(within(rows[0] as HTMLElement).getByTestId('production-queue-status')).toHaveAttribute(
      'data-status',
      'PLANNED',
    );

    // A PLANNED job has no milestone, and the row invents none.
    const text = (rows[0] as HTMLElement).textContent ?? '';
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');

    // `adminProductionJob_list` publishes no order code, no SKU code and no
    // specification, so nothing here can be showing one.
    expect(Object.keys(PLANNED_JOB).sort()).toEqual([
      'approvalSnapshotId',
      'createdAt',
      'jobId',
      'orderId',
      'status',
    ]);
  });
});

// -----------------------------------------------------------------------------
// E01-11 — after a committed start, the screen goes to the server for truth.
// -----------------------------------------------------------------------------
describe('E01-11 — a committed start refreshes to authoritative STARTED truth', () => {
  it('re-reads the detail, targets the queue cache, and never advances ahead of the server', async () => {
    const user = createUser();
    const { queryClient } = renderWithProviders(<ProductionJobScreen jobId={DETAIL_JOB_ID} />);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await screen.findByTestId('production-job-header');
    const readsBefore = getMock.mock.calls.length;

    await user.click(screen.getByTestId('production-job-start'));
    await screen.findByTestId('production-transition-dialog-start');

    // The server's committed answer becomes available only now, so a screen
    // that rendered STARTED before this point would be rendering a guess.
    getMock.mockResolvedValue(jobEnvelope(STARTED_DETAIL));

    await user.click(screen.getByTestId('production-transition-confirm'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    // The published command carries no reason — the contract refuses one.
    expect(transitionMock.mock.calls[0]?.slice(0, 2)).toEqual([DETAIL_JOB_ID, { to: 'STARTED' }]);

    // The authoritative detail is read again; the mutation receipt is evidence,
    // not the new screen state.
    await waitFor(() => {
      expect(getMock.mock.calls.length).toBeGreaterThan(readsBefore);
    });

    // And the queue that lists this job is invalidated under the one shared
    // root, so an operator returning to /san-xuat does not see finished work.
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: productionQueueKeys.lists() }),
      );
    });

    // The screen now reports the server's state, with the transition it made.
    await waitFor(() => {
      expect(screen.getByTestId('production-job-header')).toHaveTextContent(
        /STARTED|Đang sản xuất/i,
      );
    });
    const history = within(screen.getByTestId('production-job-history'));
    expect(history.getAllByTestId('production-job-history-row')).toHaveLength(1);

    // A STARTED job can no longer be started: the actions come from
    // `job.status`, not from a client reconstruction of eligibility.
    expect(screen.queryByTestId('production-job-start')).toBeNull();
    expect(screen.getByTestId('production-job-complete')).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------------
// E01-14 — the cancellation boundary, as an operator reads it.
// -----------------------------------------------------------------------------
describe('E01-14 — cancellation is a production-job action, never an order one', () => {
  it('names the production job, demands a reason, and promises no refund', async () => {
    const user = createUser();
    renderWithProviders(<ProductionJobScreen jobId={DETAIL_JOB_ID} />);
    await screen.findByTestId('production-job-header');

    await user.click(screen.getByTestId('production-job-cancel'));
    const dialog = within(await screen.findByTestId('production-transition-dialog-cancel'));

    // It says what it cancels, in the heading and again in the scope notice.
    expect(
      dialog.getByText(PRODUCTION_TRANSITION_COPY.cancel.titleFromPlanned),
    ).toBeInTheDocument();
    expect(dialog.getByText(PRODUCTION_TRANSITION_COPY.cancel.scopeTitle)).toBeInTheDocument();
    expect(dialog.getByText(PRODUCTION_TRANSITION_COPY.cancel.scopeBody)).toBeInTheDocument();

    // The copy makes the negative claim explicitly, in the operator's language:
    // the order's commercial status does not move and no refund is raised.
    expect(PRODUCTION_TRANSITION_COPY.cancel.scopeBody).toContain('KHÔNG thay đổi');
    expect(PRODUCTION_TRANSITION_COPY.cancel.scopeBody).toContain('không hoàn tiền');

    // The reason is mandatory and is enforced before the wire: submitting a
    // whitespace-only reason sends nothing at all.
    await user.type(dialog.getByTestId('production-cancel-reason'), '   ');
    await user.click(screen.getByTestId('production-transition-confirm'));
    expect(transitionMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(PRODUCTION_TRANSITION_COPY.cancel.reasonMissing),
    ).toBeInTheDocument();

    // With a real reason it sends exactly the published cancellation command.
    await user.clear(dialog.getByTestId('production-cancel-reason'));
    await user.type(dialog.getByTestId('production-cancel-reason'), CANCELLATION_REASON);
    transitionMock.mockResolvedValue(
      jobEnvelope(
        makeTransitionResult({
          status: 'CANCELLED',
          orderStatus: 'DEPOSIT_PAID',
          reservationIds: [],
        }),
      ),
    );
    getMock.mockResolvedValue(
      jobEnvelope(
        makeJobDetail({
          status: 'CANCELLED',
          cancelledAt: '2026-08-25T02:50:00.000Z',
          cancelledReason: CANCELLATION_REASON,
          transitions: [makeTransition({ toStatus: 'CANCELLED', reason: CANCELLATION_REASON })],
        }),
      ),
    );
    await user.click(screen.getByTestId('production-transition-confirm'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    expect(transitionMock.mock.calls[0]?.slice(0, 2)).toEqual([
      DETAIL_JOB_ID,
      { to: 'CANCELLED', reason: CANCELLATION_REASON },
    ]);
  });

  it('offers no refund, remaining-payment or shipping control anywhere on the screen', async () => {
    renderWithProviders(<ProductionJobScreen jobId={DETAIL_JOB_ID} />);
    await screen.findByTestId('production-job-header');

    // APP8 collects no payment and completes no fulfillment, so no such
    // affordance may exist on its only mutation surface.
    for (const testId of [
      'production-job-refund',
      'production-job-remaining-payment',
      'production-job-shipping',
      'production-job-cancel-order',
    ]) {
      expect(screen.queryByTestId(testId)).toBeNull();
    }
    for (const label of [/hoàn tiền/i, /thanh toán còn lại/i, /giao hàng/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });
});
