/**
 * The one approved list filter and its wire mapping (`866:905`).
 *
 * `adminGalleryEntry_list` publishes exactly three parameters — a **single**
 * optional `status`, `limit` and `cursor` — so there is one control here and
 * only one. The category filter the earliest sketches carried was removed in
 * `APP11-D01` for a reason that has not changed: `gallery_entries` has no
 * category column, so a control for one would be a promise the list could not
 * keep. There is no title search, no product filter, no indexability filter and
 * no date range either, for the same reason.
 *
 * ### "Tất cả trạng thái" means sending nothing
 *
 * The contract defines `DRAFT`, `PUBLISHED` and `ARCHIVED` and no fourth value,
 * and in particular no `ALL` sentinel. The presentation value `all` therefore
 * means *omit the parameter*, which is what `APP11-B01` answers with every
 * state. Sending an invented token would be a `400` the operator never asked
 * for.
 *
 * Reading is total — an arbitrary, repeated or hand-edited URL value normalizes
 * to "no filter" and is never echoed into the DOM and never sent to the API.
 */
import { AdminGalleryEntryListStatus } from '@embroidery/api-client';
import type { AdminGalleryEntryListParams } from '@embroidery/api-client';

import { GALLERY_LIST_COPY } from './gallery-list-copy';
import {
  galleryStatusLabel,
  type GalleryStatusValue,
} from '../../../shared/presentation/gallery-status';

/** The presentation value meaning "send no `status`". */
export const ALL_STATUS_FILTER_VALUE = 'all';

export type GalleryStatusFilter = typeof ALL_STATUS_FILTER_VALUE | GalleryStatusValue;

export interface GalleryListFilters {
  readonly status: GalleryStatusFilter;
}

export const DEFAULT_GALLERY_LIST_FILTERS: GalleryListFilters = {
  status: ALL_STATUS_FILTER_VALUE,
};

/** The one URL parameter this screen owns. The cursor is deliberately not one. */
export const GALLERY_LIST_STATUS_PARAM = 'status';

export interface GalleryStatusFilterOption {
  readonly value: GalleryStatusFilter;
  readonly label: string;
}

/**
 * The four options: the default, then the contract's own declaration order.
 *
 * Derived from the generated enum rather than hand-listed, so a state the
 * contract gains or loses cannot leave a stale option behind; the label comes
 * from the status presentation module, so it is the same word the pill uses.
 */
export const GALLERY_STATUS_FILTER_OPTIONS: readonly GalleryStatusFilterOption[] = [
  { value: ALL_STATUS_FILTER_VALUE, label: GALLERY_LIST_COPY.filters.all },
  ...Object.values(AdminGalleryEntryListStatus).map((value) => ({
    value,
    label: galleryStatusLabel(value),
  })),
];

const KNOWN_VALUES = new Set<string>(Object.values(AdminGalleryEntryListStatus));

/** A raw URL/query value, which may be absent, repeated or arbitrary. */
export type RawFilterValue = string | readonly string[] | undefined;

/**
 * Total by construction: every input produces valid filters.
 *
 * An unrecognised token — a typo, a stale `ALL`, a hand-edited value, or a
 * repeated parameter — normalizes to "no filter". It is dropped rather than
 * passed through, because the address bar is not a place to smuggle a value
 * past the accepted schema, and it is never rendered anywhere.
 */
export function normalizeGalleryListFilters(raw: RawFilterValue): GalleryListFilters {
  // A repeated parameter is deliberately not "the first one wins": the contract
  // takes one status, so a URL naming two has named none this screen can
  // honour, and quietly picking a winner would filter by something the operator
  // did not choose. Narrowed on `typeof` rather than `Array.isArray`, which
  // widens a readonly tuple to `any[]` and would let an unchecked value through.
  const tokens: readonly string[] = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
  const token = tokens.length === 1 ? tokens[0] : undefined;
  return {
    status:
      token !== undefined && KNOWN_VALUES.has(token)
        ? (token as GalleryStatusValue)
        : ALL_STATUS_FILTER_VALUE,
  };
}

/** The request parameters for a set of filters. `all` sends nothing at all. */
export function toGalleryListParams(
  filters: GalleryListFilters,
): Pick<AdminGalleryEntryListParams, 'status'> {
  return filters.status === ALL_STATUS_FILTER_VALUE ? {} : { status: filters.status };
}

/** Whether the operator narrowed the list — decides which empty state applies. */
export function isGalleryListFiltered(filters: GalleryListFilters): boolean {
  return filters.status !== ALL_STATUS_FILTER_VALUE;
}

/** One URL per list state: the default filter is dropped from the query string. */
export function toGalleryListSearchString(filters: GalleryListFilters): string {
  if (filters.status === ALL_STATUS_FILTER_VALUE) {
    return '';
  }
  return new URLSearchParams({ [GALLERY_LIST_STATUS_PARAM]: filters.status }).toString();
}
