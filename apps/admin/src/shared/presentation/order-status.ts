/**
 * How an order's LC-14 state is named to an operator, for the whole Admin app.
 *
 * Two APP7 screens read it — the order queue (`732:3`, `732:110`) and the order
 * detail (`734:3`, `736:3`) — so it sits in Admin shared scope for the reason
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
 * ## Only three states are drawn, and the rest say so honestly
 *
 * `APP7-D01` draws pills for exactly `AWAITING_DEPOSIT`, `DEPOSIT_PAID` and
 * `IN_PRODUCTION` (`732:3`), and the state matrix (`751:3`) is explicit that
 * APP7 neither produces nor designs screens for the nine states from
 * `IN_PRODUCTION` onward — "hiển thị đúng mã đó một cách trung tính thay vì
 * đoán nghĩa". The eight undrawn states therefore carry the approved Vietnamese
 * label from the queue's own filter list (`732:110`, which enumerates all
 * eleven) but a **neutral** tone: naming them is what the filter requires,
 * tinting them would be APP7 inventing a semantic for a state APP8/APP9 own.
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
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.idle,
  },
  AWAITING_FINAL_PAYMENT: {
    label: 'Chờ thanh toán cuối',
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.idle,
  },
  READY_FOR_DELIVERY: {
    label: 'Sẵn sàng giao',
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.idle,
  },
  DELIVERED: { label: 'Đã giao', tone: 'neutral', symbol: STATUS_SYMBOLS.idle },
  COMPLETED: { label: 'Hoàn tất', tone: 'neutral', symbol: STATUS_SYMBOLS.idle },
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
