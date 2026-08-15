/**
 * `APP4-A01` — the notification region, the manual replay, and the two approved
 * outcome states.
 *
 * The case this suite exists for is `CREATED` versus `EXISTING`. The two states
 * are visually and semantically different — one says a replay is on its way, the
 * other says the operator's click resolved onto a replay that already existed —
 * and the *only* thing that may distinguish them is the server's own `outcome`.
 * So the decisive assertions send an identical response twice, differing in that
 * one field, and require the screen to say two different things. Nothing about
 * timing, the `replayIntentId`, the PENDING status or the list length changes
 * between them.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminCustomerSupportDetail,
  adminCustomerSupportGrants,
  adminCustomerSupportResolve,
  adminNotificationIntentList,
  adminNotificationIntentReplay,
} from '@embroidery/api-client';

import { CustomerAccessScreen } from '../../src/features/customer-access-support';
import { CUSTOMER_ACCESS_COPY } from '../../src/features/customer-access-support/model/customer-access-copy';
import { makeApiClientError } from '../support/api-error';
import {
  CUSTOMER_ID,
  EMAIL_MASK,
  FORBIDDEN,
  INTENT_ID,
  envelope,
  makeCustomer,
  makeGrants,
  makeIntent,
  makeNotifications,
  makeReplay,
} from '../support/customer-access-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/support/customer-access').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomerSupportResolve: jest.fn(),
  adminCustomerSupportDetail: jest.fn(),
  adminCustomerSupportGrants: jest.fn(),
  adminNotificationIntentList: jest.fn(),
  adminNotificationIntentReplay: jest.fn(),
}));

const resolveMock = adminCustomerSupportResolve as jest.MockedFunction<
  typeof adminCustomerSupportResolve
>;
const detailMock = adminCustomerSupportDetail as jest.MockedFunction<
  typeof adminCustomerSupportDetail
>;
const grantsMock = adminCustomerSupportGrants as jest.MockedFunction<
  typeof adminCustomerSupportGrants
>;
const listMock = adminNotificationIntentList as jest.MockedFunction<
  typeof adminNotificationIntentList
>;
const replayMock = adminNotificationIntentReplay as jest.MockedFunction<
  typeof adminNotificationIntentReplay
>;

const render = () => renderWithProviders(<CustomerAccessScreen />);

async function openCustomer(user: ReturnType<typeof createUser>) {
  await user.type(screen.getByTestId('customer-lookup-contact'), FORBIDDEN.rawEmail);
  await user.click(screen.getByTestId('customer-lookup-submit'));
  await waitFor(() => {
    expect(screen.getByTestId('customer-id')).toBeInTheDocument();
  });
}

async function confirmReplay(user: ReturnType<typeof createUser>) {
  await user.click(screen.getByTestId('notification-replay'));
  await user.click(screen.getByTestId('replay-confirm'));
}

beforeEach(() => {
  jest.clearAllMocks();
  resolveMock.mockResolvedValue(envelope({ customerId: CUSTOMER_ID }));
  detailMock.mockResolvedValue(envelope(makeCustomer()));
  grantsMock.mockResolvedValue(envelope(makeGrants()));
  listMock.mockResolvedValue(envelope(makeNotifications()));
});

describe('the notification region', () => {
  it('asks the server for this Customer’s FAILED notifications only', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    // Narrowed server-side rather than downloaded and filtered here, which would
    // put other customers' delivery records in this browser.
    expect(listMock).toHaveBeenCalledWith(
      { status: 'FAILED', customerId: CUSTOMER_ID },
      expect.anything(),
    );
  });

  it('reports no failure when the Customer has none', async () => {
    listMock.mockResolvedValue(envelope(makeNotifications([])));
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.getByTestId('notification-panel-empty')).toHaveTextContent(
      CUSTOMER_ACCESS_COPY.notification.none,
    );
    expect(screen.queryByTestId('notification-replay')).not.toBeInTheDocument();
  });

  it('renders the terminal failure with the masked recipient and the safe timeline', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.getByTestId('notification-status')).toHaveTextContent(
      CUSTOMER_ACCESS_COPY.notification.statusFailed,
    );
    expect(screen.getByTestId('notification-recipient')).toHaveTextContent(EMAIL_MASK);
    expect(screen.getByTestId('notification-template')).toHaveTextContent(
      'secure-link.request-access',
    );

    const timeline = screen.getByTestId('notification-timeline');
    expect(timeline).toHaveTextContent('CHANNEL_TIMEOUT');
    expect(timeline).toHaveTextContent('FAILED_TERMINAL');
    expect(timeline).toHaveTextContent('CHANNEL_UNAVAILABLE');
  });

  it('renders an em dash where an attempt recorded no error class', async () => {
    listMock.mockResolvedValue(
      envelope(
        makeNotifications([
          makeIntent({
            attempts: [
              { attemptedAt: '2026-08-15T09:12:04.000Z', channel: 'EMAIL', outcome: 'DELIVERED' },
            ],
          }),
        ]),
      ),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.getByTestId('notification-timeline')).toHaveTextContent(
      CUSTOMER_ACCESS_COPY.notification.noErrorClass,
    );
  });
});

describe('the replay flow', () => {
  it('confirms before sending, and sends no body', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('notification-replay'));
    expect(screen.getByTestId('replay-dialog')).toHaveAttribute('role', 'dialog');
    expect(replayMock).not.toHaveBeenCalled();

    replayMock.mockResolvedValue(envelope(makeReplay('CREATED')));
    await user.click(screen.getByTestId('replay-confirm'));

    await waitFor(() => {
      expect(replayMock).toHaveBeenCalledTimes(1);
    });
    // The path id is the whole input: (intentId, options) and nothing else.
    expect(replayMock).toHaveBeenCalledWith(INTENT_ID, expect.anything());
    expect(replayMock.mock.calls[0]).toHaveLength(2);
  });

  it('disables both controls while the replay is in flight', async () => {
    let settle: (value: unknown) => void = () => undefined;
    replayMock.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }) as never,
    );
    const user = createUser();
    render();
    await openCustomer(user);

    await confirmReplay(user);

    await waitFor(() => {
      expect(screen.getByTestId('replay-confirm')).toBeDisabled();
    });
    expect(screen.getByTestId('replay-cancel')).toBeDisabled();
    expect(screen.queryByTestId('replay-created')).not.toBeInTheDocument();

    settle(envelope(makeReplay('CREATED')));
    await waitFor(() => {
      expect(screen.getByTestId('replay-created')).toBeInTheDocument();
    });
  });

  it('reports CREATED as a new replay', async () => {
    replayMock.mockResolvedValue(envelope(makeReplay('CREATED')));
    const user = createUser();
    render();
    await openCustomer(user);

    await confirmReplay(user);

    await waitFor(() => {
      expect(screen.getByTestId('replay-created')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('replay-existing')).not.toBeInTheDocument();
  });

  it('reports EXISTING as the canonical current replay, from the same response shape', async () => {
    // Byte-identical to the CREATED case except for `outcome`. If the screen
    // inferred the duplicate from anything else — timing, the id, the status,
    // the list — this assertion and the previous one could not both pass.
    replayMock.mockResolvedValue(envelope(makeReplay('EXISTING')));
    const user = createUser();
    render();
    await openCustomer(user);

    await confirmReplay(user);

    await waitFor(() => {
      expect(screen.getByTestId('replay-existing')).toBeInTheDocument();
    });
    expect(screen.getByTestId('replay-existing')).toHaveTextContent(
      CUSTOMER_ACCESS_COPY.replay.existing,
    );
    expect(screen.queryByTestId('replay-created')).not.toBeInTheDocument();
  });

  it('refetches the notification list after a replay, and nothing else', async () => {
    replayMock.mockResolvedValue(envelope(makeReplay('CREATED')));
    const user = createUser();
    render();
    await openCustomer(user);

    const detailBefore = detailMock.mock.calls.length;
    const grantsBefore = grantsMock.mock.calls.length;
    const listBefore = listMock.mock.calls.length;

    await confirmReplay(user);

    await waitFor(() => {
      expect(listMock.mock.calls.length).toBeGreaterThan(listBefore);
    });
    expect(detailMock.mock.calls).toHaveLength(detailBefore);
    expect(grantsMock.mock.calls).toHaveLength(grantsBefore);
  });

  it('keeps the origin failure visible after a successful replay', async () => {
    replayMock.mockResolvedValue(envelope(makeReplay('CREATED')));
    const user = createUser();
    render();
    await openCustomer(user);

    await confirmReplay(user);

    await waitFor(() => {
      expect(screen.getByTestId('replay-created')).toBeInTheDocument();
    });
    // B08 leaves the origin FAILED, so the refetched list still contains it.
    // That is correct history, not a stale screen, and the command's outcome is
    // reported from the mutation rather than inferred from the list changing.
    expect(screen.getByTestId('notification-status')).toBeInTheDocument();
  });

  it('does not poll the worker after a replay', async () => {
    replayMock.mockResolvedValue(envelope(makeReplay('CREATED')));
    const user = createUser();
    render();
    await openCustomer(user);

    await confirmReplay(user);
    await waitFor(() => {
      expect(screen.getByTestId('replay-created')).toBeInTheDocument();
    });

    const settled = listMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 250));
    // Accepted for transport is not delivered; APP4-W01 owns delivery and this
    // screen does not watch it.
    expect(listMock.mock.calls).toHaveLength(settled);
  });
});

describe('replay refusals', () => {
  it('maps REISSUE_REQUIRED to its own state and offers no reissue action', async () => {
    replayMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'REISSUE_REQUIRED',
        message: 'The code or link this notification carries is no longer valid.',
      }),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    await confirmReplay(user);

    await waitFor(() => {
      expect(screen.getByTestId('replay-reissue-required')).toBeInTheDocument();
    });
    expect(screen.getByTestId('replay-reissue-required')).toHaveTextContent(
      CUSTOMER_ACCESS_COPY.replay.reissueTitle,
    );
    // The hand-off is a statement, not a button: minting a credential belongs to
    // the customer flow, and this screen has no authority to run it.
    for (const forbidden of [/phát hành lại/i, /gửi mã mới/i, /cấp liên kết/i]) {
      expect(screen.queryByRole('button', { name: forbidden })).not.toBeInTheDocument();
    }
  });

  it('maps REPLAY_NOT_APPLICABLE to its own message, never to REISSUE_REQUIRED', async () => {
    replayMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'REPLAY_NOT_APPLICABLE',
        message: 'This notification did not fail delivery.',
      }),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    await confirmReplay(user);

    await waitFor(() => {
      expect(screen.getByTestId('replay-failure')).toBeInTheDocument();
    });
    expect(screen.getByTestId('replay-failure')).toHaveTextContent(
      CUSTOMER_ACCESS_COPY.replay.notApplicable,
    );
    expect(screen.queryByTestId('replay-reissue-required')).not.toBeInTheDocument();
  });

  it('maps REPLAY_SOURCE_UNAVAILABLE to its own message', async () => {
    replayMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'REPLAY_SOURCE_UNAVAILABLE',
        message: 'No single dead-lettered delivery record.',
      }),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    await confirmReplay(user);

    await waitFor(() => {
      expect(screen.getByTestId('replay-failure')).toHaveTextContent(
        CUSTOMER_ACCESS_COPY.replay.sourceUnavailable,
      );
    });
    expect(screen.queryByTestId('replay-reissue-required')).not.toBeInTheDocument();
  });

  it('classifies by code, not by the message wording', async () => {
    // A 409 whose message *says* reissue but whose code says otherwise must be
    // read by its code. Parsing the sentence would get this backwards.
    replayMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'REPLAY_NOT_APPLICABLE',
        message: 'REISSUE_REQUIRED: issue a new one instead.',
      }),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    await confirmReplay(user);

    await waitFor(() => {
      expect(screen.getByTestId('replay-failure')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('replay-reissue-required')).not.toBeInTheDocument();
  });
});
