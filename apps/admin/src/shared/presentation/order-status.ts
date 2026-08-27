/**
 * How an order's LC-14 state is named to an operator, for the whole Admin app.
 *
 * Two APP7 screens read it — the order queue (`732:3`, `732:110`) and the order
 * detail (`734:3`, `736:3`) — and `APP9-A01` extends both rather than adding a
 * screen, so it sits in Admin shared scope for the reason
 * `request-status.ts` does: an order must not change its name as the operator
 * moves between the list and the order it opened.
 *
 * ## It is presentation, and only presentation
 *
 * There is no lifecycle authority here: no transition table, no action matrix,
 * no "can this order move to X", no ordering beyond the contract's own. Those
 * are server facts, and a helper that answered them would become a second
 * lifecycle authority living in the browser.
 *
 * ## A state is tinted only once a phase has drawn it
 *
 * `APP7-D01` drew pills for `AWAITING_DEPOSIT`, `DEPOSIT_PAID` and
 * `IN_PRODUCTION` (`732:3`); `APP9-D01` drew the five fulfillment states on
 * the same table (`FIG-APP9-A01-ORDERS-FULFILLMENT-DESKTOP`, `808:4`) and on
 * the detail header of each workspace it owns. Those eight carry their drawn
 * tone.
 *
 * The remaining three — `ON_HOLD`, `CANCELLING`, `CANCELLED` — stay
 * **neutral**. They carry the approved Vietnamese label from the queue's own
 * filter list (`732:110`, which enumerates all eleven) because naming them is
 * what the filter requires, but tinting them would be inventing a semantic for
 * a state no delivered phase owns: commercial cancellation is deferred
 * (`PO-APP9-001 = OPTION A — DEFER`).
 *
 * ## Total by construction
 *
 * `presentOrderStatus` accepts `unknown` and always returns a presentation. A
 * state the contract gains later degrades to the neutral fallback rather than
 * putting a raw English enum member on an otherwise Vietnamese page.
 */
import type { AdminStatusTone } from '../status/admin-status-badge';

/** The `753:120` symbol vocabulary, fixed for the whole phase. */
export const STATUS_SYMBOLS = {
  /** Not started. */
  idle: '○',
  /** Waiting on something outside the system. */
  waiting: '◷',
  /** Being worked or reconciled. */
  working: '◐',
  /** Running. */
  running: '▶',
  succeeded: '✓',
  ended: '✕',
} as const;

export interface StatusPresentation {
  /** The stored value when this build has a label for it, else `UNKNOWN`. */
  readonly token: string;
  readonly label: string;
  readonly tone: AdminStatusTone;
  readonly symbol: string;
  readonly known: boolean;
}

interface StatusStyle {
  readonly label: string;
  readonly tone: AdminStatusTone;
  readonly symbol: string;
}

/**
 * The eleven LC-14 states, labelled exactly as `732:110` enumerates them.
 *
 * The three APP7 draws carry their drawn tone and symbol; the eight it does not
 * stay neutral. The map is a lookup over strings the contract already publishes
 * — adding a key here would not make the server accept one.
 */
const ORDER_STATUS_STYLES: Readonly<Record<string, StatusStyle>> = {
  AWAITING_DEPOSIT: {
    label: 'Chờ đặt cọc',
    tone: 'warning',
    symbol: STATUS_SYMBOLS.waiting,
  },
  DEPOSIT_PAID: {
    label: 'Đã xác nhận cọc',
    tone: 'success',
    symbol: STATUS_SYMBOLS.succeeded,
  },
  IN_PRODUCTION: { label: 'Đang sản xuất', tone: 'info', symbol: STATUS_SYMBOLS.running },
  PRODUCTION_COMPLETED: {
    label: 'Sản xuất xong',
    tone: 'info',
    symbol: STATUS_SYMBOLS.working,
  },
  AWAITING_FINAL_PAYMENT: {
    label: 'Chờ thanh toán cuối',
    tone: 'warning',
    symbol: STATUS_SYMBOLS.waiting,
  },
  READY_FOR_DELIVERY: {
    label: 'Sẵn sàng giao',
    tone: 'info',
    symbol: STATUS_SYMBOLS.running,
  },
  DELIVERED: { label: 'Đã giao', tone: 'success', symbol: STATUS_SYMBOLS.succeeded },
  COMPLETED: { label: 'Hoàn tất', tone: 'success', symbol: STATUS_SYMBOLS.succeeded },
  ON_HOLD: { label: 'Tạm giữ', tone: 'neutral', symbol: STATUS_SYMBOLS.idle },
  CANCELLING: { label: 'Đang huỷ', tone: 'neutral', symbol: STATUS_SYMBOLS.idle },
  CANCELLED: { label: 'Đã huỷ', tone: 'neutral', symbol: STATUS_SYMBOLS.idle },
};

/** The neutral fallback, for a state this build has no approved label for. */
export const UNKNOWN_ORDER_STATUS_LABEL = 'Không xác định';

export function presentOrderStatus(status: unknown): StatusPresentation {
  const style = typeof status === 'string' ? ORDER_STATUS_STYLES[status] : undefined;
  if (style === undefined) {
    return {
      token: 'UNKNOWN',
      label: UNKNOWN_ORDER_STATUS_LABEL,
      tone: 'neutral',
      symbol: STATUS_SYMBOLS.idle,
      known: false,
    };
  }
  return { token: status as string, ...style, known: true };
}

/** The label alone, for prose that names a state inline. */
export function orderStatusLabel(status: unknown): string {
  return presentOrderStatus(status).label;
}
