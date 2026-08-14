/**
 * Regressions for the `APP4-B06` secure-link resolution gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. The mutations are the plausible mistakes rather
 * than vandalism: accepting a `customerId` so the delivered repository method
 * fits, answering `SECURE_LINK_EXPIRED` because it is friendlier, returning
 * `grantId` because a client might want it, querying again after a miss to log
 * why, charging the limiter only on success, reading the left-most
 * `X-Forwarded-For` entry, publishing an example token. Every one of them
 * compiles, and most would pass a happy-path suite.
 *
 * `reads code rather than prose` matters most: every file in this checkpoint
 * documents what it deliberately does not do — "no `?t=` fallback", "no
 * diagnostic follow-up read", "never a guessed customer" — and a gate that
 * failed on its own explanation would be deleted within a checkpoint.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  REPO_ROOT,
  RESOLVE_PATH,
  checkApp4B06Contract,
} from './check-app4-b06-contract.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-b06-'));
  temporaries.push(dir);
  for (const relative of [
    'apps/api/src',
    'packages/contracts/openapi',
    'packages/api-client/src/generated',
    'packages/database/migrations',
    'packages/database/seed',
  ]) {
    const source = join(REPO_ROOT, relative);
    const target = join(dir, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, {
      recursive: true,
      filter: (from) => !from.includes('node_modules') && !from.includes(`${sep}dist`),
    });
  }
  for (const [relative, text] of Object.entries(edits)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    writeFileSync(join(dir, relative), text, 'utf8');
  }
  return dir;
}

const real = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

function failuresAfterEdit(relative, from, to) {
  const source = real(relative);
  assert.ok(source.includes(from), `${relative} is missing the anchor: ${from.slice(0, 60)}`);
  return checkApp4B06Contract(rootWith({ [relative]: source.replace(from, to) }));
}

/** Failures after one edit to the generated OpenAPI document. */
function failuresAfterContractEdit(mutate) {
  const document = JSON.parse(real(CANONICAL_FILES.openapi));
  mutate(document);
  return checkApp4B06Contract(rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }));
}

describe('APP4-B06 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp4B06Contract(REPO_ROOT), []);
  });

  it('passes against a faithful copy, so the gate is path-independent', () => {
    assert.deepEqual(checkApp4B06Contract(rootWith()), []);
  });

  it('reads code rather than prose', () => {
    const source = `${real(CANONICAL_FILES.errors)}
/**
 * SECURE_LINK_EXPIRED, SECURE_LINK_REVOKED, SECURE_LINK_WRONG_TARGET,
 * GRANT_NOT_FOUND, createHmac, timingSafeEqual, 30, customerId: body.customerId,
 * scopeKind: command.scopeKind, hops[0], redis, ALTER TABLE, acceptQuotation,
 * this.grants.revoke(), logger.log(token).
 */
`;
    assert.deepEqual(checkApp4B06Contract(rootWith({ [CANONICAL_FILES.errors]: source })), []);
  });

  it('fails when an owned file is missing', () => {
    const dir = rootWith();
    rmSync(join(dir, CANONICAL_FILES.query));
    assert.ok(mentions(checkApp4B06Contract(dir), 'does not exist'));
  });
});

describe('the published surface', () => {
  it('rejects a GET form of the resolver', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths[RESOLVE_PATH].get = { operationId: 'publicSecureLink_get' };
    });
    assert.ok(mentions(failures, 'expected exactly one POST'));
  });

  it('rejects a second secure-link route', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/secure-links/peek'] = { post: { operationId: 'x_peek' } };
    });
    assert.ok(mentions(failures, 'the secure-link surface is'));
  });

  it('rejects an extra operation anywhere, by count', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/health/extra'] = { get: { operationId: 'x_extra' } };
    });
    assert.ok(mentions(failures, 'expected 50'));
  });

  // `APP4-B07` reconciliation guard. Two authenticated Admin grant paths joined
  // the authorized set; a third grant path of any shape still fails, so the
  // rule still says "B06 owns one resolver and nothing else appeared beside it".
  it('still rejects an Admin grant route beyond the two authorized ones', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/admin/secure-grants'] = { get: { operationId: 'x_list' } };
    });
    assert.ok(mentions(failures, 'the secure-link surface is'));
  });

  it('rejects a token query parameter', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths[RESOLVE_PATH].post.parameters = [
        { name: 't', in: 'query', schema: { type: 'string' } },
      ];
    });
    assert.ok(mentions(failures, 'query parameter'));
  });

  it('rejects a token header parameter', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths[RESOLVE_PATH].post.parameters = [
        { name: 'X-Secure-Link-Token', in: 'header', schema: { type: 'string' } },
      ];
    });
    assert.ok(mentions(failures, 'header parameter'));
  });
});

describe('the request contract', () => {
  it('rejects a caller-supplied customer id', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.ResolveSecureLinkBody.properties.customerId = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'the target is read, never supplied'));
  });

  it('rejects a caller-selected scope', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.ResolveSecureLinkBody.properties.scopeKind = { type: 'string' };
    });
    assert.ok(mentions(failures, 'the target is read, never supplied'));
  });

  it('rejects a non-strict body', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.ResolveSecureLinkBody.additionalProperties = true;
    });
    assert.ok(mentions(failures, 'not strict'));
  });

  it('rejects a published example token', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.ResolveSecureLinkBody.properties.token.example =
        'aaaaBBBBccccDDDDeeeeFFFFggggHHHHiiiiJJJJkkk';
    });
    assert.ok(mentions(failures, 'a credential must not be published'));
  });

  it('rejects an unbounded token', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.components.schemas.ResolveSecureLinkBody.properties.token.pattern;
    });
    assert.ok(mentions(failures, 'no bounded pattern'));
  });

  it('rejects a target field added to the source schema', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.request,
      '    token: z',
      '    customRequestId: z.string(),\n    token: z',
    );
    assert.ok(mentions(failures, 'the token is the whole request'));
  });
});

describe('token handling', () => {
  it('rejects a second HMAC beside P01', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      'const tokenHash = digestSecret(this.peppers.require().secureLinkTokenPepper, command.token);',
      "const tokenHash = createHmac('sha256', 'x').update(command.token).digest('base64');",
    );
    assert.ok(mentions(failures, 'P01 owns the one HMAC'));
  });

  it('rejects logging the token', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      '    const grant = await this.grants.resolveActiveByTokenDigest(',
      '    this.logger.warn(`resolving ${command.token}`);\n' +
        '    const grant = await this.grants.resolveActiveByTokenDigest(',
    );
    assert.ok(mentions(failures, 'logs token or digest material'));
  });

  it('rejects a token field on the success shape', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.response,
      '  customRequestId!: string;',
      '  customRequestId!: string;\n  token!: string;',
    );
    assert.ok(mentions(failures, 'the success shape mentions token'));
  });
});

describe('target binding', () => {
  it('rejects a command that carries more than the token', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      'export interface ResolveSecureLinkCommand {\n  readonly token: string;\n}',
      'export interface ResolveSecureLinkCommand {\n  readonly token: string;\n' +
        '  readonly customerId: string;\n}',
    );
    assert.ok(mentions(failures, 'expected only the token'));
  });

  it('rejects a caller-selected scope in the resolver', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      '      REQUEST_ACCESS,\n',
      '      command.scopeKind,\n',
    );
    assert.ok(mentions(failures, 'it must be the pinned REQUEST_ACCESS constant'));
  });
});

describe('non-enumeration', () => {
  it('rejects a cause-specific public code in source', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.errors,
      "export const SECURE_LINK_ERROR_CODES = ['SECURE_LINK_UNAVAILABLE'] as const;",
      "export const SECURE_LINK_ERROR_CODES = ['SECURE_LINK_UNAVAILABLE', 'SECURE_LINK_EXPIRED'] as const;",
    );
    assert.ok(mentions(failures, 'expected only SECURE_LINK_UNAVAILABLE'));
  });

  it('rejects a cause-specific code in the published contract', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths[RESOLVE_PATH].post.responses['410'] = {
        description: 'SECURE_LINK_EXPIRED — the link has expired.',
      };
    });
    assert.ok(mentions(failures, 'cause-specific code SECURE_LINK_EXPIRED'));
  });

  it('rejects a diagnostic query after a miss', () => {
    // The oracle: a second read to find out *why* nothing resolved. It would
    // never change the response, and it would make the six causes separable by
    // timing.
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      '      await this.audit.recordUnavailable();',
      '      await this.grants.findById(tokenHash as never);\n' +
        '      await this.audit.recordUnavailable();',
    );
    assert.ok(mentions(failures, 'that read is the oracle'));
  });

  it('rejects mapping the refusal to something other than 404', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.errors,
      'return new NotFoundException({ code: error.code, message: error.message });',
      'return new ForbiddenException({ code: error.code, message: error.message });',
    );
    assert.ok(mentions(failures, 'does not map the refusal to 404'));
  });
});

describe('the success projection', () => {
  it('rejects publishing the grant id', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.SecureLinkResolutionResponse.properties.grantId = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'publishes grantId'));
  });

  it('rejects publishing the customer id', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.SecureLinkResolutionResponse.properties.customerId = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'publishes customerId'));
  });
});

describe('the rate limit', () => {
  it('rejects a hard-coded budget', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.limiter,
      'max: policy.maxRequestsPerIpPerMinute,',
      'max: policy.maxRequestsPerIpPerMinute ?? 30,',
    );
    assert.ok(mentions(failures, 'restates the published limit'));
  });

  it('rejects a limiter that can see the outcome', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.limiter,
      'check(networkKey: string, policy: SecureLinkResolvePolicy): RateLimitDecision {',
      'check(networkKey: string, policy: SecureLinkResolvePolicy, outcome: string): RateLimitDecision {',
    );
    assert.ok(mentions(failures, 'count requests only'));
  });

  it('rejects charging the limit after resolution', () => {
    const source = real(CANONICAL_FILES.controller);
    // Move the charge below the resolve call — the ordering defect that makes
    // failed guesses free.
    const mutated = source
      .replace(/    const decision = this\.limiter\.check\([\s\S]*?\n    \}\n/, '')
      .replace(
        '      return toView(await this.resolver.resolve({ token: input.token }));',
        '      const view = toView(await this.resolver.resolve({ token: input.token }));\n' +
          '      this.limiter.check(this.networkKeys.keyFor(request), policy);\n' +
          '      return view;',
      );
    const failures = checkApp4B06Contract(rootWith({ [CANONICAL_FILES.controller]: mutated }));
    assert.ok(mentions(failures, 'resolves before charging the limit'));
  });

  it('rejects a consumer that publishes its own policy', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.policyReader,
      'const version = await this.policies.currentValue(SECURE_LINK_RESOLVE_POLICY_KEY);',
      "await this.policies.ensureKey(SECURE_LINK_RESOLVE_POLICY_KEY, 'x');\n" +
        '    const version = await this.policies.currentValue(SECURE_LINK_RESOLVE_POLICY_KEY);',
    );
    assert.ok(mentions(failures, 'publication closed'));
  });

  it('rejects a distributed limiter dependency', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.limiter,
      "import { Injectable } from '@nestjs/common';",
      "import { Injectable } from '@nestjs/common';\nimport Redis from 'ioredis';",
    );
    assert.ok(mentions(failures, 'the limiter is in-process'));
  });
});

describe('the trusted client address', () => {
  it('rejects reading the left-most forwarded entry', () => {
    // The APP3-E01 defect, reintroduced: the left-most entry is the one the
    // client chose, so every network-keyed limit becomes bypassable.
    const failures = failuresAfterEdit(
      CANONICAL_FILES.networkKey,
      'const nearest = hops[hops.length - 1];',
      'const nearest = hops[0];',
    );
    assert.ok(mentions(failures, 'left-most forwarded entry'));
  });

  it('rejects reading an address directly in the controller', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      'this.networkKeys.keyFor(request)',
      'String(request.socket?.remoteAddress)',
    );
    assert.ok(mentions(failures, 'does not key the limit on the trusted address'));
  });
});

describe('audit', () => {
  it('rejects a fabricated identity on the pre-identity path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      "      actor: { kind: 'SYSTEM', systemJobKey: SECURE_LINK_JOB_KEY },\n      action: SECURE_LINK_UNAVAILABLE_ACTION,",
      "      actor: { kind: 'CUSTOMER', customerId: 'unknown' },\n      action: SECURE_LINK_UNAVAILABLE_ACTION,",
    );
    assert.ok(mentions(failures, 'does not use a SYSTEM actor'));
  });

  it('rejects a digest reaching the audit recorder', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      'export interface RecordResolvedInput {',
      'export interface RecordResolvedInput {\n  readonly tokenHash: string;',
    );
    assert.ok(mentions(failures, 'handles tokenHash'));
  });

  it('rejects dropping an audit path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      '      await this.audit.recordUnavailable();',
      '      await Promise.resolve();',
    );
    assert.ok(mentions(failures, 'does not audit both outcomes'));
  });
});

describe('the repository extension', () => {
  it('rejects dropping the expiry predicate', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repositoryAdapter,
      '            gt(secureAccessGrants.expiresAt, now),\n          ),\n        )\n        .limit(1);\n\n      return row === undefined ? undefined : toDomain(row);\n    });\n  }\n\n  async findById',
      '          ),\n        )\n        .limit(1);\n\n      return row === undefined ? undefined : toDomain(row);\n    });\n  }\n\n  async findById',
    );
    assert.ok(mentions(failures, 'drops the expiresAt predicate'));
  });

  it('rejects a raw-token repository read', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repositoryPort,
      '  resolveActiveByTokenDigest(\n    tokenHash: string,',
      '  resolveActiveByTokenDigest(\n    rawToken: string,',
    );
    assert.ok(mentions(failures, 'not keyed on a digest'));
  });
});

describe('boundaries', () => {
  it('rejects a new migration', () => {
    const dir = rootWith();
    writeFileSync(join(dir, 'packages/database/migrations/0035_link.sql'), 'select 1;', 'utf8');
    assert.ok(mentions(checkApp4B06Contract(dir), 'adds none'));
  });

  it('rejects mutating the grant while resolving', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      '    await this.audit.recordResolved({',
      "    await this.grants.revoke(grant.id, 'used');\n    await this.audit.recordResolved({",
    );
    assert.ok(mentions(failures, 'resolution is read-only'));
  });

  it('rejects an APP5 business action', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      'export class ResolveSecureLink {',
      'export class ResolveSecureLink {\n  async acceptQuotation(): Promise<void> {}\n',
    );
    assert.ok(mentions(failures, 'business action'));
  });

  it('rejects a generated client that puts the token in the URL', () => {
    const client = real(CANONICAL_FILES.client);
    const mutated = client.replace(
      'url: `/api/public/secure-links/resolve`',
      'url: `/api/public/secure-links/resolve/${resolveSecureLinkBody.token}`',
    );
    const failures = checkApp4B06Contract(rootWith({ [CANONICAL_FILES.client]: mutated }));
    assert.ok(mentions(failures, 'puts the token in the URL'));
  });
});
