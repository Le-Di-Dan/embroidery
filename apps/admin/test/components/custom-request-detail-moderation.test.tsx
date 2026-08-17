/**
 * Moderating one request from the Admin detail screen (`APP5-A02` §12–§19;
 * `669:3`, `669:60`, `669:119`, `669:173`, `670:3`, `670:46`, `670:104`,
 * `670:148`).
 *
 * What is being proved is what reaches the wire and what happens afterwards:
 *
 *  - the exact generated body for each command, with no server-owned field;
 *  - a review move that carries no customer-visible text;
 *  - success re-reads `APP5-B04` and renders the **persisted** result;
 *  - a stale 409 re-reads, never resubmits, and demands a new decision.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminCustomRequestAppendNote,
  adminCustomRequestDetail,
  adminCustomRequestTransition,
} from '@embroidery/api-client';

import { CustomRequestDetailScreen } from '../../src/features/custom-request-detail';
import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../../src/features/custom-request-detail/model/custom-request-detail-copy';
import { makeApiClientError } from '../support/api-error';
import {
  detailEnvelope,
  DETAIL_REQUEST_ID,
  makeCatalogDetail,
  makeNote,
  makeTransition,
  mutationEnvelope,
} from '../support/custom-request-detail-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/requests/r1').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomRequestDetail: jest.fn(),
  adminCustomRequestAssetGet: jest.fn(),
  adminCustomRequestTransition: jest.fn(),
  adminCustomRequestAppendNote: jest.fn(),
}));

const detailMock = adminCustomRequestDetail as jest.MockedFunction<typeof adminCustomRequestDetail>;
const transitionMock = adminCustomRequestTransition as jest.MockedFunction<
  typeof adminCustomRequestTransition
>;
const noteMock = adminCustomRequestAppendNote as jest.MockedFunction<
  typeof adminCustomRequestAppendNote
>;

beforeEach(() => {
  jest.clearAllMocks();
  detailMock.mockResolvedValue(detailEnvelope(makeCatalogDetail({ status: 'UNDER_REVIEW' })));
  transitionMock.mockResolvedValue(mutationEnvelope());
  noteMock.mockResolvedValue(mutationEnvelope());
});

const render = () =>
  renderWithProviders(<CustomRequestDetailScreen requestId={DETAIL_REQUEST_ID} />);

const bodyOf = () => transitionMock.mock.calls[0]?.[1] as unknown as Record<string, unknown>;

async function openDialog(testId: string) {
  const user = createUser();
  await screen.findByTestId('moderation-actions');
  await user.click(screen.getByTestId(testId));
  return user;
}

describe('taking a request into review', () => {
  it('sends only the target — no customer-visible reason, no internal reason', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeCatalogDetail({ status: 'NEW' })));
    const user = createUser();
    render();
    await screen.findByTestId('moderation-actions');
    await user.click(screen.getByTestId('moderation-action-start-review'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    expect(transitionMock.mock.calls[0]?.[0]).toBe(DETAIL_REQUEST_ID);
    expect(bodyOf()).toEqual({ toStatus: 'UNDER_REVIEW' });
  });

  it('opens no dialog and asks the operator for nothing', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeCatalogDetail({ status: 'NEW' })));
    const user = createUser();
    render();
    await screen.findByTestId('moderation-actions');
    await user.click(screen.getByTestId('moderation-action-start-review'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('asking for clarification', () => {
  it('refuses to submit until both reasons and the note are written', async () => {
    render();
    const user = await openDialog('moderation-action-clarify');
    await user.click(screen.getByTestId('moderation-submit'));

    expect(screen.getByTestId('moderation-validation')).toBeInTheDocument();
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it('sends both reasons separately and pins the note kind to CLARIFY', async () => {
    render();
    const user = await openDialog('moderation-action-clarify');
    await user.type(screen.getByTestId('moderation-internal-reason'), 'Ảnh mờ.');
    await user.type(screen.getByTestId('moderation-customer-reason'), 'Nhờ chị gửi lại ảnh ạ.');
    await user.type(screen.getByTestId('moderation-note'), 'Đã nhắn khách.');
    await user.click(screen.getByTestId('moderation-submit'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    expect(bodyOf()).toEqual({
      toStatus: 'NEEDS_CLARIFICATION',
      internalReason: 'Ảnh mờ.',
      customerVisibleReason: 'Nhờ chị gửi lại ảnh ạ.',
      moderationNote: 'Đã nhắn khách.',
      moderationNoteKind: 'CLARIFY',
    });
  });
});

describe('rejecting', () => {
  it('defaults the kind to REJECT and never to SPAM', async () => {
    render();
    const user = await openDialog('moderation-action-reject');
    await user.type(screen.getByTestId('moderation-internal-reason'), 'Không khả thi.');
    await user.type(screen.getByTestId('moderation-customer-reason'), 'Xưởng không nhận mẫu này.');
    await user.type(screen.getByTestId('moderation-note'), 'Từ chối kỹ thuật.');
    await user.click(screen.getByTestId('moderation-submit'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    expect(bodyOf()['moderationNoteKind']).toBe('REJECT');
  });

  it('files SPAM only when the operator chooses it', async () => {
    render();
    const user = await openDialog('moderation-action-reject');
    await user.type(screen.getByTestId('moderation-internal-reason'), 'Spam.');
    await user.type(screen.getByTestId('moderation-customer-reason'), 'Yêu cầu bị từ chối.');
    await user.type(screen.getByTestId('moderation-note'), 'Spam rõ ràng.');
    await user.click(screen.getByTestId('moderation-note-kind-spam'));
    await user.click(screen.getByTestId('moderation-submit'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    expect(bodyOf()['moderationNoteKind']).toBe('SPAM');
  });

  it('never offers PAUSE', async () => {
    render();
    await openDialog('moderation-action-reject');
    expect(screen.queryByTestId('moderation-note-kind-pause')).not.toBeInTheDocument();
  });
});

describe('cancelling', () => {
  it('requires both reasons but submits with no note', async () => {
    render();
    const user = await openDialog('moderation-action-cancel');
    await user.type(screen.getByTestId('moderation-internal-reason'), 'Khách xin huỷ.');
    await user.type(screen.getByTestId('moderation-customer-reason'), 'Đã huỷ theo yêu cầu.');
    await user.click(screen.getByTestId('moderation-submit'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    expect(bodyOf()).toEqual({
      toStatus: 'CANCELLED',
      internalReason: 'Khách xin huỷ.',
      customerVisibleReason: 'Đã huỷ theo yêu cầu.',
    });
  });
});

describe('what is never sent', () => {
  it('carries no actor, source state, sequence or correlation field', async () => {
    render();
    const user = await openDialog('moderation-action-cancel');
    await user.type(screen.getByTestId('moderation-internal-reason'), 'a');
    await user.type(screen.getByTestId('moderation-customer-reason'), 'b');
    await user.click(screen.getByTestId('moderation-submit'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    const body = bodyOf();
    for (const field of [
      'fromStatus',
      'expectedFrom',
      'adminId',
      'customerId',
      'actorKind',
      'correlationId',
      'sequence',
      'timestamp',
    ]) {
      expect(field in body).toBe(false);
    }
  });
});

describe('after a successful move', () => {
  it('re-reads the detail and renders the persisted status and history', async () => {
    detailMock.mockResolvedValueOnce(detailEnvelope(makeCatalogDetail({ status: 'NEW' })));
    // What the server has after the move — the screen must show this, not a
    // locally constructed transition.
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeCatalogDetail({
          status: 'UNDER_REVIEW',
          transitions: [makeTransition({ sequence: 1 })],
        }),
      ),
    );
    const user = createUser();
    render();
    await screen.findByTestId('moderation-actions');
    await user.click(screen.getByTestId('moderation-action-start-review'));

    await screen.findByTestId('moderation-success');
    await waitFor(() => {
      expect(screen.getByTestId('request-detail-status')).toHaveAttribute(
        'data-status',
        'UNDER_REVIEW',
      );
    });
    expect(detailMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('request-history')).toBeInTheDocument();
  });

  it('closes the dialog rather than leaving the sent payload on screen', async () => {
    render();
    const user = await openDialog('moderation-action-cancel');
    await user.type(screen.getByTestId('moderation-internal-reason'), 'a');
    await user.type(screen.getByTestId('moderation-customer-reason'), 'b');
    await user.click(screen.getByTestId('moderation-submit'));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });
});

describe('a stale conflict', () => {
  beforeEach(() => {
    transitionMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'REQUEST_TRANSITION_STALE',
        message: 'This request was moderated by someone else.',
      }),
    );
  });

  it('never resubmits, re-reads the detail, and demands a new decision', async () => {
    detailMock.mockResolvedValueOnce(detailEnvelope(makeCatalogDetail({ status: 'UNDER_REVIEW' })));
    // Someone else rejected it first.
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeCatalogDetail({
          status: 'REJECTED',
          transitions: [makeTransition({ toStatus: 'REJECTED' })],
        }),
      ),
    );
    render();
    const user = await openDialog('moderation-action-cancel');
    await user.type(screen.getByTestId('moderation-internal-reason'), 'a');
    await user.type(screen.getByTestId('moderation-customer-reason'), 'b');
    await user.click(screen.getByTestId('moderation-submit'));

    await screen.findByTestId('moderation-conflict');
    // Exactly one attempt: zero automatic resubmit.
    expect(transitionMock).toHaveBeenCalledTimes(1);
    // The detail was re-read and the new state is on screen.
    expect(detailMock).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.getByTestId('request-detail-status')).toHaveAttribute(
        'data-status',
        'REJECTED',
      );
    });
    // The stale payload is gone with the dialog, and the new state offers no
    // action at all — the operator cannot replay what was refused.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('moderation-actions-none')).toBeInTheDocument();
  });

  it('offers no "apply anyway" control', async () => {
    render();
    const user = await openDialog('moderation-action-cancel');
    await user.type(screen.getByTestId('moderation-internal-reason'), 'a');
    await user.type(screen.getByTestId('moderation-customer-reason'), 'b');
    await user.click(screen.getByTestId('moderation-submit'));

    const conflict = await screen.findByTestId('moderation-conflict');
    expect(conflict).toHaveTextContent(COPY.outcome.conflictBody);
    expect(screen.queryByRole('button', { name: /vẫn|bỏ qua|anyway/i })).not.toBeInTheDocument();
  });
});

describe('a recoverable failure', () => {
  it('keeps the dialog and the typed text, and does not retry by itself', async () => {
    transitionMock.mockRejectedValue(
      makeApiClientError({ status: 503, code: 'UPSTREAM', message: 'provider down' }),
    );
    render();
    const user = await openDialog('moderation-action-cancel');
    await user.type(screen.getByTestId('moderation-internal-reason'), 'Khách xin huỷ.');
    await user.type(screen.getByTestId('moderation-customer-reason'), 'Đã huỷ.');
    await user.click(screen.getByTestId('moderation-submit'));

    const failure = await screen.findByTestId('moderation-failure');
    expect(failure).not.toHaveTextContent('provider down');
    expect(screen.getByTestId('moderation-internal-reason')).toHaveValue('Khách xin huỷ.');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 80);
    });
    expect(transitionMock).toHaveBeenCalledTimes(1);
  });
});

describe('the standalone note', () => {
  it('appends through B05 as NOTE and re-reads the detail', async () => {
    detailMock.mockResolvedValueOnce(detailEnvelope(makeCatalogDetail({ status: 'UNDER_REVIEW' })));
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeCatalogDetail({
          status: 'UNDER_REVIEW',
          moderationNotes: [makeNote({ note: 'Đã gọi khách.' })],
        }),
      ),
    );
    const user = createUser();
    render();
    await screen.findByTestId('moderation-note-input');
    await user.type(screen.getByTestId('moderation-note-input'), 'Đã gọi khách.');
    await user.click(screen.getByTestId('moderation-note-submit'));

    await waitFor(() => {
      expect(noteMock).toHaveBeenCalledTimes(1);
    });
    expect(noteMock.mock.calls[0]?.[0]).toBe(DETAIL_REQUEST_ID);
    expect(noteMock.mock.calls[0]?.[1]).toEqual({ kind: 'NOTE', note: 'Đã gọi khách.' });

    // The note on screen is the persisted one, in the server's ordering.
    await waitFor(() => {
      expect(screen.getByTestId('request-notes')).toHaveTextContent('Đã gọi khách.');
    });
  });

  it('refuses an empty note without calling the server', async () => {
    const user = createUser();
    render();
    await screen.findByTestId('moderation-note-submit');
    await user.click(screen.getByTestId('moderation-note-submit'));
    expect(noteMock).not.toHaveBeenCalled();
  });
});
