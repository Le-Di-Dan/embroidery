/**
 * The Admin Design Template list — rendering, filters and pagination
 * (`APP3-A02`).
 *
 * The assertions that matter most are about **truthfulness**, because every one
 * of them is a sentence the operator would act on:
 *
 *  - the list projection never carries `currentVersion`, so a row must not claim
 *    a template has no version — that would mislabel every published one;
 *  - an absent scope *is* observable, so it is stated plainly;
 *  - the contract has no search, sort, page number or total, so none appears;
 *  - a rejected cursor is not a retryable failure, and offering a retry would
 *    invite the operator to click at something that can never succeed.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminDesignTemplateList, adminProductList } from '@embroidery/api-client';

import { DesignTemplateListScreen } from '../../src/features/design-templates';
import { DESIGN_TEMPLATE_COPY } from '../../src/features/design-templates/model/design-template-copy';
import { makeApiClientError } from '../support/api-error';
import { makeProduct, productEnvelope, makeProductPage } from '../support/product-fixture';
import {
  makeArchivedSummary,
  makeScopedSummary,
  makeTemplatePage,
  makeTemplateSummary,
  templateListEnvelope,
  SCOPED_PRODUCT_ID,
  TEMPLATE_DRAFT_ID,
} from '../support/design-template-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/design-templates').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminDesignTemplateList: jest.fn(),
  adminDesignTemplateCreate: jest.fn(),
  adminProductList: jest.fn(),
}));

const listMock = adminDesignTemplateList as jest.MockedFunction<typeof adminDesignTemplateList>;
const productsMock = adminProductList as jest.MockedFunction<typeof adminProductList>;
// Read through `requireMock` so this is the *same* router the component uses —
// a second `createNavigationMock()` call would build a different one, and every
// navigation assertion would silently watch the wrong object.
const router = jest
  .requireMock<{ useRouter: () => { push: jest.Mock; replace: jest.Mock } }>('next/navigation')
  .useRouter();

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  productsMock.mockResolvedValue(
    productEnvelope(makeProductPage([makeProduct({ productId: SCOPED_PRODUCT_ID })])),
  );
  listMock.mockResolvedValue(templateListEnvelope(makeTemplatePage([makeTemplateSummary()])));
});

const render = () => renderWithProviders(<DesignTemplateListScreen />);

describe('the generated boundary', () => {
  it('reads the list through the generated operation with a bounded page size', async () => {
    render();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    const [params] = listMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params['limit']).toBe(20);
    // No filter is applied by default, so neither parameter is sent at all —
    // an unfiltered page truthfully carries every lifecycle state.
    expect('status' in params).toBe(false);
    expect('productId' in params).toBe(false);
  });

  it('never reads a template detail to render a row', () => {
    const actual = jest.requireActual<Record<string, unknown>>('@embroidery/api-client');

    // Withheld from the curated boundary entirely: an available detail read is
    // an invitation to resolve a row by fetching it, which is the N+1 a keyset
    // list exists to avoid.
    expect(actual['adminDesignTemplateDetail']).toBeUndefined();
  });

  it('exposes no lifecycle operation to this screen', () => {
    const actual = jest.requireActual<Record<string, unknown>>('@embroidery/api-client');

    for (const operation of [
      'adminDesignTemplatePublish',
      'adminDesignTemplateUnpublish',
      'adminDesignTemplateArchive',
    ]) {
      expect(actual[operation]).toBeUndefined();
    }
  });
});

describe('rows', () => {
  it('renders the loading skeleton first', () => {
    listMock.mockReturnValue(new Promise(() => undefined) as never);

    render();

    expect(screen.getByTestId('template-skeleton')).toBeInTheDocument();
    expect(screen.getByText(DESIGN_TEMPLATE_COPY.states.loading)).toBeInTheDocument();
  });

  it('renders every lifecycle badge as text, never colour alone', async () => {
    listMock.mockResolvedValue(
      templateListEnvelope(
        makeTemplatePage([makeTemplateSummary(), makeScopedSummary(), makeArchivedSummary()]),
      ),
    );

    render();

    const table = await screen.findByTestId('template-table');
    expect(within(table).getByText(DESIGN_TEMPLATE_COPY.status.draft)).toBeInTheDocument();
    expect(within(table).getByText(DESIGN_TEMPLATE_COPY.status.published)).toBeInTheDocument();
    expect(within(table).getByText(DESIGN_TEMPLATE_COPY.status.archived)).toBeInTheDocument();
  });

  it('preserves the server ordering exactly', async () => {
    listMock.mockResolvedValue(
      templateListEnvelope(
        makeTemplatePage([makeArchivedSummary(), makeTemplateSummary(), makeScopedSummary()]),
      ),
    );

    render();

    const table = await screen.findByTestId('template-table');
    const names = within(table)
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent);
    // created_at DESC, id DESC is the contract's ordering; nothing re-sorts.
    expect(names).toEqual(['Mẫu cũ', 'Mẫu sen đỏ', 'Mẫu logo ngực']);
  });

  it('does not claim a template has no version, because the list never says', async () => {
    listMock.mockResolvedValue(
      templateListEnvelope(makeTemplatePage([makeTemplateSummary(), makeScopedSummary()])),
    );

    render();

    const table = await screen.findByTestId('template-table');
    // "Chưa có phiên bản" here would be false for the published row.
    expect(within(table).queryByText(DESIGN_TEMPLATE_COPY.row.noVersion)).toBeNull();
    expect(within(table).getAllByText(DESIGN_TEMPLATE_COPY.row.versionNotInList).length).toBe(2);
    // And nothing fabricates a version 1.
    expect(within(table).queryByText('v1')).toBeNull();
  });

  it('renders a version when a page ever does carry one', async () => {
    listMock.mockResolvedValue(
      templateListEnvelope(
        makeTemplatePage([
          makeTemplateSummary({
            currentVersion: {
              version: 3,
              documentSchemaVersion: 1,
              createdAt: '2026-08-01T10:00:00.000Z',
            },
          }),
        ]),
      ),
    );

    render();

    // Scoped to the table: the card list renders the same rows, so an unscoped
    // query matches twice by design.
    const table = await screen.findByTestId('template-table');
    expect(within(table).getByText('v3')).toBeInTheDocument();
  });

  it('states an absent scope plainly and names the product when it is known', async () => {
    listMock.mockResolvedValue(
      templateListEnvelope(makeTemplatePage([makeTemplateSummary(), makeScopedSummary()])),
    );

    render();

    const table = await screen.findByTestId('template-table');
    expect(within(table).getByText(DESIGN_TEMPLATE_COPY.row.noScope)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(table).getByText(DESIGN_TEMPLATE_COPY.row.scopeOnProduct(makeProduct().name)),
      ).toBeInTheDocument();
    });
  });

  it('states that a scope exists without inventing a label for an unknown product', async () => {
    listMock.mockResolvedValue(
      templateListEnvelope(
        makeTemplatePage([
          makeScopedSummary({
            scope: {
              productId: '01920000-0000-7000-8000-0000000000ff',
              productSideId: '01920000-0000-7000-8000-0000000000a1',
              embroideryAreaId: '01920000-0000-7000-8000-0000000000b1',
            },
          }),
        ]),
      ),
    );

    render();

    // Resolving the name would cost a request per row.
    const table = await screen.findByTestId('template-table');
    expect(within(table).getByText(DESIGN_TEMPLATE_COPY.row.scopeAssigned)).toBeInTheDocument();
  });

  it('renders a mobile card list beside the table', async () => {
    render();

    expect(await screen.findByTestId('template-cards')).toBeInTheDocument();
    // Both exist; the stylesheet shows exactly one per breakpoint.
    expect(screen.getByTestId('template-table')).toBeInTheDocument();
  });
});

describe('capabilities the contract does not have', () => {
  it('offers no search, sort, page number or total', async () => {
    render();
    await screen.findByTestId('template-table');

    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('combobox', { name: /sắp xếp/i })).toBeNull();
    expect(screen.queryByText(/^Trang \d/)).toBeNull();
    expect(screen.queryByText(/Tổng số/i)).toBeNull();
    // And the toolbar says why, rather than leaving the operator hunting.
    expect(screen.getByText(DESIGN_TEMPLATE_COPY.filters.constraint)).toBeInTheDocument();
  });

  it('offers no lifecycle control on a row', async () => {
    render();
    await screen.findByTestId('template-table');

    for (const label of [/xuất bản/i, /gỡ xuất bản/i, /lưu trữ/i, /khôi phục/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('represents the missing editor as a disabled control that explains itself', async () => {
    render();
    await screen.findByTestId('template-table');

    const edit = screen.getByTestId(`template-edit-${TEMPLATE_DRAFT_ID}`);
    expect(edit).toBeDisabled();
    // Not a link: APP3-A03 does not exist, so navigation would be a dead end.
    expect(edit.tagName.toLowerCase()).toBe('button');
    expect(
      screen.getAllByText(DESIGN_TEMPLATE_COPY.editAffordance.unavailable).length,
    ).toBeGreaterThan(0);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('filters', () => {
  it('sends the selected status and resets to a fresh first page', async () => {
    render();
    await screen.findByTestId('template-table');

    await user.selectOptions(screen.getByTestId('template-status-filter'), 'PUBLISHED');

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/design-templates?status=PUBLISHED', {
        scroll: false,
      });
    });
  });

  it('sends the selected product', async () => {
    render();
    await screen.findByTestId('template-table');
    await waitFor(() => {
      expect(productsMock).toHaveBeenCalled();
    });

    await user.selectOptions(screen.getByTestId('template-product-filter'), SCOPED_PRODUCT_ID);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith(
        `/design-templates?product=${SCOPED_PRODUCT_ID}`,
        { scroll: false },
      );
    });
  });

  it('keeps the list usable when the product options cannot be loaded', async () => {
    productsMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL' }));

    render();

    expect(await screen.findByTestId('template-table')).toBeInTheDocument();
    expect(
      await screen.findByText(DESIGN_TEMPLATE_COPY.filters.productUnavailable),
    ).toBeInTheDocument();
  });

  it('reads one bounded page of products, never one per row', async () => {
    listMock.mockResolvedValue(
      templateListEnvelope(
        makeTemplatePage([makeScopedSummary(), makeScopedSummary({ templateId: 'x' })]),
      ),
    );

    render();
    await screen.findByTestId('template-table');

    await waitFor(() => {
      expect(productsMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('pagination', () => {
  it('sends the next cursor exactly as issued', async () => {
    listMock.mockResolvedValueOnce(
      templateListEnvelope(makeTemplatePage([makeTemplateSummary()], 'CURSOR::opaque==')),
    );
    listMock.mockResolvedValueOnce(templateListEnvelope(makeTemplatePage([makeScopedSummary()])));

    render();
    await user.click(await screen.findByTestId('template-load-more'));

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(2);
    });
    const [params] = listMock.mock.calls[1] as unknown as [Record<string, unknown>];
    expect(params['cursor']).toBe('CURSOR::opaque==');
  });

  it('offers no continuation on a last page', async () => {
    render();
    await screen.findByTestId('template-table');

    expect(screen.queryByTestId('template-load-more')).toBeNull();
  });

  it('treats a rejected cursor as unrecoverable rather than retryable', async () => {
    listMock.mockResolvedValueOnce(
      templateListEnvelope(makeTemplatePage([makeTemplateSummary()], 'bad-cursor')),
    );
    listMock.mockRejectedValueOnce(makeApiClientError({ status: 400, code: 'VALIDATION_FAILED' }));

    render();
    await user.click(await screen.findByTestId('template-load-more'));

    expect(
      await screen.findByText(DESIGN_TEMPLATE_COPY.states.cursorErrorTitle),
    ).toBeInTheDocument();
    // The already-loaded rows survive; nothing silently restarts.
    const table = screen.getByTestId('template-table');
    expect(within(table).getByText('Mẫu sen đỏ')).toBeInTheDocument();
  });

  it('keeps loaded rows and re-sends the same cursor after a transport failure', async () => {
    listMock.mockResolvedValueOnce(
      templateListEnvelope(makeTemplatePage([makeTemplateSummary()], 'CURSOR::1')),
    );
    listMock.mockRejectedValueOnce(makeApiClientError({ status: 503, code: 'UNAVAILABLE' }));

    render();
    await user.click(await screen.findByTestId('template-load-more'));

    await waitFor(() => {
      expect(screen.getByText(DESIGN_TEMPLATE_COPY.states.loadMoreFailed)).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId('template-table')).getByText('Mẫu sen đỏ'),
    ).toBeInTheDocument();

    listMock.mockResolvedValueOnce(templateListEnvelope(makeTemplatePage([makeScopedSummary()])));
    await user.click(screen.getByTestId('template-load-more'));

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(3);
    });
    const [params] = listMock.mock.calls[2] as unknown as [Record<string, unknown>];
    expect(params['cursor']).toBe('CURSOR::1');
  });
});

describe('empty and error states', () => {
  it('distinguishes "nothing yet" from "nothing matches"', async () => {
    listMock.mockResolvedValue(templateListEnvelope(makeTemplatePage([])));

    render();

    expect(await screen.findByText(DESIGN_TEMPLATE_COPY.states.emptyTitle)).toBeInTheDocument();
    expect(screen.getByTestId('template-empty-create')).toBeInTheDocument();
  });

  it('offers a bounded retry when the first page fails', async () => {
    listMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL' }));

    render();

    expect(await screen.findByText(DESIGN_TEMPLATE_COPY.states.errorTitle)).toBeInTheDocument();
    expect(screen.getByTestId('template-list-retry')).toBeInTheDocument();
  });

  it('renders no internal detail in a failure', async () => {
    listMock.mockRejectedValue(
      makeApiClientError({
        status: 500,
        code: 'INTERNAL',
        message: 'relation "design_templates" violates constraint CST_140',
      }),
    );

    render();
    await screen.findByText(DESIGN_TEMPLATE_COPY.states.errorTitle);

    expect(document.body.textContent).not.toContain('design_templates');
    expect(document.body.textContent).not.toContain('CST_140');
  });
});
