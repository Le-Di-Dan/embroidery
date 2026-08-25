/**
 * The two approved queue filters and their wire mapping (`780:30`, `780:105`).
 *
 * `adminProductionJob_list` publishes exactly four parameters — a **repeatable**
 * `status`, an `orderId`, `limit` and `cursor` — and `780:39` says so on the
 * screen itself. There is deliberately no priority, operator, machine, date
 * range, SLA, attempt-count, artifact-readiness or customer filter here: the
 * production model has no such fact, so a control for one would be a promise
 * the queue could not keep.
 *
 * ### Selecting nothing means sending nothing
 *
 * The status control is a multi-select over the **four** LC-18 values with a
 * "Tất cả" resting state. An empty selection omits the parameter entirely
 * rather than sending a sentinel the API does not define, and `APP8-B03` then
 * answers with every state — which is what its own documentation says it does:
 * production jobs have no canonical triage subset, so none is invented.
 *
 * ### `orderId` is an order id, and never a code in disguise
 *
 * The accepted schema is `z.string().uuid()`. The filter therefore operates on
 * the id itself: a value that is not a UUID is **not sent** and is reported in
 * place, rather than being handed to a lookup that would translate an `ORD-…`
 * code into an id. `APP8-B03` publishes no code filter and no code-to-id
 * resolution, and inventing one here would be a second, silent query the
 * operator never asked for.
 *
 * Reading is total — an arbitrary, repeated or hand-edited URL value is dropped
 * and never echoed into the DOM.
 */
import { AdminProductionJobListStatusItem } from '@embroidery/api-client';
import type { AdminProductionJobListParams } from '@embroidery/api-client';

import {
  productionStatusLabel,
  type ProductionStatusValue,
} from '../../../shared/presentation/production-status';

export interface ProductionQueueFilters {
  /** The selected LC-18 states. Empty means "send no `status`". */
  readonly statuses: readonly ProductionStatusValue[];
  /** A validated order id, or `undefined` for "send no `orderId`". */
  readonly orderId: string | undefined;
}

export const DEFAULT_PRODUCTION_QUEUE_FILTERS: ProductionQueueFilters = {
  statuses: [],
  orderId: undefined,
};

/** The two URL parameters this screen owns. */
export const PRODUCTION_QUEUE_STATUS_PARAM = 'status';
export const PRODUCTION_QUEUE_ORDER_PARAM = 'orderId';

export interface ProductionStatusFilterOption {
  readonly value: ProductionStatusValue;
  readonly label: string;
}

/**
 * The four options, in the contract's own declaration order.
 *
 * Derived from the generated enum rather than hand-listed, so a state the
 * contract gains or loses cannot leave a stale checkbox behind; the label comes
 * from the status presentation module, so it is the same word the pill uses.
 */
export const PRODUCTION_STATUS_FILTER_OPTIONS: readonly ProductionStatusFilterOption[] =
  Object.values(AdminProductionJobListStatusItem).map((value) => ({
    value,
    label: productionStatusLabel(value),
  }));

const KNOWN_VALUES = new Set<string>(Object.values(AdminProductionJobListStatusItem));

/**
 * The shape `APP8-B03` accepts for `orderId`, mirrored exactly.
 *
 * Nothing looser: a value this rejects is a value the server would answer `400`
 * for, so refusing to send it costs the operator nothing and saves them an
 * error page. Nothing stricter either — the version nibble is not constrained
 * here, because the contract does not constrain it.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrderIdShaped(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** A raw URL/query value, which may be absent, repeated or arbitrary. */
export type RawFilterValue = string | readonly string[] | undefined;

function readStatuses(raw: RawFilterValue): readonly ProductionStatusValue[] {
  // Narrowed on `typeof` rather than `Array.isArray`, which widens a readonly
  // tuple to `any[]` and would let an unchecked value through.
  const tokens: readonly string[] = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
  const chosen = new Set(tokens.filter((token) => KNOWN_VALUES.has(token)));
  return PRODUCTION_STATUS_FILTER_OPTIONS.filter((option) => chosen.has(option.value)).map(
    (option) => option.value,
  );
}

/**
 * Total by construction: every input produces valid filters.
 *
 * Unrecognised status tokens are dropped rather than passed through — the queue
 * must not send the server a state it does not publish — duplicates collapse,
 * and the contract's declaration order is preserved so the selection reads the
 * same way regardless of how the URL spelled it. A malformed `orderId` is
 * dropped for the same reason: the address bar is not a place to smuggle a
 * value past the schema.
 */
export function normalizeProductionQueueFilters(
  rawStatus: RawFilterValue,
  rawOrderId: string | null | undefined,
): ProductionQueueFilters {
  const orderId =
    typeof rawOrderId === 'string' && isOrderIdShaped(rawOrderId) ? rawOrderId : undefined;
  return { statuses: readStatuses(rawStatus), orderId };
}

/**
 * The request parameters for a set of filters.
 *
 * The status parameter is repeatable, so the selection is sent as an array; an
 * empty selection sends nothing at all. `orderId` is sent only when present.
 */
export function toProductionListParams(
  filters: ProductionQueueFilters,
): Pick<AdminProductionJobListParams, 'status' | 'orderId'> {
  return {
    ...(filters.statuses.length === 0 ? {} : { status: [...filters.statuses] }),
    ...(filters.orderId === undefined ? {} : { orderId: filters.orderId }),
  };
}

/** Whether the operator narrowed the queue — decides which empty state applies. */
export function isProductionQueueFiltered(filters: ProductionQueueFilters): boolean {
  return filters.statuses.length > 0 || filters.orderId !== undefined;
}

/** One URL per queue state: an empty filter is dropped from the query string. */
export function toProductionQueueSearchString(filters: ProductionQueueFilters): string {
  const params = new URLSearchParams();
  for (const status of filters.statuses) {
    params.append(PRODUCTION_QUEUE_STATUS_PARAM, status);
  }
  if (filters.orderId !== undefined) {
    params.set(PRODUCTION_QUEUE_ORDER_PARAM, filters.orderId);
  }
  return params.toString();
}

/** Adds or removes one status, preserving the contract's declaration order. */
export function toggleProductionStatus(
  filters: ProductionQueueFilters,
  status: ProductionStatusValue,
): ProductionQueueFilters {
  const chosen = new Set<string>(filters.statuses);
  if (chosen.has(status)) {
    chosen.delete(status);
  } else {
    chosen.add(status);
  }
  return {
    ...filters,
    statuses: PRODUCTION_STATUS_FILTER_OPTIONS.filter((option) => chosen.has(option.value)).map(
      (option) => option.value,
    ),
  };
}

/** Replaces the order filter. An unshaped value clears it rather than being sent. */
export function withOrderFilter(
  filters: ProductionQueueFilters,
  orderId: string,
): ProductionQueueFilters {
  const trimmed = orderId.trim();
  return {
    ...filters,
    orderId: isOrderIdShaped(trimmed) ? trimmed : undefined,
  };
}

export function withoutStatusFilter(filters: ProductionQueueFilters): ProductionQueueFilters {
  return { ...filters, statuses: [] };
}

export function withoutOrderFilter(filters: ProductionQueueFilters): ProductionQueueFilters {
  return { ...filters, orderId: undefined };
}
