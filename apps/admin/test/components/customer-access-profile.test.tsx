/**
 * `APP10-A01` — the profile block on `/support/customer-access`.
 *
 * Four claims live here:
 *
 * 1. **Only what changed travels.** The patch names the fields the operator
 *    actually edited, because `APP10-B01`'s `changedFields` audit summary can
 *    only be right if the request is, and an echoed field would rewrite a note
 *    nobody opened.
 * 2. **Nothing is predicted.** The mutation answers 204 and republishes nothing,
 *    so what the operator reads after a save is a re-read of the authoritative
 *    customer — never the text they typed.
 * 3. **A merged customer is refused in words, not codes.** The 409 becomes the
 *    approved sentence; no backend payload reaches the DOM.
 * 4. **The APP4 panels are untouched.** Extending this screen did not displace
 *    the lookup, grant or notification regions.
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
  adminCustomerUpdate,
  adminNotificationIntentList,
} from '@embroidery/api-client';

import { CustomerAccessScreen } from '../../src/features/customer-access-support';
import { CUSTOMER_MAINTENANCE_COPY } from '../../src/features/customer-access-support/model/customer-maintenance-copy';
import { makeApiClientError } from '../support/api-error';
import {
  CUSTOMER_ID,
  FORBIDDEN,
  envelope,
  makeCustomer,
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
  adminCustomerUpdate: jest.fn(),
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
const updateMock = adminCustomerUpdate as jest.MockedFunction<typeof adminCustomerUpdate>;

const COPY = CUSTOMER_MAINTENANCE_COPY.profile;

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
  detailMock.mockResolvedValue(envelope(makeCustomer({ notes: 'Gọi buổi chiều.' })));
  grantsMock.mockResolvedValue(envelope(makeGrants()));
  listMock.mockResolvedValue(envelope(makeNotifications()));
  updateMock.mockResolvedValue(envelope(undefined));
});

describe('the resolved customer', () => {
  it('renders the maintenance affordances beside the APP4 panels', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.getByTestId('customer-display-name')).toHaveTextContent('Nguyễn Minh An');
    expect(screen.getByTestId('customer-notes')).toHaveTextContent('Gọi buổi chiều.');
    expect(screen.getByTestId('profile-edit')).toBeInTheDocument();

    // APP10-A01 extends the route; it does not replace what APP4-A01 delivered.
    expect(screen.getByTestId('customer-lookup-submit')).toBeInTheDocument();
    expect(screen.getByTestId('grant-revoke')).toBeInTheDocument();
    expect(screen.getByTestId('notification-replay')).toBeInTheDocument();
  });

  it('says so when the customer has no note rather than showing an empty cell', async () => {
    detailMock.mockResolvedValue(envelope(makeCustomer()));
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.getByTestId('customer-notes')).toHaveTextContent(COPY.notesEmpty);
  });

  it('offers no customer list, directory or search anywhere on the screen', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.queryByTestId('customer-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('customer-search')).not.toBeInTheDocument();
    expect(screen.queryByTestId('customer-directory')).not.toBeInTheDocument();
  });
});

describe('editing the profile', () => {
  it('patches only the fields that changed, then re-reads the customer', async () => {
    const user = createUser();
    render();
    await openCustomer(user);
    const readsBefore = detailMock.mock.calls.length;

    await user.click(screen.getByTestId('profile-edit'));
    await user.clear(screen.getByTestId('profile-display-name'));
    await user.type(screen.getByTestId('profile-display-name'), 'Trần Bảo');
    await user.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
    expect(updateMock.mock.calls[0]?.[0]).toBe(CUSTOMER_ID);
    // `notes` was never touched, so it is absent — not echoed back as itself.
    expect(updateMock.mock.calls[0]?.[1]).toEqual({ displayName: 'Trần Bảo' });

    await waitFor(() => {
      expect(screen.getByTestId('profile-saved')).toHaveTextContent(COPY.saved);
    });
    await waitFor(() => {
      expect(detailMock.mock.calls.length).toBeGreaterThan(readsBefore);
    });
  });

  it('sends null for a field the operator cleared', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('profile-edit'));
    await user.clear(screen.getByTestId('profile-notes'));
    await user.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
    expect(updateMock.mock.calls[0]?.[1]).toEqual({ notes: null });
  });

  it('refuses to spend a request on a draft that changed nothing', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('profile-edit'));
    await user.click(screen.getByTestId('profile-save'));

    expect(await screen.findByTestId('profile-problem')).toHaveTextContent(COPY.unchanged);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('leaves the stored profile on screen when the operator cancels', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('profile-edit'));
    await user.type(screen.getByTestId('profile-display-name'), ' đã sửa');
    await user.click(screen.getByTestId('profile-cancel'));

    expect(screen.getByTestId('customer-display-name')).toHaveTextContent('Nguyễn Minh An');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('maps a rejected patch to the approved validation sentence', async () => {
    updateMock.mockRejectedValue(
      makeApiClientError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'displayName is too long',
      }),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('profile-edit'));
    await user.type(screen.getByTestId('profile-display-name'), 'x');
    await user.click(screen.getByTestId('profile-save'));

    expect(await screen.findByTestId('profile-failure')).toHaveTextContent(COPY.validation);
    // The server's own wording never reaches the DOM.
    expect(document.body.textContent).not.toContain('displayName is too long');
    expect(screen.queryByTestId('profile-saved')).not.toBeInTheDocument();
  });

  it('maps the merged-customer conflict to its own refusal', async () => {
    updateMock.mockRejectedValue(makeApiClientError({ status: 409, code: 'CONFLICT' }));
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('profile-edit'));
    await user.type(screen.getByTestId('profile-display-name'), 'x');
    await user.click(screen.getByTestId('profile-save'));

    expect(await screen.findByTestId('profile-failure')).toHaveTextContent(COPY.merged);
  });

  it('maps a vanished customer to the stale refusal', async () => {
    updateMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'NOT_FOUND' }));
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('profile-edit'));
    await user.type(screen.getByTestId('profile-display-name'), 'x');
    await user.click(screen.getByTestId('profile-save'));

    expect(await screen.findByTestId('profile-failure')).toHaveTextContent(COPY.stale);
  });

  it('disables both actions while the patch is in flight, so a second click cannot patch twice', async () => {
    let release: (() => void) | undefined;
    updateMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(envelope(undefined));
          };
        }),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('profile-edit'));
    await user.type(screen.getByTestId('profile-display-name'), 'x');
    await user.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-save')).toBeDisabled();
    });
    expect(screen.getByTestId('profile-cancel')).toBeDisabled();
    expect(screen.getByTestId('profile-save')).toHaveTextContent(COPY.saving);

    release?.();
    await waitFor(() => {
      expect(screen.getByTestId('profile-saved')).toBeInTheDocument();
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('exposes no control for anything the contract does not accept', async () => {
    const user = createUser();
    render();
    await openCustomer(user);
    await user.click(screen.getByTestId('profile-edit'));

    for (const testId of [
      'profile-verified-at',
      'profile-merge',
      'contact-create',
      'contact-verify',
      'contact-value',
    ]) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
  });
});
