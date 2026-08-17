/**
 * Keyset continuation on the Admin queue (`APP5-A01`; `662:3`).
 *
 * The cursor is opaque: it is sent back exactly as issued, never parsed, and
 * never turned into a page number. What these tests pin down is the behaviour a
 * private, ordered, cursor-paginated list gets wrong most easily — asking twice
 * for the same page, asking past the end, and re-sorting rows the server already
 * ordered.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { adminCustomRequestList } from '@embroidery/api-client';

import { CustomRequestQueueScreen } from '../../src/features/custom-request-queue';
import { makeApiClientError } from '../support/api-error';
import {
  makeQueueItem,
  makeQueuePage,
  queueEnvelope,
  REQUEST_QUOTED_ID,
  REQUEST_REVIEW_ID,
} from '../support/custom-request-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/requests').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomRequestList: jest.fn(),
}));

const listMock = adminCustomRequestList as jest.MockedFunction<typeof adminCustomRequestList>;
const lastParams = () =>
  (listMock.mock.calls[listMock.mock.calls.length - 1] as unknown as [Record<string, unknown>])[0];

const NEWEST = makeQueueItem({ code: 'REQ-2026-000900', submittedAt: '2026-08-16T09:00:00.000Z' });
const OLDER = makeQueueItem({
  requestId: REQUEST_REVIEW_ID,
  code: 'REQ-2026-000100',
  submittedAt: '2026-08-10T09:00:00.000Z',
});
const OLDEST = makeQueueItem({
  requestId: REQUEST_QUOTED_ID,
  code: 'REQ-2026-000001',
  submittedAt: '2026-08-02T09:00:00.000Z',
});

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
});

const render = () => renderWithProviders(<CustomRequestQueueScreen />);
const renderedCodes = () =>
  screen.getAllByRole('rowheader').map((cell) => cell.textContent?.trim() ?? '');

describe('a further page', () => {
  it('is requested with the opaque cursor the server issued, and appended in server order', async () => {
    listMock.mockResolvedValueOnce(
      queueEnvelope(makeQueuePage([NEWEST, OLDER], { next: 'opaque-cursor-2' })),
    );
    listMock.mockResolvedValueOnce(queueEnvelope(makeQueuePage([OLDEST])));

    render();
    await user.click(await screen.findByTestId('request-queue-load-more'));

    await waitFor(() => {
      expect(renderedCodes()).toEqual([NEWEST.code, OLDER.code, OLDEST.code]);
    });
    expect(lastParams()['cursor']).toBe('opaque-cursor-2');
    // Nothing was re-sorted, sliced or renumbered on the client.
    expect(lastParams()['limit']).toBe(20);
  });

  it('is not offered at all once the server says there is none', async () => {
    listMock.mockResolvedValue(queueEnvelope(makeQueuePage([NEWEST])));

    render();
    await screen.findByTestId('request-queue-table');

    expect(screen.queryByTestId('request-queue-load-more')).not.toBeInTheDocument();
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('stops being offered when the last page arrives, and issues no further request', async () => {
    listMock.mockResolvedValueOnce(queueEnvelope(makeQueuePage([NEWEST], { next: 'cursor-2' })));
    listMock.mockResolvedValueOnce(queueEnvelope(makeQueuePage([OLDER])));

    render();
    await user.click(await screen.findByTestId('request-queue-load-more'));

    await waitFor(() => {
      expect(screen.queryByTestId('request-queue-load-more')).not.toBeInTheDocument();
    });
    expect(listMock).toHaveBeenCalledTimes(2);
  });
});

describe('a second click while a page is in flight', () => {
  it('cannot produce a duplicate request — the control is natively disabled', async () => {
    listMock.mockResolvedValueOnce(queueEnvelope(makeQueuePage([NEWEST], { next: 'cursor-2' })));
    listMock.mockReturnValueOnce(new Promise(() => undefined) as never);

    render();
    const loadMore = await screen.findByTestId('request-queue-load-more');
    await user.click(loadMore);

    await waitFor(() => {
      expect(loadMore).toBeDisabled();
    });
    // `fireEvent` bypasses the pointer-events check `user.click` performs, so
    // this is a genuine second attempt at the control rather than a no-op the
    // test framework declined to deliver.
    fireEvent.click(loadMore);
    fireEvent.click(loadMore);

    expect(listMock).toHaveBeenCalledTimes(2);
    expect(loadMore).toHaveAttribute('aria-busy', 'true');
  });
});

describe('a failed continuation', () => {
  it('keeps the loaded rows and confines the failure to the control', async () => {
    listMock.mockResolvedValueOnce(queueEnvelope(makeQueuePage([NEWEST], { next: 'cursor-2' })));
    listMock.mockRejectedValueOnce(makeApiClientError({ status: 503, code: 'UNAVAILABLE' }));

    render();
    await user.click(await screen.findByTestId('request-queue-load-more'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(renderedCodes()).toEqual([NEWEST.code]);
    expect(screen.queryByTestId('request-queue-error')).not.toBeInTheDocument();
  });

  it('offers a reload rather than a retry when the cursor itself was rejected', async () => {
    listMock.mockResolvedValueOnce(
      queueEnvelope(makeQueuePage([NEWEST], { next: 'stale-cursor' })),
    );
    listMock.mockRejectedValueOnce(
      makeApiClientError({ status: 400, code: 'CUSTOM_REQUEST_CURSOR_INVALID' }),
    );

    render();
    await user.click(await screen.findByTestId('request-queue-load-more'));

    const reload = await screen.findByTestId('request-queue-cursor-reload');
    expect(screen.queryByTestId('request-queue-load-more')).not.toBeInTheDocument();

    listMock.mockResolvedValueOnce(queueEnvelope(makeQueuePage([NEWEST])));
    await user.click(reload);

    await waitFor(() => {
      expect(screen.queryByTestId('request-queue-cursor-reload')).not.toBeInTheDocument();
    });
    // The reload restarts the collection from its first page — no cursor.
    expect('cursor' in lastParams()).toBe(false);
  });
});
