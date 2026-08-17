/**
 * The Admin request detail screen — what it renders and what it refuses to
 * render (`APP5-A02`; `665:3`, `665:115`, `667:3`, `667:30`).
 *
 * The assertions that matter are about truthfulness, because each is something
 * an operator would act on:
 *
 *  - the subject branch is the contract's discriminator, not a guess;
 *  - a load failure is a failure, never an empty request;
 *  - a server message, code or stack never reaches the screen;
 *  - the two reasons are never merged, and neither is backfilled;
 *  - no APP6 action exists anywhere on the page.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { adminCustomRequestDetail } from '@embroidery/api-client';

import { CustomRequestDetailScreen } from '../../src/features/custom-request-detail';
import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../../src/features/custom-request-detail/model/custom-request-detail-copy';
import { makeApiClientError } from '../support/api-error';
import {
  detailEnvelope,
  DETAIL_REQUEST_ID,
  makeCatalogDetail,
  makeCopDetail,
  makeNote,
  makeTransition,
} from '../support/custom-request-detail-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/requests/r1').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomRequestDetail: jest.fn(),
  adminCustomRequestAssetGet: jest.fn(),
}));

const detailMock = adminCustomRequestDetail as jest.MockedFunction<typeof adminCustomRequestDetail>;

beforeEach(() => {
  jest.clearAllMocks();
  detailMock.mockResolvedValue(detailEnvelope(makeCatalogDetail()));
});

const render = () =>
  renderWithProviders(<CustomRequestDetailScreen requestId={DETAIL_REQUEST_ID} />);

describe('the generated boundary', () => {
  it('reads the detail through the generated operation, addressed by request id', async () => {
    render();
    await waitFor(() => {
      expect(detailMock).toHaveBeenCalledTimes(1);
    });
    expect(detailMock.mock.calls[0]?.[0]).toBe(DETAIL_REQUEST_ID);
  });

  it('issues exactly one read per load — there is no polling and no retry loop', async () => {
    render();
    await screen.findByTestId('request-detail');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60);
    });
    expect(detailMock).toHaveBeenCalledTimes(1);
  });
});

describe('the route states', () => {
  it('shows the loading state before the request resolves', () => {
    detailMock.mockReturnValue(new Promise(() => undefined) as never);
    render();
    expect(screen.getByTestId('request-detail-loading')).toBeInTheDocument();
  });

  it('reports a missing request without revealing whether it exists', async () => {
    detailMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'REQUEST_NOT_FOUND', message: 'No such request.' }),
    );
    render();
    const panel = await screen.findByTestId('request-detail-not-found');
    expect(panel).toHaveTextContent(COPY.states.notFoundBody);
    // Same panel for 403: the screen cannot tell an unauthorized caller that the
    // id is real, and offers no retry for something a retry cannot fix.
    expect(screen.queryByTestId('request-detail-retry')).not.toBeInTheDocument();
  });

  it('offers a manual retry on a transient failure and never the server text', async () => {
    detailMock.mockRejectedValue(
      makeApiClientError({ status: 503, code: 'UPSTREAM', message: 'pg: connection refused' }),
    );
    render();
    const panel = await screen.findByTestId('request-detail-error');
    expect(panel).toHaveTextContent(COPY.states.errorBody);
    expect(panel).not.toHaveTextContent('pg: connection refused');
    expect(screen.getByTestId('request-detail-retry')).toBeInTheDocument();
  });
});

describe('the Catalog branch', () => {
  it('renders the product and variant labels', async () => {
    render();
    const panel = await screen.findByTestId('request-subject-catalog');
    expect(panel).toHaveTextContent('Áo thun cotton');
    expect(panel).toHaveTextContent('Xanh rêu');
    expect(panel).toHaveTextContent('M');
  });

  it('states that the design is not viewable here rather than inventing a preview', async () => {
    render();
    const fallback = await screen.findByTestId('request-design-preview-fallback');
    expect(fallback).toHaveTextContent(COPY.designPreview.unavailable);
    // The session id is provenance and says so; it is not offered as a link.
    expect(fallback).toHaveTextContent(COPY.designPreview.provenanceHelp);
    expect(fallback.querySelector('a')).toBeNull();
  });

  it('reports a label the server could not resolve instead of naming a product', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeCatalogDetail({
          subject: { kind: 'CATALOG', productId: '01940000-0000-7000-8000-0000000000p1' },
        }),
      ),
    );
    render();
    const panel = await screen.findByTestId('request-subject-catalog');
    expect(panel).toHaveTextContent(COPY.subject.unavailableLabel);
  });
});

describe('the customer-owned branch', () => {
  it('renders the item, its description and its dimensions', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeCopDetail()));
    render();
    const panel = await screen.findByTestId('request-subject-cop');
    expect(panel).toHaveTextContent('Áo khoác jean của khách');
    expect(panel).toHaveTextContent('Thêu logo sau lưng.');
    expect(panel).toHaveTextContent('300.00');
    expect(panel).toHaveTextContent('250.00');
  });

  it('says a customer-owned item has no design session rather than leaving a gap', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeCopDetail()));
    render();
    expect(await screen.findByText(COPY.subject.copHasNoDesign)).toBeInTheDocument();
    expect(screen.queryByTestId('request-design-preview-fallback')).not.toBeInTheDocument();
  });
});

describe('customer context', () => {
  it('shows only the masked contact and says the mask is one-way', async () => {
    render();
    const contacts = await screen.findByTestId('request-customer-contacts');
    expect(contacts).toHaveTextContent('l***@example.com');
    expect(contacts).toHaveTextContent(COPY.customer.verified);
    expect(screen.getByText(COPY.customer.maskedNote)).toBeInTheDocument();
  });

  it('offers no customer editing control', async () => {
    render();
    await screen.findByTestId('request-customer');
    expect(screen.queryByRole('button', { name: /khách/i })).not.toBeInTheDocument();
  });
});

describe('quantity', () => {
  it('renders the server total and the stored lines without merging them', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeCatalogDetail({
          quantities: [
            { quantity: 5, sizeLabel: 'M' },
            { quantity: 7, sizeLabel: 'M' },
          ],
          totalQuantity: 12,
        }),
      ),
    );
    render();
    expect(await screen.findByTestId('request-quantity-total')).toHaveTextContent('12');
    // Two lines with the same size label stay two lines.
    const rows = screen.getByTestId('request-quantity-lines').querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
  });
});

describe('history and notes', () => {
  it('renders no synthetic creation row for an unmoderated request', async () => {
    render();
    expect(await screen.findByTestId('request-history-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('request-history')).not.toBeInTheDocument();
  });

  it('keeps the internal and customer-visible reasons separate in the history', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeCatalogDetail({
          status: 'NEEDS_CLARIFICATION',
          internalReason: 'Ảnh mờ.',
          customerVisibleReason: 'Nhờ chị gửi lại ảnh ạ.',
          transitions: [
            makeTransition({
              toStatus: 'NEEDS_CLARIFICATION',
              internalReason: 'Ảnh mờ.',
              customerVisibleReason: 'Nhờ chị gửi lại ảnh ạ.',
            }),
          ],
        }),
      ),
    );
    render();
    await screen.findByTestId('request-history');
    expect(screen.getByTestId('transition-internal-reason')).toHaveTextContent('Ảnh mờ.');
    expect(screen.getByTestId('transition-customer-reason')).toHaveTextContent(
      'Nhờ chị gửi lại ảnh ạ.',
    );
    // The current-status reasons are the same two fields, still not merged.
    expect(screen.getByTestId('request-internal-reason')).toHaveTextContent('Ảnh mờ.');
    expect(screen.getByTestId('request-customer-reason')).toHaveTextContent(
      'Nhờ chị gửi lại ảnh ạ.',
    );
  });

  it('never backfills one reason from the other', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(makeCatalogDetail({ internalReason: 'Chỉ nội bộ.' })),
    );
    render();
    await screen.findByTestId('request-detail');
    expect(screen.getByTestId('request-internal-reason')).toHaveTextContent('Chỉ nội bộ.');
    expect(screen.getByTestId('request-customer-reason')).toHaveTextContent(COPY.reason.none);
  });

  it('renders notes append-only, with no edit or delete control', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeCatalogDetail({ moderationNotes: [makeNote(), makeNote({ sequence: 2 })] }),
      ),
    );
    render();
    const notes = await screen.findByTestId('request-notes');
    expect(notes.querySelectorAll('li')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /sửa|xoá/i })).not.toBeInTheDocument();
    expect(screen.getByText(COPY.notes.appendOnly)).toBeInTheDocument();
  });
});

describe('the action matrix on the page', () => {
  it('offers start-review and cancel on a NEW request', async () => {
    render();
    await screen.findByTestId('moderation-actions');
    expect(screen.getByTestId('moderation-action-start-review')).toBeInTheDocument();
    expect(screen.getByTestId('moderation-action-cancel')).toBeInTheDocument();
    expect(screen.queryByTestId('moderation-action-reject')).not.toBeInTheDocument();
  });

  it('offers clarify, reject and cancel under review', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeCatalogDetail({ status: 'UNDER_REVIEW' })));
    render();
    await screen.findByTestId('moderation-actions');
    expect(screen.getByTestId('moderation-action-clarify')).toBeInTheDocument();
    expect(screen.getByTestId('moderation-action-reject')).toBeInTheDocument();
    expect(screen.getByTestId('moderation-action-cancel')).toBeInTheDocument();
    expect(screen.queryByTestId('moderation-action-start-review')).not.toBeInTheDocument();
  });

  it('offers resume-review, reject and cancel after a clarification', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(makeCatalogDetail({ status: 'NEEDS_CLARIFICATION' })),
    );
    render();
    await screen.findByTestId('moderation-actions');
    expect(screen.getByTestId('moderation-action-resume-review')).toBeInTheDocument();
    expect(screen.getByTestId('moderation-action-reject')).toBeInTheDocument();
  });

  it.each(['QUOTED', 'DIGITIZING', 'APPROVED', 'REJECTED', 'CANCELLED'])(
    'offers no action at all in %s',
    async (status) => {
      detailMock.mockResolvedValue(detailEnvelope(makeCatalogDetail({ status })));
      render();
      expect(await screen.findByTestId('moderation-actions-none')).toBeInTheDocument();
      expect(screen.queryByTestId('moderation-actions')).not.toBeInTheDocument();
    },
  );

  it('renders no APP6 control anywhere on the page', async () => {
    detailMock.mockResolvedValue(detailEnvelope(makeCatalogDetail({ status: 'UNDER_REVIEW' })));
    render();
    await screen.findByTestId('request-detail');
    const labels = screen.getAllByRole('button').map((button) => button.textContent ?? '');
    for (const forbidden of ['báo giá', 'số hoá', 'duyệt thiết kế', 'thanh toán']) {
      expect(labels.some((label) => label.toLowerCase().includes(forbidden))).toBe(false);
    }
  });
});

describe('accessibility', () => {
  it('has exactly one page-level heading', async () => {
    render();
    await screen.findByTestId('request-detail');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('names the status as text, not by colour alone', async () => {
    render();
    const badge = await screen.findByTestId('request-detail-status');
    expect(badge).toHaveTextContent(COPY.status.new);
    expect(badge).toHaveAttribute('data-status', 'NEW');
  });
});
