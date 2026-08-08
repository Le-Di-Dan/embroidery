/**
 * The public Design Template contract (`APP3-B05`).
 *
 * Docker-free, so every collaborator is a double and what is proved is the
 * *decision*: which requests are admissible, which rows a public caller may see,
 * and — the point of this checkpoint — which ones it may not, and that all the
 * refusals are indistinguishable from one another. The SQL predicates
 * themselves are proved live in
 * `test/integration/public-design-template.integration.spec.ts`.
 *
 * Several assertions are absences — no write, no audit, no outbox, no third
 * operation, no auth guard — and an absence has no runtime signal, so they are
 * read from source and from the committed OpenAPI document. `tsc` preserves
 * JSDoc into the emitted output, so the source scans match *usage* — a decorator
 * call, an import, a method call — never a bare word, or a sentence in a comment
 * explaining why something was not done would fail the build.
 */
import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveArtifactPath } from '../../openapi/openapi-artifact';
import { zodSchemaOf } from '../../platform/validation/zod-dto';
import { PublicDesignTemplateQuery } from './application/public-design-template.query';
import {
  PublicDesignTemplateListQueryDto,
  PublicDesignTemplateSlugParam,
} from './presentation/schemas/public-design-template.request';
import {
  encodePublicTemplateCursor,
  decodePublicTemplateCursor,
} from './domain/public-design-template-cursor';
import { isPublicDesignTemplateError } from './domain/public-design-template.errors';
import { PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL } from './domain/public-design-template.policy';
import type {
  DesignTemplate,
  DesignTemplateId,
  DesignTemplateVersion,
  DesignTemplateVersionId,
} from './domain/repositories/design-template.repository';
import type {
  ListPublishedTemplatesInput,
  PublishedDesignTemplate,
  PublishedDesignTemplateRepository,
  PublishedTemplateScope,
} from './domain/repositories/published-design-template.repository';
import type {
  PlacementScopeReference,
  ProductPlacementRepository,
} from '../catalog/domain/repositories/product-placement.repository';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../catalog/domain/repositories/placement-hierarchy.port';

const DIR = __dirname;
const source = (relative: string): string => readFileSync(join(DIR, relative), 'utf8');

const CONTROLLER_SOURCE = source('presentation/public-design-template.controller.ts');
const QUERY_SOURCE = source('application/public-design-template.query.ts');
const ADAPTER_SOURCE = source(
  'infrastructure/persistence/drizzle-published-design-template.repository.ts',
);
const MODULE_SOURCE = source('design-template-public.module.ts');
const PROJECTION_SOURCE = source('application/public-design-template.projection.ts');

/**
 * The module's two decorator arrays, isolated from its header.
 *
 * The header names `DESIGN_TEMPLATE_REPOSITORY`, `AuditModule` and
 * `AssetModule` in order to say the module deliberately does **not** compose
 * them, so a whole-file scan for those names fails on the very sentence that
 * documents the invariant. These extracts are the composition itself.
 */
const MODULE_IMPORTS = /imports:\s*\[([\s\S]*?)\]/.exec(MODULE_SOURCE)?.[1] ?? '';
const MODULE_PROVIDERS = /providers:\s*\[([\s\S]*?)\n {2}\],/.exec(MODULE_SOURCE)?.[1] ?? '';

const LIST_PATH = '/api/public/design-templates';
const DETAIL_PATH = '/api/public/design-templates/{slug}';

const PRODUCT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const SIDE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const AREA_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';
const OTHER_AREA_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6074';

const SCOPE: PublishedTemplateScope = {
  productId: PRODUCT_ID as ProductId,
  productSideId: SIDE_ID as ProductSideId,
  embroideryAreaId: AREA_ID as EmbroideryAreaId,
};

interface OpenApiOperation {
  readonly operationId?: string;
  readonly security?: unknown;
  readonly parameters?: readonly { name: string; required?: boolean; in: string }[];
  readonly responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}

const document = JSON.parse(readFileSync(resolveArtifactPath(DIR), 'utf8')) as {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, unknown> };
};

/* -------------------------------------------------------------------------- */
/* Doubles                                                                     */
/* -------------------------------------------------------------------------- */

function template(overrides: Partial<DesignTemplate> = {}): DesignTemplate {
  return {
    id: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6080' as DesignTemplateId,
    name: 'Hoa sen cổ điển',
    slug: 'hoa-sen-co-dien',
    description: 'Mẫu thêu hoa sen',
    productId: PRODUCT_ID as ProductId,
    productSideId: SIDE_ID as ProductSideId,
    embroideryAreaId: AREA_ID as EmbroideryAreaId,
    status: 'PUBLISHED',
    currentVersion: 2,
    previewDerivativeId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6090',
    archivedAt: undefined,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    ...overrides,
  };
}

function version(overrides: Partial<DesignTemplateVersion> = {}): DesignTemplateVersion {
  return {
    id: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081' as DesignTemplateVersionId,
    designTemplateId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6080' as DesignTemplateId,
    version: 1,
    designDocument: { schemaVersion: 1, elements: [] },
    documentSchemaVersion: 1,
    publishedAt: new Date('2026-01-15T00:00:00.000Z'),
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    ...overrides,
  };
}

const row = (
  t: Partial<DesignTemplate> = {},
  v: Partial<DesignTemplateVersion> = {},
): PublishedDesignTemplate => ({ template: template(t), version: version(v) });

interface RepositoryCalls {
  readonly list: ListPublishedTemplatesInput[];
  readonly bySlug: string[];
}

function repository(
  rows: readonly PublishedDesignTemplate[],
  bySlug: PublishedDesignTemplate | undefined = rows[0],
): { repository: PublishedDesignTemplateRepository; calls: RepositoryCalls } {
  const calls: RepositoryCalls = { list: [], bySlug: [] };
  return {
    calls,
    repository: {
      listPublished: (input) => {
        calls.list.push(input);
        return Promise.resolve([...rows]);
      },
      findPublishedBySlug: (slug) => {
        calls.bySlug.push(slug);
        return Promise.resolve(bySlug);
      },
    },
  };
}

/** A placement port that admits exactly the triples it was given. */
function placement(...eligible: readonly PublishedTemplateScope[]): {
  port: ProductPlacementRepository;
  calls: PlacementScopeReference[];
} {
  const calls: PlacementScopeReference[] = [];
  const key = (s: PlacementScopeReference) =>
    `${s.productId}|${s.productSideId}|${s.embroideryAreaId}`;
  const admitted = new Set(eligible.map(key));
  const port = {
    findPublicPlacementScope: (reference: PlacementScopeReference) => {
      calls.push(reference);
      return Promise.resolve(admitted.has(key(reference)) ? reference : undefined);
    },
  } as unknown as ProductPlacementRepository;
  return { port, calls };
}

function query(
  rows: readonly PublishedDesignTemplate[],
  eligible: readonly PublishedTemplateScope[] = [SCOPE],
  bySlug: PublishedDesignTemplate | undefined = rows[0],
) {
  const repo = repository(rows, bySlug);
  const place = placement(...eligible);
  return {
    query: new PublicDesignTemplateQuery(repo.repository, place.port),
    repositoryCalls: repo.calls,
    placementCalls: place.calls,
  };
}

const listInput = (overrides: Record<string, unknown> = {}) => ({
  productId: PRODUCT_ID,
  productSideId: SIDE_ID,
  embroideryAreaId: AREA_ID,
  ...overrides,
});

/**
 * The DTO's Zod schema, resolved as an assertion.
 *
 * `zodSchemaOf` returns `undefined` for a class that never registered one, so a
 * DTO that lost its schema would otherwise make every case below vacuously skip
 * rather than fail.
 */
function schemaOf(dto: unknown) {
  const schema = zodSchemaOf(dto);
  if (schema === undefined) throw new Error('the DTO carries no Zod schema');
  return schema;
}

async function refusalOf(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error: unknown) {
    if (isPublicDesignTemplateError(error)) return error.code;
    return `unexpected: ${String(error)}`;
  }
  return 'no refusal';
}

/* -------------------------------------------------------------------------- */
/* 1-7 — the published contract                                                */
/* -------------------------------------------------------------------------- */

describe('the published contract', () => {
  it('publishes exactly two operations, at the locked routes and ids', () => {
    expect(document.paths[LIST_PATH]?.['get']?.operationId).toBe('publicDesignTemplate_list');
    expect(document.paths[DETAIL_PATH]?.['get']?.operationId).toBe('publicDesignTemplate_detail');

    const publicTemplateOperations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/public/design-templates'))
      .flatMap(([, methods]) => Object.keys(methods));
    expect(publicTemplateOperations).toHaveLength(2);
    expect(publicTemplateOperations.every((method) => method === 'get')).toBe(true);
  });

  it('carries no APP3-B05A delivery route and no write method', () => {
    for (const path of Object.keys(document.paths)) {
      if (!path.startsWith('/api/public/design-templates')) continue;
      expect(path).not.toMatch(/\/(assets?|preview|download|file|image|media)\b/);
    }
    expect(CONTROLLER_SOURCE).not.toMatch(/@(Post|Put|Patch|Delete)\(/);
    // Streaming a body would need one of these; a JSON read needs none.
    expect(CONTROLLER_SOURCE).not.toMatch(/StreamableFile|@Res\(|setHeader\(/);
  });

  it('is anonymous — no guard, no session, no origin allowlist', () => {
    expect(CONTROLLER_SOURCE).not.toMatch(/@UseGuards\(/);
    expect(CONTROLLER_SOURCE).not.toMatch(/DesignSessionGuard|AuthenticatedAdminGuard/);
    expect(CONTROLLER_SOURCE).not.toMatch(/@ApiCookieAuth\(|@ApiBearerAuth\(/);
    for (const path of [LIST_PATH, DETAIL_PATH]) {
      expect(document.paths[path]?.['get']?.security).toBeUndefined();
    }
  });

  it('answers both operations with a concrete schema', () => {
    for (const path of [LIST_PATH, DETAIL_PATH]) {
      const schema = JSON.stringify(
        document.paths[path]?.['get']?.responses?.['200']?.content?.['application/json']?.schema,
      );
      expect(schema).toMatch(/PublicDesignTemplate(List|Detail)Response/);
      expect(schema).not.toMatch(/"type":"object","additionalProperties":true/);
    }
  });

  it('reuses the APP3-P01 DesignDocument component rather than restating it', () => {
    const detail = JSON.stringify(
      document.components.schemas['PublicDesignTemplateDetailResponse'],
    );
    expect(detail).toContain('#/components/schemas/DesignDocument');
    // No second structural definition of a document anywhere in this checkpoint.
    expect(detail).not.toMatch(/"elements"|"placement"|"schemaVersion"/);
  });

  it('never publishes the cache as storable', () => {
    // Both operations name the constant, and the constant is `no-store`. Scanning
    // the controller's whole text for `max-age` or `immutable` would fail on the
    // prose that explains why a revocable resource is not cached.
    expect(
      CONTROLLER_SOURCE.match(/@Header\('Cache-Control', PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL\)/g),
    ).toHaveLength(2);
    expect(PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL).toBe('no-store');
  });
});

/* -------------------------------------------------------------------------- */
/* 8-11 — the compatibility triple                                             */
/* -------------------------------------------------------------------------- */

describe('compatibility is the exact triple', () => {
  const schema = schemaOf(PublicDesignTemplateListQueryDto);

  it('requires all three scope ids', () => {
    expect(schema.safeParse(listInput()).success).toBe(true);
    for (const missing of ['productId', 'productSideId', 'embroideryAreaId'] as const) {
      const partial: Record<string, unknown> = listInput();
      delete partial[missing];
      expect(schema.safeParse(partial).success).toBe(false);
    }
  });

  it('publishes all three as required query parameters', () => {
    const parameters = document.paths[LIST_PATH]?.['get']?.parameters ?? [];
    for (const name of ['productId', 'productSideId', 'embroideryAreaId']) {
      const parameter = parameters.find((entry) => entry.name === name);
      expect(parameter?.in).toBe('query');
      expect(parameter?.required).toBe(true);
    }
  });

  it('offers no wildcard, global or lifecycle dimension', () => {
    // A partial scope cannot be expressed, so there is no broader match to fall
    // back to; and no parameter admits one by another name.
    for (const rejected of [
      { ...listInput(), status: 'DRAFT' },
      { ...listInput(), includeArchived: 'true' },
      { ...listInput(), productId: undefined },
      { ...listInput(), all: 'true' },
      { ...listInput(), search: 'sen' },
      { ...listInput(), sort: 'name' },
      { ...listInput(), offset: '10' },
      { ...listInput(), page: '2' },
    ]) {
      expect(schema.safeParse(rejected).success).toBe(false);
    }
  });

  it('passes the caller’s triple to the repository unchanged and whole', async () => {
    const { query: reads, repositoryCalls } = query([row()]);
    await reads.list(listInput());
    expect(repositoryCalls.list[0]?.scope).toEqual(SCOPE);
  });

  it('matches by equality on all three columns in SQL', () => {
    for (const column of ['productId', 'productSideId', 'embroideryAreaId']) {
      expect(ADAPTER_SOURCE).toContain(`eq(designTemplates.${column}, input.scope.${column})`);
    }
    // No `or(`-joined scope predicate and no null-tolerant scope match.
    expect(ADAPTER_SOURCE).not.toMatch(/isNull\(designTemplates\.(productId|embroideryAreaId)\)/);
  });
});

/* -------------------------------------------------------------------------- */
/* 12-18 — the list                                                            */
/* -------------------------------------------------------------------------- */

describe('the list', () => {
  it('selects only PUBLISHED headers', () => {
    expect(ADAPTER_SOURCE).toContain('eq(designTemplates.status, PUBLIC_TEMPLATE_STATE)');
    expect(ADAPTER_SOURCE).toContain("const PUBLIC_TEMPLATE_STATE = 'PUBLISHED'");
    expect(ADAPTER_SOURCE).not.toMatch(/'DRAFT'|'ARCHIVED'/);
  });

  it('requires a published version as well as a published header', () => {
    expect(ADAPTER_SOURCE).toContain('isNotNull(designTemplateVersions.publishedAt)');
    expect(ADAPTER_SOURCE).toContain('hasPublishedVersion()');
    // The header's counter is never the selection key.
    expect(ADAPTER_SOURCE).not.toMatch(/designTemplates\.currentVersion/);
  });

  it('omits a scope that is no longer publicly designable', async () => {
    const { query: reads, repositoryCalls } = query([row()], []);
    await expect(reads.list(listInput())).resolves.toEqual({ items: [], hasNext: false });
    // Not merely filtered afterwards — the read never ran.
    expect(repositoryCalls.list).toHaveLength(0);
  });

  it('re-asks the placement port on every read and never repairs', async () => {
    const { query: reads, placementCalls } = query([row()]);
    await reads.list(listInput());
    await reads.list(listInput());
    expect(placementCalls).toHaveLength(2);
    expect(QUERY_SOURCE).not.toMatch(/\.archive\(|\.unpublish\(|\.publishCurrentVersion\(/);
  });

  it('pages deterministically and bounded, with no offset or total', async () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      row({
        id: `019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60${String(80 + index)}` as DesignTemplateId,
        slug: `mau-${String(index)}`,
        createdAt: new Date(Date.UTC(2026, 0, 10 - index)),
      }),
    );
    const { query: reads, repositoryCalls } = query(rows);

    const page = await reads.list(listInput({ limit: 2 }));
    expect(page.items).toHaveLength(2);
    expect(page.hasNext).toBe(true);
    expect(page.nextCursor).toEqual(expect.any(String));
    // Over-fetch by one, so "is there a next page" costs no COUNT.
    expect(repositoryCalls.list[0]?.limit).toBe(2);
    expect(page).not.toHaveProperty('total');
    expect(page).not.toHaveProperty('totalCount');
    expect(page).not.toHaveProperty('offset');
  });

  it('continues from its own cursor, at the position of the last row shown', async () => {
    const rows = [
      row({ id: 'a'.repeat(8) as DesignTemplateId, createdAt: new Date('2026-01-10T00:00:00Z') }),
      row({ id: 'b'.repeat(8) as DesignTemplateId, createdAt: new Date('2026-01-09T00:00:00Z') }),
      row({ id: 'c'.repeat(8) as DesignTemplateId, createdAt: new Date('2026-01-08T00:00:00Z') }),
    ];
    const first = query(rows);
    const page = await first.query.list(listInput({ limit: 2 }));

    const second = query(rows);
    await second.query.list(listInput({ limit: 2, cursor: page.nextCursor }));
    // The second row shown, not the over-fetched third.
    expect(second.repositoryCalls.list[0]?.after).toEqual({
      createdAt: new Date('2026-01-09T00:00:00Z'),
      id: 'b'.repeat(8),
    });
  });

  it('refuses a malformed cursor rather than silently restarting', async () => {
    const { query: reads, repositoryCalls } = query([row()]);
    for (const cursor of ['not-a-cursor', '!!!!', 'eyJib2d1cyI6dHJ1ZX0']) {
      expect(await refusalOf(() => reads.list(listInput({ cursor })))).toBe(
        'PUBLIC_DESIGN_TEMPLATE_CURSOR_INVALID',
      );
    }
    expect(repositoryCalls.list).toHaveLength(0);
  });

  it('refuses a cursor issued for a different scope', async () => {
    const foreign = encodePublicTemplateCursor(
      { createdAt: new Date('2026-01-09T00:00:00Z'), id: 'b'.repeat(8) },
      { ...SCOPE, embroideryAreaId: OTHER_AREA_ID as EmbroideryAreaId },
    );
    const { query: reads } = query([row()]);
    expect(await refusalOf(() => reads.list(listInput({ cursor: foreign })))).toBe(
      'PUBLIC_DESIGN_TEMPLATE_CURSOR_INVALID',
    );
  });

  it('refuses an invalid cursor even for an ineligible scope', async () => {
    // Otherwise which of two identical requests errors would leak the Product's
    // publication state.
    const { query: reads } = query([row()], []);
    expect(await refusalOf(() => reads.list(listInput({ cursor: 'rubbish' })))).toBe(
      'PUBLIC_DESIGN_TEMPLATE_CURSOR_INVALID',
    );
  });

  it('round-trips its own cursor', () => {
    const position = { createdAt: new Date('2026-03-04T05:06:07.008Z'), id: 'x'.repeat(12) };
    const decoded = decodePublicTemplateCursor(encodePublicTemplateCursor(position, SCOPE), SCOPE);
    expect(decoded).toEqual(position);
  });

  it('loads no document for the page', async () => {
    const { query: reads } = query([row()]);
    const page = await reads.list(listInput());
    expect(page.items[0]).not.toHaveProperty('document');
    // Two bounded statements, and no per-row version read.
    expect(ADAPTER_SOURCE).toContain('selectDistinctOn');
    expect(ADAPTER_SOURCE).not.toMatch(/for \(const .* of headers\)[\s\S]{0,200}await this\.db/);
  });
});

/* -------------------------------------------------------------------------- */
/* 19-29 — the detail                                                          */
/* -------------------------------------------------------------------------- */

describe('the detail', () => {
  const slugSchema = schemaOf(PublicDesignTemplateSlugParam);

  it('accepts only a normalized bounded slug, before any query runs', () => {
    expect(slugSchema.safeParse({ slug: 'hoa-sen-co-dien' }).success).toBe(true);
    for (const slug of [
      'Hoa-Sen',
      'hoa sen',
      'hoa--sen',
      '-hoa-sen',
      'hoa-sen-',
      'hoa_sen',
      'hoa/sen',
      "hoa'sen",
      '',
      'a'.repeat(81),
    ]) {
      expect(slugSchema.safeParse({ slug }).success).toBe(false);
    }
  });

  it('answers unknown, DRAFT, ARCHIVED and unpublished with one identical refusal', async () => {
    const refusals = await Promise.all(
      [
        // Every one of these arrives from the repository as `undefined`: the
        // header-and-version predicate excludes them in SQL, so the application
        // cannot tell them apart even if it wanted to.
        undefined,
        undefined,
        undefined,
      ].map(async (found) => {
        const { query: reads } = query([], [SCOPE], found);
        return refusalOf(() => reads.detail('hoa-sen-co-dien'));
      }),
    );
    expect(new Set(refusals)).toEqual(new Set(['PUBLIC_DESIGN_TEMPLATE_NOT_FOUND']));
  });

  it('hides a template whose product is no longer public, without mutating it', async () => {
    const { query: reads, repositoryCalls } = query([row()], []);
    expect(await refusalOf(() => reads.detail('hoa-sen-co-dien'))).toBe(
      'PUBLIC_DESIGN_TEMPLATE_NOT_FOUND',
    );
    expect(repositoryCalls.bySlug).toEqual(['hoa-sen-co-dien']);
    // The refusal is the whole response — no repair, no status write.
    expect(QUERY_SOURCE).not.toMatch(/\.update\(|\.insert\(|\.delete\(/);
  });

  it('hides a template scoped to a retired side or area', async () => {
    // The port admits the product's own triple only; a template pointing at a
    // different side or area resolves to nothing and is refused identically.
    const { query: reads } = query(
      [],
      [SCOPE],
      row({ embroideryAreaId: OTHER_AREA_ID as EmbroideryAreaId }),
    );
    expect(await refusalOf(() => reads.detail('hoa-sen-co-dien'))).toBe(
      'PUBLIC_DESIGN_TEMPLATE_NOT_FOUND',
    );
  });

  it('refuses a template with an incomplete scope', async () => {
    const { query: reads } = query([], [SCOPE], row({ embroideryAreaId: undefined }));
    expect(await refusalOf(() => reads.detail('hoa-sen-co-dien'))).toBe(
      'PUBLIC_DESIGN_TEMPLATE_NOT_FOUND',
    );
  });

  it('selects by the highest published version, never by current_version', () => {
    expect(ADAPTER_SOURCE).toContain('desc(designTemplateVersions.version)');
    expect(ADAPTER_SOURCE).toContain('isNotNull(designTemplateVersions.publishedAt)');
    expect(ADAPTER_SOURCE).not.toContain('currentVersion');
  });

  it('answers with the published document exactly as published', async () => {
    const published = { schemaVersion: 1, elements: [{ id: 'text-1' }] };
    const { query: reads } = query([], [SCOPE], row({}, { designDocument: published }));
    const detail = await reads.detail('hoa-sen-co-dien');
    expect(detail.document).toBe(published);
    // No re-canonicalization on the way out — an immutable version is answered
    // with, not repaired.
    expect(QUERY_SOURCE).not.toMatch(/prepareDesignDocument\(|canonicaliz/i);
  });

  it('leaks no private, internal or admin field', async () => {
    const { query: reads } = query([], [SCOPE], row());
    const detail = await reads.detail('hoa-sen-co-dien');
    const serialized = JSON.stringify(detail);

    for (const forbidden of [
      'previewDerivativeId',
      'storageKey',
      'bucket',
      'archivedAt',
      'currentVersion',
      'updatedAt',
      'createdAt',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    // The internal id is not the public identity; the slug is.
    expect(detail).not.toHaveProperty('templateId');
    expect(detail).not.toHaveProperty('status');
    // And the projection never reaches for them in the first place.
    expect(PROJECTION_SOURCE).not.toMatch(/template\.(previewDerivativeId|archivedAt|status)/);
  });

  it('answers a visible template with exactly the picker fields', async () => {
    const { query: reads } = query([], [SCOPE], row());
    expect(await reads.detail('hoa-sen-co-dien')).toEqual({
      slug: 'hoa-sen-co-dien',
      name: 'Hoa sen cổ điển',
      description: 'Mẫu thêu hoa sen',
      scope: { productId: PRODUCT_ID, productSideId: SIDE_ID, embroideryAreaId: AREA_ID },
      publishedVersion: {
        version: 1,
        documentSchemaVersion: 1,
        publishedAt: '2026-01-15T00:00:00.000Z',
      },
      document: { schemaVersion: 1, elements: [] },
    });
  });

  it('omits an absent description rather than sending an empty one', async () => {
    const { query: reads } = query([], [SCOPE], row({ description: undefined }));
    expect(await reads.detail('hoa-sen-co-dien')).not.toHaveProperty('description');
  });
});

/* -------------------------------------------------------------------------- */
/* 30-33 — version history                                                     */
/* -------------------------------------------------------------------------- */

describe('published version selection', () => {
  it('shows whichever published version the repository selected, and its stamp', async () => {
    for (const [selected, publishedAt] of [
      [1, '2026-01-15T00:00:00.000Z'],
      [2, '2026-03-20T00:00:00.000Z'],
    ] as const) {
      const { query: reads } = query(
        [],
        [SCOPE],
        row({}, { version: selected, publishedAt: new Date(publishedAt) }),
      );
      const detail = await reads.detail('hoa-sen-co-dien');
      expect(detail.publishedVersion.version).toBe(selected);
      expect(detail.publishedVersion.publishedAt).toBe(publishedAt);
    }
  });

  it('orders by version, so a later publication of an older version cannot win', () => {
    // `DISTINCT ON (design_template_id) … ORDER BY design_template_id, version DESC`
    // is first-row-per-group by *version*, not by publication time.
    expect(ADAPTER_SOURCE).toMatch(
      /selectDistinctOn\(\[designTemplateVersions\.designTemplateId\]\)/,
    );
    expect(ADAPTER_SOURCE).toMatch(
      /orderBy\(\s*designTemplateVersions\.designTemplateId,\s*desc\(designTemplateVersions\.version\)/,
    );
  });

  it('retains lower published versions without selecting them', () => {
    // Nothing in this checkpoint deletes or rewrites a version row.
    expect(ADAPTER_SOURCE).not.toMatch(/\.delete\(|\.update\(|\.insert\(/);
  });
});

/* -------------------------------------------------------------------------- */
/* 34-38 — read-only                                                           */
/* -------------------------------------------------------------------------- */

describe('the read-only guarantee', () => {
  it('has no write, lock or transaction anywhere in the read path', () => {
    for (const [name, code] of [
      ['adapter', ADAPTER_SOURCE],
      ['query', QUERY_SOURCE],
      ['controller', CONTROLLER_SOURCE],
    ] as const) {
      expect([name, /\.insert\(|\.update\(|\.delete\(/.test(code)]).toEqual([name, false]);
      expect([name, /runInTransaction|requireTransaction|\.for\('update'\)/.test(code)]).toEqual([
        name,
        false,
      ]);
    }
  });

  it('appends no audit row and no outbox event', () => {
    for (const code of [ADAPTER_SOURCE, QUERY_SOURCE, CONTROLLER_SOURCE]) {
      // Calls and constructions, never the words: `MODULE_SOURCE`'s own header
      // explains which modules this one deliberately does *not* import, and a
      // bare-word scan would fail on that explanation.
      expect(code).not.toMatch(/new \w*Audit\w*\(|\.record\w+\(|\.append\w*Event\(/);
    }
    expect(MODULE_IMPORTS).not.toMatch(/Audit/);
    expect(MODULE_PROVIDERS).not.toMatch(/Audit|Outbox/);
  });

  it('requests no normalization and touches no Session', () => {
    for (const code of [ADAPTER_SOURCE, QUERY_SOURCE, CONTROLLER_SOURCE]) {
      expect(code).not.toMatch(/requestNormalization\(|\.autosave\(|sessionId[,:)]/);
    }
    expect(MODULE_IMPORTS).not.toMatch(/Design(Module|Session)/);
    expect(MODULE_PROVIDERS).not.toMatch(/Session|Normaliz/);
  });

  it('binds only the read port, so no write exists to call', () => {
    // The binding, not the mention. The lifecycle token appears in this module's
    // header precisely to say it is *not* bound, so the assertion is on
    // `provide:` — the only form that would actually make a write reachable.
    expect(MODULE_PROVIDERS).toMatch(/provide: PUBLISHED_DESIGN_TEMPLATE_REPOSITORY/);
    expect(MODULE_PROVIDERS).not.toMatch(/provide: DESIGN_TEMPLATE_REPOSITORY/);
    // And the write adapter is never even imported into the module graph.
    expect(MODULE_SOURCE).not.toMatch(/import .*DrizzleDesignTemplateRepository/);
    expect(MODULE_IMPORTS).not.toMatch(/Asset|ObjectStorage|Identity/);
  });

  it('reads Catalog through the port and never its tables', () => {
    expect(QUERY_SOURCE).toContain('PRODUCT_PLACEMENT_REPOSITORY');
    expect(QUERY_SOURCE).not.toMatch(/from '\.\.\/\.\.\/catalog\/infrastructure/);
    expect(MODULE_SOURCE).toContain('CatalogPlacementReadModule');
    expect(MODULE_SOURCE).not.toMatch(/CatalogModule|CatalogPublicModule|CatalogPlacementModule\b/);
    // No re-derived publication predicate inside Design.
    expect(ADAPTER_SOURCE).not.toMatch(/products\b|categories\b/);
  });
});
