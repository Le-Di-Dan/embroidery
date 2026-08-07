/**
 * Regressions for the `APP3-B07` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a working system: a clone that keeps a live Template
 * reference, a rotation that drops its old-digest guard, a resume that extends
 * the TTL, a Design module that imports the controller-bearing placement module.
 * All four ship green and all four are defects, which is why they are asserted
 * structurally rather than left to a passing suite.
 *
 * The sub-checks run against a temp root; the predecessor chain is proved once,
 * against the real repository, in the last block.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { acceptedSurface } from './app3-accepted-surface.mjs';
import { CANONICAL_FILES, read } from './check-app3-b07-files.mjs';
import { checkRequestContract, checkSurface } from './check-app3-b07-contract.mjs';
import { REPO_ROOT, checkApp3B07 } from './check-app3-b07.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b07-'));
  temporaries.push(base);
  const extras = [
    'tools/check-app3-b07.mjs',
    'tools/check-app3-b07-contract.mjs',
    'tools/check-app3-b07-files.mjs',
    'tools/check-app3-b07.test.mjs',
  ];
  for (const relative of [...Object.values(CANONICAL_FILES), ...extras]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // The completion report does not exist while Commit A is prepared.
    }
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-b07-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const relative = CANONICAL_FILES[key] ?? key;
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

/** One check against a mutated root. */
function run(check, overrides = {}) {
  const failures = [];
  check(rootWith(overrides), (message) => failures.push(message));
  return failures;
}

/** The generated document with one mutation applied. */
function openapiWith(mutate) {
  const document = JSON.parse(file('openapi'));
  mutate(document);
  return JSON.stringify(document);
}

describe('the accepted surface authority', () => {
  it('reports the B07 surface for the delivered phase', () => {
    const surface = acceptedSurface(REPO_ROOT);
    assert.equal(surface.paths, 21);
    assert.equal(surface.operations, 25);
    assert.equal(surface.designSessionRoutes, true);
  });

  it('falls back to the pre-B07 baseline when no checkpoint is recorded', () => {
    const surface = acceptedSurface(rootWith({ phase: '# empty\n' }));
    assert.equal(surface.paths, 19);
    assert.equal(surface.operations, 23);
    assert.equal(surface.designSessionRoutes, false);
  });

  it('derives from the accepted status, never by counting the artifact', () => {
    // Counting the artifact would make any surface self-justifying.
    const source = file('tools/app3-accepted-surface.mjs');
    assert.ok(!/openapi\.generated\.json/.test(source));
  });
});

describe('the published surface', () => {
  it('accepts the delivered artifact', () => {
    assert.deepEqual(run(checkSurface), []);
  });

  it('rejects a missing B07 operation', () => {
    const openapi = openapiWith((d) => {
      delete d.paths['/api/public/design-sessions/{sessionId}/resume'];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'design-session paths, expected 2'));
  });

  it('rejects a third B07 operation', () => {
    const openapi = openapiWith((d) => {
      d.paths['/api/public/design-sessions/{sessionId}/abandon'] = { post: {} };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'design-session paths, expected 2'));
  });

  it('rejects a pre-B07 count under a delivered B07', () => {
    const openapi = openapiWith((d) => {
      delete d.paths['/api/public/design-sessions'];
      delete d.paths['/api/public/design-sessions/{sessionId}/resume'];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'paths, expected 21'));
  });

  it('rejects a bootstrap body that stops publishing both branches', () => {
    const openapi = openapiWith((d) => {
      d.components.schemas['CreateDesignSessionBody'] = { type: 'object', properties: {} };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'does not publish both branches'));
  });

  it('rejects an empty branch schema', () => {
    const openapi = openapiWith((d) => {
      d.components.schemas['CloneDesignSessionBody'] = { type: 'object' };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'publishes no properties'));
  });

  it('rejects an empty B07 path parameter', () => {
    const openapi = openapiWith((d) => {
      d.paths['/api/public/design-sessions/{sessionId}/resume'].post.parameters = [
        { name: 'sessionId', in: 'path', schema: {} },
      ];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'publishes {}'));
  });

  it('rejects secret material reaching the contract', () => {
    const openapi = openapiWith((d) => {
      d.components.schemas['Leak'] = { properties: { sessionSecretHash: { type: 'string' } } };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'publishes secret material'));
  });
});

describe('the request contract', () => {
  it('accepts the delivered schema', () => {
    assert.deepEqual(run(checkRequestContract), []);
  });

  it('rejects flattening the discriminated union', () => {
    const request = file('request').replace(/discriminatedUnion\('mode'/, 'union(');
    assert.ok(mentions(run(checkRequestContract, { request }), 'not a discriminated union'));
  });

  it('rejects losing a branch or the Template identifier', () => {
    for (const [needle, what] of [
      ["z.literal('BLANK')", 'BLANK branch'],
      ["z.literal('CLONE_TEMPLATE')", 'CLONE_TEMPLATE branch'],
    ]) {
      const request = file('request').replaceAll(needle, "z.literal('X')");
      assert.ok(run(checkRequestContract, { request }).length > 0, what);
    }
  });

  it('rejects dropping strict unknown-field rejection', () => {
    const request = file('request').replaceAll('.strict()', '');
    assert.ok(mentions(run(checkRequestContract, { request }), 'no longer rejected'));
  });

  it('rejects a controller that stops narrowing with the schema', () => {
    const controller = file('controller').replace(
      'createDesignSessionSchema.parse(body)',
      'body as never',
    );
    assert.ok(
      mentions(run(checkRequestContract, { controller }), 'does not narrow with the schema'),
    );
  });

  it('rejects casting the request body', () => {
    const controller = `${file('controller')}\nconst probe = (b) => b as unknown as never;\n`;
    assert.ok(mentions(run(checkRequestContract, { controller }), 'casts the request body'));
  });
});

describe('the whole gate, against the real repository', () => {
  it('passes, chain and all', () => {
    assert.deepEqual(checkApp3B07(REPO_ROOT), []);
  });
});
