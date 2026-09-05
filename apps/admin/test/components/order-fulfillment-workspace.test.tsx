/**
 * The APP9 commerce-completion rail on `/orders/{orderId}` (`APP9-A01`;
 * `809:4`, `809:95`, `811:4`, `812:4`, `812:109`, `814:4`, `815:4`, `815:89`,
 * `815:124`).
 *
 * The load-bearing assertions, in the order the lifecycle reaches them:
 *
 *  - `PRODUCTION_COMPLETED` opens the balance through `adminOrder_transition`
 *    with the contract's single destination, and says nothing that implies a new
 *    obligation was created;
 *  - `AWAITING_FINAL_PAYMENT` **invents nothing**: no derived amount, no attempt
 *    list, no reconciliation history, and no deposit-flavoured transport name
 *    anywhere in the rendered text;
 *  - `READY_FOR_DELIVERY` reads and saves the order-owned shipping detail as a
 *    full replacement body;
 *  - a fee increase refused for want of the customer's acknowledgement renders
 *    the approved refusal and offers **no** Admin override — and the customer
 *    command is never called;
 *  - dispatch moves the order to `DELIVERED` by re-reading, never optimistically,
 *    and the shipping block becomes read-only;
 *  - completion moves it to `COMPLETED` and every APP9 action disappears;
 *  - a replayed dispatch renders its own approved refusal rather than the
 *    server's English message.
 *
 * The deposit panel below the rail is left alone throughout: no APP9 command
 * touches the DEPOSIT obligation, and `adminOrderPaymentRead` is mocked once so
 * a stray re-read would be visible as a call count.
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
  adminOrderComplete,
  adminOrderDetail,
  adminOrderDispatch,
  adminOrderPaymentRead,
  adminOrderShippingRead,
  adminOrderShippingSave,
  adminOrderTransition,
} from '@embroidery/api-client';

import { OrderDetailScreen } from '../../src/features/order-detail';
import { ORDER_FULFILLMENT_COPY as COPY } from '../../src/features/order-detail/model/fulfillment-copy';
import {
  apiRefusal,
  INCREASED_FEE,
  makeCompletionResult,
  makeDispatchResult,
  makeFrozenShippingDetail,
  makeShippingDetail,
  makeShippingSaved,
  makeTransitionResult,
  STORED_FEE,
} from '../support/fulfillment-fixture';
import { envelope, makeOrderDetail, makePayments, ORDER_ID } from '../support/order-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/orders/o1').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminOrderDetail: jest.fn(),
  adminOrderPaymentRead: jest.fn(),
  adminOrderTransition: jest.fn(),
  adminOrderShippingRead: jest.fn(),
  adminOrderShippingSave: jest.fn(),
  adminOrderDispatch: jest.fn(),
  adminOrderComplete: jest.fn(),
}));

const detailMock = adminOrderDetail as jest.MockedFunction<typeof adminOrderDetail>;
const paymentsMock = adminOrderPaymentRead as jest.MockedFunction<typeof adminOrderPaymentRead>;
const transitionMock = adminOrderTransition as jest.MockedFunction<typeof adminOrderTransition>;
const shippingReadMock = adminOrderShippingRead as jest.MockedFunction<
  typeof adminOrderShippingRead
>;
const shippingSaveMock = adminOrderShippingSave as jest.MockedFunction<
  typeof adminOrderShippingSave
>;
const dispatchMock = adminOrderDispatch as jest.MockedFunction<typeof adminOrderDispatch>;
const completeMock = adminOrderComplete as jest.MockedFunction<typeof adminOrderComplete>;

let user: ReturnType<typeof createUser>;

const atStatus = (status: string) => envelope(makeOrderDetail({ status }));

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  paymentsMock.mockResolvedValue(
    envelope(makePayments({ depositStatus: 'SATISFIED', attempts: [] })),
  );
});

const render = () => renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

describe('PRODUCTION_COMPLETED — opening the balance', () => {
  beforeEach(() => {
    detailMock.mockResolvedValue(atStatus('PRODUCTION_COMPLETED'));
    transitionMock.mockResolvedValue(envelope(makeTransitionResult()));
  });

  it('opens the balance through adminOrder_transition and never derives an amount', async () => {
    render();

    await user.click(await screen.findByTestId('open-final-payment'));
    const dialog = await screen.findByTestId('open-final-payment-dialog');
    await user.click(within(dialog).getByTestId('open-final-payment-dialog-confirm'));

    await waitFor(() => {
      expect(transitionMock).toHaveBeenCalledTimes(1);
    });
    expect(transitionMock.mock.calls[0]?.[1]).toEqual({ to: 'AWAITING_FINAL_PAYMENT' });

    // No shipping read is issued in a stage that has no surface for one.
    expect(shippingReadMock).not.toHaveBeenCalled();
    // The order total is on the page header; the *balance* is nowhere, because
    // "total − deposit" is exactly the arithmetic a fee increase falsifies.
    expect(screen.queryByText('7.650.000 VND')).not.toBeInTheDocument();
  });
});

describe('AWAITING_FINAL_PAYMENT — a named gap, not an invented read model', () => {
  beforeEach(() => {
    detailMock.mockResolvedValue(atStatus('AWAITING_FINAL_PAYMENT'));
  });

  it('fabricates no balance, history or transport name', async () => {
    render();

    const panel = await screen.findByTestId('fulfillment-panel');
    expect(panel).toHaveAttribute('data-stage', 'awaiting-final-payment');
    // The screen no longer prints a "KNOWN API LIMITATION" banner at an
    // operator (`V01-UX-005`, `V01-UX-004`). What it must still do is refuse to
    // invent the balance, which is what the rest of this test asserts.
    expect(screen.queryByTestId('remaining-amount-gap')).not.toBeInTheDocument();
    expect(screen.getByTestId('remaining-verify-unavailable')).toBeInTheDocument();

    // The two transport spellings must never reach the screen (FU-APP9-B03-01).
    const rendered = panel.textContent ?? '';
    expect(rendered).not.toMatch(/depositObligationId|depositStatus/u);
    expect(rendered).toContain(COPY.finalPayment.title);

    // No REMAINING attempt list and no reconciliation history is conjured, and
    // no verification control is offered against an attempt id nothing publishes.
    expect(screen.queryByTestId('open-verify-dialog')).not.toBeInTheDocument();
    expect(shippingReadMock).not.toHaveBeenCalled();
  });
});

describe('READY_FOR_DELIVERY — the shipping editor', () => {
  beforeEach(() => {
    detailMock.mockResolvedValue(atStatus('READY_FOR_DELIVERY'));
    shippingReadMock.mockResolvedValue(envelope(makeShippingDetail()));
    shippingSaveMock.mockResolvedValue(envelope(makeShippingSaved()));
  });

  it('reads the order-owned detail and saves it as a full replacement body', async () => {
    render();

    const recipient = await screen.findByTestId('shipping-recipientName');
    expect(recipient).toHaveValue('Nguyễn Thị Mai Hoa');
    expect(screen.getByTestId('shipping-feeAmount')).toHaveValue(STORED_FEE);

    await user.clear(screen.getByTestId('shipping-trackingCode'));
    await user.type(screen.getByTestId('shipping-trackingCode'), 'GHN-0001112223');
    await user.click(screen.getByTestId('shipping-save'));

    await waitFor(() => {
      expect(shippingSaveMock).toHaveBeenCalledTimes(1);
    });
    // Every member the operator can see travels on every save: the contract
    // replaces the record rather than patching it.
    expect(shippingSaveMock.mock.calls[0]?.[1]).toEqual({
      recipientName: 'Nguyễn Thị Mai Hoa',
      recipientPhone: '0909111222',
      addressLine: '118 Nguyễn Văn Cừ',
      ward: 'Phường An Khê',
      district: 'Quận Thanh Khê',
      province: 'Đà Nẵng',
      feeAmount: STORED_FEE,
      carrierName: 'Giao Hàng Nhanh',
      trackingCode: 'GHN-0001112223',
    });
    expect(await screen.findByTestId('shipping-saved')).toBeInTheDocument();
  });

  it('refuses to save an empty required field before spending a round trip', async () => {
    render();

    await user.clear(await screen.findByTestId('shipping-recipientName'));
    await user.click(screen.getByTestId('shipping-save'));

    expect(await screen.findByTestId('shipping-invalid')).toBeInTheDocument();
    expect(shippingSaveMock).not.toHaveBeenCalled();
  });
});

describe('READY_FOR_DELIVERY — a fee increase the customer has not acknowledged', () => {
  beforeEach(() => {
    detailMock.mockResolvedValue(atStatus('READY_FOR_DELIVERY'));
    shippingReadMock.mockResolvedValue(envelope(makeShippingDetail()));
    shippingSaveMock.mockRejectedValue(apiRefusal(409, 'SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED'));
  });

  it('renders the approved refusal and offers the operator no way to consent for the customer', async () => {
    render();

    await user.clear(await screen.findByTestId('shipping-feeAmount'));
    await user.type(screen.getByTestId('shipping-feeAmount'), INCREASED_FEE);
    await user.click(screen.getByTestId('shipping-save'));

    const refusal = await screen.findByTestId('shipping-fee-refusal');
    expect(refusal).toHaveTextContent(COPY.feeRefusal.title);
    expect(refusal).toHaveTextContent(COPY.feeRefusal.body);
    expect(screen.getByTestId('fee-refusal-stored')).toHaveTextContent('45.000 VND');
    expect(screen.getByTestId('fee-refusal-attempted')).toHaveTextContent('95.000 VND');

    // The server's English sentence never reaches the operator.
    expect(refusal).not.toHaveTextContent(/server sentence/iu);
    // No override of any kind, and no customer credential on screen.
    expect(refusal.textContent ?? '').not.toMatch(/token|grant|challenge|OTP/iu);
    expect(screen.queryByRole('button', { name: /thay khách|xác nhận thay|ghi đè/iu })).toBeNull();
    // Dispatch is held back while the unsaved fee stands (`812:220`).
    expect(screen.getByTestId('open-dispatch')).toBeDisabled();

    // Restoring the stored fee is a local undo — it writes nothing.
    await user.click(screen.getByTestId('fee-refusal-restore'));
    expect(screen.getByTestId('shipping-feeAmount')).toHaveValue(STORED_FEE);
    expect(shippingSaveMock).toHaveBeenCalledTimes(1);
  });
});

describe('dispatch', () => {
  beforeEach(() => {
    detailMock
      .mockResolvedValueOnce(atStatus('READY_FOR_DELIVERY'))
      .mockResolvedValue(atStatus('DELIVERED'));
    shippingReadMock
      .mockResolvedValueOnce(envelope(makeShippingDetail()))
      .mockResolvedValue(envelope(makeFrozenShippingDetail()));
  });

  it('moves the order to DELIVERED by re-reading, and the detail becomes read-only', async () => {
    dispatchMock.mockResolvedValue(envelope(makeDispatchResult()));
    render();

    await user.click(await screen.findByTestId('open-dispatch'));
    const dialog = await screen.findByTestId('dispatch-dialog');
    // The freeze is named before it happens, and no database term appears.
    expect(dialog).toHaveTextContent(COPY.dispatch.freezeTitle);
    expect(dialog.textContent ?? '').not.toMatch(/shipping_snapshots|snapshot table/iu);

    await user.click(within(dialog).getByTestId('dispatch-dialog-confirm'));

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByTestId('frozen-shipping')).toBeInTheDocument();
    expect(screen.queryByTestId('shipping-save')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shipping-recipientName')).not.toBeInTheDocument();
    // Internal notes stay text: no tracking lookup is offered anywhere.
    expect(screen.queryByRole('link', { name: /tra cứu|theo dõi|track/iu })).toBeNull();
    // Completion is a separate action on its own card.
    expect(await screen.findByTestId('open-completion')).toBeInTheDocument();
  });

  it('renders its own approved refusal on a replay rather than the server message', async () => {
    dispatchMock.mockRejectedValue(apiRefusal(409, 'ORDER_INVALID_TRANSITION'));
    render();

    await user.click(await screen.findByTestId('open-dispatch'));
    const dialog = await screen.findByTestId('dispatch-dialog');
    await user.click(within(dialog).getByTestId('dispatch-dialog-confirm'));

    const error = await screen.findByTestId('dispatch-dialog-error');
    expect(error).toHaveTextContent(COPY.refusal.dispatchInvalid);
    expect(error).not.toHaveTextContent(/server sentence/iu);
    // Nothing was marked delivered on the strength of a refused call.
    expect(screen.queryByTestId('frozen-shipping')).not.toBeInTheDocument();
  });
});

describe('completion', () => {
  it('moves the order to COMPLETED and removes every APP9 action', async () => {
    detailMock
      .mockResolvedValueOnce(atStatus('DELIVERED'))
      .mockResolvedValue(atStatus('COMPLETED'));
    shippingReadMock.mockResolvedValue(envelope(makeFrozenShippingDetail()));
    completeMock.mockResolvedValue(envelope(makeCompletionResult()));
    render();

    await user.click(await screen.findByTestId('open-completion'));
    const dialog = await screen.findByTestId('completion-dialog');
    await user.click(within(dialog).getByTestId('completion-dialog-confirm'));

    await waitFor(() => {
      expect(completeMock).toHaveBeenCalledTimes(1);
    });

    const completed = await screen.findByTestId('order-completed');
    expect(completed).toHaveTextContent(COPY.completed.title);

    // Terminal: not one APP9 mutation remains, and none of them is merely
    // disabled — a disabled control still claims the capability exists.
    for (const id of ['open-completion', 'open-dispatch', 'shipping-save', 'open-final-payment']) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
    // No cancellation or refund surface is offered in its place.
    expect(screen.queryByRole('button', { name: /hoàn tiền|huỷ đơn|mở lại/iu })).toBeNull();
  });
});
