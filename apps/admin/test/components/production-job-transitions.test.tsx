/**
 * The three guarded transitions (`APP8-A03`; `786:3`, `786:39`, `786:70`,
 * `786:110`, `786:150`, `786:177`, `787:149`).
 *
 * Each assertion is a sentence an operator would act on, or a promise the
 * screen must not make:
 *
 *  - Start sends exactly `{to:'STARTED'}` and Complete exactly
 *    `{to:'COMPLETED'}` — never a `reason`, which the contract refuses;
 *  - Cancel requires a reason, sends `{to:'CANCELLED', reason}`, and a blank one
 *    never reaches the wire;
 *  - the cancel copy says what actually happens to inventory in each direction,
 *    and never that the customer order was cancelled or refunded;
 *  - a duplicate submit is one command, not two;
 *  - a refusal shows one focused message, refetches truth and never retries;
 *  - the status on screen never advances before the server confirms it.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminProductionJobGet, adminProductionJobTransition } from '@embroidery/api-client';

import { ProductionJobScreen } from '../../src/features/production-job';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import {
  DETAIL_JOB_ID,
  jobEnvelope,
  makeJobDetail,
  makeMixedSummary,
  makeTransition,
  makeTransitionResult,
} from '../support/production-job-fixture';

// The path is a literal: a `jest.mock` factory is hoisted above the imports.
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
const transitionMock = adminProductionJobTransition as jest.MockedFunction<
  typeof adminProductionJobTransition
>;

const STARTED_JOB = makeJobDetail({
  status: 'STARTED',
  startedAt: '2026-08-25T02:42:00.000Z',
  reservationSummary: makeMixedSummary(),
  transitions: [makeTransition()],
});

beforeEach(() => {
  jest.clearAllMocks();
  getMock.mockResolvedValue(jobEnvelope(makeJobDetail()));
});

async function open(action: 'start' | 'complete' | 'cancel') {
  const user = createUser();
  renderWithProviders(<ProductionJobScreen jobId={DETAIL_JOB_ID} />);
  await screen.findByTestId('production-job-header');
  await user.click(screen.getByTestId(`production-job-${action}`));
  await screen.findByTestId(`production-transition-dialog-${action}`);
  return user;
}

/** The body of the single transition request that was issued. */
function submittedBody(): Record<string, unknown> {
  const [, body] = transitionMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
  return body;
}

describe('start (`786:3`)', () => {
  beforeEach(() => {
    transitionMock.mockResolvedValue(jobEnvelope(makeTransitionResult()));
  });

  it('sends exactly {to:"STARTED"} with no reason', async () => {
    const user = await open('start');

    // The confirmation carries no reason field at all — the contract refuses a
    // reason on this command, so there is nothing to leave blank.
    expect(screen.queryByTestId('production-cancel-reason')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('production-transition-confirm'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    const [jobId] = transitionMock.mock.calls[0] as unknown as [string];
    expect(jobId).toBe(DETAIL_JOB_ID);
    expect(submittedBody()).toEqual({ to: 'STARTED' });
  });

  it('states the consumption, the COP case and that the server may refuse', async () => {
    await open('start');

    const dialog = screen.getByTestId('production-transition-dialog-start');
    expect(within(dialog).getByText(/Tồn kho đang giữ sẽ bị tiêu thụ/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Máy chủ có thể từ chối/)).toBeInTheDocument();
    const effects = within(dialog).getByTestId('production-transition-effects');
    expect(effects).toHaveTextContent('IN_PRODUCTION');
    expect(effects).toHaveTextContent('CONSUMED');
  });

  it('blocks a duplicate submit — one command, not two', async () => {
    let settle: (() => void) | undefined;
    transitionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = () => {
            resolve(jobEnvelope(makeTransitionResult()));
          };
        }),
    );
    const user = await open('start');

    const confirm = screen.getByTestId('production-transition-confirm');
    await user.click(confirm);
    await waitFor(() => {
      expect(confirm).toBeDisabled();
    });
    // The status behind the dialog has not advanced: nothing is optimistic.
    expect(screen.getByTestId('production-job-status')).toHaveAttribute('data-status', 'PLANNED');

    await user.click(confirm);
    expect(transitionMock).toHaveBeenCalledTimes(1);

    // Let the single in-flight command finish so the commit path settles inside
    // the test rather than after it.
    settle?.();
    await waitFor(() => {
      expect(screen.queryByTestId('production-transition-dialog-start')).not.toBeInTheDocument();
    });
  });

  it('refetches the authoritative detail after a commit and never trusts the receipt alone', async () => {
    getMock
      .mockResolvedValueOnce(jobEnvelope(makeJobDetail()))
      .mockResolvedValue(jobEnvelope(STARTED_JOB));
    const user = await open('start');

    await user.click(screen.getByTestId('production-transition-confirm'));

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('production-job-status')).toHaveAttribute('data-status', 'STARTED');
    });
    // The refreshed status is what rebuilt the action set.
    expect(screen.getByTestId('production-job-complete')).toBeInTheDocument();
    expect(screen.queryByTestId('production-job-start')).not.toBeInTheDocument();
  });
});

describe('complete (`786:39`)', () => {
  beforeEach(() => {
    getMock.mockResolvedValue(jobEnvelope(STARTED_JOB));
    transitionMock.mockResolvedValue(
      jobEnvelope(
        makeTransitionResult({
          fromStatus: 'STARTED',
          status: 'COMPLETED',
          orderStatus: 'PRODUCTION_COMPLETED',
          reservationIds: [],
        }),
      ),
    );
  });

  it('sends exactly {to:"COMPLETED"} and calls nothing else', async () => {
    const user = await open('complete');

    expect(screen.queryByTestId('production-cancel-reason')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('production-transition-confirm'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    expect(submittedBody()).toEqual({ to: 'COMPLETED' });
  });

  it('states that completion moves no inventory and that APP8 stops there', async () => {
    await open('complete');

    const dialog = screen.getByTestId('production-transition-dialog-complete');
    expect(within(dialog).getByText(/Không đụng đến tồn kho/)).toBeInTheDocument();
    expect(within(dialog).getByText(/APP8 dừng tại đây/)).toBeInTheDocument();
    expect(within(dialog).getByTestId('production-transition-effects')).toHaveTextContent(
      'PRODUCTION_COMPLETED',
    );
  });
});

describe('cancel from PLANNED (`786:70`)', () => {
  beforeEach(() => {
    transitionMock.mockResolvedValue(
      jobEnvelope(
        makeTransitionResult({
          status: 'CANCELLED',
          orderStatus: 'DEPOSIT_PAID',
          reservationIds: [],
        }),
      ),
    );
  });

  it('requires a reason and sends {to:"CANCELLED", reason}', async () => {
    const user = await open('cancel');

    await user.type(screen.getByTestId('production-cancel-reason'), '  Khách đổi vị trí thêu  ');
    await user.click(screen.getByTestId('production-transition-confirm'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    // Trimmed before it is sent, so what was accepted is what is stored.
    expect(submittedBody()).toEqual({ to: 'CANCELLED', reason: 'Khách đổi vị trí thêu' });
  });

  it('is worded as a production-job cancellation, never as an order cancellation or refund', async () => {
    await open('cancel');

    const dialog = screen.getByTestId('production-transition-dialog-cancel');
    expect(
      within(dialog).getByText(/huỷ LỆNH SẢN XUẤT — không phải huỷ đơn hàng/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/không hoàn tiền/)).toBeInTheDocument();
    // From PLANNED nothing was consumed, so a live hold is released.
    expect(within(dialog).getByText(/Giữ kho còn hiệu lực sẽ được giải phóng/)).toBeInTheDocument();
    expect(within(dialog).getByTestId('production-transition-effects')).toHaveTextContent(
      'RELEASED',
    );
    // The order row states plainly that nothing about it changes.
    expect(within(dialog).getByTestId('production-transition-effects')).toHaveTextContent(
      'không đổi',
    );
  });

  it('blocks a blank reason locally — zero requests reach the server', async () => {
    const user = await open('cancel');

    await user.type(screen.getByTestId('production-cancel-reason'), '    ');
    await user.click(screen.getByTestId('production-transition-confirm'));

    expect(transitionMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Vui lòng nhập lý do huỷ/)).toBeInTheDocument();
    expect(screen.getByTestId('production-cancel-reason')).toHaveAttribute('aria-invalid', 'true');
    // The reason the button stayed put names the published code as an
    // engineer-facing annotation, not as the operator's whole message.
    expect(screen.getByText(/PRODUCTION_CANCELLATION_REASON_REQUIRED/)).toBeInTheDocument();
  });
});

describe('cancel from STARTED (`786:110`)', () => {
  beforeEach(() => {
    getMock.mockResolvedValue(jobEnvelope(STARTED_JOB));
    transitionMock.mockResolvedValue(
      jobEnvelope(
        makeTransitionResult({
          fromStatus: 'STARTED',
          status: 'CANCELLED',
          orderStatus: 'IN_PRODUCTION',
          reservationIds: [],
        }),
      ),
    );
  });

  it('states that consumed stock is not restored, and offers no way to restore it', async () => {
    const user = await open('cancel');

    const dialog = screen.getByTestId('production-transition-dialog-cancel');
    expect(
      within(dialog).getByText(/Tồn kho đã tiêu thụ sẽ KHÔNG được hoàn lại/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Vẫn không phải huỷ đơn hàng/)).toBeInTheDocument();
    // The reservation row names CONSUMED on both sides: cancelling paperwork
    // does not put stock back on the shelf.
    const effects = within(dialog).getByTestId('production-transition-effects');
    expect(effects).toHaveTextContent('CONSUMED');
    expect(effects).not.toHaveTextContent('RELEASED');

    await user.type(screen.getByTestId('production-cancel-reason'), 'Máy hỏng giữa chừng');
    await user.click(screen.getByTestId('production-transition-confirm'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    // One call, and it is the transition. No stock-adjust request exists.
    expect(submittedBody()).toEqual({ to: 'CANCELLED', reason: 'Máy hỏng giữa chừng' });
  });
});

describe('refusals (`787:3`, `787:149`)', () => {
  it('reports a stale 409 with the focused message, refetches truth and never retries', async () => {
    transitionMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'PRODUCTION_INVALID_TRANSITION',
        message: 'That status change is not allowed for this production job.',
      }),
    );
    getMock
      .mockResolvedValueOnce(jobEnvelope(makeJobDetail()))
      .mockResolvedValue(jobEnvelope(STARTED_JOB));
    const user = await open('start');

    await user.click(screen.getByTestId('production-transition-confirm'));

    const refusal = await screen.findByTestId('production-transition-refusal');
    expect(within(refusal).getByText('Trạng thái sản xuất đã thay đổi')).toBeInTheDocument();
    // Exactly one command was sent. There is no automatic second attempt.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(transitionMock).toHaveBeenCalledTimes(1);
    // And the job was re-read, so the action set behind the dialog is rebuilt.
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('production-job-status')).toHaveAttribute('data-status', 'STARTED');
    });
  });

  it('names a guard refusal without ever advancing the lifecycle on screen', async () => {
    transitionMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PRODUCTION_DEPOSIT_NOT_SATISFIED' }),
    );
    const user = await open('start');

    await user.click(screen.getByTestId('production-transition-confirm'));

    const refusal = await screen.findByTestId('production-transition-refusal');
    expect(within(refusal).getByText('Đơn chưa thanh toán cọc')).toBeInTheDocument();
    // The pill never moved: nothing on this screen is optimistic.
    expect(screen.getByTestId('production-job-status')).toHaveAttribute('data-status', 'PLANNED');
    expect(screen.getByTestId('production-job-start')).toBeInTheDocument();
  });

  it('treats a lost connection as unknown, not as a failure, and offers no resend', async () => {
    transitionMock.mockRejectedValue(makeNetworkError());
    const user = await open('start');

    await user.click(screen.getByTestId('production-transition-confirm'));

    const refusal = await screen.findByTestId('production-transition-refusal');
    expect(within(refusal).getByText('Không rõ máy chủ đã ghi hay chưa')).toBeInTheDocument();
    expect(within(refusal).getByText(/KHÔNG gửi lại/)).toBeInTheDocument();
    expect(within(refusal).queryByTestId('production-transition-confirm')).not.toBeInTheDocument();
    expect(transitionMock).toHaveBeenCalledTimes(1);
  });

  it('never renders the server message as the operator-facing copy', async () => {
    transitionMock.mockRejectedValue(
      makeApiClientError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'pg: could not serialize access due to concurrent update',
      }),
    );
    const user = await open('start');

    await user.click(screen.getByTestId('production-transition-confirm'));

    await screen.findByTestId('production-transition-refusal');
    expect(screen.queryByText(/serialize access/i)).not.toBeInTheDocument();
  });
});
