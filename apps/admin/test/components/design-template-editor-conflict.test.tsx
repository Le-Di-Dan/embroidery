/**
 * The stale-version conflict (`601:147`).
 *
 * The rule this suite exists to hold: **nothing was overwritten, and nothing is
 * merged**. Every assertion below is about one of the two ways that could stop
 * being true — a screen that quietly retries, or a screen that looks saved after
 * the dialog closes.
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
  adminDesignTemplateDetail,
  adminDesignTemplateSaveDocument,
  adminProductPlacementGet,
  adminProductSideBackgroundGet,
} from '@embroidery/api-client';

import { DesignTemplateEditorScreen } from '../../src/features/design-template-editor';
import { DESIGN_TEMPLATE_EDITOR_COPY } from '../../src/features/design-template-editor/model/design-template-editor-copy';
import { makeApiClientError } from '../support/api-error';
import {
  detailEnvelope,
  EDITOR_TEMPLATE_ID,
  makeDocument,
  makePlacement,
  makeTextElement,
  makeVersionedDetail,
  placementEnvelope,
} from '../support/design-template-editor-fixture';
import { installObjectUrl } from '../support/object-url';

jest.mock('next/navigation', () => mockCreateNavigationMock('/design-templates/x').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminDesignTemplateDetail: jest.fn(),
  adminDesignTemplateSaveDocument: jest.fn(),
  adminProductPlacementGet: jest.fn(),
  adminProductSideBackgroundGet: jest.fn(),
}));

const detailMock = adminDesignTemplateDetail as jest.MockedFunction<
  typeof adminDesignTemplateDetail
>;
const saveMock = adminDesignTemplateSaveDocument as jest.MockedFunction<
  typeof adminDesignTemplateSaveDocument
>;
const placementMock = adminProductPlacementGet as jest.MockedFunction<
  typeof adminProductPlacementGet
>;
const backgroundMock = adminProductSideBackgroundGet as jest.MockedFunction<
  typeof adminProductSideBackgroundGet
>;

let user: ReturnType<typeof createUser>;

/**
 * The refusal exactly as the API emits it.
 *
 * `code: 'CONFLICT'` is not a simplification — it is what the envelope filter
 * produces for **both** 409 causes, verified against the running API. The
 * screen therefore cannot tell them apart from the error and re-reads the
 * template to find out, which is what the detail mock below is standing in for.
 */
const CONFLICT_409 = () => makeApiClientError({ status: 409, code: 'CONFLICT' });

beforeEach(() => {
  jest.clearAllMocks();
  installObjectUrl('conflict');
  user = createUser();
  detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1)));
  placementMock.mockResolvedValue(placementEnvelope(makePlacement()));
  backgroundMock.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
  saveMock.mockRejectedValue(CONFLICT_409());
});

/** Opens the editor, edits the text, and attempts a save that conflicts. */
async function conflict(edit = 'sửa cục bộ') {
  renderWithProviders(<DesignTemplateEditorScreen templateId={EDITOR_TEMPLATE_ID} />);
  await screen.findByTestId('template-editor');
  await user.click(screen.getByTestId('editor-layer-element-1'));
  const field = screen.getByTestId('editor-text-value');
  await user.clear(field);
  await user.type(field, edit);
  await waitFor(() => {
    expect(screen.getByTestId('editor-save')).toBeEnabled();
  });
  await user.click(screen.getByTestId('editor-save'));
  return screen.findByTestId('editor-conflict-dialog');
}

describe('the conflict dialog', () => {
  it('opens when the re-read shows the template is still a DRAFT', async () => {
    const dialog = await conflict();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('does not open when the same 409 means the template left DRAFT', async () => {
    // The refusal is byte-identical to the stale one — same status, same
    // `CONFLICT` code. Only the template's own status separates them, and
    // offering "keep your local draft" here would be offering it to someone
    // whose draft can never be saved.
    renderWithProviders(<DesignTemplateEditorScreen templateId={EDITOR_TEMPLATE_ID} />);
    await screen.findByTestId('template-editor');
    await user.click(screen.getByTestId('editor-layer-element-1'));
    await user.type(screen.getByTestId('editor-text-value'), '!');
    await waitFor(() => {
      expect(screen.getByTestId('editor-save')).toBeEnabled();
    });
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(1, makeDocument(), { status: 'PUBLISHED' })),
    );
    await user.click(screen.getByTestId('editor-save'));

    expect(await screen.findByTestId('editor-save-error')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.save.notEditableTitle,
    );
    expect(screen.queryByTestId('editor-conflict-dialog')).toBeNull();
  });

  it('re-reads the template to decide, and only to decide', async () => {
    const readsBefore = detailMock.mock.calls.length;
    await conflict('không được thay');

    // The classification read happened…
    expect(detailMock.mock.calls.length).toBeGreaterThan(readsBefore);
    // …and it left the draft exactly where the operator did.
    expect(screen.getByTestId('editor-text-value')).toHaveValue('không được thay');
  });

  it('says the server was not overwritten', async () => {
    const dialog = await conflict();

    expect(within(dialog).getByTestId('editor-conflict-not-overwritten')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.conflict.notOverwritten,
    );
    expect(
      within(dialog).getByText(DESIGN_TEMPLATE_EDITOR_COPY.conflict.noMerge),
    ).toBeInTheDocument();
  });

  it('offers exactly two choices and no force-save', async () => {
    const dialog = await conflict();

    const buttons = within(dialog).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const forbidden of [/ghi đè/i, /vẫn lưu/i, /gộp/i, /hợp nhất/i]) {
      expect(within(dialog).queryByRole('button', { name: forbidden })).toBeNull();
    }
  });

  it('never retries the save on its own', async () => {
    await conflict();

    // One attempt, one refusal. A silent retry would send the same stale
    // `expectedCurrentVersion` and is how "nothing was overwritten" stops
    // being something the screen can promise. The classification re-read is a
    // GET and changes nothing.
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the local draft while the dialog is open', async () => {
    await conflict('giữ nguyên');

    expect(screen.getByTestId('editor-text-value')).toHaveValue('giữ nguyên');
  });
});

describe('keeping the local draft', () => {
  it('closes the dialog but does not make the editor look saved', async () => {
    await conflict();

    await user.click(screen.getByTestId('editor-conflict-keep-local'));

    await waitFor(() => {
      expect(screen.queryByTestId('editor-conflict-dialog')).toBeNull();
    });
    expect(screen.getByTestId('editor-save-chip')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.save.chipConflict,
    );
    expect(screen.getByTestId('editor-conflict-banner')).toBeInTheDocument();
  });

  it('leaves the save disabled while the draft is still stale', async () => {
    await conflict();
    await user.click(screen.getByTestId('editor-conflict-keep-local'));

    await waitFor(() => {
      expect(screen.getByTestId('editor-save')).toBeDisabled();
    });
  });

  it('keeps the reload reachable, because the banner says to reload', async () => {
    // With the dialog gone and the save disabled, a banner instructing the
    // operator to reload would otherwise name the one way forward and offer no
    // control that performs it.
    await conflict();
    await user.click(screen.getByTestId('editor-conflict-keep-local'));
    await screen.findByTestId('editor-conflict-banner');

    await user.click(screen.getByTestId('editor-conflict-banner-reload'));

    expect(await screen.findByTestId('editor-reload-confirm')).toBeInTheDocument();
  });

  it('retains the exact local text', async () => {
    await conflict('bản của tôi');
    await user.click(screen.getByTestId('editor-conflict-keep-local'));

    await waitFor(() => {
      expect(screen.queryByTestId('editor-conflict-dialog')).toBeNull();
    });
    expect(screen.getByTestId('editor-text-value')).toHaveValue('bản của tôi');
  });
});

describe('reloading the latest version', () => {
  it('confirms the discard before replacing the draft', async () => {
    await conflict('sẽ mất');

    await user.click(screen.getByTestId('editor-conflict-reload'));

    expect(await screen.findByTestId('editor-reload-confirm')).toBeInTheDocument();
    // Nothing replaced yet.
    expect(screen.getByTestId('editor-text-value')).toHaveValue('sẽ mất');
  });

  it('replaces the draft and refreshes the version token once confirmed', async () => {
    await conflict('sẽ mất');
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(9, makeDocument([makeTextElement({ text: 'mới nhất' })]))),
    );

    await user.click(screen.getByTestId('editor-conflict-reload'));
    await user.click(await screen.findByTestId('editor-reload-confirm-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('editor-current-version')).toHaveTextContent('v9');
    });
    expect(screen.queryByTestId('editor-conflict-banner')).toBeNull();
    expect(screen.getByTestId('editor-save-chip')).toHaveTextContent(
      DESIGN_TEMPLATE_EDITOR_COPY.save.chipSaved,
    );
  });

  it('sends the refreshed version on the next save', async () => {
    await conflict();
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(9)));
    saveMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(10)));

    await user.click(screen.getByTestId('editor-conflict-reload'));
    await user.click(await screen.findByTestId('editor-reload-confirm-confirm'));
    await waitFor(() => {
      expect(screen.getByTestId('editor-current-version')).toHaveTextContent('v9');
    });

    await user.click(screen.getByTestId('editor-layer-element-1'));
    await user.type(screen.getByTestId('editor-text-value'), '!');
    await waitFor(() => {
      expect(screen.getByTestId('editor-save')).toBeEnabled();
    });
    await user.click(screen.getByTestId('editor-save'));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(2);
    });
    const second = saveMock.mock.calls[1] as unknown as [string, Record<string, unknown>];
    expect(second[1]['expectedCurrentVersion']).toBe(9);
  });

  it('keeps the draft when the discard is cancelled', async () => {
    await conflict('vẫn còn');

    await user.click(screen.getByTestId('editor-conflict-reload'));
    await user.click(await screen.findByTestId('editor-reload-confirm-cancel'));

    await waitFor(() => {
      expect(screen.queryByTestId('editor-reload-confirm')).toBeNull();
    });
    expect(screen.getByTestId('editor-text-value')).toHaveValue('vẫn còn');
  });
});
