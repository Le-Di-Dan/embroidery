/**
 * The Admin custom-request queue — states, rows and what it refuses to render
 * (`APP5-A01`; `662:3`, `662:112`, `662:182`, `662:306`).
 *
 * The assertions that matter are about truthfulness, because each is a sentence
 * the operator would act on:
 *
 *  - the effective scope is the *server's* `appliedStatuses`, never "tất cả";
 *  - a load failure is a failure, never an empty queue;
 *  - a server message, code or stack never reaches the screen;
 *  - the queue offers entry into one request and no moderation action at all.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminCustomRequestList } from '@embroidery/api-client';

import { CustomRequestQueueScreen } from '../../src/features/custom-request-queue';
import { CUSTOM_REQUEST_QUEUE_COPY } from '../../src/features/custom-request-queue/model/custom-request-queue-copy';
import { makeApiClientError } from '../support/api-error';
import { readFeatureSource } from '../support/feature-source';
import {
  makeQueueItem,
  makeQueuePage,
  queueEnvelope,
  REQUEST_NEW_ID,
  REQUEST_QUOTED_ID,
} from '../support/custom-request-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/requests').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomRequestList: jest.fn(),
}));

const listMock = adminCustomRequestList as jest.MockedFunction<typeof adminCustomRequestList>;

beforeEach(() => {
  jest.clearAllMocks();
  listMock.mockResolvedValue(queueEnvelope(makeQueuePage([makeQueueItem()])));
});

const render = () => renderWithProviders(<CustomRequestQueueScreen />);

describe('the generated boundary', () => {
  it('reads the queue through the generated operation with a bounded page size', async () => {
    render();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });
    const [params] = listMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params['limit']).toBe(20);
    // The default queue sends no status: B04 applies the triage set itself.
    expect('status' in params).toBe(false);
    expect('subjectKind' in params).toBe(false);
    expect('cursor' in params).toBe(false);
  });

  it('issues exactly one request per load — there is no polling and no retry loop', async () => {
    render();
    await screen.findByTestId('request-queue-table');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60);
    });
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('reaches no APP5 moderation or detail operation from this screen', () => {
    const actual = jest.requireActual<Record<string, unknown>>('@embroidery/api-client');

    // All three crossed the curated boundary with `APP5-B04`/`APP5-A02`, whose
    // approved consumer is the request *detail* screen — so their absence from
    // the shared package stopped being what makes this true. `APP12-H01`
    // (FU-APP12-A01-01) re-points the check at the claim that was always the one
    // about this screen: the queue feature names none of them. Nothing is
    // relaxed — an import anywhere under the feature still fails.
    //
    // The old list also asked about `adminCustomRequestNoteAppend`, which has
    // never existed under that name; the operation is `adminCustomRequestAppendNote`,
    // so that third assertion was passing on a typo. Corrected here.
    const featureSource = readFeatureSource('custom-request-queue');
    for (const moderationOperation of [
      'adminCustomRequestDetail',
      'adminCustomRequestTransition',
      'adminCustomRequestAppendNote',
    ]) {
      expect(actual[moderationOperation]).toEqual(expect.any(Function));
      // Whole identifier, not a substring: the queue legitimately holds a route
      // helper called `adminCustomRequestDetailRoute`, and a `toContain` would
      // read that as a call to the operation.
      expect(featureSource).not.toMatch(new RegExp(`\\b${moderationOperation}\\b`));
    }
  });
});

describe('loading', () => {
  it('shows the skeleton first and never flashes the empty state', () => {
    listMock.mockReturnValue(new Promise(() => undefined) as never);

    render();

    expect(screen.getByTestId('request-queue-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('request-queue-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('request-queue-table')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(CUSTOM_REQUEST_QUEUE_COPY.states.loading);
  });
});

describe('rows', () => {
  it('renders the approved operational fields for one request', async () => {
    listMock.mockResolvedValue(queueEnvelope(makeQueuePage([makeQueueItem()])));

    render();
    const row = within(await screen.findByTestId('request-queue-row'));

    expect(row.getByRole('rowheader')).toHaveTextContent('REQ-2026-000123');
    expect(row.getByText(CUSTOM_REQUEST_QUEUE_COPY.status.new)).toBeInTheDocument();
    expect(row.getByText(CUSTOM_REQUEST_QUEUE_COPY.subject.catalog)).toBeInTheDocument();
    expect(row.getByText('Gấu bông thêu tên')).toBeInTheDocument();
    expect(row.getByText('Chị Lan')).toBeInTheDocument();
    expect(row.getByText('12')).toBeInTheDocument();
    // The instant is machine-readable as well as human-readable.
    expect(row.getByText((_, node) => node?.tagName === 'TIME')).toHaveAttribute(
      'dateTime',
      '2026-08-14T02:30:00.000Z',
    );
  });

  it('states an absent customer name and an unresolved subject', async () => {
    listMock.mockResolvedValue(
      queueEnvelope(
        makeQueuePage([
          makeQueueItem({ customerDisplayName: undefined, subjectSummary: undefined }),
        ]),
      ),
    );

    render();
    const row = within(await screen.findByTestId('request-queue-row'));

    expect(row.getByText(CUSTOM_REQUEST_QUEUE_COPY.customer.unnamed)).toBeInTheDocument();
    expect(row.getByText(CUSTOM_REQUEST_QUEUE_COPY.subject.missingSummary)).toBeInTheDocument();
  });

  it('renders no raw identifier as operator-facing text', async () => {
    render();
    await screen.findByTestId('request-queue-table');

    const table = screen.getByTestId('request-queue-table');
    expect(table.textContent).not.toContain(REQUEST_NEW_ID);
    expect(table.textContent).not.toContain('01930000-0000-7000-8000-0000000000c1');
  });

  it('names a state it offers no action in, rather than mapping it onto a triage state', async () => {
    listMock.mockResolvedValue(
      queueEnvelope(
        makeQueuePage([makeQueueItem({ requestId: REQUEST_QUOTED_ID, status: 'QUOTED' })], {
          appliedStatuses: ['QUOTED'],
        }),
      ),
    );

    render();
    const row = within(await screen.findByTestId('request-queue-row'));

    expect(row.getByText(CUSTOM_REQUEST_QUEUE_COPY.status.quoted)).toBeInTheDocument();
    expect(row.queryByText(CUSTOM_REQUEST_QUEUE_COPY.status.new)).not.toBeInTheDocument();
  });

  it('degrades an undefined state to a neutral label without echoing the token', async () => {
    listMock.mockResolvedValue(
      queueEnvelope(makeQueuePage([makeQueueItem({ status: 'SOMETHING_APP7_ADDED' })])),
    );

    render();
    const row = within(await screen.findByTestId('request-queue-row'));

    expect(row.getByText(CUSTOM_REQUEST_QUEUE_COPY.status.unknown)).toBeInTheDocument();
    expect(screen.getByTestId('request-queue-table').textContent).not.toContain(
      'SOMETHING_APP7_ADDED',
    );
  });

  it('states the status as text, so colour is never the only signal', async () => {
    render();
    const badge = await screen.findByText(CUSTOM_REQUEST_QUEUE_COPY.status.new);

    expect(badge.textContent?.trim()).toBe(CUSTOM_REQUEST_QUEUE_COPY.status.new);
  });
});

describe('effective scope', () => {
  it('states the statuses the server actually applied, not "all requests"', async () => {
    render();
    const scope = await screen.findByTestId('request-queue-scope');

    expect(scope).toHaveTextContent(CUSTOM_REQUEST_QUEUE_COPY.status.new);
    expect(scope).toHaveTextContent(CUSTOM_REQUEST_QUEUE_COPY.status.underReview);
    expect(scope).toHaveTextContent(CUSTOM_REQUEST_QUEUE_COPY.status.needsClarification);
    expect(scope).toHaveTextContent(CUSTOM_REQUEST_QUEUE_COPY.scope.note);
    // The APP6 states are not in the default scope and are not claimed to be.
    expect(scope).not.toHaveTextContent(CUSTOM_REQUEST_QUEUE_COPY.status.digitizing);
  });

  it('follows the server when it applies a scope the screen did not request', async () => {
    listMock.mockResolvedValue(
      queueEnvelope(makeQueuePage([makeQueueItem()], { appliedStatuses: ['NEW'] })),
    );

    render();
    const scope = await screen.findByTestId('request-queue-scope');

    expect(scope).toHaveTextContent(CUSTOM_REQUEST_QUEUE_COPY.status.new);
    expect(scope).not.toHaveTextContent(CUSTOM_REQUEST_QUEUE_COPY.status.underReview);
  });
});

describe('the true empty queue', () => {
  it('says the work has not arrived, offers no reset and no creation control', async () => {
    listMock.mockResolvedValue(queueEnvelope(makeQueuePage([])));

    render();
    const empty = await screen.findByTestId('request-queue-empty');

    expect(empty).toHaveTextContent(CUSTOM_REQUEST_QUEUE_COPY.states.emptyTitle);
    expect(screen.queryByTestId('request-queue-filter-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('request-queue-empty-reset')).not.toBeInTheDocument();
    // The scope is still stated: an empty triage queue is not an empty table.
    expect(screen.getByTestId('request-queue-scope')).toBeInTheDocument();
  });
});

describe('a failed load', () => {
  it('reports the failure, never an empty queue, and never the server’s words', async () => {
    listMock.mockRejectedValue(
      makeApiClientError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'relation "custom_requests" does not exist',
      }),
    );

    render();
    const failure = await screen.findByTestId('request-queue-error');

    expect(failure).toHaveTextContent(CUSTOM_REQUEST_QUEUE_COPY.states.errorTitle);
    expect(failure).toHaveAttribute('role', 'alert');
    expect(screen.queryByTestId('request-queue-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('request-queue-table')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('custom_requests');
    expect(document.body.textContent).not.toContain('INTERNAL_ERROR');
  });

  it('retries only when the operator asks, and recovers', async () => {
    listMock.mockRejectedValueOnce(makeApiClientError({ status: 503, code: 'UNAVAILABLE' }));

    render();
    const retry = await screen.findByTestId('request-queue-retry');
    expect(listMock).toHaveBeenCalledTimes(1);

    listMock.mockResolvedValue(queueEnvelope(makeQueuePage([makeQueueItem()])));
    retry.click();

    await screen.findByTestId('request-queue-table');
    expect(listMock).toHaveBeenCalledTimes(2);
  });
});

describe('detail entry', () => {
  it('links each row to the canonical request-detail route', async () => {
    render();
    const link = await screen.findByRole('link', {
      name: `${CUSTOM_REQUEST_QUEUE_COPY.actions.open}: REQ-2026-000123`,
    });

    expect(link).toHaveAttribute('href', `/requests/${REQUEST_NEW_ID}`);
  });
});

describe('what the queue does not offer', () => {
  it('renders no moderation, quotation, payment or production control', async () => {
    render();
    await screen.findByTestId('request-queue-table');

    const labels = screen.queryAllByRole('button').map((button) => button.textContent ?? '');
    for (const forbidden of ['Duyệt', 'Từ chối', 'Huỷ', 'Báo giá', 'Thanh toán', 'Ghi chú']) {
      expect(labels.some((label) => label.includes(forbidden))).toBe(false);
    }
    // The only row affordance is the detail link.
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('has one page heading and a semantic table', async () => {
    render();
    await screen.findByTestId('request-queue-table');

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  });
});
