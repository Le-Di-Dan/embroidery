/**
 * The generated Design Document JSON Schema (`APP3-B08-C1`).
 *
 * These prove the one property the correction rests on: the published schema is
 * **derived** from P01's TypeScript types, not authored beside them. So the
 * assertions are about coverage and determinism — every exported v1 shape must
 * appear, and the same types must always produce the same bytes — rather than
 * about individual field spellings, which would be the second field definition
 * this whole approach exists to avoid.
 *
 * The generator runs as a child process rather than being imported. It is an
 * ESM build script that depends on a devDependency, and pulling it into this
 * package's module graph would put a tooling package one import away from the
 * browser-safe runtime root. Spawning also means the proofs exercise the real
 * command a developer and the gate run, not a re-implementation of it.
 *
 * The drift case mutates a *copy* of the committed artifact. A drift proof that
 * edits the real artifact or the real types proves only that it can break them.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION } from './constants';

interface JsonSchemaNode {
  readonly type?: string;
  readonly $ref?: string;
  readonly anyOf?: readonly JsonSchemaNode[];
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly items?: JsonSchemaNode;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly properties?: Readonly<Record<string, JsonSchemaNode>>;
}

interface GeneratedSchema {
  readonly $ref: string;
  readonly definitions: Readonly<Record<string, JsonSchemaNode>>;
}

const PACKAGE_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(PACKAGE_ROOT, 'scripts', 'generate-schema.mjs');
// Must stay the generator's own output path. It lives under `src/` because the
// API consumes the built package (IMP-D018) and an artifact outside `src/` would
// never reach `dist`; a second spelling of it here is how this suite ends up
// proving a file nothing publishes.
const ARTIFACT = join(PACKAGE_ROOT, 'src', 'schema', 'generated', 'design-document.schema.json');
const ROOT_TYPE = 'DesignDocument';

/** One invocation of the real generator. Generation is slow; callers cache. */
function run(args: readonly string[]): { status: number; stdout: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
  });
  return { status: result.status ?? -1, stdout: result.stdout };
}

const committed = readFileSync(ARTIFACT, 'utf8');
const schema = JSON.parse(committed) as GeneratedSchema;

describe('generation', () => {
  let first: string;

  beforeAll(() => {
    first = run(['--stdout']).stdout;
  }, 120_000);

  it('reproduces the committed artifact byte for byte', () => {
    expect(first).toBe(committed);
  });

  it('is deterministic across runs', () => {
    expect(run(['--stdout']).stdout).toBe(first);
  }, 120_000);

  it('reports the committed artifact as current', () => {
    expect(run(['--check']).status).toBe(0);
  }, 120_000);

  it('refuses an artifact that has drifted from the types', () => {
    const directory = mkdtempSync(join(tmpdir(), 'p01-schema-drift-'));
    try {
      const drifted = join(directory, 'drifted.json');
      // A renamed root field: exactly what a TypeScript change without a
      // regeneration would leave behind.
      writeFileSync(drifted, committed.replace('"schemaVersion"', '"schemaVersionRenamed"'));
      expect(run(['--check', drifted]).status).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it('is marked generated, so nobody edits it by hand', () => {
    expect(committed).toContain('GENERATED — DO NOT EDIT');
  });

  it('is rooted at the P01 type name, not an API-specific alias', () => {
    expect(schema.$ref).toBe(`#/definitions/${ROOT_TYPE}`);
  });
});

describe('coverage of the v1 model', () => {
  const root = schema.definitions[ROOT_TYPE]!;

  it('publishes the three root concerns as required', () => {
    expect(root.required).toEqual(
      expect.arrayContaining(['schemaVersion', 'placement', 'elements']),
    );
    expect(root.additionalProperties).toBe(false);
  });

  it('resolves placement and elements through references, not inline blobs', () => {
    expect(root.properties?.placement?.$ref).toBe('#/definitions/DesignPlacementSnapshot');
    expect(root.properties?.elements?.type).toBe('array');
    expect(root.properties?.elements?.items?.$ref).toBe('#/definitions/DesignElement');
  });

  it('represents every exported v1 shape', () => {
    for (const name of [
      'DesignDocument',
      'DesignPlacementSnapshot',
      'DesignElement',
      'DesignElementTransform',
      'TextElement',
      'ImageElement',
      'ShapeElement',
      'FreehandElement',
      'GroupElement',
      'FreehandPoint',
      'FontStyle',
      'TextAlign',
      'ShapeKind',
    ]) {
      expect(schema.definitions[name]).toBeDefined();
    }
  });

  it('publishes the element union with all five members', () => {
    const members = (schema.definitions['DesignElement']?.anyOf ?? []).map((entry) => entry.$ref);
    expect(members).toEqual([
      '#/definitions/TextElement',
      '#/definitions/ImageElement',
      '#/definitions/ShapeElement',
      '#/definitions/FreehandElement',
      '#/definitions/GroupElement',
    ]);
  });

  it('discriminates each variant by a literal type', () => {
    for (const [name, literal] of [
      ['TextElement', 'text'],
      ['ImageElement', 'image'],
      ['ShapeElement', 'shape'],
      ['FreehandElement', 'freehand'],
      ['GroupElement', 'group'],
    ] as const) {
      expect(schema.definitions[name]?.properties?.type?.const).toBe(literal);
    }
  });

  it('closes every object, matching the runtime unknown-key rejection', () => {
    for (const [name, node] of Object.entries(schema.definitions)) {
      if (node.type === 'object') {
        expect([name, node.additionalProperties]).toEqual([name, false]);
      }
    }
  });

  it('carries the string unions as enums', () => {
    expect(schema.definitions['FontStyle']?.enum).toEqual(['normal', 'italic']);
    expect(schema.definitions['TextAlign']?.enum).toEqual(['left', 'center', 'right']);
    expect(schema.definitions['ShapeKind']?.enum).toEqual(['rectangle', 'ellipse', 'line']);
  });
});

describe('the boundary between structure and semantics', () => {
  it('states structure only, leaving runtime rules to the validators', () => {
    // `schemaVersion` is `number` in TypeScript, so it is `number` here. That
    // only version 1 is accepted is a runtime rule, and duplicating it into the
    // schema is exactly the second definition this correction refuses.
    expect(schema.definitions[ROOT_TYPE]?.properties?.schemaVersion?.type).toBe('number');
    expect(CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION).toBe(1);
  });

  it('does not restate runtime-only constraints', () => {
    const text = JSON.stringify(schema);
    // None of these are expressible from the TypeScript types, so their absence
    // is the correct outcome rather than a gap to be filled by hand.
    for (const runtimeOnly of ['minLength', 'exclusiveMinimum', 'maxItems', 'pattern']) {
      expect(text).not.toContain(`"${runtimeOnly}"`);
    }
  });
});
