/**
 * The quotation workbench's bootstrap and its drafting writes (`APP6-A01` §4,
 * §7, §9, §10, §11; `682:3`, `684:3`, `684:144`, `686:3`, `686:62`).
 *
 * The claims worth proving here are the ones a plausible-looking screen gets
 * wrong:
 *
 *  - the quotation is found through the **durable locator**, so an unsent DRAFT
 *    survives a reload;
 *  - loading, empty and failed are three states and never collapse into one;
 *  - `QUOTATION_ALREADY_EXISTS` is recovered by re-reading, not by parsing an
 *    id out of the refusal;
 *  - a customer-owned request is offered no `PRODUCT` line;
 *  - nothing the server said reaches the operator verbatim.
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
  adminCustomRequestDetail,
  adminQuotationCreate,
  adminQuotationVersionDetail,
  adminQuotationVersionHistory,
} from '@embroidery/api-client';

import { QuotationWorkbenchScreen } from '../../src/features/request-quotation';
import { REQUEST_QUOTATION_COPY as COPY } from '../../src/features/request-quotation/model/request-quotation-copy';
import { presentRequestStatus } from '../../src/shared/presentation/request-status';
import { makeApiClientError } from '../support/api-error';
import {
  envelope,
  makeCatalogRequest,
  makeCopRequest,
  makeDrafted,
  makeHistory,
  makeVersionDetail,
  OTHER_QUOTATION_ID,
  QUOTATION_ID,
  QUOTATION_REQUEST_ID,
} from '../support/request-quotation-fixture';

jest.mock(
  'next/navigation',
  () =>
    mockCreateNavigationMock(`/requests/${'01950000-0000-7000-8000-0000000000r1'}/quotation`)
      .module,
);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomRequestDetail: jest.fn(),
  adminQuotationCreate: jest.fn(),
  adminQuotationAddVersion: jest.fn(),
  adminQuotationVersionHistory: jest.fn(),
  adminQuotationVersionDetail: jest.fn(),
  adminQuotationSendVersion: jest.fn(),
}));

const contextMock = adminCustomRequestDetail as jest.MockedFunction<
  typeof adminCustomRequestDetail
>;
const createMock = adminQuotationCreate as jest.MockedFunction<typeof adminQuotationCreate>;
const historyMock = adminQuotationVersionHistory as jest.MockedFunction<
  typeof adminQuotationVersionHistory
>;
const detailMock = adminQuotationVersionDetail as jest.MockedFunction<
  typeof adminQuotationVersionDetail
>;

beforeEach(() => {
  jest.clearAllMocks();
  contextMock.mockResolvedValue(envelope(makeCatalogRequest()) as never);
  historyMock.mockResolvedValue(envelope(makeHistory()) as never);
  detailMock.mockResolvedValue(envelope(makeVersionDetail()) as never);
  createMock.mockResolvedValue(envelope(makeDrafted()) as never);
});

const render = () =>
  renderWithProviders(<QuotationWorkbenchScreen requestId={QUOTATION_REQUEST_ID} />);

/** Fill the minimum a valid draft needs, leaving the defaults alone. */
async function fillMinimumDraft(user: ReturnType<typeof createUser>) {
  const form = screen.getByTestId('quotation-form');
  await user.type(within(form).getByLabelText(COPY.form.quantityTotal), '12');
  await user.type(within(form).getByLabelText(COPY.form.lineDescription), 'Thêu logo');
  await user.type(within(form).getByLabelText(COPY.form.lineUnitPrice), '102880.66');
}

describe('the bootstrap order', () => {
  it('reads the request context first, addressed by the route id', async () => {
    render();
    await waitFor(() => {
      expect(contextMock).toHaveBeenCalledTimes(1);
    });
    expect(contextMock.mock.calls[0]?.[0]).toBe(QUOTATION_REQUEST_ID);
  });

  it('shows loading — not empty — while the context read is in flight', () => {
    contextMock.mockReturnValue(new Promise(() => undefined) as never);
    render();
    expect(screen.getByTestId('quotation-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('quotation-empty')).not.toBeInTheDocument();
    expect(historyMock).not.toHaveBeenCalled();
  });

  it('requests no history at all while the locator is unknown', async () => {
    render();
    await screen.findByTestId('quotation-empty');
    expect(historyMock).not.toHaveBeenCalled();
  });

  it('issues one read per load — there is no polling and no retry loop', async () => {
    render();
    await screen.findByTestId('quotation-empty');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60);
    });
    expect(contextMock).toHaveBeenCalledTimes(1);
  });
});

describe('the durable locator', () => {
  it('opens the existing quotation when the context carries one', async () => {
    contextMock.mockResolvedValue(
      envelope(makeCatalogRequest({ quotationId: QUOTATION_ID })) as never,
    );
    render();

    await waitFor(() => {
      expect(historyMock).toHaveBeenCalledTimes(1);
    });
    expect(historyMock.mock.calls[0]?.[0]).toBe(QUOTATION_ID);
    expect(screen.queryByTestId('quotation-empty')).not.toBeInTheDocument();
    expect(await screen.findByTestId('quotation-history')).toBeInTheDocument();
  });

  it('finds an unsent DRAFT even though no version is customer-current', async () => {
    // The state the pointer cannot express: a quotation exists, nothing has been
    // sent, so `currentVersionId` is null. Discovery must not depend on it.
    contextMock.mockResolvedValue(
      envelope(makeCatalogRequest({ quotationId: QUOTATION_ID, status: 'UNDER_REVIEW' })) as never,
    );
    render();

    await screen.findByTestId('quotation-version-panel');
    expect(historyMock.mock.calls[0]?.[0]).toBe(QUOTATION_ID);
    expect(screen.getByTestId('quotation-version-status')).toHaveTextContent(
      COPY.versionStatus.DRAFT,
    );
  });

  it('shows the empty state only for a successful read with no quotation', async () => {
    render();
    expect(await screen.findByTestId('quotation-empty')).toHaveTextContent(COPY.empty.heading);
  });
});

describe('a failed read is a failure, never an empty quotation', () => {
  it('reports a context read failure without revealing whether the request exists', async () => {
    contextMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'REQUEST_NOT_FOUND', message: 'No such request.' }),
    );
    render();

    const error = await screen.findByTestId('quotation-error');
    expect(error).toHaveTextContent(COPY.error.missing);
    expect(screen.queryByTestId('quotation-empty')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('No such request.');
    expect(document.body.textContent).not.toContain('REQUEST_NOT_FOUND');
    expect(document.body.textContent).not.toContain('req-test-0001');
  });

  it('keeps a failed history read distinct from having no quotation', async () => {
    contextMock.mockResolvedValue(
      envelope(makeCatalogRequest({ quotationId: QUOTATION_ID })) as never,
    );
    historyMock.mockRejectedValue(
      makeApiClientError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: 'DB down.' }),
    );
    render();

    const error = await screen.findByTestId('quotation-error');
    expect(error).toHaveTextContent(COPY.error.historyHeading);
    expect(screen.queryByTestId('quotation-empty')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('DB down.');
  });

  it('retries only when the operator asks', async () => {
    const user = createUser();
    contextMock.mockRejectedValueOnce(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));
    render();

    await screen.findByTestId('quotation-error');
    expect(contextMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: COPY.error.retry }));
    await screen.findByTestId('quotation-empty');
    expect(contextMock).toHaveBeenCalledTimes(2);
  });
});

describe('the offered form follows the subject branch', () => {
  it('offers a product line for a catalog request', async () => {
    render();
    await screen.findByTestId('quotation-form');
    const kind = within(screen.getByTestId('quotation-form')).getByLabelText(COPY.form.lineKind);
    expect(within(kind).getByRole('option', { name: COPY.lineKinds.PRODUCT })).toBeInTheDocument();
  });

  it('offers no product line for a customer-owned request', async () => {
    contextMock.mockResolvedValue(envelope(makeCopRequest()) as never);
    render();

    await screen.findByTestId('quotation-form');
    const kind = within(screen.getByTestId('quotation-form')).getByLabelText(COPY.form.lineKind);
    expect(
      within(kind).queryByRole('option', { name: COPY.lineKinds.PRODUCT }),
    ).not.toBeInTheDocument();
    expect(
      within(kind).getByRole('option', { name: COPY.lineKinds.EMBROIDERY }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('quotation-cop-notice')).toHaveTextContent(COPY.context.copNotice);
  });

  it('offers neither a shipping nor an adjustment line, which have their own fields', async () => {
    render();
    await screen.findByTestId('quotation-form');
    const kind = within(screen.getByTestId('quotation-form')).getByLabelText(COPY.form.lineKind);
    expect(within(kind).queryByRole('option', { name: COPY.lineKinds.SHIPPING })).toBeNull();
    expect(within(kind).queryByRole('option', { name: COPY.lineKinds.ADJUSTMENT })).toBeNull();
  });
});

describe('creating the first quotation', () => {
  it('sends the operator figures as exact strings and no derived total', async () => {
    const user = createUser();
    render();
    await screen.findByTestId('quotation-form');

    await fillMinimumDraft(user);
    await user.click(screen.getByTestId('quotation-form-submit'));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });
    const body = createMock.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(body.customRequestId).toBe(QUOTATION_REQUEST_ID);
    expect((body.lineItems as { unitPriceAmount: string }[])[0]?.unitPriceAmount).toBe('102880.66');
    expect(body).not.toHaveProperty('totalAmount');
    expect(body).not.toHaveProperty('subtotalAmount');
    expect(body).not.toHaveProperty('depositAmount');
  });

  it('re-reads the context after the write, so the new DRAFT survives a reload', async () => {
    const user = createUser();
    contextMock
      .mockResolvedValueOnce(envelope(makeCatalogRequest()) as never)
      .mockResolvedValue(envelope(makeCatalogRequest({ quotationId: QUOTATION_ID })) as never);
    render();
    await screen.findByTestId('quotation-form');

    await fillMinimumDraft(user);
    await user.click(screen.getByTestId('quotation-form-submit'));

    // The second context read is the durability proof: the locator now comes
    // from the server, not from the receipt held in memory.
    await waitFor(() => {
      expect(contextMock).toHaveBeenCalledTimes(2);
    });
    await screen.findByTestId('quotation-history');
    expect(historyMock.mock.calls[0]?.[0]).toBe(QUOTATION_ID);
  });

  it('refuses to submit a form the server would reject, without a round trip', async () => {
    const user = createUser();
    render();
    await screen.findByTestId('quotation-form');

    await fillMinimumDraft(user);
    // An adjustment with no reason — the first half of the bidirectional rule.
    await user.type(
      within(screen.getByTestId('quotation-form')).getByLabelText(COPY.form.manualAdjustment),
      '-50000',
    );
    await user.click(screen.getByTestId('quotation-form-submit'));

    expect(await screen.findByTestId('quotation-validation')).toBeInTheDocument();
    expect(screen.getByText(COPY.validation.adjustmentReasonRequired)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('shows a server pricing refusal without echoing what the server said', async () => {
    const user = createUser();
    createMock.mockRejectedValue(
      makeApiClientError({
        status: 400,
        code: 'QUOTATION_PRICING_INVALID',
        message: 'lineItems.0.unitPriceAmount must match /^\\d+$/',
      }),
    );
    render();
    await screen.findByTestId('quotation-form');

    await fillMinimumDraft(user);
    await user.click(screen.getByTestId('quotation-form-submit'));

    expect(await screen.findByTestId('quotation-validation')).toHaveTextContent(
      COPY.validation.rejected,
    );
    expect(document.body.textContent).not.toContain('must match');
    expect(document.body.textContent).not.toContain('QUOTATION_PRICING_INVALID');
    // The operator's figures survive a refusal they can act on.
    expect(
      within(screen.getByTestId('quotation-form')).getByLabelText(COPY.form.lineUnitPrice),
    ).toHaveValue('102880.66');
  });
});

describe('QUOTATION_ALREADY_EXISTS is reconciled, not parsed', () => {
  it('re-reads the locator and opens the quotation the server reports', async () => {
    const user = createUser();
    createMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'QUOTATION_ALREADY_EXISTS',
        // A different id, deliberately: a screen that scraped the message would
        // open the wrong quotation and this assertion would catch it.
        message: `A quotation already exists: ${OTHER_QUOTATION_ID}`,
      }),
    );
    contextMock
      .mockResolvedValueOnce(envelope(makeCatalogRequest()) as never)
      .mockResolvedValue(envelope(makeCatalogRequest({ quotationId: QUOTATION_ID })) as never);
    render();
    await screen.findByTestId('quotation-form');

    await fillMinimumDraft(user);
    await user.click(screen.getByTestId('quotation-form-submit'));

    await waitFor(() => {
      expect(contextMock).toHaveBeenCalledTimes(2);
    });
    await screen.findByTestId('quotation-history');
    expect(historyMock).toHaveBeenCalledTimes(1);
    expect(historyMock.mock.calls[0]?.[0]).toBe(QUOTATION_ID);
    expect(historyMock.mock.calls[0]?.[0]).not.toBe(OTHER_QUOTATION_ID);
    expect(document.body.textContent).not.toContain(OTHER_QUOTATION_ID);
  });

  it('does not retry the create after losing the race', async () => {
    const user = createUser();
    createMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'QUOTATION_ALREADY_EXISTS' }),
    );
    render();
    await screen.findByTestId('quotation-form');

    await fillMinimumDraft(user);
    await user.click(screen.getByTestId('quotation-form-submit'));

    await waitFor(() => {
      expect(contextMock).toHaveBeenCalledTimes(2);
    });
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

describe('the request context rail', () => {
  it('shows the catalog subject and the request status it was read with', async () => {
    render();
    const context = await screen.findByTestId('quotation-context');
    expect(within(context).getByTestId('quotation-subject-catalog')).toHaveTextContent(
      'Áo thun cotton',
    );
    // APP6-A01-C1. This assertion used to expect the raw `UNDER_REVIEW` token,
    // so it locked in the defect the browser pass found rather than catching it.
    // It now asserts the operator-facing label *and* that the token is gone.
    const status = screen.getByTestId('quotation-context-status');
    expect(status).toHaveTextContent(presentRequestStatus('UNDER_REVIEW'));
    expect(status.textContent).not.toContain('UNDER_REVIEW');
  });

  it('shows the customer-owned subject on the other branch', async () => {
    contextMock.mockResolvedValue(envelope(makeCopRequest()) as never);
    render();
    const context = await screen.findByTestId('quotation-context');
    expect(within(context).getByTestId('quotation-subject-cop')).toHaveTextContent(
      'Áo khoác jean cá nhân',
    );
    expect(within(context).queryByTestId('quotation-subject-catalog')).not.toBeInTheDocument();
  });
});
