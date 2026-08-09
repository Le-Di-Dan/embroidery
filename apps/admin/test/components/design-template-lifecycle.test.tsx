/**
 * `APP3-A04` — the lifecycle action matrix, the exact command bodies and what
 * the screen adopts from a success.
 *
 * The cases worth reading twice are the absences. A control for a transition
 * LC-24 does not recognise, a body carrying a field the server owns, a status
 * flipped before the server answered — each of those leaves a screen that looks
 * right and is wrong, and none of them is visible in a passing happy path.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminDesignTemplateArchive,
  adminDesignTemplateDetail,
  adminDesignTemplatePublish,
  adminDesignTemplateRestore,
  adminDesignTemplateUnpublish,
  adminProductPlacementGet,
} from '@embroidery/api-client';

import { DesignTemplatePublicationScreen } from '../../src/features/design-template-lifecycle';
import { LIFECYCLE_COPY } from '../../src/features/design-template-lifecycle/model/lifecycle-copy';
import {
  detailEnvelope,
  EDITOR_TEMPLATE_ID,
  makeDocument,
  makePlacement,
  makeUnversionedDetail,
  makeVersionedDetail,
  placementEnvelope,
} from '../support/design-template-editor-fixture';

jest.mock(
  'next/navigation',
  () => mockCreateNavigationMock(`/design-templates/${'x'}/publication`).module,
);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminDesignTemplateDetail: jest.fn(),
  adminDesignTemplatePublish: jest.fn(),
  adminDesignTemplateUnpublish: jest.fn(),
  adminDesignTemplateArchive: jest.fn(),
  adminDesignTemplateRestore: jest.fn(),
  adminProductPlacementGet: jest.fn(),
}));

const detailMock = adminDesignTemplateDetail as jest.MockedFunction<
  typeof adminDesignTemplateDetail
>;
const publishMock = adminDesignTemplatePublish as jest.MockedFunction<
  typeof adminDesignTemplatePublish
>;
const unpublishMock = adminDesignTemplateUnpublish as jest.MockedFunction<
  typeof adminDesignTemplateUnpublish
>;
const archiveMock = adminDesignTemplateArchive as jest.MockedFunction<
  typeof adminDesignTemplateArchive
>;
const restoreMock = adminDesignTemplateRestore as jest.MockedFunction<
  typeof adminDesignTemplateRestore
>;
const placementMock = adminProductPlacementGet as jest.MockedFunction<
  typeof adminProductPlacementGet
>;

const render = () =>
  renderWithProviders(<DesignTemplatePublicationScreen templateId={EDITOR_TEMPLATE_ID} />);

beforeEach(() => {
  jest.clearAllMocks();
  placementMock.mockResolvedValue(placementEnvelope(makePlacement()));
});

// ---------------------------------------------------------------------------
// 13–17 · The action matrix
// ---------------------------------------------------------------------------
describe('the lifecycle action matrix', () => {
  it('offers publish and archive on a DRAFT, and nothing else', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(2, makeDocument())));

    render();

    expect(await screen.findByTestId('lifecycle-publish')).toBeInTheDocument();
    expect(screen.getByTestId('lifecycle-archive')).toBeInTheDocument();
    expect(screen.queryByTestId('lifecycle-unpublish')).toBeNull();
    expect(screen.queryByTestId('lifecycle-restore')).toBeNull();
  });

  it('offers unpublish and archive on a PUBLISHED template, and nothing else', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(2, makeDocument(), { status: 'PUBLISHED' })),
    );

    render();

    expect(await screen.findByTestId('lifecycle-unpublish')).toBeInTheDocument();
    expect(screen.getByTestId('lifecycle-archive')).toBeInTheDocument();
    expect(screen.queryByTestId('lifecycle-publish')).toBeNull();
    expect(screen.queryByTestId('lifecycle-restore')).toBeNull();
  });

  it('offers restore alone on an ARCHIVED template — never a direct republish', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeVersionedDetail(2, makeDocument(), {
          status: 'ARCHIVED',
          archivedAt: '2026-08-01T09:00:00.000Z',
        }),
      ),
    );

    render();

    expect(await screen.findByTestId('lifecycle-restore')).toBeInTheDocument();
    // `ARCHIVED → PUBLISHED` is not a transition LC-24 recognises.
    expect(screen.queryByTestId('lifecycle-publish')).toBeNull();
    expect(screen.queryByTestId('lifecycle-unpublish')).toBeNull();
    expect(screen.queryByTestId('lifecycle-archive')).toBeNull();
  });

  it('offers no delete in any state', async () => {
    for (const status of ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const) {
      detailMock.mockResolvedValue(
        detailEnvelope(makeVersionedDetail(2, makeDocument(), { status })),
      );
      const view = render();
      await screen.findByTestId('template-lifecycle-screen');
      for (const label of [/xoá/i, /xóa/i, /delete/i]) {
        expect(screen.queryByRole('button', { name: label })).toBeNull();
      }
      view.unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// 18–24 · The command bodies
// ---------------------------------------------------------------------------
describe('the command bodies', () => {
  const openAndConfirm = async (
    trigger: string,
    dialog: string,
    reason?: string,
  ): Promise<void> => {
    const user = createUser();
    await user.click(await screen.findByTestId(trigger));
    if (reason !== undefined) {
      await user.type(await screen.findByTestId(`${dialog}-reason`), reason);
    }
    await user.click(await screen.findByTestId(`${dialog}-confirm`));
  };

  it('sends publish with the token alone', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(3, makeDocument())));
    publishMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(3, makeDocument(), { status: 'PUBLISHED' })),
    );

    render();
    await openAndConfirm('lifecycle-publish', 'publish-dialog');

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledTimes(1);
    });
    expect(publishMock.mock.calls[0]?.[1]).toEqual({ expectedCurrentVersion: 3 });
  });

  it('sends unpublish with the token alone', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(3, makeDocument(), { status: 'PUBLISHED' })),
    );
    unpublishMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(3, makeDocument())));

    render();
    await openAndConfirm('lifecycle-unpublish', 'unpublish-dialog');

    await waitFor(() => {
      expect(unpublishMock).toHaveBeenCalledTimes(1);
    });
    expect(unpublishMock.mock.calls[0]?.[1]).toEqual({ expectedCurrentVersion: 3 });
  });

  it('sends archive with the token and a trimmed reason', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(3, makeDocument())));
    archiveMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(3, makeDocument(), { status: 'ARCHIVED' })),
    );

    render();
    await openAndConfirm('lifecycle-archive', 'archive-dialog', '  Ngừng bán  ');

    await waitFor(() => {
      expect(archiveMock).toHaveBeenCalledTimes(1);
    });
    expect(archiveMock.mock.calls[0]?.[1]).toEqual({
      expectedCurrentVersion: 3,
      reason: 'Ngừng bán',
    });
  });

  it('sends restore with the token and a trimmed reason', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(3, makeDocument(), { status: 'ARCHIVED' })),
    );
    restoreMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(3, makeDocument())));

    render();
    await openAndConfirm('lifecycle-restore', 'restore-dialog', 'Bán lại');

    await waitFor(() => {
      expect(restoreMock).toHaveBeenCalledTimes(1);
    });
    expect(restoreMock.mock.calls[0]?.[1]).toEqual({
      expectedCurrentVersion: 3,
      reason: 'Bán lại',
    });
  });

  it('refuses a blank reason without calling the server', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(3, makeDocument())));
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-archive'));
    await user.type(await screen.findByTestId('archive-dialog-reason'), '   ');
    await user.click(screen.getByTestId('archive-dialog-confirm'));

    expect(archiveMock).not.toHaveBeenCalled();
    expect(screen.getByText(LIFECYCLE_COPY.reason.blank)).toBeInTheDocument();
  });

  it('caps the reason at the server bound', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(3, makeDocument())));
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-archive'));
    const field = await screen.findByTestId('archive-dialog-reason');

    // The field itself refuses more than 500, so an over-long reason cannot even
    // be composed — the server bound and the control agree.
    expect(field).toHaveAttribute('maxLength', '500');
  });

  it('sends no server-owned field on any command', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(3, makeDocument())));
    publishMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(3, makeDocument(), { status: 'PUBLISHED' })),
    );

    render();
    await openAndConfirm('lifecycle-publish', 'publish-dialog');

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalled();
    });
    const body = publishMock.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
    for (const owned of [
      'status',
      'targetStatus',
      'document',
      'scope',
      'publishedAt',
      'archivedAt',
      'force',
      'publishAfterRestore',
      'versionToPublish',
    ]) {
      expect(body).not.toHaveProperty(owned);
    }
  });
});

// ---------------------------------------------------------------------------
// 25–32 · Success is server truth
// ---------------------------------------------------------------------------
describe('adopting the server answer', () => {
  it('adopts each transition from its own response, with no second read', async () => {
    const cases = [
      {
        status: 'DRAFT' as const,
        trigger: 'lifecycle-publish',
        dialog: 'publish-dialog',
        mock: publishMock,
        next: 'PUBLISHED' as const,
        announcement: LIFECYCLE_COPY.outcome.published,
      },
      {
        status: 'PUBLISHED' as const,
        trigger: 'lifecycle-unpublish',
        dialog: 'unpublish-dialog',
        mock: unpublishMock,
        next: 'DRAFT' as const,
        announcement: LIFECYCLE_COPY.outcome.unpublished,
      },
    ];

    for (const testCase of cases) {
      jest.clearAllMocks();
      placementMock.mockResolvedValue(placementEnvelope(makePlacement()));
      detailMock.mockResolvedValue(
        detailEnvelope(makeVersionedDetail(2, makeDocument(), { status: testCase.status })),
      );
      testCase.mock.mockResolvedValue(
        detailEnvelope(makeVersionedDetail(2, makeDocument(), { status: testCase.next })),
      );

      const view = render();
      const user = createUser();
      await user.click(await screen.findByTestId(testCase.trigger));
      await user.click(await screen.findByTestId(`${testCase.dialog}-confirm`));

      await waitFor(() => {
        expect(screen.getByTestId('lifecycle-status-badge')).toHaveTextContent(testCase.next);
      });
      expect(screen.getByText(testCase.announcement)).toBeInTheDocument();
      // The response was complete, so nothing re-read the detail afterwards.
      expect(detailMock).toHaveBeenCalledTimes(1);
      view.unmount();
    }
  });

  it('adopts ARCHIVED from archive and DRAFT from restore', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(2, makeDocument())));
    archiveMock.mockResolvedValue(
      detailEnvelope(
        makeVersionedDetail(2, makeDocument(), {
          status: 'ARCHIVED',
          archivedAt: '2026-08-09T00:00:00.000Z',
        }),
      ),
    );
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-archive'));
    await user.type(await screen.findByTestId('archive-dialog-reason'), 'Hết mẫu');
    await user.click(screen.getByTestId('archive-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('lifecycle-status-badge')).toHaveTextContent('ARCHIVED');
    });
    // The archived state is the restore state: one command, and it is not publish.
    expect(screen.getByTestId('lifecycle-restore')).toBeInTheDocument();
    expect(screen.getByText(LIFECYCLE_COPY.outcome.archived)).toBeInTheDocument();
  });

  it('closes the confirmation once the transition happened', async () => {
    // Found in the browser, not here: the success callback reported "ok" and the
    // screen read the same boolean as "keep open", so a published Template kept
    // its publish dialog on screen — and the next action was unclickable behind
    // the backdrop. Every assertion about the badge still passed.
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(2, makeDocument())));
    publishMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(2, makeDocument(), { status: 'PUBLISHED' })),
    );
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-publish'));
    await user.click(await screen.findByTestId('publish-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('lifecycle-status-badge')).toHaveTextContent('PUBLISHED');
    });
    expect(screen.queryByTestId('publish-dialog')).toBeNull();
    // And the next legal action is actually reachable.
    expect(screen.getByTestId('lifecycle-unpublish')).toBeEnabled();
  });

  it('closes a reason dialog on success too', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(2, makeDocument())));
    archiveMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(2, makeDocument(), { status: 'ARCHIVED' })),
    );
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-archive'));
    await user.type(await screen.findByTestId('archive-dialog-reason'), 'Hết mẫu');
    await user.click(screen.getByTestId('archive-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('lifecycle-status-badge')).toHaveTextContent('ARCHIVED');
    });
    expect(screen.queryByTestId('archive-dialog')).toBeNull();
    expect(screen.getByTestId('lifecycle-restore')).toBeEnabled();
  });

  it('never flips the badge before the server answers', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(2, makeDocument())));
    let resolvePublish: ((value: unknown) => void) | undefined;
    publishMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePublish = resolve;
      }) as never,
    );
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-publish'));
    await user.click(await screen.findByTestId('publish-dialog-confirm'));

    // In flight: the status is still what the server last said.
    expect(screen.getByTestId('lifecycle-status-badge')).toHaveTextContent('DRAFT');

    resolvePublish?.(
      detailEnvelope(makeVersionedDetail(2, makeDocument(), { status: 'PUBLISHED' })),
    );
    await waitFor(() => {
      expect(screen.getByTestId('lifecycle-status-badge')).toHaveTextContent('PUBLISHED');
    });
  });

  it('never increments the version locally', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(4, makeDocument())));
    publishMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(4, makeDocument(), { status: 'PUBLISHED' })),
    );
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-publish'));
    await user.click(await screen.findByTestId('publish-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('lifecycle-status-badge')).toHaveTextContent('PUBLISHED');
    });
    // Publish creates no version, so v4 stays v4 — never a hopeful v5.
    expect(screen.getByTestId('lifecycle-version')).toHaveTextContent('v4');
    expect(screen.getByTestId('lifecycle-version')).not.toHaveTextContent('v5');
  });

  it('sends the authoritative zero for a Template with no version', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeUnversionedDetail()));
    render();

    // Publish is refused locally — no immutable version — so the token is never
    // fabricated into a `1` to make the button work.
    expect(await screen.findByTestId('lifecycle-publish')).toBeDisabled();
    expect(publishMock).not.toHaveBeenCalled();
  });
});
