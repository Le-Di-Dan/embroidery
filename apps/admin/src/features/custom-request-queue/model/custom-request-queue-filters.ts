/**
 * The two approved queue filters and their wire mapping (`662:3`, `662:243`).
 *
 * **Status.** `APP5-B04` takes a *repeatable* `status` and, when none is sent,
 * applies the pre-quotation triage set itself and echoes it in
 * `appliedStatuses`. The presentation value `triage` therefore means *omit the
 * parameter* — the server stays the authority on what the default scope is, and
 * the screen never sends a triple that it would then have to keep in step with
 * the backend by hand. Naming one canonical status sends exactly that one,
 * APP6 states included, which `B04` answers truthfully.
 *
 * **Subject kind.** `all` means omit, same rule.
 *
 * `code`, `submittedFrom`/`submittedTo` and the `contactKind`+`contact` pair are
 * capabilities `B04` publishes that this screen does not expose: there is no
 * fuzzy search here, and an exact-match control that is not in the consumed
 * design authority would be a surface `APP5-A01` invented.
 *
 * Reading is total — an arbitrary, repeated or hand-edited URL value normalizes
 * to the default and is never echoed into the DOM.
 */
import { AdminCustomRequestListSubjectKind } from '@embroidery/api-client';
import type {
  AdminCustomRequestListParams,
  AdminCustomRequestListStatusItem,
} from '@embroidery/api-client';

import { CUSTOM_REQUEST_QUEUE_COPY } from './custom-request-queue-copy';
import { presentStatus, QUEUE_STATUS_ORDER } from './custom-request-presentation';

/** The presentation value meaning "send no `status`, let B04 apply triage". */
export const TRIAGE_FILTER_VALUE = 'triage';

/** The presentation value meaning "send no `subjectKind`". */
export const ALL_FILTER_VALUE = 'all';

export type QueueStatusFilter =
  | typeof TRIAGE_FILTER_VALUE
  | (typeof AdminCustomRequestListStatusItem)[keyof typeof AdminCustomRequestListStatusItem];

export type QueueSubjectFilter =
  | typeof ALL_FILTER_VALUE
  | (typeof AdminCustomRequestListSubjectKind)[keyof typeof AdminCustomRequestListSubjectKind];

export interface CustomRequestQueueFilters {
  readonly status: QueueStatusFilter;
  readonly subjectKind: QueueSubjectFilter;
}

export const DEFAULT_QUEUE_FILTERS: CustomRequestQueueFilters = {
  status: TRIAGE_FILTER_VALUE,
  subjectKind: ALL_FILTER_VALUE,
};

/** The URL parameter names this screen owns. */
export const QUEUE_FILTER_PARAMS = { status: 'status', subjectKind: 'subject' } as const;

export interface QueueFilterOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

/** Default first, then the canonical lifecycle order the contract publishes. */
export const QUEUE_STATUS_FILTER_OPTIONS: readonly QueueFilterOption<QueueStatusFilter>[] = [
  { value: TRIAGE_FILTER_VALUE, label: CUSTOM_REQUEST_QUEUE_COPY.filters.statusTriage },
  ...QUEUE_STATUS_ORDER.map((status) => ({
    value: status,
    label: presentStatus(status).label,
  })),
];

export const QUEUE_SUBJECT_FILTER_OPTIONS: readonly QueueFilterOption<QueueSubjectFilter>[] = [
  { value: ALL_FILTER_VALUE, label: CUSTOM_REQUEST_QUEUE_COPY.filters.subjectAll },
  {
    value: AdminCustomRequestListSubjectKind.CATALOG,
    label: CUSTOM_REQUEST_QUEUE_COPY.subject.catalog,
  },
  {
    value: AdminCustomRequestListSubjectKind.CUSTOMER_OWNED,
    label: CUSTOM_REQUEST_QUEUE_COPY.subject.customerOwned,
  },
];

/** A raw URL/query value, which may be absent, repeated or arbitrary. */
export type RawFilterValue = string | readonly string[] | undefined;

function firstValue(raw: RawFilterValue): unknown {
  return Array.isArray(raw) ? raw[0] : raw;
}

function normalizeOption<TValue extends string>(
  raw: RawFilterValue,
  options: readonly QueueFilterOption<TValue>[],
  fallback: TValue,
): TValue {
  const value = firstValue(raw);
  return options.find((option) => option.value === value)?.value ?? fallback;
}

/** Total by construction: every input produces valid filters. */
export function normalizeQueueFilters(raw: {
  readonly status?: RawFilterValue;
  readonly subject?: RawFilterValue;
}): CustomRequestQueueFilters {
  return {
    status: normalizeOption(raw.status, QUEUE_STATUS_FILTER_OPTIONS, TRIAGE_FILTER_VALUE),
    subjectKind: normalizeOption(raw.subject, QUEUE_SUBJECT_FILTER_OPTIONS, ALL_FILTER_VALUE),
  };
}

/**
 * The request parameters for a set of filters.
 *
 * `status` is an array because the contract's parameter is repeatable; a single
 * explicit choice is a one-element array, and the default sends nothing at all
 * rather than a sentinel the API does not define.
 */
export function toQueueListParams(
  filters: CustomRequestQueueFilters,
): Pick<AdminCustomRequestListParams, 'status' | 'subjectKind'> {
  return {
    ...(filters.status === TRIAGE_FILTER_VALUE ? {} : { status: [filters.status] }),
    ...(filters.subjectKind === ALL_FILTER_VALUE ? {} : { subjectKind: filters.subjectKind }),
  };
}

/** Whether the operator narrowed the queue — decides which empty state applies. */
export function isAnyQueueFilterActive(filters: CustomRequestQueueFilters): boolean {
  return filters.status !== TRIAGE_FILTER_VALUE || filters.subjectKind !== ALL_FILTER_VALUE;
}

/** One URL per queue state: a default filter is dropped from the query string. */
export function toQueueFilterSearchString(filters: CustomRequestQueueFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== TRIAGE_FILTER_VALUE) {
    params.set(QUEUE_FILTER_PARAMS.status, filters.status);
  }
  if (filters.subjectKind !== ALL_FILTER_VALUE) {
    params.set(QUEUE_FILTER_PARAMS.subjectKind, filters.subjectKind);
  }
  return params.toString();
}
