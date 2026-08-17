/**
 * The two approved queue filters, the filtered-empty state and the reset
 * (`APP5-A01`; `662:3`, `662:243`).
 *
 * `next/navigation` is mocked with a *mutable* search string so a filter change
 * replays the way the App Router would: the component calls `router.replace`,
 * the URL changes, the screen re-renders. That is what makes the reset and
 * pagination-reset assertions meaningful rather than a restatement of the query
 * key.
 */
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import { adminCustomRequestList } from '@embroidery/api-client';

import { CustomRequestQueueScreen } from '../../src/features/custom-request-queue';
import { CUSTOM_REQUEST_QUEUE_COPY } from '../../src/features/custom-request-queue/model/custom-request-queue-copy';
import { makeQueueItem, makeQueuePage, queueEnvelope } from '../support/custom-request-fixture';

// The factory owns its own state so it can be referenced before the test module
// body has evaluated (jest.mock is hoisted above every import).
jest.mock('next/navigation', () => {
  const state = { search: '' };
  const router = {
    replace: jest.fn((url: string) => {
      const query = url.split('?')[1];
      state.search = query ?? '';
    }),
    push: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  };
  return {
    __state: state,
    __router: router,
    useRouter: () => router,
    usePathname: () => '/requests',
    useSearchParams: () => new URLSearchParams(state.search),
  };
});

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomRequestList: jest.fn(),
}));

import * as navigation from 'next/navigation';

const navState = (navigation as unknown as { __state: { search: string } }).__state;
const navRouter = (navigation as unknown as { __router: { replace: jest.Mock } }).__router;
const listMock = adminCustomRequestList as jest.MockedFunction<typeof adminCustomRequestList>;

const statusSelect = () => screen.getByLabelText(CUSTOM_REQUEST_QUEUE_COPY.filters.statusLabel);
const subjectSelect = () => screen.getByLabelText(CUSTOM_REQUEST_QUEUE_COPY.filters.subjectLabel);
const lastParams = () =>
  (listMock.mock.calls[listMock.mock.calls.length - 1] as unknown as [Record<string, unknown>])[0];

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  navState.search = '';
  user = createUser();
  listMock.mockResolvedValue(queueEnvelope(makeQueuePage([makeQueueItem()])));
});

const render = () => renderWithProviders(<CustomRequestQueueScreen />);

/**
 * Replays what the App Router would do after `router.replace`: the mocked
 * `replace` has already rewritten the search string, so the screen only needs to
 * re-render to observe the new URL. The `APP2-A02` convention, unchanged.
 */
type Rerender = { rerender: (ui: React.ReactElement) => void };
const replayNavigation = (view: Rerender) => {
  view.rerender(<CustomRequestQueueScreen />);
};

describe('the filter controls', () => {
  it('renders exactly two labelled filters, status first', async () => {
    render();
    await screen.findByTestId('request-queue-table');

    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    expect(selects[0]).toBe(statusSelect());
    expect(selects[1]).toBe(subjectSelect());
  });

  it('defaults status to the triage scope, never to an "all requests" option', async () => {
    render();
    await screen.findByTestId('request-queue-table');

    expect(statusSelect()).toHaveValue('triage');
    const optionLabels = [...statusSelect().querySelectorAll('option')].map((o) => o.textContent);
    expect(optionLabels[0]).toBe(CUSTOM_REQUEST_QUEUE_COPY.filters.statusTriage);
    expect(optionLabels).toContain(CUSTOM_REQUEST_QUEUE_COPY.status.quoted);
    expect(optionLabels).not.toContain('Tất cả trạng thái');
  });

  it('offers no free-text, code, date or contact search control', async () => {
    const { container } = render();
    await screen.findByTestId('request-queue-table');

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(0);
  });

  it('offers the reset only once something is actually filtered', async () => {
    const view = render();
    await screen.findByTestId('request-queue-table');
    expect(screen.queryByTestId('request-queue-reset')).not.toBeInTheDocument();

    await user.selectOptions(statusSelect(), 'NEW');
    replayNavigation(view);

    expect(screen.getByTestId('request-queue-reset')).toBeInTheDocument();
  });
});

describe('a status choice', () => {
  it('goes into the URL and into the request as the contract’s repeatable array', async () => {
    const view = render();
    await screen.findByTestId('request-queue-table');

    await user.selectOptions(statusSelect(), 'NEEDS_CLARIFICATION');

    expect(navRouter.replace).toHaveBeenCalledWith('/requests?status=NEEDS_CLARIFICATION', {
      scroll: false,
    });
    replayNavigation(view);
    await waitFor(() => {
      expect(lastParams()['status']).toEqual(['NEEDS_CLARIFICATION']);
    });
  });

  it('is serialized as a repeated key, not as `status[]`', async () => {
    const view = render();
    await screen.findByTestId('request-queue-table');

    await user.selectOptions(statusSelect(), 'NEW');
    replayNavigation(view);

    await waitFor(() => {
      expect(lastParams()['status']).toEqual(['NEW']);
    });
    // Axios brackets arrays by default, and `status[]` is a different parameter
    // name to `APP5-B04` — the filter would be dropped in flight while every
    // assertion on the parameter object still passed. Found in the browser.
    const options = (listMock.mock.calls[listMock.mock.calls.length - 1] as unknown[])[1] as {
      config?: { paramsSerializer?: { indexes?: unknown } };
    };
    expect(options.config?.paramsSerializer?.indexes).toBeNull();
  });

  it('reports the scope the server applied for that choice', async () => {
    const view = render();
    await screen.findByTestId('request-queue-table');

    listMock.mockResolvedValue(
      queueEnvelope(
        makeQueuePage([makeQueueItem({ status: 'QUOTED' })], { appliedStatuses: ['QUOTED'] }),
      ),
    );
    await user.selectOptions(statusSelect(), 'QUOTED');
    replayNavigation(view);

    await waitFor(() => {
      expect(screen.getByTestId('request-queue-scope')).toHaveTextContent(
        CUSTOM_REQUEST_QUEUE_COPY.status.quoted,
      );
    });
  });
});

describe('a subject-kind choice', () => {
  it('goes into the URL and into the request', async () => {
    const view = render();
    await screen.findByTestId('request-queue-table');

    await user.selectOptions(subjectSelect(), 'CUSTOMER_OWNED');

    expect(navRouter.replace).toHaveBeenCalledWith('/requests?subject=CUSTOMER_OWNED', {
      scroll: false,
    });
    replayNavigation(view);
    await waitFor(() => {
      expect(lastParams()['subjectKind']).toBe('CUSTOMER_OWNED');
    });
  });
});

describe('the filtered-empty state', () => {
  it('is distinct from a genuinely empty queue, keeps the filter and offers a reset', async () => {
    const view = render();
    await screen.findByTestId('request-queue-table');

    listMock.mockResolvedValue(
      queueEnvelope(makeQueuePage([], { appliedStatuses: ['CANCELLED'] })),
    );
    await user.selectOptions(statusSelect(), 'CANCELLED');
    replayNavigation(view);

    const filterEmpty = await screen.findByTestId('request-queue-filter-empty');
    expect(filterEmpty).toHaveTextContent(CUSTOM_REQUEST_QUEUE_COPY.states.filteredEmptyTitle);
    expect(screen.queryByTestId('request-queue-empty')).not.toBeInTheDocument();
    // The filter the operator set is still visible and still selected.
    expect(statusSelect()).toHaveValue('CANCELLED');
  });

  it('recovers the default queue through the reset', async () => {
    const view = render();
    await screen.findByTestId('request-queue-table');

    listMock.mockResolvedValue(
      queueEnvelope(makeQueuePage([], { appliedStatuses: ['CANCELLED'] })),
    );
    await user.selectOptions(statusSelect(), 'CANCELLED');
    replayNavigation(view);
    await screen.findByTestId('request-queue-filter-empty');

    listMock.mockResolvedValue(queueEnvelope(makeQueuePage([makeQueueItem()])));
    await user.click(screen.getByTestId('request-queue-empty-reset'));

    // A clean address, the default control value and no status on the wire.
    expect(navRouter.replace).toHaveBeenLastCalledWith('/requests', { scroll: false });
    replayNavigation(view);
    await screen.findByTestId('request-queue-table');
    expect(statusSelect()).toHaveValue('triage');
    expect('status' in lastParams()).toBe(false);
  });
});

describe('pagination across a filter change', () => {
  it('drops the previous cursor chain and asks for a fresh first page', async () => {
    listMock.mockResolvedValue(
      queueEnvelope(makeQueuePage([makeQueueItem()], { next: 'cursor-page-2' })),
    );

    const view = render();
    await user.click(await screen.findByTestId('request-queue-load-more'));
    await waitFor(() => {
      expect(lastParams()['cursor']).toBe('cursor-page-2');
    });

    await user.selectOptions(statusSelect(), 'NEW');
    replayNavigation(view);

    await waitFor(() => {
      expect('cursor' in lastParams()).toBe(false);
    });
    expect(lastParams()['status']).toEqual(['NEW']);
  });
});
