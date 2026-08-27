/**
 * The `/orders` queue extended for the five APP9 fulfillment states
 * (`APP9-A01`; `FIG-APP9-A01-ORDERS-FULFILLMENT-DESKTOP` `808:4`,
 * `FIG-APP9-A01-ORDERS-FILTEROPEN-DESKTOP` `808:100`).
 *
 * The load-bearing assertions:
 *
 *  - all five APP9 states render with the tone `808:4` draws for each, so an
 *    operator can pick fulfillment work out of a mixed queue by sight;
 *  - filtering by them sends exactly the repeatable `status` parameter
 *    `adminOrder_list` already publishes — APP9 adds no second queue, no new
 *    parameter and no pagination change;
 *  - the three states no delivered phase owns stay **neutral**, so the tone is
 *    a claim about drawn design rather than about the enum's length.
 *
 * There is deliberately no assertion about a deposit or remaining-amount column.
 * `AdminOrderQueueItemResponse` carries `totalAmount` and nothing else about
 * money, so the two the approved frame sketches cannot be rendered from any
 * delivered read — recorded in the A01 report rather than faked here.
 */
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import { adminOrderList } from '@embroidery/api-client';

import { OrderQueueScreen } from '../../src/features/order-queue';
import { presentOrderStatus } from '../../src/shared/presentation/order-status';
import { envelope, makeQueueItem, makeQueuePage } from '../support/order-fixture';

jest.mock('next/navigation', () => {
  const state = { search: '' };
  const router = {
    replace: jest.fn((url: string) => {
      state.search = url.split('?')[1] ?? '';
    }),
    push: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  };
  return {
    __state: state,
    useRouter: () => router,
    usePathname: () => '/orders',
    useSearchParams: () => new URLSearchParams(state.search),
  };
});

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminOrderList: jest.fn(),
}));

import * as navigation from 'next/navigation';

const navState = (navigation as unknown as { __state: { search: string } }).__state;
const listMock = adminOrderList as jest.MockedFunction<typeof adminOrderList>;

const FULFILLMENT_STATES = [
  'PRODUCTION_COMPLETED',
  'AWAITING_FINAL_PAYMENT',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
] as const;

const lastParams = () =>
  (listMock.mock.calls[listMock.mock.calls.length - 1] as unknown as [Record<string, unknown>])[0];

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  navState.search = '';
  user = createUser();
  listMock.mockResolvedValue(
    envelope(
      makeQueuePage(
        FULFILLMENT_STATES.map((status, index) =>
          makeQueueItem({
            orderId: `01950000-0000-7000-8000-00000000010${index}`,
            code: `ORD-FULFILL${index}`,
            status,
          }),
        ),
      ),
    ),
  );
});

describe('APP9 fulfillment states in the order queue', () => {
  it('renders each of the five with the tone 808:4 draws for it', async () => {
    renderWithProviders(<OrderQueueScreen />);

    const rows = await screen.findAllByTestId('order-queue-status');
    expect(rows).toHaveLength(FULFILLMENT_STATES.length);

    const drawn = rows.map((badge) => [
      badge.getAttribute('data-status'),
      badge.className.replace(/^.*admin-status--/u, ''),
    ]);
    expect(drawn).toEqual([
      ['PRODUCTION_COMPLETED', 'info'],
      ['AWAITING_FINAL_PAYMENT', 'warning'],
      ['READY_FOR_DELIVERY', 'info'],
      ['DELIVERED', 'success'],
      ['COMPLETED', 'success'],
    ]);
  });

  it('leaves the three states no delivered phase owns neutral', () => {
    for (const status of ['ON_HOLD', 'CANCELLING', 'CANCELLED']) {
      const presentation = presentOrderStatus(status);
      expect(presentation.known).toBe(true);
      expect(presentation.tone).toBe('neutral');
    }
  });

  it('filters by a fulfillment state through the existing repeatable parameter', async () => {
    const view = renderWithProviders(<OrderQueueScreen />);
    await screen.findAllByTestId('order-queue-status');

    await user.click(screen.getByTestId('order-filter-READY_FOR_DELIVERY'));
    // The App Router would re-render on `router.replace`; the mock only records
    // the new URL, so the replay is explicit. The `APP7-A01` convention.
    view.rerender(<OrderQueueScreen />);

    await waitFor(() => {
      expect(lastParams()['status']).toEqual(['READY_FOR_DELIVERY']);
    });
  });
});
