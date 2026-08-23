/**
 * The frozen half of the Admin order workspace (`APP7-A01`; `734:3`, `736:3`).
 *
 * The assertions are about what the screen refuses to invent:
 *
 *  - an absent `sizeLabel` is reported as absent, never rebuilt from a variant;
 *  - a customer-owned line is never given a SKU or a variant;
 *  - no Catalog operation is reachable from this capability at all, so a future
 *    edit could not enrich a historical line even by mistake;
 *  - money is transported as a string and never re-summed.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  within,
} from '@embroidery/frontend-testing';
import { adminOrderDetail, adminOrderPaymentRead } from '@embroidery/api-client';

import { OrderDetailScreen } from '../../src/features/order-detail';
import { ORDER_DETAIL_COPY as COPY } from '../../src/features/order-detail/model/order-detail-copy';
import { makeApiClientError } from '../support/api-error';
import {
  envelope,
  makeCatalogItem,
  makeOrderDetail,
  makePayments,
  ORDER_ID,
} from '../support/order-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock(`/orders/${'o1'}`).module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminOrderDetail: jest.fn(),
  adminOrderPaymentRead: jest.fn(),
}));

const detailMock = adminOrderDetail as jest.MockedFunction<typeof adminOrderDetail>;
const paymentsMock = adminOrderPaymentRead as jest.MockedFunction<typeof adminOrderPaymentRead>;

beforeEach(() => {
  jest.clearAllMocks();
  detailMock.mockResolvedValue(envelope(makeOrderDetail()));
  paymentsMock.mockResolvedValue(envelope(makePayments()));
});

const render = () => renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

describe('the generated boundary', () => {
  it('reads the order and its payments once each, addressed by order id', async () => {
    render();
    await screen.findByTestId('order-detail-code');

    expect(detailMock).toHaveBeenCalledTimes(1);
    expect(detailMock.mock.calls[0]?.[0]).toBe(ORDER_ID);
    expect(paymentsMock).toHaveBeenCalledTimes(1);
    expect(paymentsMock.mock.calls[0]?.[0]).toBe(ORDER_ID);
  });

  it('imports no Catalog operation anywhere in the capability', () => {
    // Not merely unused: the read seam exports three functions and none of them
    // reaches Catalog, so a historical order line cannot be enriched from live
    // product data even by a careless later edit.
    const readService = jest.requireActual<Record<string, unknown>>(
      '../../src/features/order-detail/services/order-detail.service',
    );
    expect(Object.keys(readService).sort()).toEqual([
      'fetchOrderDetail',
      'fetchOrderPayments',
      'fetchPaymentEvidence',
    ]);
  });
});

describe('frozen order facts', () => {
  it('renders the order as stored, with its own currency', async () => {
    render();

    expect(await screen.findByTestId('order-detail-code')).toHaveTextContent('ORD-K7M2Q9XR4T');
    expect(screen.getByTestId('order-detail-total')).toHaveTextContent('12.750.000 VND');
    expect(screen.getByTestId('order-detail-status')).toHaveTextContent('Chờ đặt cọc');
  });

  it('never converts a total to a number', async () => {
    detailMock.mockResolvedValue(envelope(makeOrderDetail({ totalAmount: '999999999999.00' })));
    render();

    expect(await screen.findByTestId('order-detail-total')).toHaveTextContent(
      '999.999.999.999 VND',
    );
  });
});

describe('frozen order lines', () => {
  it('renders each line in position order with its transported figures', async () => {
    render();
    const rows = await screen.findAllByTestId('order-item-row');

    expect(rows).toHaveLength(2);
    const first = within(rows[0] as HTMLElement);
    expect(first.getByText('Áo thun cotton premium')).toBeInTheDocument();
    expect(first.getByText('2.150.000')).toBeInTheDocument();
    // The accepted line total, transported — never `unitPrice × quantity`.
    expect(first.getByText('6.450.000')).toBeInTheDocument();
  });

  it('reports an absent size as absent rather than fabricating one', async () => {
    render();
    const rows = await screen.findAllByTestId('order-item-row');
    const size = within(rows[0] as HTMLElement).getByTestId('order-item-size');

    expect(size).toHaveTextContent(COPY.items.absentNote);
    // The variant is present on this line and must not become the size label.
    expect(size).not.toHaveTextContent('Trắng / M');
    expect(screen.getByTestId('order-items-size-note')).toBeInTheDocument();
  });

  it('renders a stored size when the order actually froze one', async () => {
    detailMock.mockResolvedValue(
      envelope(makeOrderDetail({ items: [makeCatalogItem({ sizeLabel: 'M' })] })),
    );
    render();
    const size = within(
      (await screen.findAllByTestId('order-item-row'))[0] as HTMLElement,
    ).getByTestId('order-item-size');

    expect(size).toHaveTextContent('M');
    // The explanatory note is about absence, so it disappears when nothing is absent.
    expect(screen.queryByTestId('order-items-size-note')).not.toBeInTheDocument();
  });

  it('keeps the Catalog and customer-owned branches distinguishable and truthful', async () => {
    render();
    const rows = await screen.findAllByTestId('order-item-row');

    expect(rows[0]).toHaveAttribute('data-kind', 'CATALOG');
    expect(within(rows[0] as HTMLElement).getByText(/SKU/)).toBeInTheDocument();

    const cop = within(rows[1] as HTMLElement);
    expect(rows[1]).toHaveAttribute('data-kind', 'CUSTOMER_OWNED');
    expect(cop.getByText(COPY.items.customerOwnedNote)).toBeInTheDocument();
    // No SKU value and no variant is invented for a product the customer
    // already owned — the note says "không có SKU", it does not print one.
    expect((rows[1] as HTMLElement).textContent).not.toMatch(/SKU\s+\w{4}…/);
    expect(cop.queryByText(/biến thể/)).not.toBeInTheDocument();
  });

  it('shows nothing rather than the customer-owned note when a catalog line stored no ids', async () => {
    detailMock.mockResolvedValue(
      envelope(
        makeOrderDetail({
          items: [makeCatalogItem({ skuId: undefined, variantLabel: undefined })],
        }),
      ),
    );
    render();
    const row = within((await screen.findAllByTestId('order-item-row'))[0] as HTMLElement);

    expect(row.queryByText(COPY.items.customerOwnedNote)).not.toBeInTheDocument();
  });
});

describe('read failures', () => {
  it('does not distinguish a missing order from one that is not readable', async () => {
    detailMock.mockRejectedValue(makeApiClientError({ status: 403, code: 'FORBIDDEN' }));
    render();

    expect(await screen.findByTestId('order-detail-error')).toHaveTextContent(
      COPY.failure.detailMissingTitle,
    );
    // A refusal will be refused again, so no retry is offered for it.
    expect(screen.queryByTestId('order-detail-retry')).not.toBeInTheDocument();
  });

  it('offers a retry only in the transport band, and leaks no server text', async () => {
    detailMock.mockRejectedValue(
      makeApiClientError({ status: 503, code: 'UPSTREAM', message: 'pg pool exhausted' }),
    );
    render();

    const failure = await screen.findByTestId('order-detail-error');
    expect(screen.getByTestId('order-detail-retry')).toBeInTheDocument();
    expect(failure.textContent).not.toContain('pg pool');
    expect(failure.textContent).not.toContain('UPSTREAM');
  });
});
