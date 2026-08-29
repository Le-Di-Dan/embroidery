/**
 * `APP10-E01` case **E01-02**, the Admin half of journey `J1-C2`.
 *
 * The API half — `j1-support-and-maintenance.acceptance.spec.ts` — proves the
 * server applies one bounded patch, refuses everything outside it, and republishes
 * the change from the authority. What it cannot show is that the *screen an
 * operator actually uses* issues that request and reads that answer, and that is
 * the boundary this case owns.
 *
 * The values here are the ones the API journey committed, so the two halves meet
 * at a payload rather than at a description of one: the request asserted below is
 * byte-for-byte the body `E01-02` sent over HTTP and got a 204 for.
 *
 * ### Not a rerun of `APP10-A01`
 *
 * `customer-access-profile.test.tsx` owns the dialog states — the cleared-field
 * `null`, the no-op draft, the merged-customer refusal, the note-empty copy. This
 * case runs the one representative round trip end to end and asserts the three
 * cross-boundary claims: the patch names only what changed, nothing is predicted
 * from the operator's own input, and no raw contact value ever reaches the DOM.
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
import { makeApiClientError } from '../support/api-error';
import {
  CUSTOMER_ID,
  EMAIL_MASK,
  FORBIDDEN,
  PHONE_MASK,
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

/** The exact values `E01-02` committed over HTTP. */
const SAVED_DISPLAY_NAME = 'Nguyễn Minh An';
const SAVED_NOTES = 'Ưu tiên liên hệ buổi chiều.';

beforeEach(() => {
  jest.clearAllMocks();
  resolveMock.mockResolvedValue(envelope({ customerId: CUSTOMER_ID }));
  // The customer as it stood before the patch: named, with no operator note.
  detailMock.mockResolvedValue(envelope(makeCustomer({ displayName: 'Nguyễn Minh' })));
  grantsMock.mockResolvedValue(envelope(makeGrants()));
  listMock.mockResolvedValue(envelope(makeNotifications()));
  updateMock.mockResolvedValue(envelope(undefined));
});

async function openCustomer(user: ReturnType<typeof createUser>) {
  await user.type(screen.getByTestId('customer-lookup-contact'), FORBIDDEN.rawEmail);
  await user.click(screen.getByTestId('customer-lookup-submit'));
  await waitFor(() => {
    expect(screen.getByTestId('customer-id')).toBeInTheDocument();
  });
}

describe('APP10-E01 · E01-02 · Admin customer maintenance crosses the UI/API boundary', () => {
  it('resolves by exact contact, patches only what changed, and re-reads the authority', async () => {
    const user = createUser();
    renderWithProviders(<CustomerAccessScreen />);

    // The operator types one contact. The screen has no list to browse: the
    // resolver is the only lookup, and it takes the value they typed.
    await openCustomer(user);
    expect(resolveMock).toHaveBeenCalledTimes(1);
    expect(resolveMock.mock.calls[0]?.[0]).toEqual({
      contactKind: 'EMAIL',
      contact: FORBIDDEN.rawEmail,
    });
    expect(screen.queryByTestId('customer-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('customer-search')).not.toBeInTheDocument();

    // What the screen shows before the save is what the server last published.
    expect(screen.getByTestId('customer-display-name')).toHaveTextContent('Nguyễn Minh');
    const readsBeforeSave = detailMock.mock.calls.length;

    // Edit both permitted fields, and nothing else is editable to begin with.
    await user.click(screen.getByTestId('profile-edit'));
    await user.clear(screen.getByTestId('profile-display-name'));
    await user.type(screen.getByTestId('profile-display-name'), SAVED_DISPLAY_NAME);
    await user.type(screen.getByTestId('profile-notes'), SAVED_NOTES);

    // The server's post-save state, staged before the write so the re-read the
    // screen issues resolves with it. Nothing below is stubbed to echo the
    // operator's input: the mutation answers 204 and republishes nothing, so what
    // is rendered next can only have come from this read.
    detailMock.mockResolvedValue(
      envelope(makeCustomer({ displayName: SAVED_DISPLAY_NAME, notes: SAVED_NOTES })),
    );
    await user.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
    // The body the API half sent and got a 204 for. `changedFields` in the
    // APP10-B01 audit summary can only be right if this request is.
    expect(updateMock.mock.calls[0]?.[0]).toBe(CUSTOMER_ID);
    expect(updateMock.mock.calls[0]?.[1]).toEqual({
      displayName: SAVED_DISPLAY_NAME,
      notes: SAVED_NOTES,
    });

    // The screen re-read the customer rather than rendering the draft it held.
    await waitFor(() => {
      expect(detailMock.mock.calls.length).toBeGreaterThan(readsBeforeSave);
    });
    await waitFor(() => {
      expect(screen.getByTestId('customer-display-name')).toHaveTextContent(SAVED_DISPLAY_NAME);
    });
    expect(screen.getByTestId('customer-notes')).toHaveTextContent(SAVED_NOTES);
  });

  it('offers no unsupported write, and puts no raw contact, token or id in the DOM', async () => {
    const user = createUser();
    const { container } = renderWithProviders(<CustomerAccessScreen />);
    await openCustomer(user);

    // Only the two permitted fields are editable. Verification evidence, merge
    // state and every contact value are read-only on this screen — APP10-B01
    // exposes no write for them and the UI invents none.
    await user.click(screen.getByTestId('profile-edit'));
    expect(screen.getByTestId('profile-display-name')).toBeInTheDocument();
    expect(screen.getByTestId('profile-notes')).toBeInTheDocument();
    for (const absent of [
      'profile-verified-at',
      'profile-contact-value',
      'profile-merge',
      'profile-delete',
    ]) {
      expect(screen.queryByTestId(absent)).not.toBeInTheDocument();
    }

    // Contacts are shown masked, and only masked. The email mask appears more
    // than once — the contact panel and the notification panel each name the
    // same destination — and every occurrence is the mask.
    expect(screen.getAllByText(EMAIL_MASK).length).toBeGreaterThan(0);
    expect(screen.getAllByText(PHONE_MASK).length).toBeGreaterThan(0);

    // The whole rendered tree is searched for every value that must never appear
    // — the raw address and number, the verification code, the grant token, the
    // peppered digest, the sealed ciphertext and the provider's own body.
    const markup = container.innerHTML;
    for (const forbidden of Object.values(FORBIDDEN)) {
      // The raw email is the operator's own lookup input; it lives in the field
      // they typed it into and nowhere else.
      if (forbidden === FORBIDDEN.rawEmail) {
        continue;
      }
      expect(markup).not.toContain(forbidden);
    }
  });

  it('shows the operator the refusal in words when the server rejects the patch', async () => {
    // One representative failure, to prove no backend payload reaches the DOM.
    // The full A01 refusal matrix stays in `customer-access-profile.test.tsx`.
    updateMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'CONFLICT',
        message: 'Customer 019a2b3c has been merged into 019a2b3d.',
      }),
    );
    const user = createUser();
    const { container } = renderWithProviders(<CustomerAccessScreen />);
    await openCustomer(user);

    await user.click(screen.getByTestId('profile-edit'));
    await user.type(screen.getByTestId('profile-notes'), SAVED_NOTES);
    await user.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-failure')).toBeInTheDocument();
    });
    // The operator reads approved copy, never the server's sentence or its ids.
    expect(container.innerHTML).not.toContain('has been merged into');
    expect(container.innerHTML).not.toContain('019a2b3d');
  });
});
