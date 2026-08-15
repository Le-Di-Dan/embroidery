/**
 * `APP4-A01` — the PII and secret boundary.
 *
 * Every assertion here is about something that must appear **nowhere**. They are
 * written as searches over the whole rendered document, the whole storage, the
 * URL, the history and the console — not as field-by-field checks — because a
 * secret in a field nobody thought to assert on is exactly the leak these exist
 * to catch.
 *
 * The fixtures deliberately feed the screen more than it should render: the API
 * responses here carry extra keys a future contract change might add, and the
 * suite requires none of them to reach the DOM.
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
  adminSecureGrantRevoke,
} from '@embroidery/api-client';

import { CustomerAccessScreen } from '../../src/features/customer-access-support';
import {
  CUSTOMER_ID,
  FORBIDDEN,
  envelope,
  makeCustomer,
  makeGrant,
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
const replayMock = adminNotificationIntentReplay as jest.MockedFunction<
  typeof adminNotificationIntentReplay
>;
const revokeMock = adminSecureGrantRevoke as jest.MockedFunction<typeof adminSecureGrantRevoke>;

const render = () => renderWithProviders(<CustomerAccessScreen />);

/** Every value that must never surface, whatever the server sends. */
const SECRETS = [
  FORBIDDEN.rawEmail,
  FORBIDDEN.rawPhone,
  FORBIDDEN.code,
  FORBIDDEN.token,
  FORBIDDEN.digest,
  FORBIDDEN.ciphertext,
  FORBIDDEN.providerBody,
];

async function openCustomer(user: ReturnType<typeof createUser>) {
  await user.type(screen.getByTestId('customer-lookup-contact'), FORBIDDEN.rawEmail);
  await user.click(screen.getByTestId('customer-lookup-submit'));
  await waitFor(() => {
    expect(screen.getByTestId('customer-id')).toBeInTheDocument();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();

  resolveMock.mockResolvedValue(envelope({ customerId: CUSTOMER_ID }));
  detailMock.mockResolvedValue(envelope(makeCustomer()));
  // Deliberately over-supplied: a contract that later grew these fields must not
  // find the screen already rendering them.
  grantsMock.mockResolvedValue(
    envelope(
      makeGrants([
        {
          ...makeGrant(),
          tokenHash: FORBIDDEN.digest,
          token: FORBIDDEN.token,
        } as never,
      ]),
    ),
  );
  listMock.mockResolvedValue(
    envelope(
      makeNotifications([
        {
          ...makeIntent(),
          params: { code: FORBIDDEN.code },
          providerResponse: FORBIDDEN.providerBody,
          envelopeCiphertext: FORBIDDEN.ciphertext,
          normalizedRecipient: FORBIDDEN.rawEmail,
        } as never,
      ]),
    ),
  );
});

describe('the secret boundary', () => {
  it('renders no raw contact, code, token, digest, ciphertext or provider body', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    const html = document.body.innerHTML;
    for (const secret of SECRETS) {
      expect(html).not.toContain(secret);
    }
    // And the field names themselves never reach the markup.
    for (const key of ['tokenHash', 'ciphertext', 'providerResponse', 'normalizedRecipient']) {
      expect(html).not.toContain(key);
    }
  });

  it('writes nothing to localStorage, sessionStorage or the URL', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    const stored = JSON.stringify({ ...localStorage, ...sessionStorage });
    for (const secret of SECRETS) {
      expect(stored).not.toContain(secret);
    }
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    // The contact is submitted in a body; nothing about it may reach the URL.
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain(FORBIDDEN.rawEmail);
  });

  it('logs no contact or secret to the console during a full session', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined),
    );

    try {
      revokeMock.mockResolvedValue(envelope(undefined));
      replayMock.mockResolvedValue(envelope(makeReplay('CREATED')));
      const user = createUser();
      render();
      await openCustomer(user);

      await user.click(screen.getByTestId('grant-revoke'));
      await user.type(screen.getByTestId('revoke-reason'), 'liên kết bị lộ');
      await user.click(screen.getByTestId('revoke-confirm'));
      await waitFor(() => {
        expect(screen.getByTestId('revoke-success')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('notification-replay'));
      await user.click(screen.getByTestId('replay-confirm'));
      await waitFor(() => {
        expect(screen.getByTestId('replay-created')).toBeInTheDocument();
      });

      const logged = spies
        .flatMap((spy) => spy.mock.calls)
        .map((call) => call.map((argument) => String(argument)).join(' '))
        .join('\n');
      for (const secret of SECRETS) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('keeps the contact out of the request options and out of every read', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    // The resolver is the only call that may carry the contact, and only in its
    // body. Every subsequent call is addressed by the opaque Customer id.
    const [body] = resolveMock.mock.calls[0] ?? [];
    expect(JSON.stringify(body)).toContain(FORBIDDEN.rawEmail);

    const downstream = JSON.stringify([
      detailMock.mock.calls,
      grantsMock.mock.calls,
      listMock.mock.calls,
    ]);
    expect(downstream).not.toContain(FORBIDDEN.rawEmail);
    expect(downstream).toContain(CUSTOMER_ID);
  });

  it('renders no APP5–APP7 commercial control', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    for (const forbidden of [/báo giá/i, /thanh toán/i, /đơn hàng/i, /hoá đơn/i, /giá/i]) {
      expect(screen.queryByRole('button', { name: forbidden })).not.toBeInTheDocument();
    }
  });

  it('exposes one h1 and a heading for each region', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    // Lookup, Customer, grant and notification each own a level-2 heading.
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(4);
  });

  it('keeps a polite live region for the lookup status', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
  });
});
