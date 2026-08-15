#!/usr/bin/env node
/**
 * `APP4-B06` — the public secure-link resolution contract.
 *
 * This is the phase's highest-risk public surface, and the failures this gate
 * exists for are the ones that look like helpfulness: adding a `customerId` to
 * the request "so the query can use the delivered method"; answering
 * `SECURE_LINK_EXPIRED` because it is friendlier; returning `grantId` because a
 * client might want it; running a second query after a miss to log *why*;
 * charging the rate limiter only for failures because successes are legitimate;
 * reading the left-most `X-Forwarded-For` entry; putting the token in a `GET`
 * because a POST for a read feels wrong. Each one works, and each one turns the
 * endpoint into an oracle over somebody's order.
 *
 * Assertions read the **generated OpenAPI document**, the **generated client**,
 * and **real source with comments stripped** — never prose, and never the
 * completion report. Every file in this checkpoint documents what it
 * deliberately does not do ("no `?t=` fallback", "no diagnostic follow-up
 * read"), and a gate that failed on its own explanation would be deleted.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-b06-contract.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { importSpecifiers, stripComments } from './check-app4-b01.mjs';
import { B07_ADMIN_GRANT_PATHS, MODULE_DIR } from './check-app4-b03-contract.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The one route, under the global API prefix. */
export const RESOLVE_PATH = '/api/public/secure-links/resolve';

export const CANONICAL_FILES = Object.freeze({
  controller: `${MODULE_DIR}/presentation/public-secure-link.controller.ts`,
  request: `${MODULE_DIR}/presentation/schemas/secure-link-resolve.request.ts`,
  response: `${MODULE_DIR}/presentation/schemas/secure-link-resolution.response.ts`,
  query: `${MODULE_DIR}/application/resolve-secure-link.query.ts`,
  recorder: `${MODULE_DIR}/application/secure-link-audit.recorder.ts`,
  errors: `${MODULE_DIR}/domain/grant/secure-link.errors.ts`,
  policy: `${MODULE_DIR}/domain/grant/secure-link-policy.ts`,
  policyReader: `${MODULE_DIR}/infrastructure/policy/secure-link-policy.reader.ts`,
  limiter: `${MODULE_DIR}/infrastructure/rate-limit/secure-link-rate-limiter.ts`,
  networkKey: `${MODULE_DIR}/infrastructure/rate-limit/public-network-key.service.ts`,
  repositoryPort: `${MODULE_DIR}/domain/repositories/secure-access-grant.repository.ts`,
  repositoryAdapter: `${MODULE_DIR}/infrastructure/persistence/drizzle-secure-access-grant.repository.ts`,
  module: `${MODULE_DIR}/customer.module.ts`,
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  client: 'packages/api-client/src/generated/embroidery-api.ts',
  seed: 'packages/database/seed/app4-policy-configuration.seed.json',
});

/** Every file `APP4-B06` owns. The whole surface the rules read. */
export const B06_SOURCES = Object.freeze([
  CANONICAL_FILES.controller,
  CANONICAL_FILES.request,
  CANONICAL_FILES.response,
  CANONICAL_FILES.query,
  CANONICAL_FILES.recorder,
  CANONICAL_FILES.errors,
  CANONICAL_FILES.policy,
  CANONICAL_FILES.policyReader,
  CANONICAL_FILES.limiter,
  CANONICAL_FILES.networkKey,
]);

/** The one published code, and the ones that must never appear beside it. */
const PUBLIC_CODE = 'SECURE_LINK_UNAVAILABLE';
const FORBIDDEN_CODES = [
  'SECURE_LINK_EXPIRED',
  'SECURE_LINK_REVOKED',
  'SECURE_LINK_SUPERSEDED',
  'SECURE_LINK_NOT_FOUND',
  'SECURE_LINK_WRONG_TARGET',
  'SECURE_LINK_FORBIDDEN',
  'GRANT_NOT_FOUND',
];

/** The published abuse limit. It lives in the seed, never in source. */
const MAX_REQUESTS = 30;

/**
 * The entry world plus exactly B06's one — 47 at B06's closure. Then 50, after
 * `APP4-B07`'s three Admin support operations. Now 52, after `APP4-B08`'s Admin
 * notification list and manual replay. Measured, not assumed.
 *
 * Restated rather than dropped: the count's job is to catch an operation
 * appearing *beside* B06's resolver, and a rule that stopped counting would stop
 * doing that. B06's own surface is still asserted to be exactly one POST below.
 */
const EXPECTED_OPERATIONS = 52;
const MIGRATION_COUNT = 34;

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function sources(rootDir, list = B06_SOURCES) {
  return list
    .map((relative) => ({ path: relative, raw: read(rootDir, relative) ?? '' }))
    .filter((file) => file.raw !== '')
    .map((file) => ({ ...file, code: stripComments(file.raw) }));
}

function codeOf(rootDir, key) {
  const raw = read(rootDir, key);
  return raw === undefined ? '' : stripComments(raw);
}

function loadOpenApi(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi} is missing`);
    return undefined;
  }
  return JSON.parse(raw);
}

function checkFilesExist(rootDir, fail) {
  for (const relative of B06_SOURCES) {
    if (!existsSync(join(rootDir, relative))) {
      fail(`${relative} does not exist`);
    }
  }
}

/** 1, 2, 3, 6 — one POST at the canonical route, and no GET resolver. */
function checkPublishedSurface(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  if (document === undefined) return;

  const methods = ['get', 'post', 'put', 'patch', 'delete'];
  const methodsOf = (path) =>
    methods.filter((method) => document.paths?.[path]?.[method] !== undefined);

  if (JSON.stringify(methodsOf(RESOLVE_PATH)) !== JSON.stringify(['post'])) {
    fail(
      `${RESOLVE_PATH} publishes [${methodsOf(RESOLVE_PATH).join(', ')}]; expected exactly one POST`,
    );
  }

  // 1 — and there is no second secure-link route hiding elsewhere.
  //
  // `APP4-B07` published two authenticated Admin grant routes, which match this
  // pattern and are not secure-link resolvers. They are authorized by exact
  // name, so the rule still says what it always said: B06 owns one resolver, and
  // a second public secure-link route — a GET form, an alias, a `/verify`
  // variant — still fails.
  const expectedLinkPaths = [RESOLVE_PATH, ...B07_ADMIN_GRANT_PATHS].sort();
  const linkPaths = Object.keys(document.paths ?? {})
    .filter((path) => /secure-link|secure_link|grant/i.test(path))
    .sort();
  if (JSON.stringify(linkPaths) !== JSON.stringify(expectedLinkPaths)) {
    fail(
      `the secure-link surface is [${linkPaths.join(', ')}]; expected ` +
        `[${expectedLinkPaths.join(', ')}]`,
    );
  }

  const total = Object.keys(document.paths ?? {}).reduce(
    (count, path) => count + methodsOf(path).length,
    0,
  );
  if (total !== EXPECTED_OPERATIONS) {
    fail(
      `the document publishes ${String(total)} operations; expected ${String(EXPECTED_OPERATIONS)}`,
    );
  }

  const operation = document.paths?.[RESOLVE_PATH]?.post;
  if (operation === undefined) {
    fail(`${RESOLVE_PATH} has no POST operation to inspect`);
    return;
  }
  if (typeof operation.operationId !== 'string' || operation.operationId === '') {
    fail(`${RESOLVE_PATH} has no operationId`);
  }

  // 5 — no token parameter of any kind. The only parameter any operation
  // carries is the platform's optional `X-Request-ID`.
  for (const parameter of operation.parameters ?? []) {
    const name = String(parameter.name);
    // `t` is matched exactly — it is the fragment parameter's name, and a
    // substring test would flag the platform's `X-Request-ID` on every route.
    if (/token|secret|credential/i.test(name) || name.toLowerCase() === 't') {
      fail(`${RESOLVE_PATH} declares a "${name}" ${String(parameter.in)} parameter`);
    }
  }
  if (/\{.*token.*\}/i.test(RESOLVE_PATH)) {
    fail(`${RESOLVE_PATH} carries the token in the path`);
  }
}

/** 4, 7, 25 — the body is a strict object of one token, with no example. */
function checkRequestContract(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  if (document === undefined) return;

  const body = document.components?.schemas?.ResolveSecureLinkBody;
  if (body === undefined) {
    fail('ResolveSecureLinkBody is not published as a component');
    return;
  }
  if (JSON.stringify(Object.keys(body.properties ?? {})) !== JSON.stringify(['token'])) {
    fail(
      `ResolveSecureLinkBody publishes [${Object.keys(body.properties ?? {}).join(', ')}]; ` +
        'expected exactly one token field',
    );
  }
  if (body.additionalProperties !== false) {
    fail('ResolveSecureLinkBody is not strict; an extra field would be accepted');
  }
  if (typeof body.properties?.token?.pattern !== 'string') {
    fail('ResolveSecureLinkBody.token has no bounded pattern');
  }
  // 7 — an example token is a credential-shaped literal in the published
  // contract, rendered in Swagger UI and pre-filled into "try it out".
  for (const field of ['example', 'default', 'examples']) {
    if (body.properties?.token?.[field] !== undefined) {
      fail(`ResolveSecureLinkBody.token declares a ${field}; a credential must not be published`);
    }
  }

  // 11 — no public target identifier, on the wire or in the source schema.
  const request = codeOf(rootDir, 'request');
  for (const invented of [
    'customerId',
    'customRequestId',
    'grantId',
    'scopeKind',
    'purpose',
    'sessionId',
    'email',
    'phone',
  ]) {
    if (body.properties?.[invented] !== undefined) {
      fail(`ResolveSecureLinkBody accepts ${invented}; the target is read, never supplied`);
    }
    if (new RegExp(`${invented}\\s*:`).test(request)) {
      fail(`${CANONICAL_FILES.request}: declares ${invented}; the token is the whole request`);
    }
  }
}

/** 8, 9, 20 — P01's digest, once, and never logged. */
function checkTokenHandling(rootDir, fail) {
  const query = codeOf(rootDir, 'query');
  if (!/digestSecret\(/.test(query)) {
    fail(`${CANONICAL_FILES.query}: does not use the APP4-P01 digest`);
  }
  if (!/secureLinkTokenPepper/.test(query)) {
    fail(`${CANONICAL_FILES.query}: does not use the secure-link pepper`);
  }

  // 9 — no second crypto anywhere in the checkpoint.
  for (const file of sources(rootDir)) {
    if (file.path === CANONICAL_FILES.networkKey) continue; // hashes an address, never a token
    if (/createHmac|createHash|scrypt|pbkdf2|timingSafeEqual/.test(file.code)) {
      fail(`${file.path}: computes its own digest; P01 owns the one HMAC`);
    }
  }

  // The raw token is never compared against persistence, and never stored.
  if (/tokenHash\s*[:=]\s*(command|input)\.token\b/.test(query)) {
    fail(`${CANONICAL_FILES.query}: uses the raw token where a digest belongs`);
  }

  // 12, 20 — nothing logs or returns the credential.
  for (const file of sources(rootDir)) {
    for (const match of file.code.matchAll(/(logger|console)\.\w+\(([^;]*)/g)) {
      if (/token|secret|digest|pepper|hash/i.test(match[2] ?? '')) {
        fail(`${file.path}: logs token or digest material`);
      }
    }
  }
  const response = codeOf(rootDir, 'response');
  for (const leaked of ['token', 'tokenHash', 'digest', 'secret']) {
    if (new RegExp(`\\b${leaked}\\b`).test(response)) {
      fail(`${CANONICAL_FILES.response}: the success shape mentions ${leaked}`);
    }
  }
}

/** 10, 11 — the scope is authority, and the target is read from the row. */
function checkTargetBinding(rootDir, fail) {
  const query = codeOf(rootDir, 'query');
  if (!/REQUEST_ACCESS/.test(query)) {
    fail(`${CANONICAL_FILES.query}: does not fix the scope to REQUEST_ACCESS`);
  }
  if (/(scopeKind|purpose)\s*[:=]\s*(command|input|body)\./.test(query)) {
    fail(`${CANONICAL_FILES.query}: takes the scope or purpose from the caller`);
  }
  // The command type is the structural guarantee: one field.
  const command = /interface\s+ResolveSecureLinkCommand\s*\{([\s\S]*?)\}/.exec(query)?.[1] ?? '';
  if (command === '') {
    fail(`${CANONICAL_FILES.query}: could not read ResolveSecureLinkCommand`);
  } else {
    const fields = [...command.matchAll(/readonly\s+(\w+)/g)].map((match) => match[1]);
    if (JSON.stringify(fields) !== JSON.stringify(['token'])) {
      fail(`ResolveSecureLinkCommand carries [${fields.join(', ')}]; expected only the token`);
    }
  }
  // The target comes back from the repository read, not from the command — and
  // the scope argument is asserted **positionally**, inside the call. A rule
  // that only checked the constant appeared somewhere in the file would pass
  // while the call handed the repository a caller-supplied scope beside an
  // unused constant.
  const call = /resolveActiveByTokenDigest\(([\s\S]*?)\);/.exec(query);
  if (call === null) {
    fail(`${CANONICAL_FILES.query}: does not resolve from the token digest`);
  } else {
    const args = (call[1] ?? '').split(',').map((argument) => argument.trim());
    if (args[1] !== 'REQUEST_ACCESS' && args[1] !== "'REQUEST_ACCESS'") {
      fail(
        `${CANONICAL_FILES.query}: passes "${args[1] ?? '(nothing)'}" as the scope; ` +
          'it must be the pinned REQUEST_ACCESS constant',
      );
    }
    if (!/tokenHash/.test(args[0] ?? '')) {
      fail(`${CANONICAL_FILES.query}: does not pass the digest as the lookup key`);
    }
  }
  if (/grant\.customerId\s*!==|grant\.customRequestId\s*!==/.test(query)) {
    fail(`${CANONICAL_FILES.query}: compares the target against a supplied value`);
  }
}

/** 13, 14, 15 — one classification, one code, no cause-specific variant. */
function checkNonEnumeration(rootDir, fail) {
  const errors = codeOf(rootDir, 'errors');
  if (!errors.includes(PUBLIC_CODE)) {
    fail(`${CANONICAL_FILES.errors}: does not declare ${PUBLIC_CODE}`);
  }
  const declared = /SECURE_LINK_ERROR_CODES\s*=\s*\[([\s\S]*?)\]/.exec(errors)?.[1] ?? '';
  const codes = [...declared.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
  if (JSON.stringify(codes) !== JSON.stringify([PUBLIC_CODE])) {
    fail(`the public code set is [${codes.join(', ')}]; expected only ${PUBLIC_CODE}`);
  }
  // Asserted on what the mapper actually *returns*, not on the identifier
  // appearing somewhere in the file: an import can be repointed while a stale
  // mention keeps a name-only rule satisfied.
  const mapper = /export function toSecureLinkHttpException\([\s\S]*?\n\}/.exec(errors)?.[0] ?? '';
  if (mapper === '') {
    fail(`${CANONICAL_FILES.errors}: has no HTTP mapper to inspect`);
  } else if (!/return new NotFoundException\(/.test(mapper)) {
    fail(`${CANONICAL_FILES.errors}: does not map the refusal to 404`);
  }

  // 15 — no cause-specific code anywhere in the checkpoint, source or contract.
  const document = loadOpenApi(rootDir, fail);
  const contract = document === undefined ? '' : JSON.stringify(document);
  for (const forbidden of FORBIDDEN_CODES) {
    for (const file of sources(rootDir)) {
      if (file.code.includes(forbidden)) {
        fail(`${file.path}: declares the cause-specific code ${forbidden}`);
      }
    }
    if (contract.includes(forbidden)) {
      fail(`the published contract declares the cause-specific code ${forbidden}`);
    }
  }

  // 29 — no diagnostic follow-up read to classify a miss.
  const query = codeOf(rootDir, 'query');
  const missBranch = /if\s*\(grant === undefined\)\s*\{([\s\S]*?)\n    \}/.exec(query)?.[1] ?? '';
  if (missBranch === '') {
    fail(`${CANONICAL_FILES.query}: could not read the unavailable branch`);
  } else if (/this\.grants\.|findById|listActive|resolveActive/.test(missBranch)) {
    fail(`${CANONICAL_FILES.query}: queries again after a miss; that read is the oracle`);
  }
}

/** 12 — the success projection is three safe fields. */
function checkSuccessProjection(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  if (document === undefined) return;

  const schema = document.components?.schemas?.SecureLinkResolutionResponse;
  if (schema === undefined) {
    fail('SecureLinkResolutionResponse is not published as a component');
    return;
  }
  const fields = Object.keys(schema.properties ?? {}).sort();
  if (JSON.stringify(fields) !== JSON.stringify(['customRequestId', 'expiresAt', 'scopeKind'])) {
    fail(`the success projection publishes [${fields.join(', ')}]; expected three safe fields`);
  }
  for (const forbidden of ['token', 'tokenHash', 'grantId', 'customerId', 'contact', 'email']) {
    if (schema.properties?.[forbidden] !== undefined) {
      fail(`the success projection publishes ${forbidden}`);
    }
  }
}

/** 16, 17, 18 — the limit is published, outcome-independent and has no fallback. */
function checkRateLimit(rootDir, fail) {
  const policy = codeOf(rootDir, 'policy');
  if (!/'secure_link\.resolve'/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: does not name the secure_link.resolve key`);
  }
  const reader = codeOf(rootDir, 'policyReader');
  if (!/PolicyConfigurationRepository/.test(reader) || !/currentValue\(/.test(reader)) {
    fail(`${CANONICAL_FILES.policyReader}: does not read the published policy`);
  }
  if (/publishVersion|ensureKey/.test(reader)) {
    fail(`${CANONICAL_FILES.policyReader}: publishes policy; publication closed with APP4-B01-C1`);
  }

  // 17 — the published number appears in no source file, and no `??` default.
  for (const file of sources(rootDir)) {
    if (new RegExp(`\\b${String(MAX_REQUESTS)}\\b`).test(file.code)) {
      fail(`${file.path}: restates the published limit ${String(MAX_REQUESTS)}; read it instead`);
    }
    if (/maxRequestsPerIpPerMinute\s*(\?\?|\|\|)\s*\d/.test(file.code)) {
      fail(`${file.path}: defaults the abuse limit; a missing policy must fail closed`);
    }
  }

  // 18 — the limiter cannot see an outcome. Its signature is the proof.
  const limiter = codeOf(rootDir, 'limiter');
  const signature = /check\(([^)]*)\)/.exec(limiter)?.[1] ?? '';
  if (/outcome|result|resolved|success|failed|grant|token/i.test(signature)) {
    fail(`${CANONICAL_FILES.limiter}: check() can see the outcome; it must count requests only`);
  }
  if (!/SlidingWindowRateLimiter/.test(limiter)) {
    fail(`${CANONICAL_FILES.limiter}: does not use the platform limiter`);
  }
  // 42 — in-process only.
  for (const file of sources(rootDir)) {
    for (const specifier of importSpecifiers(file.raw)) {
      if (/redis|ioredis|memcached/i.test(specifier)) {
        fail(`${file.path} imports ${specifier}; the limiter is in-process`);
      }
    }
  }

  // The controller charges once, before resolving.
  const controller = codeOf(rootDir, 'controller');
  const limitAt = controller.indexOf('this.limiter.check(');
  const resolveAt = controller.indexOf('this.resolver.resolve(');
  if (limitAt < 0 || resolveAt < 0) {
    fail(`${CANONICAL_FILES.controller}: does not both limit and resolve`);
  } else if (limitAt > resolveAt) {
    fail(`${CANONICAL_FILES.controller}: resolves before charging the limit`);
  }
  if ((controller.match(/this\.limiter\.check\(/g) ?? []).length !== 1) {
    fail(`${CANONICAL_FILES.controller}: charges the limiter more than once per request`);
  }
}

/** 19 — the trusted client address is the entry the gateway appended. */
function checkTrustedClientIp(rootDir, fail) {
  const key = codeOf(rootDir, 'networkKey');
  if (!/x-forwarded-for/i.test(key)) {
    fail(`${CANONICAL_FILES.networkKey}: does not read the forwarding header`);
  }
  // The right-most entry — the APP3-E01 correction. `hops[0]` is the bug.
  if (!/hops\[hops\.length - 1\]/.test(key)) {
    fail(
      `${CANONICAL_FILES.networkKey}: does not take the last X-Forwarded-For entry; ` +
        'a client-supplied left-most entry is spoofable',
    );
  }
  if (/hops\[0\]/.test(key)) {
    fail(`${CANONICAL_FILES.networkKey}: reads the left-most forwarded entry`);
  }
  if (!/createHmac/.test(key)) {
    fail(`${CANONICAL_FILES.networkKey}: does not hash the address`);
  }
  const controller = codeOf(rootDir, 'controller');
  if (!/networkKeys\.keyFor\(/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: does not key the limit on the trusted address`);
  }
  if (/request\.ip\b|remoteAddress/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: reads an address directly; use the key service`);
  }
}

/** 21 — the audit carries no credential and fabricates no identity. */
function checkAudit(rootDir, fail) {
  const recorder = codeOf(rootDir, 'recorder');
  for (const forbidden of ['token', 'tokenHash', 'digest', 'pepper', 'truy-cap', '#t=']) {
    if (new RegExp(`\\b${forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(recorder)) {
      fail(`${CANONICAL_FILES.recorder}: handles ${forbidden}`);
    }
  }
  // The pre-identity path is SYSTEM with a sentinel, never a guessed customer.
  const unavailable = /async recordUnavailable\([\s\S]*?\n  \}/.exec(recorder)?.[0] ?? '';
  if (unavailable === '') {
    fail(`${CANONICAL_FILES.recorder}: has no unavailable audit path`);
  } else {
    if (!/kind:\s*'SYSTEM'/.test(unavailable)) {
      fail(`${CANONICAL_FILES.recorder}: the unavailable audit does not use a SYSTEM actor`);
    }
    if (/customerId|grantId/.test(unavailable)) {
      fail(`${CANONICAL_FILES.recorder}: the unavailable audit names an identity it cannot know`);
    }
  }
  const query = codeOf(rootDir, 'query');
  if (!/audit\.recordResolved\(/.test(query) || !/audit\.recordUnavailable\(/.test(query)) {
    fail(`${CANONICAL_FILES.query}: does not audit both outcomes`);
  }
}

/** The repository extension is read-only and digest-keyed (§16). */
function checkRepositoryExtension(rootDir, fail) {
  const port = codeOf(rootDir, 'repositoryPort');
  const adapter = codeOf(rootDir, 'repositoryAdapter');
  if (!/resolveActiveByTokenDigest\(/.test(port)) {
    fail(`${CANONICAL_FILES.repositoryPort}: the B06 read is not declared`);
    return;
  }
  const signature = /resolveActiveByTokenDigest\(([\s\S]*?)\):/.exec(port)?.[1] ?? '';
  if (/rawToken|token\s*:\s*string(?!Hash)/.test(signature.replace(/tokenHash/g, ''))) {
    fail(`${CANONICAL_FILES.repositoryPort}: the read takes a raw token`);
  }
  if (!/tokenHash/.test(signature)) {
    fail(`${CANONICAL_FILES.repositoryPort}: the read is not keyed on a digest`);
  }
  const body = /async resolveActiveByTokenDigest\([\s\S]*?\n  \}/.exec(adapter)?.[0] ?? '';
  if (body === '') {
    fail(`${CANONICAL_FILES.repositoryAdapter}: the B06 read is not implemented`);
    return;
  }
  if (/\.insert\(|\.update\(|\.delete\(/.test(body)) {
    fail(`${CANONICAL_FILES.repositoryAdapter}: the B06 read writes`);
  }
  for (const predicate of ['tokenHash', 'scopeKind', "'ACTIVE'", 'expiresAt']) {
    if (!body.includes(predicate)) {
      fail(`${CANONICAL_FILES.repositoryAdapter}: the B06 read drops the ${predicate} predicate`);
    }
  }
}

/** 22, 23, 24, 26 — no schema, no APP5 action, no frontend, and a body-only client. */
function checkBoundaries(rootDir, fail) {
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : -1;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; APP4-B06 adds none`);
  }

  for (const file of sources(rootDir)) {
    if (/pgTable\(|uniqueIndex\(|alterTable|ALTER TABLE|CREATE TABLE/i.test(file.code)) {
      fail(`${file.path}: declares schema; B06 changes none`);
    }
    if (/acceptQuotation|approveDesign|initiatePayment|createCustomRequest/i.test(file.code)) {
      fail(`${file.path}: performs an APP5/APP6/APP7 business action`);
    }
    // 33, 34 — resolution reads; it never mutates the grant.
    if (/grants\.(revoke|supersede|issue)\(/.test(file.code)) {
      fail(`${file.path}: mutates a grant; resolution is read-only`);
    }
    for (const specifier of importSpecifiers(file.raw)) {
      if (/apps\/storefront|apps\/admin|apps\/worker|react|next\//.test(specifier)) {
        fail(`${file.path} imports ${specifier}; B06 is one API capability`);
      }
    }
  }

  // 26 — the generated client takes a body and has no token URL argument.
  const client = read(rootDir, 'client');
  if (client === undefined) {
    fail(`${CANONICAL_FILES.client} is missing`);
    return;
  }
  const fn = /export const publicSecureLinkResolve = \(([\s\S]*?)\n\};/.exec(client)?.[0] ?? '';
  if (fn === '') {
    fail('the generated client has no publicSecureLinkResolve operation');
    return;
  }
  if (!/resolveSecureLinkBody/.test(fn)) {
    fail('the generated client does not take the request body');
  }
  if (/\$\{[^}]*token[^}]*\}/i.test(fn) || /params:/.test(fn)) {
    fail('the generated client puts the token in the URL or a query parameter');
  }
  if (!/url: `\/api\/public\/secure-links\/resolve`/.test(fn)) {
    fail('the generated client does not call the canonical static route');
  }
  if (/useQuery|useMutation/.test(client) && /publicSecureLinkResolve/.test(client)) {
    // TanStack hooks are handwritten per IMP-D023; the generated file has none.
    const hooks = /export const usePublicSecureLinkResolve/.test(client);
    if (hooks) fail('the generated client declares a TanStack hook; B06 adds none');
  }
}

export function checkApp4B06Contract(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkFilesExist(rootDir, fail);
  checkPublishedSurface(rootDir, fail);
  checkRequestContract(rootDir, fail);
  checkTokenHandling(rootDir, fail);
  checkTargetBinding(rootDir, fail);
  checkNonEnumeration(rootDir, fail);
  checkSuccessProjection(rootDir, fail);
  checkRateLimit(rootDir, fail);
  checkTrustedClientIp(rootDir, fail);
  checkAudit(rootDir, fail);
  checkRepositoryExtension(rootDir, fail);
  checkBoundaries(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp4B06Contract(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app4-b06-contract — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app4-b06-contract — exactly one published operation, a POST at the canonical ' +
      'secure-links resolve route with no GET form and no token path, query or header ' +
      'parameter; a strict body of one bounded token with no published example; the APP4-P01 ' +
      'digest reused with no second HMAC and no raw-token comparison; the scope fixed to ' +
      'REQUEST_ACCESS and the target read from the grant row rather than accepted, with no ' +
      'customer, request or purpose field invented; one public classification answering 404 ' +
      'SECURE_LINK_UNAVAILABLE with no cause-specific code and no diagnostic query after a ' +
      'miss; a success projection of three secret-free fields; the abuse limit read from the ' +
      'published secure_link.resolve policy with no literal and no fallback, charged once per ' +
      'request before resolution by a limiter whose signature cannot see the outcome; the ' +
      'trusted client address taken from the entry the gateway appended; an audit that names ' +
      'no token or digest and fabricates no identity for a pre-identity failure; a read-only, ' +
      'digest-keyed repository addition; and no schema, migration, business action, frontend ' +
      'or token-bearing generated-client argument',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
