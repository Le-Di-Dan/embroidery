/**
 * `APP3-A04` — the advisory readiness panel, the publish refusal and the
 * lifecycle conflict.
 *
 * Three properties carry this file, and all three are about *not* claiming
 * knowledge the client does not have:
 *
 * - a condition this client cannot evaluate never renders as a pass, and never
 *   blocks publish either;
 * - a 422 names no failed condition, because the wire publishes no
 *   discriminator to name one from;
 * - a 409 is re-read exactly once and never replayed.
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
  adminProductPlacementGet,
} from '@embroidery/api-client';

import { DesignTemplatePublicationScreen } from '../../src/features/design-template-lifecycle';
import { LIFECYCLE_COPY } from '../../src/features/design-template-lifecycle/model/lifecycle-copy';
import { READINESS_CONDITIONS } from '../../src/features/design-template-lifecycle/model/lifecycle-readiness';
import {
  detailEnvelope,
  EDITOR_TEMPLATE_ID,
  makeDocument,
  makeImageElement,
  makePlacement,
  makeTextElement,
  makeUnversionedDetail,
  makeVersionedDetail,
  placementEnvelope,
} from '../support/design-template-editor-fixture';

jest.mock(
  'next/navigation',
  () => mockCreateNavigationMock('/design-templates/x/publication').module,
);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminDesignTemplateDetail: jest.fn(),
  adminDesignTemplatePublish: jest.fn(),
  adminDesignTemplateArchive: jest.fn(),
  adminProductPlacementGet: jest.fn(),
}));

const detailMock = adminDesignTemplateDetail as jest.MockedFunction<
  typeof adminDesignTemplateDetail
>;
const publishMock = adminDesignTemplatePublish as jest.MockedFunction<
  typeof adminDesignTemplatePublish
>;
const archiveMock = adminDesignTemplateArchive as jest.MockedFunction<
  typeof adminDesignTemplateArchive
>;
const placementMock = adminProductPlacementGet as jest.MockedFunction<
  typeof adminProductPlacementGet
>;

const render = () =>
  renderWithProviders(<DesignTemplatePublicationScreen templateId={EDITOR_TEMPLATE_ID} />);

/** An Axios-shaped rejection carrying the envelope the API actually returns. */
function apiError(status: number, code: string) {
  return {
    isAxiosError: true,
    response: {
      status,
      data: {
        success: false,
        code,
        message: 'server text that must never be rendered',
        meta: { requestId: 'req-1', timestamp: '2026-08-09T00:00:00.000Z' },
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  placementMock.mockResolvedValue(placementEnvelope(makePlacement()));
});

// ---------------------------------------------------------------------------
// 33–39 · The advisory panel
// ---------------------------------------------------------------------------
describe('the readiness panel', () => {
  it('renders all seven GRD-T01 conditions, always', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1, makeDocument())));

    render();

    await screen.findByTestId('readiness-rows');
    expect(READINESS_CONDITIONS).toHaveLength(7);
    for (const condition of READINESS_CONDITIONS) {
      expect(screen.getByTestId(`readiness-${condition}`)).toBeInTheDocument();
    }
  });

  it('invents no readiness endpoint — the detail and the placement are the only reads', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1, makeDocument())));

    render();
    await screen.findByTestId('readiness-rows');

    expect(detailMock).toHaveBeenCalledTimes(1);
    expect(placementMock).toHaveBeenCalledTimes(1);
  });

  it('never renders an unprovable condition as a pass', async () => {
    // A document that references an Asset: derivative eligibility is a fact only
    // the server can check, so the row must defer rather than guess.
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(1, makeDocument([makeTextElement(), makeImageElement()]))),
    );

    render();

    const media = await screen.findByTestId('readiness-MEDIA_ELIGIBLE');
    expect(media).toHaveAttribute('data-state', 'CHECKED_ON_PUBLISH');
    expect(media).toHaveTextContent(LIFECYCLE_COPY.readiness.details.mediaCheckedOnPublish);
  });

  it('proves the one media fact it can — a document that references nothing', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1, makeDocument())));

    render();

    const media = await screen.findByTestId('readiness-MEDIA_ELIGIBLE');
    expect(media).toHaveAttribute('data-state', 'READY');
  });

  it('does not block publish on a condition it could not evaluate', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(1, makeDocument([makeTextElement(), makeImageElement()]))),
    );

    render();

    // Media is deferred, and publish stays available: the server is the guard.
    expect(await screen.findByTestId('readiness-MEDIA_ELIGIBLE')).toHaveAttribute(
      'data-state',
      'CHECKED_ON_PUBLISH',
    );
    expect(screen.getByTestId('lifecycle-publish')).toBeEnabled();
  });

  it('blocks publish on a Template with no immutable version', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeUnversionedDetail()));

    render();

    expect(await screen.findByTestId('readiness-IMMUTABLE_VERSION')).toHaveAttribute(
      'data-state',
      'NOT_READY',
    );
    const publish = screen.getByTestId('lifecycle-publish');
    expect(publish).toBeDisabled();
    // The reason is announced, not left to be inferred from a grey button.
    expect(publish).toHaveAttribute('aria-describedby', 'lifecycle-publish-blocked');
  });

  it('blocks publish on a Template with no scope', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(makeVersionedDetail(1, makeDocument(), { scope: undefined })),
    );

    render();

    expect(await screen.findByTestId('readiness-SCOPE_COMPLETE')).toHaveAttribute(
      'data-state',
      'NOT_READY',
    );
    expect(screen.getByTestId('lifecycle-publish')).toBeDisabled();
    // No scope, no Product request.
    expect(placementMock).not.toHaveBeenCalled();
  });

  it('reports a retired Area as a proven failure, and stops evaluating geometry', async () => {
    placementMock.mockResolvedValue(
      placementEnvelope(
        makePlacement({
          sides: [
            {
              ...makePlacement().sides[0],
              areas: [
                {
                  ...makePlacement().sides[0]!.areas[0],
                  retiredAt: '2026-08-01T00:00:00.000Z',
                },
              ],
            },
          ],
        }),
      ),
    );
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1, makeDocument())));

    render();

    await waitFor(() => {
      expect(screen.getByTestId('readiness-SCOPE_ACTIVE')).toHaveAttribute(
        'data-state',
        'NOT_READY',
      );
    });
    // Containment against an Area the Template may not claim would mean nothing.
    expect(screen.getByTestId('readiness-PLACEMENT_MATCHES')).toHaveAttribute(
      'data-state',
      'CHECKED_ON_PUBLISH',
    );
    expect(screen.getByTestId('readiness-WITHIN_AREA')).toHaveAttribute(
      'data-state',
      'CHECKED_ON_PUBLISH',
    );
  });

  it('reports a placement that names another Side as a proven mismatch', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeVersionedDetail(1, {
          ...makeDocument(),
          placement: {
            ...makeDocument().placement,
            productSideId: '01920000-0000-7000-8000-0000000000ff',
          },
        }),
      ),
    );

    render();

    await waitFor(() => {
      expect(screen.getByTestId('readiness-PLACEMENT_MATCHES')).toHaveAttribute(
        'data-state',
        'NOT_READY',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// 40–44 · The publish refusal
// ---------------------------------------------------------------------------
describe('a publish refusal', () => {
  it('changes no status, states the server changed nothing, and names no condition', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1, makeDocument())));
    publishMock.mockRejectedValue(apiError(422, 'UNPROCESSABLE_ENTITY'));
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-publish'));
    await user.click(await screen.findByTestId('publish-dialog-confirm'));

    const failure = await screen.findByTestId('lifecycle-failure');
    expect(failure).toHaveTextContent(LIFECYCLE_COPY.failure.notReady);
    // The Template did not move.
    expect(screen.getByTestId('lifecycle-status-badge')).toHaveTextContent('DRAFT');
    // No re-read: `APP3-B04` guarantees the guard wrote nothing.
    expect(detailMock).toHaveBeenCalledTimes(1);
  });

  it('keeps all seven rows visible and fabricates no failed guard', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1, makeDocument())));
    publishMock.mockRejectedValue(apiError(422, 'UNPROCESSABLE_ENTITY'));
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-publish'));
    await user.click(await screen.findByTestId('publish-dialog-confirm'));
    await screen.findByTestId('lifecycle-failure');

    for (const condition of READINESS_CONDITIONS) {
      expect(screen.getByTestId(`readiness-${condition}`)).toBeInTheDocument();
    }
    // Every row this client proved is still shown as proved; the refusal marked
    // none of them failed, because the wire named none.
    expect(screen.getByTestId('readiness-IMMUTABLE_VERSION')).toHaveAttribute(
      'data-state',
      'READY',
    );
  });

  it('never renders the server message', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeVersionedDetail(1, makeDocument())));
    publishMock.mockRejectedValue(apiError(422, 'UNPROCESSABLE_ENTITY'));
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-publish'));
    await user.click(await screen.findByTestId('publish-dialog-confirm'));
    await screen.findByTestId('lifecycle-failure');

    expect(screen.queryByText(/server text that must never be rendered/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 45–50 · The lifecycle conflict
// ---------------------------------------------------------------------------
describe('a lifecycle conflict', () => {
  it('never retries, re-reads exactly once, and recomputes the actions', async () => {
    detailMock
      .mockResolvedValueOnce(detailEnvelope(makeVersionedDetail(1, makeDocument())))
      // The authoritative re-read: somebody else published it.
      .mockResolvedValueOnce(
        detailEnvelope(makeVersionedDetail(1, makeDocument(), { status: 'PUBLISHED' })),
      );
    publishMock.mockRejectedValue(apiError(409, 'CONFLICT'));
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-publish'));
    await user.click(await screen.findByTestId('publish-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('lifecycle-status-badge')).toHaveTextContent('PUBLISHED');
    });
    // One command attempt, never replayed.
    expect(publishMock).toHaveBeenCalledTimes(1);
    // The initial read plus exactly one authoritative re-read.
    expect(detailMock).toHaveBeenCalledTimes(2);
    // The actions now follow PUBLISHED, not the state the operator saw.
    expect(screen.getByTestId('lifecycle-unpublish')).toBeInTheDocument();
    expect(screen.queryByTestId('lifecycle-publish')).toBeNull();
    expect(screen.getByTestId('lifecycle-failure')).toHaveTextContent(
      LIFECYCLE_COPY.failure.staleReloaded,
    );
  });

  it('voids a stale archive confirmation and requires a fresh reason', async () => {
    detailMock
      .mockResolvedValueOnce(detailEnvelope(makeVersionedDetail(1, makeDocument())))
      .mockResolvedValueOnce(detailEnvelope(makeVersionedDetail(2, makeDocument())));
    archiveMock.mockRejectedValue(apiError(409, 'CONFLICT'));
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-archive'));
    await user.type(await screen.findByTestId('archive-dialog-reason'), 'Hết mẫu');
    await user.click(screen.getByTestId('archive-dialog-confirm'));

    await screen.findByTestId('lifecycle-failure');
    // The dialog is gone, so the sentence the operator wrote for the old state
    // cannot be reused against the new one.
    expect(screen.queryByTestId('archive-dialog')).toBeNull();
    expect(screen.getByTestId('lifecycle-failure')).toHaveTextContent(
      LIFECYCLE_COPY.failure.staleReasonCleared,
    );

    // Reopening starts from an empty field.
    await user.click(screen.getByTestId('lifecycle-archive'));
    expect(await screen.findByTestId('archive-dialog-reason')).toHaveValue('');
  });

  it('classifies from the status, never from the message text', async () => {
    detailMock
      .mockResolvedValueOnce(detailEnvelope(makeVersionedDetail(1, makeDocument())))
      .mockResolvedValueOnce(detailEnvelope(makeVersionedDetail(1, makeDocument())));
    // A 409 whose body says nothing recognisable: the status alone must decide.
    publishMock.mockRejectedValue(apiError(409, 'CONFLICT'));
    const user = createUser();

    render();
    await user.click(await screen.findByTestId('lifecycle-publish'));
    await user.click(await screen.findByTestId('publish-dialog-confirm'));

    await waitFor(() => {
      expect(detailMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId('lifecycle-failure')).toHaveTextContent(
      LIFECYCLE_COPY.failure.staleReloaded,
    );
  });
});
