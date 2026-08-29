/**
 * `APP10-A02` — participant selection and opening a case.
 *
 * The claims that live here:
 *
 * 1. **There is exactly one way to name a Customer.** Both slots go through the
 *    delivered exact-contact resolver; no list, directory, autocomplete or
 *    fuzzy search exists to be rendered.
 * 2. **The two roles are named, and named differently.** Survivor and loser each
 *    carry a title and a sentence saying what happens to that identity.
 * 3. **The same Customer cannot be both sides**, and the guard blocks *before*
 *    a request is sent rather than harvesting the server's refusal.
 * 4. **A participant is replaceable right up to the open**, and not afterwards —
 *    the workflow leaves this screen entirely.
 * 5. **A successful open navigates to the authoritative case**, carrying nothing
 *    but the id.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminCustomerMergeOpen,
  adminCustomerSupportDetail,
  adminCustomerSupportResolve,
} from '@embroidery/api-client';

import { MergeSelectionScreen } from '../../src/features/customer-merge';
import { CUSTOMER_MERGE_COPY } from '../../src/features/customer-merge/model/customer-merge-copy';
import { makeApiClientError } from '../support/api-error';
import { FORBIDDEN, envelope, makeCustomer } from '../support/customer-access-fixture';
import {
  LOSER_CUSTOMER_ID,
  LOSER_MASK,
  MERGE_CASE_ID,
  SURVIVOR_CUSTOMER_ID,
  SURVIVOR_MASK,
} from '../support/customer-merge-fixture';

// `jest.mock` is hoisted above every const, so the router is read back from
// the mock registry afterwards rather than closed over.
jest.mock(
  'next/navigation',
  () => mockCreateNavigationMock('/support/customer-access/merge').module,
);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomerSupportResolve: jest.fn(),
  adminCustomerSupportDetail: jest.fn(),
  adminCustomerMergeOpen: jest.fn(),
}));

const resolveMock = adminCustomerSupportResolve as jest.MockedFunction<
  typeof adminCustomerSupportResolve
>;
const detailMock = adminCustomerSupportDetail as jest.MockedFunction<
  typeof adminCustomerSupportDetail
>;
const openMock = adminCustomerMergeOpen as jest.MockedFunction<typeof adminCustomerMergeOpen>;
const router = jest
  .requireMock<{ useRouter: () => { push: jest.Mock } }>('next/navigation')
  .useRouter();

const COPY = CUSTOMER_MERGE_COPY;

const render = () => renderWithProviders(<MergeSelectionScreen />);

/** Resolve one slot with a raw contact the operator typed. */
async function fillSlot(
  user: ReturnType<typeof createUser>,
  role: 'survivor' | 'loser',
  contact: string,
) {
  await user.type(screen.getByTestId(`merge-slot-${role}-contact`), contact);
  await user.click(screen.getByTestId(`merge-slot-${role}-resolve`));
  await waitFor(() => {
    expect(screen.getByTestId(`merge-slot-${role}-card`)).toBeInTheDocument();
  });
}

async function fillBothSlots(user: ReturnType<typeof createUser>) {
  await fillSlot(user, 'survivor', FORBIDDEN.rawEmail);
  await fillSlot(user, 'loser', FORBIDDEN.rawPhone);
}

beforeEach(() => {
  jest.clearAllMocks();
  router.push.mockClear();
  // Keyed on the submitted contact rather than on call order: `clearAllMocks`
  // clears calls but not a queued `mockResolvedValueOnce`, so an order-based
  // stub leaks its leftovers into the next test.
  resolveMock.mockReset();
  resolveMock.mockImplementation((body: unknown) =>
    Promise.resolve(
      envelope({
        customerId:
          (body as { contact: string }).contact === FORBIDDEN.rawEmail
            ? SURVIVOR_CUSTOMER_ID
            : LOSER_CUSTOMER_ID,
      }),
    ),
  );
  detailMock.mockImplementation((customerId: unknown) =>
    Promise.resolve(
      envelope(
        customerId === SURVIVOR_CUSTOMER_ID
          ? makeCustomer({
              customerId: SURVIVOR_CUSTOMER_ID,
              displayName: 'Nguyễn Minh An',
              contacts: [
                {
                  contactId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f70e1',
                  kind: 'EMAIL',
                  maskedValue: SURVIVOR_MASK,
                  verified: true,
                  primary: true,
                },
              ],
            })
          : makeCustomer({
              customerId: LOSER_CUSTOMER_ID,
              displayName: 'Nguyen Minh An',
              contacts: [
                {
                  contactId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f70e2',
                  kind: 'EMAIL',
                  maskedValue: LOSER_MASK,
                  verified: true,
                  primary: true,
                },
              ],
            }),
      ),
    ),
  );
  openMock.mockResolvedValue(envelope({ mergeCaseId: MERGE_CASE_ID, status: 'REQUESTED' }));
});

describe('participant selection', () => {
  it('names both roles and says what happens to each identity', () => {
    render();

    const survivor = screen.getByTestId('merge-slot-survivor');
    const loser = screen.getByTestId('merge-slot-loser');

    expect(survivor).toHaveTextContent(COPY.selection.survivorTitle);
    expect(survivor).toHaveTextContent(COPY.selection.survivorMeaning);
    expect(loser).toHaveTextContent(COPY.selection.loserTitle);
    expect(loser).toHaveTextContent(COPY.selection.loserMeaning);
    // Never "Khách hàng 1 / 2": the direction of an irreversible operation is
    // not left to position.
    expect(document.body.textContent).not.toMatch(/Khách hàng 1|Khách hàng 2/);
  });

  it('resolves each slot through the exact-contact resolver', async () => {
    const user = createUser();
    render();
    await fillBothSlots(user);

    expect(resolveMock).toHaveBeenCalledTimes(2);
    // The contact travels in the request body, never a query parameter.
    expect(resolveMock.mock.calls[0]?.[0]).toEqual({
      contactKind: 'EMAIL',
      contact: FORBIDDEN.rawEmail,
    });
    expect(screen.getByTestId('merge-slot-survivor-card')).toHaveTextContent(SURVIVOR_MASK);
    expect(screen.getByTestId('merge-slot-loser-card')).toHaveTextContent(LOSER_MASK);
  });

  it('renders no customer list, directory or search affordance', async () => {
    const user = createUser();
    render();
    await fillBothSlots(user);

    for (const testId of [
      'customer-list',
      'customer-search',
      'customer-directory',
      'merge-queue',
      'merge-list',
      'duplicate-candidates',
    ]) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clears a slot back to its lookup form when the participant is replaced', async () => {
    const user = createUser();
    render();
    await fillSlot(user, 'survivor', FORBIDDEN.rawEmail);

    await user.click(screen.getByTestId('merge-slot-survivor-replace'));

    expect(screen.queryByTestId('merge-slot-survivor-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('merge-slot-survivor-contact')).toBeInTheDocument();
  });

  it('empties the slot when a lookup misses rather than leaving the previous customer', async () => {
    resolveMock.mockReset();
    resolveMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'NOT_FOUND' }));
    const user = createUser();
    render();

    await user.type(screen.getByTestId('merge-slot-survivor-contact'), FORBIDDEN.rawEmail);
    await user.click(screen.getByTestId('merge-slot-survivor-resolve'));

    expect(await screen.findByTestId('merge-slot-survivor-failure')).toBeInTheDocument();
    expect(screen.queryByTestId('merge-slot-survivor-card')).not.toBeInTheDocument();
  });

  it('blocks the open when both slots resolve to one customer, and sends nothing', async () => {
    resolveMock.mockReset();
    resolveMock.mockResolvedValue(envelope({ customerId: SURVIVOR_CUSTOMER_ID }));
    const user = createUser();
    render();
    await fillBothSlots(user);

    await user.type(screen.getByTestId('merge-open-reason'), 'Trùng hồ sơ.');

    expect(screen.getByTestId('merge-same-customer')).toHaveTextContent(
      COPY.selection.sameCustomer,
    );
    expect(screen.getByTestId('merge-open-submit')).toBeDisabled();
    expect(openMock).not.toHaveBeenCalled();
  });
});

describe('opening a merge case', () => {
  it('requires a reason before anything is sent', async () => {
    const user = createUser();
    render();
    await fillBothSlots(user);

    await user.click(screen.getByTestId('merge-open-submit'));

    expect(await screen.findByTestId('merge-open-problem')).toHaveTextContent(
      COPY.open.reasonBlank,
    );
    expect(openMock).not.toHaveBeenCalled();
  });

  it('sends both ids and the trimmed reason, and no contact value', async () => {
    const user = createUser();
    render();
    await fillBothSlots(user);

    await user.type(screen.getByTestId('merge-open-reason'), '  Cùng một người.  ');
    await user.click(screen.getByTestId('merge-open-submit'));

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledTimes(1);
    });
    expect(openMock.mock.calls[0]?.[0]).toEqual({
      survivorCustomerId: SURVIVOR_CUSTOMER_ID,
      loserCustomerId: LOSER_CUSTOMER_ID,
      reason: 'Cùng một người.',
    });
    const body = JSON.stringify(openMock.mock.calls[0]?.[0]);
    expect(body).not.toContain(FORBIDDEN.rawEmail);
    expect(body).not.toContain(FORBIDDEN.rawPhone);
  });

  it('navigates to the authoritative case detail on success', async () => {
    const user = createUser();
    render();
    await fillBothSlots(user);

    await user.type(screen.getByTestId('merge-open-reason'), 'Cùng một người.');
    await user.click(screen.getByTestId('merge-open-submit'));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/support/customer-access/merge/${MERGE_CASE_ID}`);
    });
  });

  it('maps a duplicate-open or already-merged conflict to one bounded refusal', async () => {
    openMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'CONFLICT',
        message: 'A merge case is already open for this pair of customers.',
      }),
    );
    const user = createUser();
    render();
    await fillBothSlots(user);

    await user.type(screen.getByTestId('merge-open-reason'), 'Cùng một người.');
    await user.click(screen.getByTestId('merge-open-submit'));

    const failure = await screen.findByTestId('merge-open-failure');
    expect(failure).toHaveTextContent(COPY.openFailure.conflict);
    // The server's own wording never reaches the DOM.
    expect(document.body.textContent).not.toContain('A merge case is already open');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('maps a stale participant to its own refusal', async () => {
    openMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'NOT_FOUND' }));
    const user = createUser();
    render();
    await fillBothSlots(user);

    await user.type(screen.getByTestId('merge-open-reason'), 'Cùng một người.');
    await user.click(screen.getByTestId('merge-open-submit'));

    expect(await screen.findByTestId('merge-open-failure')).toHaveTextContent(
      COPY.openFailure.participantMissing,
    );
  });

  it('maps an unclassified failure to the sanitized generic sentence', async () => {
    openMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));
    const user = createUser();
    render();
    await fillBothSlots(user);

    await user.type(screen.getByTestId('merge-open-reason'), 'Cùng một người.');
    await user.click(screen.getByTestId('merge-open-submit'));

    expect(await screen.findByTestId('merge-open-failure')).toHaveTextContent(
      COPY.openFailure.generic,
    );
  });

  it('disables the submit while the open is in flight so a second click cannot open twice', async () => {
    let release: (() => void) | undefined;
    openMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(envelope({ mergeCaseId: MERGE_CASE_ID, status: 'REQUESTED' }));
          };
        }),
    );
    const user = createUser();
    render();
    await fillBothSlots(user);

    await user.type(screen.getByTestId('merge-open-reason'), 'Cùng một người.');
    await user.click(screen.getByTestId('merge-open-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('merge-open-submit')).toBeDisabled();
    });
    expect(screen.getByTestId('merge-open-submit')).toHaveTextContent(COPY.open.submitting);

    release?.();
    await waitFor(() => {
      expect(openMock).toHaveBeenCalledTimes(1);
    });
  });

  it('says in place that opening a case moves nothing', () => {
    render();
    expect(document.body.textContent).toContain(COPY.open.nothingMovedNote);
  });
});
