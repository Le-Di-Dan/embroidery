/**
 * The two approved list filters and their wire mapping (`596:8`).
 *
 * Exactly two: lifecycle status and Product. Both are real `APP3-B03` query
 * parameters — `status` and `productId` — and nothing else is offered, because
 * nothing else exists. The contract publishes no text search, no sort selector,
 * no page number, no offset and no total count, and the approved design carries
 * none of them either.
 *
 * "All" is a presentation value, not a wire value: it means *omit the
 * parameter*, so an unfiltered request never sends `status=all` and the default
 * page truthfully contains drafts, published and archived templates alike.
 */
import { AdminDesignTemplateListStatus } from '@embroidery/api-client';
import type { AdminDesignTemplateListParams } from '@embroidery/api-client';

import { DESIGN_TEMPLATE_COPY } from './design-template-copy';

/** The presentation value meaning "no parameter". */
export const ALL_FILTER_VALUE = 'all';

export type TemplateStatusFilter =
  | typeof ALL_FILTER_VALUE
  | (typeof AdminDesignTemplateListStatus)[keyof typeof AdminDesignTemplateListStatus];

/** A Product id, or "all". Validated as a UUID before it reaches the wire. */
export type TemplateProductFilter = string;

export interface DesignTemplateFilters {
  readonly status: TemplateStatusFilter;
  readonly productId: TemplateProductFilter;
}

export const DEFAULT_TEMPLATE_FILTERS: DesignTemplateFilters = {
  status: ALL_FILTER_VALUE,
  productId: ALL_FILTER_VALUE,
};

/** The URL parameter names this screen owns. */
export const TEMPLATE_FILTER_PARAMS = { status: 'status', productId: 'product' } as const;

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const STATUS_VALUES = new Set<string>(Object.values(AdminDesignTemplateListStatus));

/**
 * Reading is **total**: an arbitrary, repeated or hand-edited parameter value
 * normalizes to "all" and is never echoed into the DOM. A `productId` that is
 * not a UUID could only ever produce a 400, so it is dropped here rather than
 * sent.
 */
export function normalizeTemplateFilters(raw: {
  readonly status?: string | undefined;
  readonly productId?: string | undefined;
}): DesignTemplateFilters {
  const status = raw.status !== undefined && STATUS_VALUES.has(raw.status) ? raw.status : undefined;
  const productId =
    raw.productId !== undefined && UUID.test(raw.productId) ? raw.productId : undefined;

  return {
    status: (status as TemplateStatusFilter | undefined) ?? ALL_FILTER_VALUE,
    productId: productId ?? ALL_FILTER_VALUE,
  };
}

/** The query string for a filter set; empty when nothing is filtered. */
export function toFilterSearchString(filters: DesignTemplateFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== ALL_FILTER_VALUE) {
    params.set(TEMPLATE_FILTER_PARAMS.status, filters.status);
  }
  if (filters.productId !== ALL_FILTER_VALUE) {
    params.set(TEMPLATE_FILTER_PARAMS.productId, filters.productId);
  }
  return params.toString();
}

/**
 * The wire parameters for a filter set.
 *
 * A filter set to "all" contributes **no key at all** rather than an empty
 * string: the workspace compiles with `exactOptionalPropertyTypes`, and a
 * present-but-undefined member would still be serialized by some clients.
 */
export function toListParams(
  filters: DesignTemplateFilters,
  limit: number,
): AdminDesignTemplateListParams {
  return {
    limit,
    ...(filters.status === ALL_FILTER_VALUE ? {} : { status: filters.status }),
    ...(filters.productId === ALL_FILTER_VALUE ? {} : { productId: filters.productId }),
  };
}

export interface TemplateFilterOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

/** Option order is "all" first, then the contract's own order. */
export const TEMPLATE_STATUS_FILTER_OPTIONS: readonly TemplateFilterOption<TemplateStatusFilter>[] =
  [
    { value: ALL_FILTER_VALUE, label: DESIGN_TEMPLATE_COPY.filters.statusAll },
    { value: AdminDesignTemplateListStatus.DRAFT, label: DESIGN_TEMPLATE_COPY.status.draft },
    {
      value: AdminDesignTemplateListStatus.PUBLISHED,
      label: DESIGN_TEMPLATE_COPY.status.published,
    },
    { value: AdminDesignTemplateListStatus.ARCHIVED, label: DESIGN_TEMPLATE_COPY.status.archived },
  ];
