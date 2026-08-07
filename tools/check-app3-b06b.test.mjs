/**
 * Regressions for the `APP3-B06B` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a working system: an intake that buffers the body, a
 * lane whose ceiling drifts to the Admin 25 MiB, a transaction that associates
 * before it proves the Session live, a second normalization append, an expired
 * allocation that deletes an object it cannot identify. All five ship green and
 * all five are defects, which is why they are asserted structurally.
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
import { CANONICAL_FILES, read } from './check-app3-b06b-files.mjs';
import { checkLane, checkResponse, checkSurface } from './check-app3-b06b-contract.mjs';
import {
  REPO_ROOT,
  checkApp3B06B,
  checkAssociation,
  checkDurableTransaction,
  checkSecurity,
  checkStreaming,
} from './check-app3-b06b.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b06b-'));
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
  const root = mkdtempSync(join(tmpdir(), 'app3-b06b-case-'));
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

const ROUTE = '/api/public/design-sessions/{sessionId}/assets';

describe('the accepted surface authority', () => {
  it('reports the B06B surface for the delivered phase', () => {
    const surface = acceptedSurface(REPO_ROOT);
    assert.equal(surface.paths, 22);
    assert.equal(surface.operations, 26);
    assert.equal(surface.schemas, 49);
    assert.equal(surface.designSessionPaths, 3);
  });

  it('hands every gate the same three Session paths', () => {
    const paths = acceptedSessionPaths(REPO_ROOT);
    assert.equal(paths.length, 3);
    assert.ok(paths.includes(ROUTE));
  });

  it('falls back below B07 when no checkpoint is recorded', () => {
    const root = rootWith({ phase: '# empty\n' });
    assert.equal(acceptedSurface(root).paths, 19);
    assert.deepEqual(acceptedSessionPaths(root), []);
  });
});

describe('the published surface', () => {
  it('accepts the delivered artifact', () => {
    assert.deepEqual(run(checkSurface), []);
  });

  it('rejects a missing intake operation', () => {
    const openapi = openapiWith((d) => {
      delete d.paths[ROUTE];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'is not published'));
  });

  it('rejects a renamed operation id', () => {
    const openapi = openapiWith((d) => {
      d.paths[ROUTE].post.operationId = 'publicDesignSessionAsset_upload';
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'operation id is'));
  });

  it('rejects a second method on the intake path', () => {
    const openapi = openapiWith((d) => {
      d.paths[ROUTE].get = { operationId: 'publicDesignSessionAsset_list' };
    });
    assert.ok(run(checkSurface, { openapi }).length > 0);
  });

  it('rejects a multipart body that stops being one binary part', () => {
    const openapi = openapiWith((d) => {
      d.paths[ROUTE].post.requestBody.content['multipart/form-data'].schema.properties.assetKind = {
        type: 'string',
      };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'exactly one "file" part'));
  });

  it('rejects a non-binary file part', () => {
    const openapi = openapiWith((d) => {
      d.paths[ROUTE].post.requestBody.content['multipart/form-data'].schema.properties.file.format =
        'byte';
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'not binary'));
  });

  it('rejects a sessionId parameter that loses its uuid format', () => {
    const openapi = openapiWith((d) => {
      const parameter = d.paths[ROUTE].post.parameters.find((p) => p.name === 'sessionId');
      parameter.schema = { type: 'string' };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'uuid path parameter'));
  });

  it('rejects private material reaching the contract', () => {
    for (const leak of ['objectKey', 'sessionSecretHash', 'claimToken']) {
      const openapi = openapiWith((d) => {
        d.components.schemas['Leak'] = { properties: { [leak]: { type: 'string' } } };
      });
      assert.ok(mentions(run(checkSurface, { openapi }), leak), leak);
    }
  });

  it('rejects a presign or upload-intent operation appearing', () => {
    const openapi = openapiWith((d) => {
      d.paths['/api/public/design-sessions/{sessionId}/assets/presign'] = { post: {} };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'presign'));
  });
});

describe('the two lanes', () => {
  it('accepts the delivered lanes', () => {
    assert.deepEqual(run(checkLane), []);
  });

  it('rejects a Session ceiling that drifts to the Admin one', () => {
    const policy = file('policy').replace('10_485_760', '26_214_400');
    assert.ok(run(checkLane, { policy }).length > 0);
  });

  it('rejects a guest upload landing in the catalog lane', () => {
    const policy = file('policy').replace("'CUSTOMER_UPLOAD'", "'CATALOG_MEDIA'");
    assert.ok(mentions(run(checkLane, { policy }), 'CUSTOMER_UPLOAD'));
  });

  it('rejects a guest upload that is not private', () => {
    const policy = file('policy').replace("'CUSTOMER_PRIVATE'", "'PRODUCTION_SENSITIVE'");
    assert.ok(mentions(run(checkLane, { policy }), 'CUSTOMER_PRIVATE'));
  });

  it('rejects the Session lane growing client-supplied metadata fields', () => {
    const policy = file('policy').replace(
      'declaresMetadataFields: false',
      'declaresMetadataFields: true',
    );
    assert.ok(mentions(run(checkLane, { policy }), 'still declares metadata fields'));
  });

  it('rejects any change to the Admin lane values', () => {
    const lane = file('lane').replace(
      'maxUploadBytes: MAX_UPLOAD_BYTES',
      'maxUploadBytes: 10_485_760',
    );
    assert.ok(mentions(run(checkLane, { lane }), 'Admin lane'));
  });
});

describe('the streaming pipeline', () => {
  it('accepts the delivered pipeline', () => {
    assert.deepEqual(run(checkStreaming), []);
  });

  it('rejects a parser whose lane stops defaulting to Admin', () => {
    const parser = file('parser').replace(
      'lane: AssetIntakeLane = ADMIN_CATALOG_INTAKE_LANE',
      'lane: AssetIntakeLane',
    );
    assert.ok(mentions(run(checkStreaming, { parser }), 'does not default'));
  });

  it('rejects a reader that stops counting incrementally', () => {
    const reader = file('reader').replace('byteSize > maxBytes', 'false');
    assert.ok(mentions(run(checkStreaming, { reader }), 'incrementally'));
  });

  it('rejects an intake that buffers the whole upload', () => {
    const intake = `${file('intake')}\nconst whole = Buffer.concat([]);\n`;
    assert.ok(mentions(run(checkStreaming, { intake }), 'buffers the upload'));
  });

  it('rejects an intake that grows a presigned URL', () => {
    const intake = `${file('intake')}\nconst url = getSignedUrl();\n`;
    assert.ok(mentions(run(checkStreaming, { intake }), 'presigned'));
  });

  it('rejects an intake that stops capping bytes at the Session ceiling', () => {
    // Both read sites — the streaming pass and the replay pass — must lose the
    // cap: leaving one behind would satisfy the checker while a real upload
    // still streamed uncapped down the other path.
    const intake = file('intake').replaceAll(
      'maxBytes: DESIGN_SESSION_INTAKE_LANE.maxUploadBytes',
      'maxBytes: undefined',
    );
    assert.ok(mentions(run(checkStreaming, { intake }), 'does not cap bytes'));
  });

  it('rejects reclaiming an expired allocation instead of refusing it', () => {
    const intake = file('intake').replace(
      "case 'expired':\n        // See the module comment: refused, never reclaimed.\n        return this.rejectAfterDrain(attempt, 'ASSET_UPLOAD_STATE_CONFLICT');",
      "case 'expired':\n        return this.resumeExpired(attempt, claim.result);",
    );
    assert.ok(mentions(run(checkStreaming, { intake }), 'expired allocation is not refused'));
  });

  it('rejects a destructive object delete that could remove a winner', () => {
    const intake = `${file('intake')}\nawait this.storage.deleteObject({});\n`;
    assert.ok(mentions(run(checkStreaming, { intake }), 'deleteObject'));
  });
});

describe('the durable transaction', () => {
  it('accepts the delivered transaction', () => {
    assert.deepEqual(run(checkDurableTransaction), []);
  });

  it('rejects losing the Session CAS', () => {
    const transactions = file('transactions').replace(
      'advanceRevision({ id: sessionId, expectedRevision, at })',
      'findById(sessionId)',
    );
    assert.ok(mentions(run(checkDurableTransaction, { transactions }), 'CAS'));
  });

  it('rejects associating before the Session is proved live', () => {
    const source = file('transactions');
    const advance =
      '    const session = await this.sessions.advanceRevision({ id: sessionId, expectedRevision, at });\n';
    const attach =
      '    const designSessionAssetId = await this.sessions.attachAsset(sessionId, asset.id);\n';
    // Swap the two statements: still compiles, still passes a happy path.
    const swapped = source
      .replace(advance, '@@A@@')
      .replace(attach, advance)
      .replace('@@A@@', attach);
    assert.ok(
      mentions(
        run(checkDurableTransaction, { transactions: swapped }),
        'revision is not advanced before the association',
      ),
    );
  });

  it('rejects a second normalization append', () => {
    const transactions = file('transactions').replace(
      'const result = decodeSessionCompleted({',
      'await this.outbox.append({ eventType: ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE });\n      const result = decodeSessionCompleted({',
    );
    assert.ok(mentions(run(checkDurableTransaction, { transactions }), 'expected exactly 1'));
  });

  it('rejects a storage call inside the durable transaction', () => {
    const transactions = `${file('transactions')}\nawait storage.putObjectStream({});\n`;
    assert.ok(mentions(run(checkDurableTransaction, { transactions }), 'inside the durable'));
  });

  it('rejects a scheduler taking over the W01C retry', () => {
    const transactions = `${file('transactions')}\nsetInterval(() => undefined, 1000);\n`;
    assert.ok(mentions(run(checkDurableTransaction, { transactions }), 'W01C owns the retry'));
  });

  it('rejects addressing normalization at something other than the association', () => {
    const transactions = file('transactions').replace(
      "kind: 'DESIGN_SESSION_ASSET', designSessionAssetId",
      "kind: 'DESIGN_TEMPLATE_ASSET', designTemplateAssetId: asset.id",
    );
    assert.ok(run(checkDurableTransaction, { transactions }).length > 0);
  });
});

describe('the association', () => {
  it('accepts the delivered association', () => {
    assert.deepEqual(run(checkAssociation), []);
  });

  it('rejects an attachAsset that returns nothing', () => {
    const sessionRepository = file('sessionRepository').replace(
      'attachAsset(id: DesignSessionId, assetId: string): Promise<string>',
      'attachAsset(id: DesignSessionId, assetId: string): Promise<void>',
    );
    assert.ok(mentions(run(checkAssociation, { sessionRepository }), 'returns no id'));
  });

  it('rejects a plain insert that duplicates on replay', () => {
    const drizzleSession = file('drizzleSession').replace(/onConflictDoNothing\(/g, 'noConflict(');
    assert.ok(mentions(run(checkAssociation, { drizzleSession }), 'insert-or-confirm'));
  });

  it('rejects a conflict target that is not the canonical unique key', () => {
    const drizzleSession = file('drizzleSession').replace(
      'target: [designSessionAssets.sessionId, designSessionAssets.assetId]',
      'target: [designSessionAssets.id]',
    );
    assert.ok(mentions(run(checkAssociation, { drizzleSession }), 'canonical unique key'));
  });
});

describe('the reused security', () => {
  it('accepts the delivered controller', () => {
    assert.deepEqual(run(checkSecurity), []);
  });

  it('rejects dropping the B06A guard', () => {
    const controller = file('controller').replace('@UseGuards(DesignSessionGuard)', '');
    assert.ok(mentions(run(checkSecurity, { controller }), 'guard is not applied'));
  });

  it('rejects binding a body, which would buffer the upload', () => {
    const controller = file('controller').replace(
      '@Req() request: IncomingMessage',
      '@Body() body: unknown, @Req() request: IncomingMessage',
    );
    assert.ok(mentions(run(checkSecurity, { controller }), 'binds a body'));
  });

  it('rejects trusting the path over the authorized context', () => {
    const controller = file('controller').replace('context.designSessionId', 'params.sessionId');
    assert.ok(run(checkSecurity, { controller }).length > 0);
  });

  it('rejects re-implementing a B06A mechanism', () => {
    const controller = `${file('controller')}\nconst mac = createHmac('sha256', pepper);\n`;
    assert.ok(mentions(run(checkSecurity, { controller }), 're-implements'));
  });
});

describe('the bounded response', () => {
  it('accepts the delivered projection', () => {
    assert.deepEqual(run(checkResponse), []);
  });

  it('rejects returning a storage key or URL', () => {
    for (const leak of ['objectKey', 'url']) {
      const projection = file('projection').replace(
        "assetStatus: 'INSPECTING',",
        `assetStatus: 'INSPECTING',\n    ${leak}: result.objectKey,`,
      );
      assert.ok(mentions(run(checkResponse, { projection }), leak), leak);
    }
  });

  it('rejects claiming inspection or normalization succeeded', () => {
    const projection = file('projection').replace("'INSPECTING'", "'ACCEPTED'");
    assert.ok(run(checkResponse, { projection }).length > 0);
  });
});

describe('the whole gate, against the real repository', () => {
  it('passes, chain and all', () => {
    assert.deepEqual(checkApp3B06B(REPO_ROOT), []);
  });
});
