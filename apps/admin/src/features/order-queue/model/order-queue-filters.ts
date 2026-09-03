/**
 * The two approved queue filters and their wire mapping (`732:3`, `732:110`;
 * `Nguồn đơn` added by `APP12-A02-C1`, `912:337`).
 *
 * `adminOrder_list` publishes exactly four parameters — a **repeatable**
 * `status`, a **repeatable** `origin`, `limit` and `cursor` — and both frames
 * say so on the screen itself. There is deliberately no text search, no product
 * or SKU filter, no provider filter, no evidence filter, no inventory filter
 * and no date range here: an exact-match control the API cannot serve is a
 * promise the queue could not keep, and none of them appears in the consumed
 * design authority.
 *
 * ### Selecting nothing means sending nothing
 *
 * Each control is a multi-select over its contract values with a "Tất cả"
 * resting state (`732:110`, "2 đã chọn"). An empty selection omits that
 * parameter entirely rather than sending a sentinel the API does not define,
 * and the server then answers with every value — which is what it documents:
 * orders have no canonical triage subset, so none is invented.
 *
 * ### The origin filter is the server's, not the browser's
 *
 * `origin` goes on the wire. It is never applied to an accumulated page in
 * memory: the queue is keyset-paginated, so filtering after the page was cut
 * would hand the operator short pages and a cursor that skips whatever the
 * predicate removed (`APP12-A02-C1` §10).
 *
 * Reading is total — an arbitrary, repeated or hand-edited URL value is dropped
 * and never echoed into the DOM.
 */
import { AdminOrderListOriginItem, AdminOrderListStatusItem } from '@embroidery/api-client';
import type { AdminOrderListParams } from '@embroidery/api-client';

import { orderOriginLabel } from '../../../shared/presentation/order-origin';
import { orderStatusLabel } from '../../../shared/presentation/order-status';

export type OrderStatusFilterValue =
  (typeof AdminOrderListStatusItem)[keyof typeof AdminOrderListStatusItem];

export type OrderOriginFilterValue =
  (typeof AdminOrderListOriginItem)[keyof typeof AdminOrderListOriginItem];

export interface OrderQueueFilters {
  /** The selected order states. Empty means "send no `status`". */
  readonly statuses: readonly OrderStatusFilterValue[];
  /** The selected origins. Empty means "send no `origin`" — every origin. */
  readonly origins: readonly OrderOriginFilterValue[];
}

export const DEFAULT_ORDER_QUEUE_FILTERS: OrderQueueFilters = { statuses: [], origins: [] };

/** The two URL parameters this screen owns. */
export const ORDER_QUEUE_STATUS_PARAM = 'status';
export const ORDER_QUEUE_ORIGIN_PARAM = 'origin';

export interface OrderStatusFilterOption {
  readonly value: OrderStatusFilterValue;
  readonly label: string;
}

export interface OrderOriginFilterOption {
  readonly value: OrderOriginFilterValue;
  readonly label: string;
}

/**
 * Every status option, in the contract's own declaration order.
 *
 * Derived from the generated enum rather than hand-listed, so a state the
 * contract gains or loses cannot leave a stale checkbox behind; the label comes
 * from the shared presentation module, so it is the same word the badge uses.
 * `APP12-A02-C1` widened the published set from eleven to thirteen, and this
 * list followed without an edit — which is the property deriving it buys.
 */
export const ORDER_STATUS_FILTER_OPTIONS: readonly OrderStatusFilterOption[] = Object.values(
  AdminOrderListStatusItem,
).map((value) => ({ value, label: orderStatusLabel(value) }));

/** The two origin options, derived from the contract on the same terms. */
export const ORDER_ORIGIN_FILTER_OPTIONS: readonly OrderOriginFilterOption[] = Object.values(
  AdminOrderListOriginItem,
).map((value) => ({ value, label: orderOriginLabel(value) }));

const KNOWN_VALUES = new Set<string>(Object.values(AdminOrderListStatusItem));
const KNOWN_ORIGINS = new Set<string>(Object.values(AdminOrderListOriginItem));

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
export function normalizeOrderQueueFilters(
  raw: RawFilterValue,
  rawOrigin: RawFilterValue = undefined,
): OrderQueueFilters {
  return { statuses: readStatuses(raw), origins: readOrigins(rawOrigin) };
}

function readStatuses(raw: RawFilterValue): readonly OrderStatusFilterValue[] {
  const chosen = new Set(tokensOf(raw).filter((token) => KNOWN_VALUES.has(token)));
  return ORDER_STATUS_FILTER_OPTIONS.filter((option) => chosen.has(option.value)).map(
    (option) => option.value,
  );
}

function readOrigins(raw: RawFilterValue): readonly OrderOriginFilterValue[] {
  const chosen = new Set(tokensOf(raw).filter((token) => KNOWN_ORIGINS.has(token)));
  return ORDER_ORIGIN_FILTER_OPTIONS.filter((option) => chosen.has(option.value)).map(
    (option) => option.value,
  );
}

/**
 * Narrowed on `typeof` rather than `Array.isArray`, which widens a readonly
 * tuple to `any[]` and would let an unchecked value through.
 */
function tokensOf(raw: RawFilterValue): readonly string[] {
  return raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
}

/**
 * The request parameters for a set of filters.
 *
 * Both of the contract's filter parameters are repeatable, so each selection is
 * sent as an array; an empty selection sends nothing at all. The origin goes on
 * the wire for the reason the status does — the server pages over the filtered
 * set, and a browser-side predicate would break the cursor.
 */
export function toOrderListParams(
  filters: OrderQueueFilters,
): Pick<AdminOrderListParams, 'status' | 'origin'> {
  return {
    ...(filters.statuses.length === 0 ? {} : { status: [...filters.statuses] }),
    ...(filters.origins.length === 0 ? {} : { origin: [...filters.origins] }),
  };
}

/** Whether the operator narrowed the queue — decides which empty state applies. */
export function isOrderQueueFiltered(filters: OrderQueueFilters): boolean {
  return filters.statuses.length > 0 || filters.origins.length > 0;
}

/** One URL per queue state: an empty selection is dropped from the query string. */
export function toOrderQueueSearchString(filters: OrderQueueFilters): string {
  const params = new URLSearchParams();
  for (const status of filters.statuses) {
    params.append(ORDER_QUEUE_STATUS_PARAM, status);
  }
  for (const origin of filters.origins) {
    params.append(ORDER_QUEUE_ORIGIN_PARAM, origin);
  }
  return params.toString();
}

/** Adds or removes one status, preserving the contract's declaration order. */
export function toggleOrderStatus(
  filters: OrderQueueFilters,
  status: OrderStatusFilterValue,
): OrderQueueFilters {
  const chosen = toggled(filters.statuses, status);
  return {
    ...filters,
    statuses: ORDER_STATUS_FILTER_OPTIONS.filter((option) => chosen.has(option.value)).map(
      (option) => option.value,
    ),
  };
}

/** Adds or removes one origin, on exactly the same terms. */
export function toggleOrderOrigin(
  filters: OrderQueueFilters,
  origin: OrderOriginFilterValue,
): OrderQueueFilters {
  const chosen = toggled(filters.origins, origin);
  return {
    ...filters,
    origins: ORDER_ORIGIN_FILTER_OPTIONS.filter((option) => chosen.has(option.value)).map(
      (option) => option.value,
    ),
  };
}

function toggled(current: readonly string[], value: string): ReadonlySet<string> {
  const chosen = new Set<string>(current);
  if (chosen.has(value)) {
    chosen.delete(value);
  } else {
    chosen.add(value);
  }
  return chosen;
}
