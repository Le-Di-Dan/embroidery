/**
 * Regressions for the `APP3-B08` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a working system: an autosave that extends the
 * session lifetime, one that records idempotency so a lost response can be
 * "safely" replayed, a media allowlist that reads object storage, a validation
 * pass moved inside the transaction, and a controller that trusts the path
 * parameter over the guard context. All five ship green and all five are
 * defects, which is why they are asserted structurally.
 *
 * The sub-checks run against a temp root; the whole gate is proved once, against
 * the real repository, in the last block.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { acceptedSurface, acceptedSessionPaths } from './app3-accepted-surface.mjs';
import { checkGeneratedClient, checkSurface } from './check-app3-b08-contract.mjs';
import { CANONICAL_FILES, REPO_ROOT, read } from './check-app3-b08-files.mjs';
import {
  checkApp3B08,
  checkCasContract,
  checkDocumentAuthority,
  checkDurableWrite,
  checkMediaAuthority,
  checkPlacementAuthority,
  checkRateLimits,
  checkSecurity,
  checkStatus,
  checkTestsAndIndex,
} from './check-app3-b08.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b08-'));
  temporaries.push(base);
  for (const relative of Object.values(CANONICAL_FILES)) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // Not every canonical file has to exist for a sub-check to run.
    }
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-b08-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const target = join(root, CANONICAL_FILES[key] ?? key);
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

const ROUTE = '/api/public/design-sessions/{sessionId}/document';

describe('the accepted surface authority', () => {
  it('reports the B08 surface for the delivered phase', () => {
    const surface = acceptedSurface(REPO_ROOT);
    assert.equal(surface.paths, 23);
    assert.equal(surface.operations, 27);
    // 50 at B08, 63 after `APP3-B08-C1` published the 13 P01 components, 66
    // after `APP3-P04` published the shared response snapshot.
    assert.equal(surface.schemas, 66);
    assert.equal(surface.designSessionPaths, 4);
  });

  it('hands every gate the same four Session paths', () => {
    const paths = acceptedSessionPaths(REPO_ROOT);
    assert.equal(paths.length, 4);
    assert.ok(paths.includes(ROUTE));
  });
});

describe('the status block', () => {
  it('accepts the delivered phase', () => {
    assert.deepEqual(run(checkStatus), []);
  });

  it('rejects losing any predecessor authority', () => {
    for (const line of [
      'APP3-P01 = COMPLETE — REVIEW_ACCEPTED',
      'APP3-P02 = COMPLETE — REVIEW_ACCEPTED',
      'APP3-G04 = COMPLETE — REVIEW_ACCEPTED',
      'APP3-B06B = COMPLETE — REVIEW_ACCEPTED',
    ]) {
      const phase = file('phase').replace(`\n${line}\n`, '\n');
      assert.ok(mentions(run(checkStatus, { phase }), line), line);
    }
  });

  it('rejects taking autosave cadence away from APP3-S10', () => {
    const phase = file('phase').replace(
      '\nAUTOSAVE_CADENCE_OWNER = APP3-S10\n',
      '\nAUTOSAVE_CADENCE_OWNER = APP3-B08\n',
    );
    assert.ok(mentions(run(checkStatus, { phase }), 'AUTOSAVE_CADENCE_OWNER'));
  });
});

describe('the published surface', () => {
  it('accepts the delivered artifact', () => {
    assert.deepEqual(run(checkSurface), []);
  });

  it('rejects a missing autosave operation', () => {
    const openapi = openapiWith((d) => {
      delete d.paths[ROUTE];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'is not published'));
  });

  it('rejects a renamed operation id', () => {
    const openapi = openapiWith((d) => {
      d.paths[ROUTE].put.operationId = 'publicDesignSession_save';
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'operation id is'));
  });

  it('rejects a second method on the autosave path', () => {
    const openapi = openapiWith((d) => {
      d.paths[ROUTE].patch = { operationId: 'publicDesignSession_patch' };
    });
    assert.ok(run(checkSurface, { openapi }).length > 0);
  });

  it('rejects an empty request schema', () => {
    const openapi = openapiWith((d) => {
      d.components.schemas.AutosaveDesignSessionBody = { type: 'object' };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'empty schema'));
  });

  it('rejects an optional expectedRevision', () => {
    const openapi = openapiWith((d) => {
      d.components.schemas.AutosaveDesignSessionBody.required = ['document'];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'expectedRevision'));
  });

  it('rejects a revision that stops being a non-negative integer', () => {
    for (const mutation of [{ type: 'number' }, { type: 'integer', minimum: -1 }]) {
      const openapi = openapiWith((d) => {
        d.components.schemas.AutosaveDesignSessionBody.properties.expectedRevision = mutation;
      });
      assert.ok(mentions(run(checkSurface, { openapi }), 'integer with minimum 0'));
    }
  });

  it('rejects letting the caller choose the persisted schema version', () => {
    const openapi = openapiWith((d) => {
      d.components.schemas.AutosaveDesignSessionBody.properties.documentSchemaVersion = {
        type: 'integer',
      };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'persisted schema version'));
  });

  it('rejects a sessionId that loses its uuid format', () => {
    const openapi = openapiWith((d) => {
      const parameter = d.paths[ROUTE].put.parameters.find((p) => p.name === 'sessionId');
      parameter.schema = { type: 'string' };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'uuid path parameter'));
  });

  it('rejects dropping the documented 409', () => {
    const openapi = openapiWith((d) => {
      delete d.paths[ROUTE].put.responses['409'];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), '409'));
  });

  it('rejects private material reaching the contract', () => {
    for (const leak of ['sessionSecretHash', 'storageKey', 'scopeKey']) {
      const openapi = openapiWith((d) => {
        d.components.schemas['Leak'] = { properties: { [leak]: { type: 'string' } } };
      });
      assert.ok(mentions(run(checkSurface, { openapi }), leak), leak);
    }
  });

  it('rejects the document snapshot regressing to an open object', () => {
    // The exact `APP3-B08` defect C1 corrects: an object that describes nothing.
    const openapi = openapiWith((d) => {
      d.components.schemas.AutosaveDesignSessionBody.properties.document = {
        type: 'object',
        additionalProperties: {},
      };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'does not reference DesignDocument'));
  });

  it('rejects a reference to a component that was never published', () => {
    const openapi = openapiWith((d) => {
      delete d.components.schemas.DesignDocument;
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'not published as a component'));
  });

  it('rejects the internal publication marker leaking into the contract', () => {
    const openapi = openapiWith((d) => {
      d.components.schemas.AutosaveDesignSessionBody.properties.document[
        'x-embroidery-published-schema'
      ] = 'DesignDocument';
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'marker leaked'));
  });

  it('rejects a draft-07 const surviving into OpenAPI 3.0', () => {
    const openapi = openapiWith((d) => {
      d.components.schemas.TextElement = {
        type: 'object',
        properties: { type: { const: 'text' } },
      };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'draft-07'));
  });

  it('rejects an autosave success that publishes no response schema', () => {
    // The `APP3-P04` defect: no schema generates as `void`.
    const openapi = openapiWith((d) => {
      delete d.paths[ROUTE].put.responses['200'].content;
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'publishes no success response schema'));
  });

  it('rejects an autosave response that stops sharing the snapshot component', () => {
    const openapi = openapiWith((d) => {
      d.paths[ROUTE].put.responses['200'].content['application/json'].schema = {
        type: 'object',
        additionalProperties: true,
      };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'not DesignSessionSnapshotResponse'));
  });

  it('rejects a snapshot whose document regresses to an open map', () => {
    const openapi = openapiWith((d) => {
      d.components.schemas.DesignSessionSnapshotResponse.properties.document = {
        type: 'object',
        additionalProperties: true,
      };
    });
    const failures = run(checkSurface, { openapi });
    assert.ok(mentions(failures, 'does not reference DesignDocument'), failures.join('\n'));
    assert.ok(mentions(failures, 'still published as an open object'), failures.join('\n'));
  });

  it('rejects making scope or lineage required, which runtime omits', () => {
    for (const field of ['scope', 'lineage']) {
      const openapi = openapiWith((d) => {
        const snapshot = d.components.schemas.DesignSessionSnapshotResponse;
        snapshot.required = [...snapshot.required, field];
      });
      assert.ok(mentions(run(checkSurface, { openapi }), `"${field}" is required`), field);
    }
  });

  it('rejects dropping a field the runtime always returns', () => {
    const openapi = openapiWith((d) => {
      const snapshot = d.components.schemas.DesignSessionSnapshotResponse;
      snapshot.required = snapshot.required.filter((name) => name !== 'revision');
    });
    assert.ok(mentions(run(checkSurface, { openapi }), '"revision" is not required'));
  });

  it('rejects an adjacent operation B08 does not own', () => {
    const openapi = openapiWith((d) => {
      d.paths['/api/public/design-sessions/{sessionId}/elements'] = { post: {} };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'beyond the one autosave operation'));
  });
});

describe('the document pipeline', () => {
  it('accepts the delivered authority', () => {
    assert.deepEqual(run(checkDocumentAuthority), []);
  });

  it('rejects skipping quantization and canonicalization', () => {
    const documents = file('documents').replace(/prepareDesignDocument/g, 'validateOnly');
    assert.ok(mentions(run(checkDocumentAuthority, { documents }), 'prepare pipeline'));
  });

  it('rejects dropping contextual media validation', () => {
    const documents = file('documents').replace(/validateDesignDocumentContext/g, 'noContext');
    assert.ok(mentions(run(checkDocumentAuthority, { documents }), 'contextual media'));
  });

  it('rejects dropping either half of the P02 authority', () => {
    for (const [symbol, complaint] of [
      ['validatePlacementSnapshot', 'placement authority'],
      ['validateDocumentWithinEmbroideryArea', 'containment authority'],
    ]) {
      const documents = file('documents').replaceAll(symbol, 'skipped');
      assert.ok(mentions(run(checkDocumentAuthority, { documents }), complaint), complaint);
    }
  });

  it('rejects a local copy of the document schema', () => {
    const documents = `${file('documents')}\nconst local = z.object({ elements: [] });\n`;
    assert.ok(mentions(run(checkDocumentAuthority, { documents }), 'local document schema'));
  });

  it('rejects importing rendering code into the API', () => {
    const documents = `import { Stage } from 'konva';\n${file('documents')}`;
    assert.ok(mentions(run(checkDocumentAuthority, { documents }), 'rendering code'));
  });
});

describe('the placement authority', () => {
  it('accepts the delivered resolver', () => {
    assert.deepEqual(run(checkPlacementAuthority), []);
  });

  it('rejects resolving placement from anything but the persisted Product', () => {
    const placement = file('placement').replace(
      'findPlacement(session.productId',
      'findPlacement(input.productId',
    );
    assert.ok(mentions(run(checkPlacementAuthority, { placement }), 'persisted Product'));
  });

  it('rejects dropping the Area-belongs-to-Side check', () => {
    const placement = file('placement').replace('area.productSideId !== side.id', 'false');
    assert.ok(mentions(run(checkPlacementAuthority, { placement }), 'belongs to that Side'));
  });

  it('rejects discarding retirement', () => {
    const placement = file('placement').replaceAll('retiredAt', 'ignoredAt');
    assert.ok(mentions(run(checkPlacementAuthority, { placement }), 'retirement'));
  });
});

describe('the media allowlist', () => {
  it('accepts the delivered authority', () => {
    assert.deepEqual(run(checkMediaAuthority), []);
  });

  it('rejects an allowlist not scoped to this session', () => {
    const mediaAuthority = file('mediaAuthority').replace(/listAssetIds/g, 'listAllAssetIds');
    assert.ok(mentions(run(checkMediaAuthority, { mediaAuthority }), 'scope the allowlist'));
  });

  it('rejects reading object storage to validate a document', () => {
    const mediaAuthority = `${file('mediaAuthority')}\nasync function peek() { await storage.headObject({}); }\n`;
    assert.ok(mentions(run(checkMediaAuthority, { mediaAuthority }), 'object storage'));
  });

  it('rejects restating the editor-safe vocabulary instead of deferring to P01', () => {
    const mediaAuthority = file('mediaAuthority').replace(
      'const map = new Map',
      "const eligible = 'NORMALIZED';\n  const map = new Map",
    );
    assert.ok(mentions(run(checkMediaAuthority, { mediaAuthority }), 'restates'));
  });
});

describe('the durable write', () => {
  it('accepts the delivered use case', () => {
    assert.deepEqual(run(checkDurableWrite), []);
  });

  it('rejects abandoning the DB7 CAS', () => {
    const useCase = file('useCase').replace(/saveDocument\(/g, 'updateDocument(');
    assert.ok(mentions(run(checkDurableWrite, { useCase }), 'DB7 autosave CAS'));
  });

  it('rejects an autosave that extends the session lifetime', () => {
    const useCase = file('useCase').replace(
      'expectedRevision,\n        }),',
      'expectedRevision,\n          expiresAt: new Date(),\n        }),',
    );
    assert.ok(mentions(run(checkDurableWrite, { useCase }), 'expiry'));
  });

  it('rejects rotating or issuing a credential on autosave', () => {
    for (const [injection, complaint] of [
      ['\nconst rotated = await this.sessions.rotateSecret({});\n', 'credential'],
      ["\nresponse.setHeader('Set-Cookie', cookie);\n", 'cookie'],
    ]) {
      const useCase = file('useCase') + injection;
      assert.ok(mentions(run(checkDurableWrite, { useCase }), complaint), complaint);
    }
  });

  it('rejects adding autosave idempotency, which would enable blind replay', () => {
    const useCase = `${file('useCase')}\nconst claim = await this.allocations.claimWithAllocation({});\n`;
    assert.ok(mentions(run(checkDurableWrite, { useCase }), 'idempotency'));
  });

  it('rejects appending an event for a document save', () => {
    const useCase = `${file('useCase')}\nawait this.outbox.append({});\n`;
    assert.ok(mentions(run(checkDurableWrite, { useCase }), 'event'));
  });

  it('rejects taking autosave cadence into backend authority', () => {
    const useCase = `${file('useCase')}\nconst debounceMs = 2000;\n`;
    assert.ok(mentions(run(checkDurableWrite, { useCase }), 'cadence'));
  });

  it('rejects moving validation inside the durable transaction', () => {
    // Reordered so the transaction opens before the document is judged: a row
    // lock held across work that cannot fail the CAS.
    const useCase = file('useCase')
      .replace('const outcome = this.documents.validateForSave', 'const outcome = this.LATER')
      .replace('runInTransaction', 'runInTransaction /* first */')
      .concat('\nconst late = this.documents.validateForSave(x, y, z);\n');
    assert.ok(mentions(run(checkDurableWrite, { useCase }), 'inside the durable transaction'));
  });

  it('rejects losing the 409 mapping', () => {
    const useCase = file('useCase').replace(/designSessionStaleWrite\(\)/g, 'error');
    assert.ok(mentions(run(checkDurableWrite, { useCase }), '409'));
  });
});

describe('the CAS contract', () => {
  it('accepts the delivered repository port', () => {
    assert.deepEqual(run(checkCasContract), []);
  });

  it('rejects losing the ACTIVE/expiry guard statement', () => {
    const sessionRepository = file('sessionRepository')
      .replace(/ACTIVE and not expired/g, 'whenever')
      .replace(/G-DB7-19/g, 'G-DB7-XX');
    assert.ok(mentions(run(checkCasContract, { sessionRepository }), 'ACTIVE/expiry'));
  });
});

describe('security reuse', () => {
  it('accepts the delivered controller', () => {
    assert.deepEqual(run(checkSecurity), []);
  });

  it('rejects trusting the path parameter over the guard context', () => {
    const controller = file('controller').replace(
      'sessionId: context.designSessionId,',
      'sessionId: params.sessionId,',
    );
    assert.ok(mentions(run(checkSecurity, { controller }), 'path parameter'));
  });

  it('rejects an unguarded autosave route', () => {
    const controller = file('controller').replace(
      "@Put(':sessionId/document')\n  @HttpCode(HttpStatus.OK)\n  @UseGuards(DesignSessionGuard)",
      "@Put(':sessionId/document')\n  @HttpCode(HttpStatus.OK)",
    );
    assert.ok(mentions(run(checkSecurity, { controller }), 'DesignSessionGuard'));
  });

  it('rejects re-implementing B06A security in the controller', () => {
    const controller = `${file('controller')}\nconst mac = createHmac('sha256', pepper);\n`;
    assert.ok(mentions(run(checkSecurity, { controller }), 're-implements'));
  });

  it('rejects reporting which document rule failed', () => {
    const controller = file('controller').replace(/designSessionDocumentRefused/g, 'detailedError');
    assert.ok(mentions(run(checkSecurity, { controller }), 'one refusal'));
  });
});

describe('inherited abuse limits', () => {
  it('accepts the delivered configuration', () => {
    assert.deepEqual(run(checkRateLimits), []);
  });

  it('rejects widening the mutation budget', () => {
    // Widened to 300 — the mutation that a boundary-less `30` would accept.
    const authConfig = file('authConfig').replace('mutation: { max: 30,', 'mutation: { max: 300,');
    assert.ok(mentions(run(checkRateLimits, { authConfig }), '30/minute'));
  });
});

describe('the generated client', () => {
  it('accepts the delivered client', () => {
    assert.deepEqual(run(checkGeneratedClient), []);
  });

  it('rejects a stale client that lacks the autosave method', () => {
    const client = file('client').replace(/publicDesignSessionAutosave/g, 'somethingElse');
    assert.ok(mentions(run(checkGeneratedClient, { client }), 'autosave method'));
  });

  it('rejects a client whose request type is not concrete', () => {
    const clientSchemas = file('clientSchemas').replace(
      /expectedRevision: number/g,
      'expectedRevision: unknown',
    );
    assert.ok(mentions(run(checkGeneratedClient, { clientSchemas }), 'not concrete'));
  });

  it('rejects a client whose autosave success falls back to void', () => {
    // `APP3-P04`'s reason for existing, asserted at the generated-client edge.
    const client = file('client').replace(
      /apiRequest<PublicDesignSessionAutosave200>/g,
      'apiRequest<void>',
    );
    assert.ok(mentions(run(checkGeneratedClient, { client }), 'resolves its success to "void"'));
  });

  it('rejects a client whose autosave success type is not generated', () => {
    const client = file('client').replace(
      /apiRequest<PublicDesignSessionAutosave200>/g,
      'apiRequest<SomethingUndeclared>',
    );
    assert.ok(mentions(run(checkGeneratedClient, { client }), 'is not a generated type'));
  });

  it('rejects a client that types the document as an unbounded map again', () => {
    const clientSchemas = file('clientSchemas')
      .replace(/export interface DesignDocument\b/g, 'export interface DesignDoc')
      .replace(/document: DesignDocument/g, 'document: { [key: string]: unknown }');
    const failures = run(checkGeneratedClient, { clientSchemas });
    assert.ok(mentions(failures, 'Design Document type was not generated'), failures.join('\n'));
  });
});

describe('suites and command index', () => {
  it('accepts the delivered suites', () => {
    assert.deepEqual(run(checkTestsAndIndex), []);
  });

  it('rejects an unindexed command', () => {
    for (const id of ['CMD-CHECK-APP3-B08', 'CMD-TEST-APP3-B08-INTEGRATION']) {
      const commandIndex = file('commandIndex').replaceAll(id, 'CMD-X');
      assert.ok(mentions(run(checkTestsAndIndex, { commandIndex }), id), id);
    }
  });

  it('rejects a live suite that stops racing', () => {
    const liveSpec = file('liveSpec').replace(/iteration < 10/g, 'iteration < 1');
    assert.ok(mentions(run(checkTestsAndIndex, { liveSpec }), 'ten-iteration race'));
  });

  it('rejects a race whose writers are no longer concurrent', () => {
    const liveSpec = file('liveSpec').replaceAll('Promise.all(', 'sequential(');
    assert.ok(mentions(run(checkTestsAndIndex, { liveSpec }), 'concurrent writers'));
  });
});

describe('the whole gate, against the real repository', () => {
  it('passes, chain and all', () => {
    assert.deepEqual(checkApp3B08(REPO_ROOT), []);
  });
});
