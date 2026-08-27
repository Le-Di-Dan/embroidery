/**
 * Which APP9 sections the fulfillment rail renders for the order's current
 * state — and nothing more than that.
 *
 * ## This is presentation, not a lifecycle authority
 *
 * There is no transition table here, no "may this order move to X", no guard and
 * no precondition. LC-14 lives on the server, every one of the five commands
 * re-proves its own preconditions inside its transaction, and each of them will
 * refuse a call this module happened to allow. What this decides is only which
 * of the approved frames is the right one to draw — `809:4`, `811:4`, `812:4`,
 * `815:4` or `815:124` — so that an operator is not offered a control the server
 * would certainly refuse.
 *
 * The consequence matters more than the rule: a capability that is *absent* here
 * is a control that is not drawn, never a control that is drawn and disabled on
 * the strength of a client-side guess.
 *
 * ## Only APP9's own five states are answered
 *
 * `AWAITING_DEPOSIT`, `DEPOSIT_PAID` and `IN_PRODUCTION` belong to APP7 and
 * APP8, and `ON_HOLD`, `CANCELLING`, `CANCELLED` belong to a commercial
 * cancellation flow that is deferred (`PO-APP9-001 = OPTION A — DEFER`). All six
 * get `none`: the APP9 rail renders nothing at all, rather than a card
 * speculating about a state it does not own.
 *
 * Total by construction — an unrecognised value is `none`, so a state the
 * contract gains later cannot make this screen offer a fulfillment action for
 * it.
 */

/** The one APP9 section a state puts in the rail's primary position. */
export type FulfillmentStage =
  /** `809:4` — the balance is not open yet; `TR-LC14-05` is the only action. */
  | 'open-final-payment'
  /** `811:4` — the balance is open and unverified. */
  | 'awaiting-final-payment'
  /** `812:4` — shipping is editable and dispatch is available. */
  | 'shipping'
  /** `815:4` — shipping is frozen and completion is available. */
  | 'delivered'
  /** `815:124` — terminal; every APP9 mutation is gone. */
  | 'completed'
  /** Not an APP9 state. The rail renders nothing. */
  | 'none';

const STAGE_OF: Readonly<Record<string, FulfillmentStage>> = {
  PRODUCTION_COMPLETED: 'open-final-payment',
  AWAITING_FINAL_PAYMENT: 'awaiting-final-payment',
  READY_FOR_DELIVERY: 'shipping',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
};

export function fulfillmentStageOf(status: unknown): FulfillmentStage {
  return (typeof status === 'string' ? STAGE_OF[status] : undefined) ?? 'none';
}

/**
 * Whether the shipping detail is read at all in this stage.
 *
 * `adminOrderShipping_read` is issued from `READY_FOR_DELIVERY` onward and never
 * before: at `PRODUCTION_COMPLETED` the design draws the shipping block as a
 * locked placeholder (`809:86`), and requesting a detail nothing can display yet
 * would spend an Admin round trip to render a card the operator cannot use.
 */
export function readsShippingDetail(stage: FulfillmentStage): boolean {
  return stage === 'shipping' || stage === 'delivered' || stage === 'completed';
}

/**
 * Whether the shipping editor accepts input.
 *
 * Two conditions, both required, and the *stored* one is authoritative: the
 * order must be in the one stage that edits, and the detail's own LC-19 state
 * must say `EDITABLE`. `AdminShippingDetailResponse.status` is what dispatch
 * actually writes, so a detail that reports `FROZEN` is read-only even if the
 * order status has not caught up in this browser's cache.
 */
export function editsShippingDetail(stage: FulfillmentStage, shippingStatus: unknown): boolean {
  return stage === 'shipping' && shippingStatus === 'EDITABLE';
}
