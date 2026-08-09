import type {
  AdminDesignTemplateDetailResponse,
  AdminDesignTemplateListResponse,
  AdminDesignTemplateSummaryResponse,
} from '@embroidery/api-client';

export const TEMPLATE_DRAFT_ID = '01930000-0000-7000-8000-000000000001';
export const TEMPLATE_PUBLISHED_ID = '01930000-0000-7000-8000-000000000002';
export const TEMPLATE_ARCHIVED_ID = '01930000-0000-7000-8000-000000000003';
export const SCOPED_PRODUCT_ID = '01920000-0000-7000-8000-000000000001';
export const FOREIGN_PRODUCT_ID = '01920000-0000-7000-8000-0000000000ff';

/**
 * A list summary shaped exactly like the `APP3-B03` contract.
 *
 * `currentVersion` is **omitted by default and on purpose**: the list projection
 * calls `toSummaryView(template, undefined)`, so no list page ever carries one —
 * for a draft or a published template alike. A fixture that supplied it would
 * let the screen pass a test the real API could never satisfy.
 */
export function makeTemplateSummary(
  overrides: Record<string, unknown> = {},
): AdminDesignTemplateSummaryResponse {
  return {
    templateId: TEMPLATE_DRAFT_ID,
    name: 'Mẫu sen đỏ',
    slug: 'mau-sen-do',
    status: 'DRAFT',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-02T11:30:00.000Z',
    ...overrides,
  } as unknown as AdminDesignTemplateSummaryResponse;
}

/** A scoped template: scope is present only as a complete triple. */
export function makeScopedSummary(
  overrides: Record<string, unknown> = {},
): AdminDesignTemplateSummaryResponse {
  return makeTemplateSummary({
    templateId: TEMPLATE_PUBLISHED_ID,
    name: 'Mẫu logo ngực',
    slug: 'mau-logo-nguc',
    status: 'PUBLISHED',
    scope: {
      productId: SCOPED_PRODUCT_ID,
      productSideId: '01920000-0000-7000-8000-0000000000a1',
      embroideryAreaId: '01920000-0000-7000-8000-0000000000b1',
    },
    ...overrides,
  });
}

export function makeArchivedSummary(): AdminDesignTemplateSummaryResponse {
  return makeTemplateSummary({
    templateId: TEMPLATE_ARCHIVED_ID,
    name: 'Mẫu cũ',
    slug: 'mau-cu',
    status: 'ARCHIVED',
    archivedAt: '2026-08-03T09:00:00.000Z',
  });
}

export function makeTemplatePage(
  items: AdminDesignTemplateSummaryResponse[],
  next?: string,
): AdminDesignTemplateListResponse {
  return next === undefined
    ? { hasNext: false, items }
    : { hasNext: true, items, nextCursor: next };
}

export function templateListEnvelope(page: AdminDesignTemplateListResponse) {
  return {
    success: true,
    code: 'DESIGN_TEMPLATE_LIST_READ',
    message: 'ok',
    data: page,
    meta: { requestId: 'req-1', timestamp: '2026-08-09T00:00:00.000Z' },
  } as never;
}

/**
 * The create response is a **detail** view — the one place a fresh template's
 * "no version yet" is a fact the API actually states rather than one the list
 * could only infer.
 */
export function makeCreatedTemplate(
  overrides: Record<string, unknown> = {},
): AdminDesignTemplateDetailResponse {
  return {
    templateId: '01930000-0000-7000-8000-00000000000f',
    name: 'Mẫu mới',
    slug: 'mau-moi',
    status: 'DRAFT',
    createdAt: '2026-08-09T08:00:00.000Z',
    updatedAt: '2026-08-09T08:00:00.000Z',
    ...overrides,
  } as unknown as AdminDesignTemplateDetailResponse;
}

export function templateCreateEnvelope(template: AdminDesignTemplateDetailResponse) {
  return {
    success: true,
    code: 'DESIGN_TEMPLATE_CREATED',
    message: 'ok',
    data: template,
    meta: { requestId: 'req-2', timestamp: '2026-08-09T00:00:00.000Z' },
  } as never;
}
