/**
 * The published `APP5-B05` contract, built in process, plus the one enum
 * widening `APP6-B06` makes to it.
 *
 * The integration suites prove what the two mutations *do*; this proves what the
 * document *says*, which is the half every generated client depends on. It runs
 * before the single generation slot is spent, so a defect found here costs
 * nothing while one found in the committed artifact costs the slot.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const NOTES_PATH = '/api/admin/custom-requests/{requestId}/moderation-notes';
const TRANSITIONS_PATH = '/api/admin/custom-requests/{requestId}/transitions';

interface SchemaShape {
  readonly properties?: Record<string, SchemaShape>;
  readonly required?: readonly string[];
  readonly additionalProperties?: unknown;
  readonly enum?: readonly string[];
  readonly $ref?: string;
}
interface OperationShape {
  readonly operationId?: string;
  readonly requestBody?: {
    readonly content?: Record<string, { readonly schema?: SchemaShape }>;
  };
  readonly responses?: Record<string, unknown>;
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Fields the server owns outright. None may be accepted by either body.
 *
 * `fromStatus` is on the list for the reason `APP5-B05` §4 gives: the state a
 * request is moving out of is read and locked by the server, and a body that
 * could state one would be a client deciding what it raced against.
 */
const SERVER_OWNED_INPUTS = [
  'fromStatus',
  'adminId',
  'customerId',
  'actorKind',
  'actor',
  'correlationId',
  'requestId',
  'sequence',
  'createdAt',
  'occurredAt',
  'timestamp',
];

/** Substrings no B05 schema, property name, description or example may contain. */
const FORBIDDEN_IN_B05_SCHEMAS = [
  'tokenHash',
  'tokenDigest',
  'storageKey',
  'objectKey',
  'bucket',
  'sessionSecret',
  'secretHash',
  'idempotencyKey',
  'grantToken',
];

describe('APP5-B05 — the published Admin moderation contract', () => {
  let app: INestApplication;
  let document: OpenApiShape;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    previousUrl = process.env['DATABASE_URL'];
    ensureGenerationEnvironment();
    app = await createApiApplication({ logger: false });
    document = buildOpenApiDocument(app) as unknown as OpenApiShape;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    if (previousUrl === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = previousUrl;
  });

  function bodySchema(path: string): SchemaShape {
    const inline =
      document.paths[path]?.['post']?.requestBody?.content?.['application/json']?.schema;
    const ref = inline?.$ref;
    if (ref === undefined) {
      return inline ?? {};
    }
    return document.components.schemas[ref.replace('#/components/schemas/', '')] ?? {};
  }

  it('publishes exactly two mutations, under the B04 domain, with no id reissued', () => {
    expect(Object.keys(document.paths[NOTES_PATH] ?? {})).toEqual(['post']);
    expect(Object.keys(document.paths[TRANSITIONS_PATH] ?? {})).toEqual(['post']);
    expect(document.paths[NOTES_PATH]?.['post']?.operationId).toBe('adminCustomRequest_appendNote');
    expect(document.paths[TRANSITIONS_PATH]?.['post']?.operationId).toBe(
      'adminCustomRequest_transition',
    );
    // `APP5-B04`'s two accepted ids are untouched by the controller split.
    expect(document.paths['/api/admin/custom-requests']?.['get']?.operationId).toBe(
      'adminCustomRequest_list',
    );
    expect(document.paths['/api/admin/custom-requests/{requestId}']?.['get']?.operationId).toBe(
      'adminCustomRequest_detail',
    );
  });

  it('publishes no route that could edit or remove a note', () => {
    const noteRoutes = Object.keys(document.paths).filter((path) =>
      path.includes('/moderation-notes'),
    );
    expect(noteRoutes).toEqual([NOTES_PATH]);
    expect(Object.keys(document.paths[NOTES_PATH] ?? {})).not.toContain('put');
    expect(Object.keys(document.paths[NOTES_PATH] ?? {})).not.toContain('patch');
    expect(Object.keys(document.paths[NOTES_PATH] ?? {})).not.toContain('delete');
  });

  it.each([
    ['the note body', NOTES_PATH],
    ['the transition body', TRANSITIONS_PATH],
  ])('accepts no server-owned field in %s', (_label, path) => {
    const schema = bodySchema(path);
    const properties = Object.keys(schema.properties ?? {});
    expect(properties.length).toBeGreaterThan(0);
    for (const field of SERVER_OWNED_INPUTS) {
      expect(properties).not.toContain(field);
    }
    // `.strict()` reaches the document as `additionalProperties: false`, so an
    // unlisted field is refused rather than ignored.
    expect(schema.additionalProperties).toBe(false);
  });

  it('offers the four APP5 targets plus DIGITIZING, and no system-owned state', () => {
    const targets = bodySchema(TRANSITIONS_PATH).properties?.['toStatus']?.enum ?? [];
    expect([...targets].sort()).toEqual([
      'CANCELLED',
      'DIGITIZING',
      'NEEDS_CLARIFICATION',
      'REJECTED',
      'UNDER_REVIEW',
    ]);
  });

  it('keeps the four system-owned APP6 states out of the published command enum', () => {
    // `APP6-G01` §4.1. These four are projections written inside the quotation
    // or design transaction that causes them; publishing one here is the exact
    // failure `APP6-B06` exists to prevent, and the schema boundary — not the
    // policy behind it — is where a client's attempt has to die.
    const targets = bodySchema(TRANSITIONS_PATH).properties?.['toStatus']?.enum ?? [];
    for (const systemOwned of ['QUOTED', 'QUOTE_ACCEPTED', 'DESIGN_REVIEW', 'APPROVED']) {
      expect(targets).not.toContain(systemOwned);
    }
    // Nor is the enum quietly the whole lifecycle vocabulary.
    expect(targets).not.toContain('NEW');
    expect(targets).toHaveLength(5);
  });

  it('offers only the four APP5 note kinds, and not PAUSE', () => {
    const kinds = bodySchema(NOTES_PATH).properties?.['kind']?.enum ?? [];
    expect([...kinds].sort()).toEqual(['CLARIFY', 'NOTE', 'REJECT', 'SPAM']);
  });

  it('requires only the two fields a note append owns', () => {
    expect([...(bodySchema(NOTES_PATH).required ?? [])].sort()).toEqual(['kind', 'note']);
    // The transition's conditional requirements are decided against the state
    // the request is in, so the contract requires only the target.
    expect(bodySchema(TRANSITIONS_PATH).required).toEqual(['toStatus']);
  });

  it('documents the refusals a client must branch on', () => {
    // `500` is the platform's, added to every operation by the envelope
    // augmentation rather than declared here.
    expect(Object.keys(document.paths[TRANSITIONS_PATH]?.['post']?.responses ?? {}).sort()).toEqual(
      ['200', '400', '401', '403', '404', '409', '415', '500'],
    );
    expect(Object.keys(document.paths[NOTES_PATH]?.['post']?.responses ?? {}).sort()).toEqual([
      '201',
      '400',
      '401',
      '403',
      '404',
      '415',
      '500',
    ]);
  });

  it('names no credential and no unreleased APP6 capability in its components', () => {
    // B05's own four components, named exactly. `APP5-B04`'s history and note
    // components are deliberately excluded: those publish the whole LC-11
    // vocabulary so a read can report a `QUOTED` request truthfully, which is
    // that checkpoint's contract and not a capability offered here.
    const B05_COMPONENTS = [
      'AppendModerationNoteBody',
      'TransitionCustomRequestBody',
      'ModerationNoteAppendedResponse',
      'RequestTransitionedResponse',
    ];
    const b05Schemas = Object.entries(document.components.schemas).filter(([name]) =>
      B05_COMPONENTS.includes(name),
    );
    expect(b05Schemas.map(([name]) => name).sort()).toEqual([...B05_COMPONENTS].sort());
    const serialized = JSON.stringify(Object.fromEntries(b05Schemas));
    for (const forbidden of FORBIDDEN_IN_B05_SCHEMAS) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // `DIGITIZING` is now a released command target and is expected in the
    // transition body; the four states no operator commands are not.
    for (const systemOwned of ['QUOTED', 'QUOTE_ACCEPTED', 'DESIGN_REVIEW', 'APPROVED']) {
      expect(serialized).not.toContain(systemOwned);
    }
  });
});
