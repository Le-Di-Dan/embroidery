/**
 * `APP4-A01` — the grant region and the confirmed revoke.
 *
 * Three claims live here and nowhere else:
 *
 * 1. **A grant stored ACTIVE past its expiry is reported as expired.** That is
 *    the truth about the link, and the row is not rewritten to say it — the
 *    label is derived from `status` and `expiresAt` together, exactly as
 *    `APP4-B07` instructs.
 * 2. **Nothing is optimistic.** The success banner appears only after the
 *    server's 204, and the state on screen afterwards comes from a refetch.
 * 3. **A conflict refetches too.** The operator is not left looking at a card
 *    that is no longer true, whichever way the command settled.
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
  adminSecureGrantRevoke,
} from '@embroidery/api-client';

import { CustomerAccessScreen } from '../../src/features/customer-access-support';
import { CUSTOMER_ACCESS_COPY } from '../../src/features/customer-access-support/model/customer-access-copy';
import { makeApiClientError } from '../support/api-error';
import {
  CUSTOMER_ID,
  FORBIDDEN,
  GRANT_ID,
  envelope,
  makeCustomer,
  makeGrant,
  makeGrants,
  makeNotifications,
} from '../support/customer-access-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/support/customer-access').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomerSupportResolve: jest.fn(),
  adminCustomerSupportDetail: jest.fn(),
  adminCustomerSupportGrants: jest.fn(),
  adminNotificationIntentList: jest.fn(),
  adminSecureGrantRevoke: jest.fn(),
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
const revokeMock = adminSecureGrantRevoke as jest.MockedFunction<typeof adminSecureGrantRevoke>;

const render = () => renderWithProviders(<CustomerAccessScreen />);

async function openCustomer(user: ReturnType<typeof createUser>) {
  await user.type(screen.getByTestId('customer-lookup-contact'), FORBIDDEN.rawEmail);
  await user.click(screen.getByTestId('customer-lookup-submit'));
  await waitFor(() => {
    expect(screen.getByTestId('customer-id')).toBeInTheDocument();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resolveMock.mockResolvedValue(envelope({ customerId: CUSTOMER_ID }));
  detailMock.mockResolvedValue(envelope(makeCustomer()));
  grantsMock.mockResolvedValue(envelope(makeGrants()));
  listMock.mockResolvedValue(envelope(makeNotifications()));
});

describe('the grant region', () => {
  it('reports a live grant with its scope and expiry, and offers revoke', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.getByTestId('grant-status')).toHaveTextContent(
      CUSTOMER_ACCESS_COPY.grant.statusActive,
    );
    expect(screen.getByTestId('grant-scope')).toHaveTextContent('REQUEST_ACCESS');
    expect(screen.getByTestId('grant-expires-at')).toBeInTheDocument();
    expect(screen.getByTestId('grant-revoke')).toBeInTheDocument();
  });

  it('says the Customer has no grant when the list is empty', async () => {
    grantsMock.mockResolvedValue(envelope(makeGrants([])));
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.getByTestId('grant-panel-empty')).toHaveTextContent(
      CUSTOMER_ACCESS_COPY.grant.none,
    );
    expect(screen.queryByTestId('grant-revoke')).not.toBeInTheDocument();
  });

  it('reports a stored-ACTIVE grant whose expiry has passed as expired, and withholds revoke', async () => {
    grantsMock.mockResolvedValue(
      envelope(
        makeGrants([makeGrant({ status: 'ACTIVE', expiresAt: '2020-01-01T00:00:00.000Z' })]),
      ),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    // The truth about the link, told from status + expiresAt together.
    expect(screen.getByTestId('grant-status')).toHaveTextContent(
      CUSTOMER_ACCESS_COPY.grant.statusExpiredByTime,
    );
    // Offering revoke here would produce a 409 the operator could not have
    // predicted from what they were looking at.
    expect(screen.queryByTestId('grant-revoke')).not.toBeInTheDocument();
    expect(screen.getByTestId('grant-not-revocable')).toBeInTheDocument();
  });

  it('reports a revoked grant as revoked', async () => {
    grantsMock.mockResolvedValue(envelope(makeGrants([makeGrant({ status: 'REVOKED' })])));
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.getByTestId('grant-status')).toHaveTextContent(
      CUSTOMER_ACCESS_COPY.grant.statusRevoked,
    );
    expect(screen.queryByTestId('grant-revoke')).not.toBeInTheDocument();
  });

  it('leads with the live grant when the Customer has several', async () => {
    grantsMock.mockResolvedValue(
      envelope(
        makeGrants([
          makeGrant({ grantId: 'old', status: 'REVOKED' }),
          makeGrant({ grantId: GRANT_ID, status: 'ACTIVE' }),
        ]),
      ),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.getByTestId('grant-status')).toHaveTextContent(
      CUSTOMER_ACCESS_COPY.grant.statusActive,
    );
  });
});

describe('the revoke flow', () => {
  it('requires a confirmation before anything is sent', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('grant-revoke'));

    expect(screen.getByTestId('revoke-dialog')).toHaveAttribute('role', 'alertdialog');
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('refuses a blank reason without calling the API', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('grant-revoke'));
    await user.click(screen.getByTestId('revoke-confirm'));

    expect(screen.getByRole('alert')).toHaveTextContent(CUSTOMER_ACCESS_COPY.revoke.reasonBlank);
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('refuses a whitespace-only reason', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('grant-revoke'));
    await user.type(screen.getByTestId('revoke-reason'), '    ');
    await user.click(screen.getByTestId('revoke-confirm'));

    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('sends the trimmed reason and reports success only after the server answers', async () => {
    let settle: (value: unknown) => void = () => undefined;
    revokeMock.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }) as never,
    );
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('grant-revoke'));
    await user.type(screen.getByTestId('revoke-reason'), '  liên kết bị lộ  ');
    await user.click(screen.getByTestId('revoke-confirm'));

    // In flight: the button is busy, both controls are disabled, and nothing
    // claims the grant is revoked yet.
    await waitFor(() => {
      expect(screen.getByTestId('revoke-confirm')).toBeDisabled();
    });
    expect(screen.getByTestId('revoke-cancel')).toBeDisabled();
    expect(screen.queryByTestId('revoke-success')).not.toBeInTheDocument();

    grantsMock.mockResolvedValue(envelope(makeGrants([makeGrant({ status: 'REVOKED' })])));
    settle(envelope(undefined));

    await waitFor(() => {
      expect(screen.getByTestId('revoke-success')).toBeInTheDocument();
    });
    expect(revokeMock).toHaveBeenCalledWith(
      GRANT_ID,
      { reason: 'liên kết bị lộ' },
      expect.anything(),
    );
  });

  it('refetches the grants after a success, and nothing else', async () => {
    revokeMock.mockResolvedValue(envelope(undefined));
    const user = createUser();
    render();
    await openCustomer(user);

    const detailCallsBefore = detailMock.mock.calls.length;
    const listCallsBefore = listMock.mock.calls.length;
    const grantCallsBefore = grantsMock.mock.calls.length;

    grantsMock.mockResolvedValue(envelope(makeGrants([makeGrant({ status: 'REVOKED' })])));
    await user.click(screen.getByTestId('grant-revoke'));
    await user.type(screen.getByTestId('revoke-reason'), 'khách yêu cầu');
    await user.click(screen.getByTestId('revoke-confirm'));

    await waitFor(() => {
      expect(grantsMock.mock.calls.length).toBeGreaterThan(grantCallsBefore);
    });
    // The Customer did not change and no notification was sent, so re-reading
    // either would be two requests to render identical data.
    expect(detailMock.mock.calls).toHaveLength(detailCallsBefore);
    expect(listMock.mock.calls).toHaveLength(listCallsBefore);
  });

  it('shows the canonical current state after a conflict', async () => {
    revokeMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'CONFLICT',
        message: 'That secure grant is no longer active and cannot be revoked.',
      }),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    // The server-side truth the refetch will return.
    grantsMock.mockResolvedValue(envelope(makeGrants([makeGrant({ status: 'REVOKED' })])));

    await user.click(screen.getByTestId('grant-revoke'));
    await user.type(screen.getByTestId('revoke-reason'), 'thu hồi theo yêu cầu');
    await user.click(screen.getByTestId('revoke-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('revoke-conflict')).toBeInTheDocument();
    });
    // Not just an error banner: the card now shows what is actually true.
    await waitFor(() => {
      expect(screen.getByTestId('grant-status')).toHaveTextContent(
        CUSTOMER_ACCESS_COPY.grant.statusRevoked,
      );
    });
    expect(screen.queryByTestId('revoke-success')).not.toBeInTheDocument();
  });

  it('closes the dialog and stays on the screen after a revoke', async () => {
    revokeMock.mockResolvedValue(envelope(undefined));
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('grant-revoke'));
    await user.type(screen.getByTestId('revoke-reason'), 'khách yêu cầu');
    await user.click(screen.getByTestId('revoke-confirm'));

    await waitFor(() => {
      expect(screen.queryByTestId('revoke-dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('customer-id')).toBeInTheDocument();
  });

  it('cancels without sending anything', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('grant-revoke'));
    await user.type(screen.getByTestId('revoke-reason'), 'nhầm');
    await user.click(screen.getByTestId('revoke-cancel'));

    await waitFor(() => {
      expect(screen.queryByTestId('revoke-dialog')).not.toBeInTheDocument();
    });
    expect(revokeMock).not.toHaveBeenCalled();
  });
});
