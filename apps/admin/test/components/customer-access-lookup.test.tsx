/**
 * `APP4-A01` — the lookup entry point, the Customer/contact region, and the
 * load/not-found/error states.
 *
 * The cases worth reading twice are the ones about the contact the operator
 * typed: that it leaves in a request **body**, that it is cleared once it has
 * resolved, and that a miss says "no match" without ever saying which of the
 * four causes it was. A screen that got any of those wrong would look completely
 * correct in a happy path.
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
} from '@embroidery/api-client';

import { CustomerAccessScreen } from '../../src/features/customer-access-support';
import { CUSTOMER_ACCESS_COPY } from '../../src/features/customer-access-support/model/customer-access-copy';
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

const render = () => renderWithProviders(<CustomerAccessScreen />);

function resolvesToCustomer(): void {
  resolveMock.mockResolvedValue(envelope({ customerId: CUSTOMER_ID }));
  detailMock.mockResolvedValue(envelope(makeCustomer()));
  grantsMock.mockResolvedValue(envelope(makeGrants()));
  listMock.mockResolvedValue(envelope(makeNotifications()));
}

async function lookUp(user: ReturnType<typeof createUser>, value: string = FORBIDDEN.rawEmail) {
  await user.type(screen.getByTestId('customer-lookup-contact'), value);
  await user.click(screen.getByTestId('customer-lookup-submit'));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the lookup control', () => {
  it('shows an idle prompt and asks for nothing before a lookup', () => {
    render();

    expect(screen.getByTestId('customer-access-idle')).toBeInTheDocument();
    // No Customer id exists yet, so none of the three reads may fire.
    expect(detailMock).not.toHaveBeenCalled();
    expect(grantsMock).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
  });

  it('sends the contact in the request body, never as a query parameter', async () => {
    resolvesToCustomer();
    const user = createUser();
    render();

    await lookUp(user);

    await waitFor(() => {
      expect(resolveMock).toHaveBeenCalledTimes(1);
    });
    const [body, options] = resolveMock.mock.calls[0] ?? [];
    expect(body).toEqual({ contactKind: 'EMAIL', contact: FORBIDDEN.rawEmail });
    // The generated operation takes (body, options) — there is no params object
    // to put a contact in, and the call must not have invented one.
    expect(JSON.stringify(options ?? {})).not.toContain(FORBIDDEN.rawEmail);
  });

  it('submits PHONE when the operator selects it', async () => {
    resolvesToCustomer();
    const user = createUser();
    render();

    await user.click(screen.getByLabelText(CUSTOMER_ACCESS_COPY.lookup.kindPhone));
    await lookUp(user, FORBIDDEN.rawPhone);

    await waitFor(() => {
      expect(resolveMock).toHaveBeenCalledWith(
        { contactKind: 'PHONE', contact: FORBIDDEN.rawPhone },
        expect.anything(),
      );
    });
  });

  it('clears the typed contact once it has been submitted', async () => {
    resolvesToCustomer();
    const user = createUser();
    render();

    await lookUp(user);

    await waitFor(() => {
      expect(screen.getByTestId('customer-id')).toHaveTextContent(CUSTOMER_ID);
    });
    // The field is empty and the value is nowhere in the document: the screen has
    // the Customer id it needed and no further use for a person's address.
    expect(screen.getByTestId('customer-lookup-contact')).toHaveValue('');
    expect(document.body.textContent ?? '').not.toContain(FORBIDDEN.rawEmail);
  });

  it('refuses a blank lookup without calling the API', async () => {
    const user = createUser();
    render();

    await user.click(screen.getByTestId('customer-lookup-submit'));

    expect(screen.getByRole('alert')).toHaveTextContent(CUSTOMER_ACCESS_COPY.lookup.blank);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('loads all three regions for the resolved Customer, and only that Customer', async () => {
    resolvesToCustomer();
    const user = createUser();
    render();

    await lookUp(user);

    await waitFor(() => {
      expect(detailMock).toHaveBeenCalledWith(CUSTOMER_ID, expect.anything());
    });
    expect(grantsMock).toHaveBeenCalledWith(CUSTOMER_ID, expect.anything());
    // The notification list is narrowed server-side by both status and Customer.
    expect(listMock).toHaveBeenCalledWith(
      { status: 'FAILED', customerId: CUSTOMER_ID },
      expect.anything(),
    );
  });
});

describe('the Customer and contact region', () => {
  it('renders the loading state before the reads settle', async () => {
    resolveMock.mockResolvedValue(envelope({ customerId: CUSTOMER_ID }));
    detailMock.mockReturnValue(new Promise(() => undefined) as never);
    grantsMock.mockReturnValue(new Promise(() => undefined) as never);
    listMock.mockReturnValue(new Promise(() => undefined) as never);
    const user = createUser();
    render();

    await lookUp(user);

    await waitFor(() => {
      expect(screen.getByTestId('customer-panel-loading')).toBeInTheDocument();
    });
    expect(screen.getByTestId('grant-panel-loading')).toBeInTheDocument();
    expect(screen.getByTestId('notification-panel-loading')).toBeInTheDocument();
  });

  it('renders the identity, the display name and both masked contacts', async () => {
    resolvesToCustomer();
    const user = createUser();
    render();

    await lookUp(user);

    await waitFor(() => {
      expect(screen.getByTestId('customer-display-name')).toHaveTextContent('Nguyễn Minh An');
    });
    expect(screen.getByTestId('customer-id')).toHaveTextContent(CUSTOMER_ID);

    const contacts = screen.getByTestId('customer-contacts');
    expect(contacts).toHaveTextContent(EMAIL_MASK);
    expect(contacts).toHaveTextContent(PHONE_MASK);
  });

  it('reports verified and primary in words, not by colour alone', async () => {
    resolvesToCustomer();
    const user = createUser();
    render();

    await lookUp(user);

    await waitFor(() => {
      expect(screen.getAllByTestId('customer-contact-verified')).toHaveLength(2);
    });
    const badges = screen.getAllByTestId('customer-contact-verified');
    expect(badges[0]).toHaveTextContent(CUSTOMER_ACCESS_COPY.customer.verified);
    expect(badges[1]).toHaveTextContent(CUSTOMER_ACCESS_COPY.customer.unverified);
    expect(screen.getByText(CUSTOMER_ACCESS_COPY.customer.primary)).toBeInTheDocument();
  });

  it('says so plainly when the Customer never supplied a name', async () => {
    resolveMock.mockResolvedValue(envelope({ customerId: CUSTOMER_ID }));
    const { displayName: _dropped, ...withoutName } = makeCustomer();
    detailMock.mockResolvedValue(envelope(withoutName));
    grantsMock.mockResolvedValue(envelope(makeGrants()));
    listMock.mockResolvedValue(envelope(makeNotifications()));
    const user = createUser();
    render();

    await lookUp(user);

    await waitFor(() => {
      expect(screen.getByTestId('customer-display-name')).toHaveTextContent(
        CUSTOMER_ACCESS_COPY.customer.displayNameEmpty,
      );
    });
  });

  it('offers no customer edit, merge or verification control', async () => {
    resolvesToCustomer();
    const user = createUser();
    render();

    await waitFor(async () => {
      await lookUp(user);
      expect(screen.getByTestId('customer-id')).toBeInTheDocument();
    });

    for (const forbidden of [/sửa/i, /gộp/i, /xoá/i, /xác minh lại/i, /huỷ xác minh/i]) {
      expect(screen.queryByRole('button', { name: forbidden })).not.toBeInTheDocument();
    }
  });
});

describe('not found and load error', () => {
  it('reports one not-found answer and names no cause', async () => {
    resolveMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'NOT_FOUND', message: 'No customer matches.' }),
    );
    const user = createUser();
    render();

    await lookUp(user);

    await waitFor(() => {
      expect(screen.getByTestId('customer-not-found')).toBeInTheDocument();
    });
    const text = screen.getByTestId('customer-not-found').textContent ?? '';
    // The four causes the server refuses to distinguish must not be distinguished
    // here either.
    expect(text).not.toMatch(/chưa xác minh|đã ngừng|không hợp lệ|sai định dạng/i);
    expect(detailMock).not.toHaveBeenCalled();
  });

  it('gives the same not-found answer for a rejected contact shape', async () => {
    resolveMock.mockRejectedValue(
      makeApiClientError({ status: 400, code: 'VALIDATION_ERROR', message: 'Bad body.' }),
    );
    const user = createUser();
    render();

    await lookUp(user, 'not-an-address');

    await waitFor(() => {
      expect(screen.getByTestId('customer-not-found')).toBeInTheDocument();
    });
  });

  it('shows a load error when a region read fails, and retries all three', async () => {
    resolveMock.mockResolvedValue(envelope({ customerId: CUSTOMER_ID }));
    detailMock.mockResolvedValue(envelope(makeCustomer()));
    grantsMock.mockRejectedValue(
      makeApiClientError({ status: 500, code: 'INTERNAL_ERROR', message: 'boom' }),
    );
    listMock.mockResolvedValue(envelope(makeNotifications()));
    const user = createUser();
    render();

    await lookUp(user);

    await waitFor(() => {
      expect(screen.getByTestId('customer-load-error')).toBeInTheDocument();
    });
    // No raw transport detail reaches the operator.
    expect(screen.getByTestId('customer-load-error').textContent ?? '').not.toContain('boom');

    grantsMock.mockResolvedValue(envelope(makeGrants()));
    await user.click(screen.getByTestId('customer-load-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('grant-status')).toBeInTheDocument();
    });
  });

  it('drops the previous Customer when a later lookup misses', async () => {
    resolvesToCustomer();
    const user = createUser();
    render();

    await lookUp(user);
    await waitFor(() => {
      expect(screen.getByTestId('customer-id')).toBeInTheDocument();
    });

    resolveMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'NOT_FOUND', message: 'No customer matches.' }),
    );
    await lookUp(user, 'ai-do@vidu.test');

    await waitFor(() => {
      expect(screen.getByTestId('customer-not-found')).toBeInTheDocument();
    });
    // Answering a question about somebody else with the person still on screen
    // is the worst possible answer, so the record is cleared.
    expect(screen.queryByTestId('customer-id')).not.toBeInTheDocument();
  });
});
