/**
 * `APP10-A01` — contact promotion and deactivation on `/support/customer-access`.
 *
 * The claims that live here:
 *
 * 1. **Eligibility is offered, not asserted.** Promote appears only on a
 *    verified non-primary contact; the primary row carries no action at all.
 * 2. **Deactivate is a retirement, and says so.** The confirmation states that
 *    the record is kept, and there is no undo and no reactivate anywhere — the
 *    contract publishes neither.
 * 3. **Both outcomes end in a re-read.** The operations answer 204 and
 *    republish nothing, so the new primary designation and the disappearance of
 *    a deactivated contact are facts only the detail read has.
 * 4. **The two 409 refusals are told apart from the authoritative record.**
 *    `APP10-B01` publishes no business code, so the screen re-reads the customer
 *    and reads the reason off what the server now says is true.
 * 5. **The contact id addresses the request and nothing else.** It is sent; it
 *    is never rendered.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminCustomerContactDeactivate,
  adminCustomerContactPromote,
  adminCustomerSupportDetail,
  adminCustomerSupportGrants,
  adminCustomerSupportResolve,
  adminNotificationIntentList,
} from '@embroidery/api-client';
import type { AdminCustomerDetailResponse } from '@embroidery/api-client';

import { CustomerAccessScreen } from '../../src/features/customer-access-support';
import { CUSTOMER_MAINTENANCE_COPY } from '../../src/features/customer-access-support/model/customer-maintenance-copy';
import { makeApiClientError } from '../support/api-error';
import {
  CUSTOMER_ID,
  EMAIL_CONTACT_ID,
  EMAIL_MASK,
  FORBIDDEN,
  PHONE_CONTACT_ID,
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
  adminCustomerContactPromote: jest.fn(),
  adminCustomerContactDeactivate: jest.fn(),
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
const promoteMock = adminCustomerContactPromote as jest.MockedFunction<
  typeof adminCustomerContactPromote
>;
const deactivateMock = adminCustomerContactDeactivate as jest.MockedFunction<
  typeof adminCustomerContactDeactivate
>;

const COPY = CUSTOMER_MAINTENANCE_COPY;

/** Both contacts verified: the phone becomes a promotable, retirable row. */
function twoVerified(): AdminCustomerDetailResponse {
  const customer = makeCustomer();
  return {
    ...customer,
    contacts: [
      { ...(customer.contacts[0] as (typeof customer.contacts)[number]) },
      { ...(customer.contacts[1] as (typeof customer.contacts)[number]), verified: true },
    ],
  };
}

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
  detailMock.mockResolvedValue(envelope(twoVerified()));
  grantsMock.mockResolvedValue(envelope(makeGrants()));
  listMock.mockResolvedValue(envelope(makeNotifications()));
  promoteMock.mockResolvedValue(envelope(undefined));
  deactivateMock.mockResolvedValue(envelope(undefined));
});

describe('contact action eligibility', () => {
  it('offers promote on the verified non-primary contact only', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    // Two contacts, one primary: exactly one promote action.
    expect(screen.getAllByTestId('contact-promote')).toHaveLength(1);
  });

  it('offers neither action on the primary contact', async () => {
    detailMock.mockResolvedValue(
      envelope({
        ...twoVerified(),
        contacts: [
          {
            contactId: EMAIL_CONTACT_ID,
            kind: 'EMAIL',
            maskedValue: EMAIL_MASK,
            verified: true,
            primary: true,
          },
        ],
      }),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.queryByTestId('contact-promote')).not.toBeInTheDocument();
    expect(screen.queryByTestId('contact-deactivate')).not.toBeInTheDocument();
  });

  it('does not offer promote on an unverified contact', async () => {
    // The default fixture's phone contact is unverified.
    detailMock.mockResolvedValue(envelope(makeCustomer()));
    const user = createUser();
    render();
    await openCustomer(user);

    expect(screen.queryByTestId('contact-promote')).not.toBeInTheDocument();
    // It is still retirable — being unverified is not a reason to keep it.
    expect(screen.getAllByTestId('contact-deactivate')).toHaveLength(1);
  });

  it('invents no reactivate, undo or contact-creation control', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    for (const testId of [
      'contact-reactivate',
      'contact-undo',
      'contact-create',
      'contact-delete',
    ]) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
  });
});

describe('promoting a contact to primary', () => {
  it('confirms, sends both ids, then re-reads the customer', async () => {
    const user = createUser();
    render();
    await openCustomer(user);
    const readsBefore = detailMock.mock.calls.length;

    await user.click(screen.getByTestId('contact-promote'));
    expect(screen.getByTestId('contact-action-dialog')).toHaveTextContent(COPY.promote.title);
    // The dialog names the contact by its mask, never by its id.
    expect(screen.getByTestId('contact-action-subject')).toHaveTextContent(PHONE_MASK);

    await user.click(screen.getByTestId('contact-action-confirm'));

    await waitFor(() => {
      expect(promoteMock).toHaveBeenCalledTimes(1);
    });
    expect(promoteMock.mock.calls[0]?.[0]).toBe(CUSTOMER_ID);
    expect(promoteMock.mock.calls[0]?.[1]).toBe(PHONE_CONTACT_ID);

    await waitFor(() => {
      expect(screen.getByTestId('contact-action-dialog')).toHaveTextContent(
        COPY.promote.successTitle,
      );
    });
    await waitFor(() => {
      expect(detailMock.mock.calls.length).toBeGreaterThan(readsBefore);
    });
  });

  it('reads a 409 on an unverified contact off the re-read record', async () => {
    promoteMock.mockRejectedValue(makeApiClientError({ status: 409, code: 'CONFLICT' }));
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('contact-promote'));
    // The re-read finds the contact unverified, which is what the refusal was.
    detailMock.mockResolvedValue(envelope(makeCustomer()));
    await user.click(screen.getByTestId('contact-action-confirm'));

    expect(await screen.findByTestId('contact-action-error')).toHaveTextContent(
      COPY.contactFailure.unverified,
    );
  });

  it('maps a vanished contact to the stale refusal', async () => {
    promoteMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'NOT_FOUND' }));
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('contact-promote'));
    await user.click(screen.getByTestId('contact-action-confirm'));

    expect(await screen.findByTestId('contact-action-error')).toHaveTextContent(
      COPY.contactFailure.stale,
    );
  });
});

describe('deactivating a contact', () => {
  it('says retire rather than delete, and offers no undo', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getAllByTestId('contact-deactivate')[0] as HTMLElement);
    const dialog = screen.getByTestId('contact-action-dialog');

    expect(dialog).toHaveTextContent(COPY.deactivate.title);
    expect(dialog).toHaveTextContent(COPY.deactivate.body);
    expect(screen.getByTestId('contact-action-confirm')).toHaveTextContent(COPY.deactivate.confirm);
    expect(screen.queryByTestId('contact-undo')).not.toBeInTheDocument();
  });

  it('sends both ids and re-reads, so the contact leaves the list', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getAllByTestId('contact-deactivate')[0] as HTMLElement);
    // What the server returns after the transition: one contact, not two.
    detailMock.mockResolvedValue(
      envelope({
        ...twoVerified(),
        contacts: [
          {
            contactId: EMAIL_CONTACT_ID,
            kind: 'EMAIL',
            maskedValue: EMAIL_MASK,
            verified: true,
            primary: true,
          },
        ],
      }),
    );
    await user.click(screen.getByTestId('contact-action-confirm'));

    await waitFor(() => {
      expect(deactivateMock).toHaveBeenCalledTimes(1);
    });
    expect(deactivateMock.mock.calls[0]?.[0]).toBe(CUSTOMER_ID);
    expect(deactivateMock.mock.calls[0]?.[1]).toBe(PHONE_CONTACT_ID);

    await waitFor(() => {
      expect(screen.getByTestId('contact-action-dialog')).toHaveTextContent(
        COPY.deactivate.successTitle,
      );
    });
    await user.click(screen.getByTestId('contact-action-cancel'));
    await waitFor(() => {
      expect(screen.queryByText(PHONE_MASK)).not.toBeInTheDocument();
    });
  });

  it('explains a primary-contact refusal, read off the re-read record', async () => {
    deactivateMock.mockRejectedValue(makeApiClientError({ status: 409, code: 'CONFLICT' }));
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getAllByTestId('contact-deactivate')[0] as HTMLElement);
    // Somebody promoted this contact between the read and the click.
    detailMock.mockResolvedValue(
      envelope({
        ...twoVerified(),
        contacts: [
          {
            contactId: EMAIL_CONTACT_ID,
            kind: 'EMAIL',
            maskedValue: EMAIL_MASK,
            verified: true,
            primary: false,
          },
          {
            contactId: PHONE_CONTACT_ID,
            kind: 'PHONE',
            maskedValue: PHONE_MASK,
            verified: true,
            primary: true,
          },
        ],
      }),
    );
    await user.click(screen.getByTestId('contact-action-confirm'));

    expect(await screen.findByTestId('contact-action-error')).toHaveTextContent(
      COPY.contactFailure.primary,
    );
  });

  it('explains a last-verified-contact refusal distinctly from the primary one', async () => {
    deactivateMock.mockRejectedValue(makeApiClientError({ status: 409, code: 'CONFLICT' }));
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getAllByTestId('contact-deactivate')[0] as HTMLElement);
    // The other contact lost its verification: this is now the only verified one.
    detailMock.mockResolvedValue(
      envelope({
        ...twoVerified(),
        contacts: [
          {
            contactId: EMAIL_CONTACT_ID,
            kind: 'EMAIL',
            maskedValue: EMAIL_MASK,
            verified: false,
            primary: true,
          },
          {
            contactId: PHONE_CONTACT_ID,
            kind: 'PHONE',
            maskedValue: PHONE_MASK,
            verified: true,
            primary: false,
          },
        ],
      }),
    );
    await user.click(screen.getByTestId('contact-action-confirm'));

    expect(await screen.findByTestId('contact-action-error')).toHaveTextContent(
      COPY.contactFailure.lastVerified,
    );
  });

  it('falls back to the generic conflict when the fresh record names no reason', async () => {
    deactivateMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'CONFLICT', message: 'customer has been merged' }),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getAllByTestId('contact-deactivate')[0] as HTMLElement);
    await user.click(screen.getByTestId('contact-action-confirm'));

    const error = await screen.findByTestId('contact-action-error');
    expect(error).toHaveTextContent(COPY.contactFailure.conflict);
    expect(document.body.textContent).not.toContain('customer has been merged');
  });

  it('maps an unclassified failure to the sanitized generic sentence', async () => {
    deactivateMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getAllByTestId('contact-deactivate')[0] as HTMLElement);
    await user.click(screen.getByTestId('contact-action-confirm'));

    expect(await screen.findByTestId('contact-action-error')).toHaveTextContent(
      COPY.contactFailure.generic,
    );
  });

  it('disables the confirmation while the transition is in flight', async () => {
    let release: (() => void) | undefined;
    deactivateMock.mockImplementation(
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

    await user.click(screen.getAllByTestId('contact-deactivate')[0] as HTMLElement);
    await user.click(screen.getByTestId('contact-action-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('contact-action-confirm')).toBeDisabled();
    });
    expect(screen.getByTestId('contact-action-cancel')).toBeDisabled();

    release?.();
    await waitFor(() => {
      expect(deactivateMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('the maintenance privacy boundary', () => {
  it('renders no contact id and no raw contact value, in either dialog', async () => {
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('contact-promote'));
    const withDialog = document.body.textContent ?? '';

    for (const forbidden of [
      EMAIL_CONTACT_ID,
      PHONE_CONTACT_ID,
      FORBIDDEN.rawEmail,
      FORBIDDEN.rawPhone,
      FORBIDDEN.code,
      FORBIDDEN.token,
      FORBIDDEN.digest,
    ]) {
      expect(withDialog).not.toContain(forbidden);
    }
    // The masks are the one contact representation on screen, and they are there.
    expect(withDialog).toContain(PHONE_MASK);
  });

  it('dumps no raw server object into the failure UI', async () => {
    promoteMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'CONFLICT',
        message: 'That contact is not verified.',
        errors: [{ field: 'contactId', code: 'CONFLICT', message: PHONE_CONTACT_ID }],
      }),
    );
    const user = createUser();
    render();
    await openCustomer(user);

    await user.click(screen.getByTestId('contact-promote'));
    await user.click(screen.getByTestId('contact-action-confirm'));
    await screen.findByTestId('contact-action-error');

    const rendered = document.body.textContent ?? '';
    expect(rendered).not.toContain('That contact is not verified.');
    expect(rendered).not.toContain(PHONE_CONTACT_ID);
    expect(rendered).not.toContain('requestId');
    expect(rendered).not.toContain('CONFLICT');
  });
});
