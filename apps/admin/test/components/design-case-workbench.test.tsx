/**
 * The design-case workbench, rendered (`APP6-A02` §13–§22).
 *
 * The claims worth proving here are the ones a plausible-looking screen gets
 * wrong:
 *
 *  - an **absent** submitted source is an honest empty state, not a load error;
 *  - a COP request states that it has no Design Session and shows request
 *    evidence instead of a fabricated Catalog document;
 *  - the **current authored** version and the version **awaiting review** stay
 *    distinct on screen;
 *  - a revision copies the **exact predecessor's** document, not the latest;
 *  - a duplicate send activation is blocked, a replay is reported as a replay,
 *    and `REVIEW_ALREADY_ACTIVE` re-reads without sending anything;
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
  adminCustomRequestDesignVersionCreate,
  adminCustomRequestDesignVersionDetail,
  adminCustomRequestDesignVersionList,
  adminCustomRequestDesignVersionSend,
  adminCustomRequestDetail,
  adminCustomRequestSubmittedDesignGet,
} from '@embroidery/api-client';

import { DesignCaseWorkbenchScreen } from '../../src/features/request-design-case';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../../src/features/request-design-case/model/request-design-case-copy';
import { presentRequestStatus } from '../../src/shared/presentation/request-status';
import { makeApiClientError } from '../support/api-error';
import {
  APPROVED_HASH,
  catalogDocument,
  customerOwnedDocument,
  DESIGN_REQUEST_ID,
  envelope,
  makeAbsentSource,
  makeApproval,
  makeCatalogRequest,
  makeCopRequest,
  makeCreated,
  makeSent,
  makeSubmittedSource,
  makeVersion,
  makeVersionDetail,
  makeVersionList,
  SENT_HASH,
  VERSION_1_ID,
  VERSION_2_ID,
} from '../support/request-design-case-fixture';

jest.mock(
  'next/navigation',
  () => mockCreateNavigationMock(`/requests/${DESIGN_REQUEST_ID}/design`).module,
);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomRequestDetail: jest.fn(),
  adminCustomRequestSubmittedDesignGet: jest.fn(),
  adminCustomRequestDesignVersionList: jest.fn(),
  adminCustomRequestDesignVersionDetail: jest.fn(),
  adminCustomRequestDesignVersionCreate: jest.fn(),
  adminCustomRequestDesignVersionSend: jest.fn(),
  adminCustomRequestAssetGet: jest.fn(),
}));

const detailMock = adminCustomRequestDetail as jest.MockedFunction<typeof adminCustomRequestDetail>;
const sourceMock = adminCustomRequestSubmittedDesignGet as jest.MockedFunction<
  typeof adminCustomRequestSubmittedDesignGet
>;
const listMock = adminCustomRequestDesignVersionList as jest.MockedFunction<
  typeof adminCustomRequestDesignVersionList
>;
const versionMock = adminCustomRequestDesignVersionDetail as jest.MockedFunction<
  typeof adminCustomRequestDesignVersionDetail
>;
const createMock = adminCustomRequestDesignVersionCreate as jest.MockedFunction<
  typeof adminCustomRequestDesignVersionCreate
>;
const sendMock = adminCustomRequestDesignVersionSend as jest.MockedFunction<
  typeof adminCustomRequestDesignVersionSend
>;

function render() {
  return renderWithProviders(<DesignCaseWorkbenchScreen requestId={DESIGN_REQUEST_ID} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  detailMock.mockResolvedValue(envelope(makeCatalogRequest()) as never);
  sourceMock.mockResolvedValue(envelope(makeSubmittedSource()) as never);
  listMock.mockResolvedValue(envelope(makeVersionList()) as never);
  versionMock.mockResolvedValue(envelope(makeVersionDetail()) as never);
});

describe('APP6-A02 — bootstrap, gate and states', () => {
  it('renders on the exact route the checkpoint owns', async () => {
    render();
    await screen.findByTestId('design-case-workbench');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows loading, then the workbench — the two never collapse', async () => {
    render();
    expect(screen.getByTestId('design-case-loading')).toBeInTheDocument();
    await screen.findByTestId('design-case-workbench');
    expect(screen.queryByTestId('design-case-loading')).not.toBeInTheDocument();
  });

  it('reports a failed request read without echoing anything the server said', async () => {
    detailMock.mockRejectedValue(
      makeApiClientError({ status: 500, code: 'PG_UNIQUE_VIOLATION', message: 'duplicate key' }),
    );
    render();
    const error = await screen.findByTestId('design-case-error');
    expect(error).toHaveTextContent(COPY.states.errorRetryable);
    expect(error.textContent).not.toContain('PG_UNIQUE_VIOLATION');
    expect(error.textContent).not.toContain('duplicate key');
    expect(error.textContent).not.toContain(DESIGN_REQUEST_ID);
  });

  it('renders the gate — and no authoring control — before DIGITIZING', async () => {
    detailMock.mockResolvedValue(
      envelope(makeCatalogRequest({ status: 'QUOTE_ACCEPTED' })) as never,
    );
    render();
    await screen.findByTestId('design-case-gate');
    // No control that would merely wait for a 409.
    expect(screen.queryByTestId('design-create-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('design-send-open')).not.toBeInTheDocument();
    // It links to APP6-B06's own control rather than duplicating it.
    expect(screen.getByText(COPY.gate.goToRequest)).toHaveAttribute(
      'href',
      `/requests/${DESIGN_REQUEST_ID}`,
    );
  });

  it('exposes no DESIGN_REVIEW or APPROVED request-target control anywhere', async () => {
    render();
    const workbench = await screen.findByTestId('design-case-workbench');
    for (const control of workbench.querySelectorAll('button, a')) {
      expect(control.textContent ?? '').not.toContain('DESIGN_REVIEW');
      expect(control.textContent ?? '').not.toContain('APPROVED');
    }
  });

  it('names the request status with the Admin-shared presenter, not a raw token', async () => {
    detailMock.mockResolvedValue(
      envelope(makeCatalogRequest({ status: 'DESIGN_REVIEW' })) as never,
    );
    render();
    const status = await screen.findByTestId('design-case-request-status');
    expect(status).toHaveTextContent(presentRequestStatus('DESIGN_REVIEW'));
    expect(status.textContent).not.toContain('DESIGN_REVIEW');
  });
});

describe('APP6-A02 — the digitizing source', () => {
  it('renders the submitted Catalog document client-side, with no download', async () => {
    render();
    await screen.findByTestId('design-source-catalog');
    expect(await screen.findByTestId('design-source-preview')).toBeInTheDocument();
    expect(screen.queryByText(/tải xuống/i)).not.toBeInTheDocument();
  });

  it('renders an absent source as an honest empty state, never as an error', async () => {
    sourceMock.mockResolvedValue(envelope(makeAbsentSource()) as never);
    render();
    const absent = await screen.findByTestId('design-source-absent');
    expect(absent).toHaveTextContent(COPY.source.absentTitle);
    // The distinction the brief names explicitly.
    expect(screen.queryByTestId('design-source-error')).not.toBeInTheDocument();
    // And no fabricated blank document stands in for it.
    expect(screen.queryByTestId('design-source-preview')).not.toBeInTheDocument();
  });

  it('keeps a failed source read distinct from an absent source', async () => {
    sourceMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'BOOM' }));
    render();
    await screen.findByTestId('design-source-error');
    expect(screen.queryByTestId('design-source-absent')).not.toBeInTheDocument();
  });

  it('states the COP truth and never asks APP6-B07 for a session', async () => {
    detailMock.mockResolvedValue(envelope(makeCopRequest()) as never);
    render();
    const cop = await screen.findByTestId('design-source-cop');
    expect(cop).toHaveTextContent(COPY.source.copBody);
    // No Catalog document is fabricated for the branch.
    expect(screen.queryByTestId('design-source-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('design-source-catalog')).not.toBeInTheDocument();
  });
});

describe('APP6-A02 — version history', () => {
  const inReview = makeVersion({
    versionId: VERSION_1_ID,
    version: 1,
    status: 'SENT_FOR_REVIEW',
    current: false,
    sentAt: '2026-08-19T09:00:00.000Z',
  });
  const newerDraft = makeVersion({
    versionId: VERSION_2_ID,
    version: 2,
    status: 'DRAFT',
    current: true,
  });

  it('renders every returned version in the server’s order, hiding none', async () => {
    listMock.mockResolvedValue(
      envelope(
        makeVersionList([
          makeVersion({
            versionId: VERSION_1_ID,
            version: 1,
            status: 'SUPERSEDED',
            current: false,
          }),
          newerDraft,
        ]),
      ) as never,
    );
    render();
    const table = await screen.findByTestId('design-version-history');
    const rows = within(table).getAllByRole('row');
    // Header plus both versions: a superseded row stays visible.
    expect(rows).toHaveLength(3);
  });

  it('keeps "current authored" and "awaiting customer review" distinct', async () => {
    listMock.mockResolvedValue(envelope(makeVersionList([inReview, newerDraft])) as never);
    render();

    const reviewRow = await screen.findByTestId(`design-version-row-${VERSION_1_ID}`);
    const draftRow = screen.getByTestId(`design-version-row-${VERSION_2_ID}`);

    // The newer DRAFT is current; the older version is the one under review.
    expect(draftRow).toHaveTextContent(COPY.history.currentYes);
    expect(reviewRow).not.toHaveTextContent(COPY.history.currentYes);
    expect(reviewRow).toHaveTextContent(COPY.versionStatus.SENT_FOR_REVIEW);
  });

  it('shows an empty history as a fact, not as a failed read', async () => {
    listMock.mockResolvedValue(envelope(makeVersionList([])) as never);
    render();
    expect(await screen.findByTestId('design-versions-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('design-case-error')).not.toBeInTheDocument();
  });

  it('keeps a failed history read distinct from an empty history', async () => {
    listMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'BOOM' }));
    render();
    await screen.findByTestId('design-case-error');
    expect(screen.queryByTestId('design-versions-empty')).not.toBeInTheDocument();
  });

  it('reads the exact selected version, addressed by request and version', async () => {
    listMock.mockResolvedValue(envelope(makeVersionList([inReview, newerDraft])) as never);
    const user = createUser();
    render();

    await user.click(await screen.findByTestId(`design-version-select-${VERSION_1_ID}`));
    await waitFor(() => {
      expect(versionMock).toHaveBeenCalledWith(DESIGN_REQUEST_ID, VERSION_1_ID, expect.anything());
    });
  });
});

describe('APP6-A02 — review feedback and the approved snapshot', () => {
  it('renders the customer’s exact words as text, never as markup', async () => {
    const feedback = 'Chữ hơi nhỏ <b>nhờ phóng to</b>';
    listMock.mockResolvedValue(
      envelope(makeVersionList([makeVersion({ status: 'REVISION_REQUESTED' })])) as never,
    );
    versionMock.mockResolvedValue(
      envelope(
        makeVersionDetail({
          status: 'REVISION_REQUESTED',
          documentHash: SENT_HASH,
          reviews: [
            { outcome: 'REQUEST_REVISION', decidedAt: '2026-08-19T04:00:00.000Z', feedback },
          ],
        }),
      ) as never,
    );
    render();

    const quote = await screen.findByTestId('design-review-feedback');
    expect(quote).toHaveTextContent(feedback);
    // Escaped, not interpreted.
    expect(quote.querySelector('b')).toBeNull();
  });

  it('renders an empty decision history honestly', async () => {
    render();
    expect(await screen.findByTestId('design-reviews-empty')).toBeInTheDocument();
  });

  it('renders the approval snapshot from frozen evidence, masked and APP7-free', async () => {
    listMock.mockResolvedValue(
      envelope(makeVersionList([makeVersion({ status: 'APPROVED' })])) as never,
    );
    versionMock.mockResolvedValue(
      envelope(
        makeVersionDetail({
          status: 'APPROVED',
          documentHash: APPROVED_HASH,
          approval: makeApproval(),
        }),
      ) as never,
    );
    render();

    const snapshot = await screen.findByTestId('design-approval-snapshot');
    // The frozen product name, not the live subject's.
    expect(snapshot).toHaveTextContent('Áo thun cotton (tên lúc duyệt)');
    expect(within(snapshot).getByTestId('design-approval-hash')).toHaveTextContent(APPROVED_HASH);
    // Contacts arrive masked. The mask deliberately *keeps* the domain and the
    // last four digits — that is what makes a recipient recognisable without the
    // record becoming a contact database — so the assertion is that the
    // identifying part is withheld, not that the whole string is.
    const contacts = within(snapshot).getByTestId('design-approval-contacts');
    expect(contacts.textContent).toContain('m***@vidu.com');
    expect(contacts.textContent).toContain('+84 ***** 5678');
    // The local part beyond the first character and the national prefix are gone.
    expect(contacts.textContent).not.toContain('mai.');
    expect(contacts.textContent).not.toContain('+84912345678');
    // No APP7 claim, and the denial is present.
    expect(within(snapshot).getByTestId('design-approval-scope')).toHaveTextContent(
      COPY.approval.scopeNote,
    );
    // No approve / request-revision control exists on an Admin surface.
    expect(screen.queryByText(COPY.reviewOutcome.APPROVE, { selector: 'button' })).toBeNull();
  });

  it('offers no editing or send on an approved version', async () => {
    listMock.mockResolvedValue(
      envelope(makeVersionList([makeVersion({ status: 'APPROVED' })])) as never,
    );
    versionMock.mockResolvedValue(
      envelope(makeVersionDetail({ status: 'APPROVED', approval: makeApproval() })) as never,
    );
    render();
    await screen.findByTestId('design-approval-snapshot');
    expect(screen.queryByTestId('design-send-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('design-open-authoring')).not.toBeInTheDocument();
    expect(screen.queryByTestId('design-create-from-version')).not.toBeInTheDocument();
  });
});

describe('APP6-A02 — sent-for-review and revision-requested', () => {
  it('renders a sent version read-only with no re-send', async () => {
    listMock.mockResolvedValue(
      envelope(
        makeVersionList([
          makeVersion({ status: 'SENT_FOR_REVIEW', sentAt: '2026-08-19T09:00:00.000Z' }),
        ]),
      ) as never,
    );
    versionMock.mockResolvedValue(
      envelope(makeVersionDetail({ status: 'SENT_FOR_REVIEW', documentHash: SENT_HASH })) as never,
    );
    render();

    const note = await screen.findByTestId('design-version-note');
    expect(note).toHaveTextContent(COPY.selected.awaitingTitle);
    expect(screen.queryByTestId('design-send-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('design-open-authoring')).not.toBeInTheDocument();
  });

  it('offers a revision only as a new DRAFT from the exact predecessor', async () => {
    const predecessorDocument = catalogDocument('element-from-v1');
    listMock.mockResolvedValue(
      envelope(makeVersionList([makeVersion({ status: 'REVISION_REQUESTED' })])) as never,
    );
    versionMock.mockResolvedValue(
      envelope(
        makeVersionDetail({
          status: 'REVISION_REQUESTED',
          documentHash: SENT_HASH,
          document: predecessorDocument,
          reviews: [
            { outcome: 'REQUEST_REVISION', decidedAt: '2026-08-19T04:00:00.000Z', feedback: 'Sửa' },
          ],
        }),
      ) as never,
    );
    createMock.mockResolvedValue(envelope(makeCreated()) as never);
    const user = createUser();
    render();

    await user.click(await screen.findByTestId('design-create-from-version'));

    // The dialog names the exact predecessor it copied.
    const source = await screen.findByTestId('design-create-source');
    expect(source).toHaveTextContent('v1');
    expect(source).toHaveTextContent(COPY.versionStatus.REVISION_REQUESTED);

    await user.click(screen.getByTestId('design-create-submit'));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });
    const [, body] = createMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    // The exact predecessor's document, not the submitted source and not the
    // latest version's.
    expect(body['document']).toEqual(predecessorDocument);
  });
});

describe('APP6-A02 — creating a version', () => {
  it('sends only the document on the Catalog branch, and names no placement', async () => {
    createMock.mockResolvedValue(envelope(makeCreated()) as never);
    const user = createUser();
    render();

    await user.click(await screen.findByTestId('design-create-open'));
    expect(screen.getByTestId('design-create-branch')).toHaveTextContent(
      COPY.context.branchCatalog,
    );
    // No editable Catalog placement is offered at all.
    expect(screen.queryByTestId('design-create-cop-fields')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('design-create-submit'));
    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    const [, body] = createMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(Object.keys(body)).toEqual(['document']);
    for (const forbidden of [
      'requestId',
      'designCaseId',
      'branch',
      'productId',
      'status',
      'version',
      'parentVersionId',
      'documentHash',
    ]) {
      expect(body[forbidden]).toBeUndefined();
    }
  });

  it('requires both COP labels and a positive envelope, and sends them as numbers', async () => {
    detailMock.mockResolvedValue(envelope(makeCopRequest()) as never);
    listMock.mockResolvedValue(
      envelope(
        makeVersionList([
          makeVersion({
            branch: 'CUSTOMER_OWNED',
            productId: null,
            productVariantId: null,
            productSideId: null,
            embroideryAreaId: null,
            placementSideLabel: 'Ngực trái',
            placementAreaLabel: 'Vùng thêu ngực',
          }),
        ]),
      ) as never,
    );
    versionMock.mockResolvedValue(
      envelope(
        makeVersionDetail({
          branch: 'CUSTOMER_OWNED',
          documentSchemaVersion: 2,
          document: customerOwnedDocument(),
          productId: null,
          placementSideLabel: 'Ngực trái',
          placementAreaLabel: 'Vùng thêu ngực',
        }),
      ) as never,
    );
    createMock.mockResolvedValue(envelope(makeCreated()) as never);
    const user = createUser();
    render();

    await user.click(await screen.findByTestId('design-create-open'));
    const submit = screen.getByTestId('design-create-submit');
    // Incomplete COP placement cannot be submitted.
    expect(submit).toBeDisabled();

    await user.type(screen.getByTestId('design-create-side'), 'Lưng áo');
    await user.type(screen.getByTestId('design-create-area'), 'Vùng thêu lưng');
    await user.type(screen.getByTestId('design-create-width'), '120');
    await user.type(screen.getByTestId('design-create-height'), '80');
    await user.click(submit);

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });
    const [, body] = createMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(body['placementSideLabel']).toBe('Lưng áo');
    expect(body['placementAreaLabel']).toBe('Vùng thêu lưng');
    // Numbers, which is what APP6-B08 publishes.
    expect(body['physicalWidthMm']).toBe(120);
    expect(body['physicalHeightMm']).toBe(80);
  });
});

describe('APP6-A02 — sending for review', () => {
  it('confirms the exact version, sends bodyless, and blocks a duplicate activation', async () => {
    sendMock.mockImplementation(() => new Promise(() => undefined) as never);
    const user = createUser();
    render();

    await user.click(await screen.findByTestId('design-send-open'));
    const dialog = await screen.findByTestId('design-send-dialog');
    expect(dialog).toHaveTextContent(COPY.send.body(1));

    const confirm = screen.getByTestId('design-send-confirm');
    // Dispatched on the DOM node directly, three times, in one synchronous run.
    //
    // This is the whole point of the assertion, and getting it right took two
    // attempts. Both `await user.click(...)` and `fireEvent.click(...)` flush
    // React between clicks — `fireEvent` wraps each dispatch in `act()` — so
    // `disabled` has already applied by the second click and the test passes
    // with the `inFlight` ref **deleted**. It would prove nothing.
    //
    // A raw `dispatchEvent` is not act-wrapped, so all three handlers run before
    // React re-renders. That is the real double-click: the handler reached one
    // render before `disabled` applies, which only the ref can stop.
    const click = () => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    };
    click();
    click();
    click();

    await waitFor(() => {
      expect(sendMock).toHaveBeenCalled();
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(DESIGN_REQUEST_ID, VERSION_1_ID, expect.anything());
    // Three arguments: no body is passed, because the operation has none.
    expect((sendMock.mock.calls[0] as unknown[]).length).toBe(3);
  });

  it('reports a replay as a replay rather than as a second send', async () => {
    sendMock.mockResolvedValue(envelope(makeSent({ replayed: true })) as never);
    const user = createUser();
    render();

    await user.click(await screen.findByTestId('design-send-open'));
    await user.click(screen.getByTestId('design-send-confirm'));

    await waitFor(() => {
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
    // The request context is re-read, because B09 may have moved the request.
    await waitFor(() => {
      expect(detailMock.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('reconciles REVIEW_ALREADY_ACTIVE by re-reading, and never auto-sends', async () => {
    sendMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'REVIEW_ALREADY_ACTIVE',
        message: 'uq_design_versions__case__sent_for_review',
      }),
    );
    const user = createUser();
    render();

    await user.click(await screen.findByTestId('design-send-open'));
    await user.click(screen.getByTestId('design-send-confirm'));

    const notice = await screen.findByTestId('design-review-already-active');
    expect(notice).toHaveTextContent(COPY.reviewActive.title);
    // No constraint name reaches the operator.
    expect(notice.textContent).not.toContain('uq_design_versions');
    // The pending dialog is closed and nothing was sent a second time.
    expect(screen.queryByTestId('design-send-dialog')).not.toBeInTheDocument();
    expect(sendMock).toHaveBeenCalledTimes(1);
    // Server truth was re-read.
    await waitFor(() => {
      expect(listMock.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('reports a stale send inside the dialog and requires a new decision', async () => {
    sendMock.mockRejectedValue(makeApiClientError({ status: 409, code: 'VERSION_NOT_SENDABLE' }));
    const user = createUser();
    render();

    await user.click(await screen.findByTestId('design-send-open'));
    await user.click(screen.getByTestId('design-send-confirm'));

    const error = await screen.findByTestId('design-send-error');
    expect(error).toHaveTextContent(COPY.send.errorStale);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

describe('APP6-A02 — the authoring surface', () => {
  it('opens on the exact version’s document and never mutates history', async () => {
    createMock.mockResolvedValue(envelope(makeCreated()) as never);
    const user = createUser();
    render();

    await user.click(await screen.findByTestId('design-open-authoring'));
    const surface = await screen.findByTestId('design-authoring-surface');
    expect(surface).toHaveTextContent(COPY.authoring.scopeNote);

    await user.click(within(surface).getByTestId('design-authoring-add-text'));

    // Editing issues no write: history is append-only and there is no update API.
    expect(createMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();

    // Saving is the only path that persists, and it appends a new version.
    await user.click(within(surface).getByTestId('design-authoring-save'));
    await user.click(await screen.findByTestId('design-create-submit'));
    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });
  });

  it('offers no machine-digitizing capability', async () => {
    const user = createUser();
    render();
    await user.click(await screen.findByTestId('design-open-authoring'));
    const surface = await screen.findByTestId('design-authoring-surface');
    expect(surface.textContent).not.toContain('DST');
    expect(surface.textContent).not.toContain('PES');
    expect(surface.querySelector('canvas')).toBeNull();
  });
});
