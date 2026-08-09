/**
 * The bounded create flow the Template list owns (`APP3-A02`).
 *
 * What the dialog does **not** ask for carries as much weight as what it does.
 * `APP3-B03` derives the slug, assigns `DRAFT` and writes no version, so a slug
 * input, a status selector or a version field would each be a control whose
 * value the server ignores — a promise the screen cannot keep.
 *
 * The reconciliation assertions matter for the same reason: a row spliced into
 * the cache would sit at a position the server's ordering did not choose, and
 * would survive under a filter that excludes it.
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
  adminDesignTemplateCreate,
  adminDesignTemplateList,
  adminProductList,
} from '@embroidery/api-client';

import { DesignTemplateListScreen } from '../../src/features/design-templates';
import { DESIGN_TEMPLATE_COPY } from '../../src/features/design-templates/model/design-template-copy';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import { makeProduct, makeProductPage, productEnvelope } from '../support/product-fixture';
import {
  makeCreatedTemplate,
  makeTemplatePage,
  makeTemplateSummary,
  templateCreateEnvelope,
  templateListEnvelope,
} from '../support/design-template-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/design-templates').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminDesignTemplateList: jest.fn(),
  adminDesignTemplateCreate: jest.fn(),
  adminProductList: jest.fn(),
}));

const listMock = adminDesignTemplateList as jest.MockedFunction<typeof adminDesignTemplateList>;
const createMock = adminDesignTemplateCreate as jest.MockedFunction<
  typeof adminDesignTemplateCreate
>;
const productsMock = adminProductList as jest.MockedFunction<typeof adminProductList>;

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  productsMock.mockResolvedValue(productEnvelope(makeProductPage([makeProduct()])));
  listMock.mockResolvedValue(templateListEnvelope(makeTemplatePage([makeTemplateSummary()])));
  createMock.mockResolvedValue(templateCreateEnvelope(makeCreatedTemplate()));
});

const render = () => renderWithProviders(<DesignTemplateListScreen />);

async function openDialog() {
  render();
  await screen.findByTestId('template-table');
  await user.click(screen.getByTestId('template-create-open'));
  return screen.findByTestId('template-create-dialog');
}

describe('the dialog', () => {
  it('opens from the toolbar and is a labelled modal', async () => {
    const dialog = await openDialog();

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(DESIGN_TEMPLATE_COPY.create.title)).toBeInTheDocument();
    expect(within(dialog).getByText(DESIGN_TEMPLATE_COPY.create.help)).toBeInTheDocument();
  });

  it('moves focus into the dialog', async () => {
    const dialog = await openDialog();

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it('opens from the empty state too', async () => {
    listMock.mockResolvedValue(templateListEnvelope(makeTemplatePage([])));

    render();
    await user.click(await screen.findByTestId('template-empty-create'));

    expect(await screen.findByTestId('template-create-dialog')).toBeInTheDocument();
  });

  it('asks for nothing the contract does not accept', async () => {
    const dialog = await openDialog();

    // The server derives the slug and assigns DRAFT; a version and a document
    // belong to APP3-B03A, not to creation.
    for (const forbidden of [/đường dẫn/i, /slug/i, /trạng thái/i, /phiên bản/i, /tài liệu/i]) {
      expect(within(dialog).queryByLabelText(forbidden)).toBeNull();
    }
    // …and it explains why there is no slug field rather than leaving a gap.
    expect(within(dialog).getByText(DESIGN_TEMPLATE_COPY.create.slugNote)).toBeInTheDocument();
  });

  it('refuses to submit an empty name and says so', async () => {
    const dialog = await openDialog();

    await user.click(within(dialog).getByTestId('template-create-submit'));

    expect(within(dialog).getByText(DESIGN_TEMPLATE_COPY.create.nameRequired)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('submission', () => {
  it('sends exactly the generated body', async () => {
    const dialog = await openDialog();

    await user.type(within(dialog).getByTestId('template-create-name'), 'Mẫu mới');
    await user.click(within(dialog).getByTestId('template-create-submit'));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });
    const [body] = createMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(body).toEqual({ name: 'Mẫu mới' });
    // Omitted, never sent empty or null.
    for (const forbidden of [
      'slug',
      'status',
      'version',
      'document',
      'documentSchemaVersion',
      'publishedAt',
    ]) {
      expect(forbidden in body).toBe(false);
    }
  });

  it('omits an untouched description instead of sending an empty string', async () => {
    const dialog = await openDialog();

    await user.type(within(dialog).getByTestId('template-create-name'), 'Mẫu mới');
    await user.click(within(dialog).getByTestId('template-create-submit'));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });
    const [body] = createMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect('description' in body).toBe(false);
  });

  it('reconciles the list from the server rather than splicing a row', async () => {
    const dialog = await openDialog();
    const readsBefore = listMock.mock.calls.length;

    await user.type(within(dialog).getByTestId('template-create-name'), 'Mẫu mới');
    await user.click(within(dialog).getByTestId('template-create-submit'));

    await waitFor(() => {
      expect(screen.queryByTestId('template-create-dialog')).toBeNull();
    });
    // A refetch, not a local insert — the server owns the ordering and the slug.
    await waitFor(() => {
      expect(listMock.mock.calls.length).toBeGreaterThan(readsBefore);
    });
  });

  it('states the created template has no version yet', async () => {
    const dialog = await openDialog();

    await user.type(within(dialog).getByTestId('template-create-name'), 'Mẫu mới');
    await user.click(within(dialog).getByTestId('template-create-submit'));

    // The create response is a *detail* view, so this is a fact the API stated.
    expect(await screen.findByTestId('template-created')).toHaveTextContent(
      DESIGN_TEMPLATE_COPY.create.created('Mẫu mới'),
    );
  });

  it('performs no detail read after creating', async () => {
    const actual = jest.requireActual<Record<string, unknown>>('@embroidery/api-client');
    const dialog = await openDialog();

    await user.type(within(dialog).getByTestId('template-create-name'), 'Mẫu mới');
    await user.click(within(dialog).getByTestId('template-create-submit'));
    await screen.findByTestId('template-created');

    // There is nothing to call: the operation is not on the boundary at all.
    expect(actual['adminDesignTemplateDetail']).toBeUndefined();
  });
});

describe('failure', () => {
  it('keeps the dialog and the typed values when the create fails', async () => {
    createMock.mockRejectedValue(makeNetworkError());
    const dialog = await openDialog();

    await user.type(within(dialog).getByTestId('template-create-name'), 'Mẫu mới');
    await user.click(within(dialog).getByTestId('template-create-submit'));

    await waitFor(() => {
      expect(screen.getByText(DESIGN_TEMPLATE_COPY.create.failedTitle)).toBeInTheDocument();
    });
    expect(screen.getByTestId('template-create-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('template-create-name')).toHaveValue('Mẫu mới');
  });

  it('reports the create 409 as an unreserved address, never as a taken name', async () => {
    // `APP3-B03` derives the slug from the name and, on collision, appends the
    // new Template's own id — so two templates may share a name (confirmed in
    // the browser) and this status never means "pick a different name".
    createMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'DESIGN_TEMPLATE_ADDRESS_UNAVAILABLE' }),
    );
    const dialog = await openDialog();

    await user.type(within(dialog).getByTestId('template-create-name'), 'Mẫu trùng');
    await user.click(within(dialog).getByTestId('template-create-submit'));

    expect(
      await screen.findByText(DESIGN_TEMPLATE_COPY.create.addressUnreservedTitle),
    ).toBeInTheDocument();
    // The name is not blamed, and the operator's input survives for the retry.
    expect(screen.queryByText(/tên mẫu đã được dùng/i)).not.toBeInTheDocument();
    expect(within(dialog).getByTestId('template-create-name')).toHaveValue('Mẫu trùng');
  });

  it('never renders an internal message', async () => {
    createMock.mockRejectedValue(
      makeApiClientError({
        status: 500,
        code: 'INTERNAL',
        message: 'duplicate key value violates unique constraint "design_templates_slug_key"',
      }),
    );
    const dialog = await openDialog();

    await user.type(within(dialog).getByTestId('template-create-name'), 'Mẫu mới');
    await user.click(within(dialog).getByTestId('template-create-submit'));
    await screen.findByText(DESIGN_TEMPLATE_COPY.create.failedTitle);

    expect(document.body.textContent).not.toContain('design_templates_slug_key');
    expect(document.body.textContent).not.toContain('unique constraint');
  });
});
