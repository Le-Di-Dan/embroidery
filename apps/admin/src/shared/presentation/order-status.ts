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
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import type { AdminStatusTone } from '../status/admin-status-badge';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-orders.json`, under `statusLabels`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const statusLabelsMessage = messageView(VI_MESSAGES.adminOrders, 'statusLabels');

/** The label both applications use for a value the server did not classify. */
const commonMessage = messageView(VI_MESSAGES.common);

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
    label: statusLabelsMessage.text('AWAITING_DEPOSIT.label'),
    tone: 'warning',
    symbol: STATUS_SYMBOLS.waiting,
  },
  DEPOSIT_PAID: {
    label: statusLabelsMessage.text('DEPOSIT_PAID.label'),
    tone: 'success',
    symbol: STATUS_SYMBOLS.succeeded,
  },
  IN_PRODUCTION: {
    label: statusLabelsMessage.text('IN_PRODUCTION.label'),
    tone: 'info',
    symbol: STATUS_SYMBOLS.running,
  },
  PRODUCTION_COMPLETED: {
    label: statusLabelsMessage.text('PRODUCTION_COMPLETED.label'),
    tone: 'info',
    symbol: STATUS_SYMBOLS.working,
  },
  AWAITING_FINAL_PAYMENT: {
    label: statusLabelsMessage.text('AWAITING_FINAL_PAYMENT.label'),
    tone: 'warning',
    symbol: STATUS_SYMBOLS.waiting,
  },
  // The two Ready-Made states (`APP12-A02-C1`, `912:337` and `913:337`). Both
  // are drawn, so both carry their drawn tone and symbol rather than the
  // neutral fallback the untinted eleven use.
  //
  // `Chờ báo phí` is `912:337`'s wording, used on the filter checkbox and the
  // queue row. `913:337` draws the detail badge as `Chờ báo phí giao hàng`;
  // this module publishes **one** name per state on purpose — an order must not
  // change what it is called as the operator moves from the list to the order
  // they opened — so the queue's shorter form is the one name, and the longer
  // one reads as an expansion of it rather than a second label.
  AWAITING_SHIPPING_FEE: {
    label: statusLabelsMessage.text('AWAITING_SHIPPING_FEE.label'),
    tone: 'warning',
    symbol: STATUS_SYMBOLS.waiting,
  },
  AWAITING_PAYMENT: {
    label: statusLabelsMessage.text('AWAITING_PAYMENT.label'),
    tone: 'warning',
    symbol: STATUS_SYMBOLS.waiting,
  },
  READY_FOR_DELIVERY: {
    label: statusLabelsMessage.text('READY_FOR_DELIVERY.label'),
    tone: 'info',
    symbol: STATUS_SYMBOLS.running,
  },
  DELIVERED: {
    label: statusLabelsMessage.text('DELIVERED.label'),
    tone: 'success',
    symbol: STATUS_SYMBOLS.succeeded,
  },
  COMPLETED: {
    label: statusLabelsMessage.text('COMPLETED.label'),
    tone: 'success',
    symbol: STATUS_SYMBOLS.succeeded,
  },
  ON_HOLD: {
    label: statusLabelsMessage.text('ON_HOLD.label'),
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.idle,
  },
  CANCELLING: {
    label: statusLabelsMessage.text('CANCELLING.label'),
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.idle,
  },
  CANCELLED: {
    label: statusLabelsMessage.text('CANCELLED.label'),
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.idle,
  },
};

/** The neutral fallback, for a state this build has no approved label for. */
export const UNKNOWN_ORDER_STATUS_LABEL = commonMessage.text('value.unknown');

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
