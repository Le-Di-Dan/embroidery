/**
 * The one approved queue filter and its wire mapping (`732:3`, `732:110`).
 *
 * `adminOrder_list` publishes exactly three parameters — a **repeatable**
 * `status`, `limit` and `cursor` — and `732:3` says so on the screen itself.
 * There is deliberately no text search, no product or SKU filter, no provider
 * filter, no evidence filter, no inventory filter and no date range here: an
 * exact-match control the API cannot serve is a promise the queue could not
 * keep, and none of them appears in the consumed design authority.
 *
 * ### Selecting nothing means sending nothing
 *
 * The approved control is a multi-select of the **eleven** contract values with
 * a "Tất cả" resting state (`732:110`, "2 đã chọn"). An empty selection omits
 * the parameter entirely rather than sending a sentinel the API does not
 * define, and `APP7-B02` then answers with every LC-14 state — which is what it
 * documents: orders have no canonical triage subset, so none is invented.
 *
 * Reading is total — an arbitrary, repeated or hand-edited URL value is dropped
 * and never echoed into the DOM.
 */
import { AdminOrderListStatusItem } from '@embroidery/api-client';
import type { AdminOrderListParams } from '@embroidery/api-client';

import { orderStatusLabel } from '../../../shared/presentation/order-status';

export type OrderStatusFilterValue =
  (typeof AdminOrderListStatusItem)[keyof typeof AdminOrderListStatusItem];

export interface OrderQueueFilters {
  /** The selected LC-14 states. Empty means "send no `status`". */
  readonly statuses: readonly OrderStatusFilterValue[];
}

export const DEFAULT_ORDER_QUEUE_FILTERS: OrderQueueFilters = { statuses: [] };

/** The URL parameter this screen owns. */
export const ORDER_QUEUE_STATUS_PARAM = 'status';

export interface OrderStatusFilterOption {
  readonly value: OrderStatusFilterValue;
  readonly label: string;
}

/**
 * The eleven options, in the contract's own declaration order.
 *
 * Derived from the generated enum rather than hand-listed, so a state the
 * contract gains or loses cannot leave a stale checkbox behind; the label comes
 * from the shared presentation module, so it is the same word the badge uses.
 */
export const ORDER_STATUS_FILTER_OPTIONS: readonly OrderStatusFilterOption[] = Object.values(
  AdminOrderListStatusItem,
).map((value) => ({ value, label: orderStatusLabel(value) }));

const KNOWN_VALUES = new Set<string>(Object.values(AdminOrderListStatusItem));

/** A raw URL/query value, which may be absent, repeated or arbitrary. */
export type RawFilterValue = string | readonly string[] | undefined;

/**
 * Total by construction: every input produces valid filters.
 *
 * Unrecognised tokens are dropped rather than passed through — the queue must
 * not send the server a status it does not publish — and duplicates collapse,
 * so a hand-edited `?status=X&status=X` addresses the same cache entry as one.
 * The contract's declaration order is preserved so the selection reads the same
 * way regardless of how the URL spelled it.
 */
export function normalizeOrderQueueFilters(raw: RawFilterValue): OrderQueueFilters {
  // Narrowed on `typeof` rather than `Array.isArray`, which widens a readonly
  // tuple to `any[]` and would let an unchecked value through.
  const tokens: readonly string[] = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
  const chosen = new Set(tokens.filter((token) => KNOWN_VALUES.has(token)));
  return {
    statuses: ORDER_STATUS_FILTER_OPTIONS.filter((option) => chosen.has(option.value)).map(
      (option) => option.value,
    ),
  };
}

/**
 * The request parameters for a set of filters.
 *
 * The contract's parameter is repeatable, so the selection is sent as an array;
 * an empty selection sends nothing at all.
 */
export function toOrderListParams(
  filters: OrderQueueFilters,
): Pick<AdminOrderListParams, 'status'> {
  return filters.statuses.length === 0 ? {} : { status: [...filters.statuses] };
}

/** Whether the operator narrowed the queue — decides which empty state applies. */
export function isOrderQueueFiltered(filters: OrderQueueFilters): boolean {
  return filters.statuses.length > 0;
}

/** One URL per queue state: an empty selection is dropped from the query string. */
export function toOrderQueueSearchString(filters: OrderQueueFilters): string {
  const params = new URLSearchParams();
  for (const status of filters.statuses) {
    params.append(ORDER_QUEUE_STATUS_PARAM, status);
  }
  return params.toString();
}

/** Adds or removes one status, preserving the contract's declaration order. */
export function toggleOrderStatus(
  filters: OrderQueueFilters,
  status: OrderStatusFilterValue,
): OrderQueueFilters {
  const chosen = new Set<string>(filters.statuses);
  if (chosen.has(status)) {
    chosen.delete(status);
  } else {
    chosen.add(status);
  }
  return {
    statuses: ORDER_STATUS_FILTER_OPTIONS.filter((option) => chosen.has(option.value)).map(
      (option) => option.value,
    ),
  };
}
