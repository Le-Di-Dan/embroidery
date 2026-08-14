#!/usr/bin/env node
/**
 * `APP4-B07` — the Admin Customer, verification and secure-grant support
 * contract.
 *
 * This is the first authenticated Admin surface over customer identity, and the
 * failures it exists for are the ones that look like helpfulness. Adding a
 * `GET /admin/customers` list "so the operator can find someone". Adding an
 * email filter, because that is how support actually starts. Returning
 * `normalizedValue` beside the mask "for copy-paste". Returning `tokenHash`
 * because it is not the token. Adding an Admin *issue* route beside the revoke,
 * because an operator who can kill a link will ask to send one. Calling the
 * repository's `revoke` directly, because it is right there and it works. Each
 * one is a small, reasonable-looking edit, and each turns a support screen into
 * a customer database, a credential lookup table, or an unaudited way to move
 * somebody's only credential for their order.
 *
 * Assertions read the **generated OpenAPI document**, the **generated client**,
 * and **real source with comments stripped** — never prose, and never the
 * completion report. Every file in this checkpoint documents at length what it
 * deliberately does not do, and a gate that failed on its own explanation would
 * be deleted rather than obeyed.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-b07-contract.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { importSpecifiers, stripComments } from './check-app4-b01.mjs';
import { MODULE_DIR } from './check-app4-b03-contract.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The three canonical routes, under the global API prefix. */
export const DETAIL_PATH = '/api/admin/customers/{customerId}';
export const GRANTS_PATH = '/api/admin/customers/{customerId}/grants';
export const REVOKE_PATH = '/api/admin/secure-grants/{grantId}/revoke';

/** Path → the one verb B07 owns on it. A second verb is a new operation. */
const ROUTE_VERBS = Object.freeze([
  [DETAIL_PATH, 'get'],
  [GRANTS_PATH, 'get'],
  [REVOKE_PATH, 'post'],
]);

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

export const CANONICAL_FILES = Object.freeze({
  customerController: `${MODULE_DIR}/presentation/admin-customer-support.controller.ts`,
  grantController: `${MODULE_DIR}/presentation/admin-secure-grant.controller.ts`,
  customerResponse: `${MODULE_DIR}/presentation/schemas/admin-customer-support.response.ts`,
  grantResponse: `${MODULE_DIR}/presentation/schemas/admin-secure-grant.response.ts`,
  request: `${MODULE_DIR}/presentation/schemas/admin-support.request.ts`,
  query: `${MODULE_DIR}/application/admin-customer-support.query.ts`,
  revokeUseCase: `${MODULE_DIR}/application/revoke-secure-grant.use-case.ts`,
  errors: `${MODULE_DIR}/domain/support/admin-support.errors.ts`,
  policy: `${MODULE_DIR}/domain/support/admin-support.policy.ts`,
  module: `${MODULE_DIR}/customer-admin-support.module.ts`,
  issuer: `${MODULE_DIR}/application/secure-grant.issuer.ts`,
  repositoryPort: `${MODULE_DIR}/domain/repositories/secure-access-grant.repository.ts`,
  repositoryAdapter: `${MODULE_DIR}/infrastructure/persistence/drizzle-secure-access-grant.repository.ts`,
  masker: `${MODULE_DIR}/domain/contact/mask-contact.ts`,
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  client: 'packages/api-client/src/generated/embroidery-api.ts',
  clientSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
});

/** Every file `APP4-B07` owns. The whole surface the source rules read. */
export const B07_SOURCES = Object.freeze([
  CANONICAL_FILES.customerController,
  CANONICAL_FILES.grantController,
  CANONICAL_FILES.customerResponse,
  CANONICAL_FILES.grantResponse,
  CANONICAL_FILES.request,
  CANONICAL_FILES.query,
  CANONICAL_FILES.revokeUseCase,
  CANONICAL_FILES.errors,
  CANONICAL_FILES.policy,
  CANONICAL_FILES.module,
]);

/** The entry world (47) plus exactly B07's three. Measured, not assumed. */
const B06_BASELINE_OPERATIONS = 47;
const EXPECTED_OPERATIONS = 50;
const MIGRATION_COUNT = 34;

/** The exact Admin guard, and the exact security scheme its routes publish. */
const ADMIN_GUARD = 'AuthenticatedAdminGuard';
const ADMIN_SECURITY_SCHEME = 'adminSession';

/** The established private-read transport for an authenticated Admin read. */
const NO_STORE = 'no-store';

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function codeOf(rootDir, key) {
  const raw = read(rootDir, key);
  return raw === undefined ? '' : stripComments(raw);
}

function sources(rootDir, list = B07_SOURCES) {
  return list
    .map((relative) => ({ path: relative, raw: read(rootDir, relative) ?? '' }))
    .filter((file) => file.raw !== '')
    .map((file) => ({ ...file, code: stripComments(file.raw) }));
}

function loadOpenApi(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi} is missing`);
    return undefined;
  }
  return JSON.parse(raw);
}

function methodsOf(document, path) {
  return HTTP_METHODS.filter((method) => document.paths?.[path]?.[method] !== undefined);
}

/** 0 — every owned file exists. A deleted file must not pass by absence. */
function checkFilesExist(rootDir, fail) {
  for (const relative of B07_SOURCES) {
    if (!existsSync(join(rootDir, relative))) {
      fail(`${relative} does not exist`);
    }
  }
}

/**
 * 1, 2, 3, 4, 5, 28 — the published surface is exactly three new operations at
 * the canonical routes, and nothing else moved.
 */
function checkPublishedSurface(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  if (document === undefined) return;

  for (const [path, verb] of ROUTE_VERBS) {
    const verbs = methodsOf(document, path);
    if (JSON.stringify(verbs) !== JSON.stringify([verb])) {
      fail(`${path} publishes [${verbs.join(', ')}]; APP4-B07 owns exactly one ${verb}`);
    }
  }

  const total = Object.keys(document.paths ?? {}).reduce(
    (count, path) => count + methodsOf(document, path).length,
    0,
  );
  if (total !== EXPECTED_OPERATIONS) {
    fail(
      `the document publishes ${String(total)} operations; expected ${String(EXPECTED_OPERATIONS)} ` +
        `— the APP4-B06 baseline of ${String(B06_BASELINE_OPERATIONS)} plus exactly B07's three`,
    );
  }

  // 1 — and there is no fourth B07 route hiding elsewhere under either prefix.
  const owned = ROUTE_VERBS.map(([path]) => path);
  const admin = Object.keys(document.paths ?? {}).filter((path) =>
    /^\/api\/admin\/(customers|secure-grants)/.test(path),
  );
  const unexpected = admin.filter((path) => !owned.includes(path));
  if (unexpected.length > 0) {
    fail(`the Admin support surface also declares [${unexpected.join(', ')}]; B07 owns three`);
  }

  // 42 — the operation ids are B07's own and collide with no accepted one.
  const expectedIds = {
    [DETAIL_PATH]: 'adminCustomerSupport_detail',
    [GRANTS_PATH]: 'adminCustomerSupport_grants',
    [REVOKE_PATH]: 'adminSecureGrant_revoke',
  };
  for (const [path, verb] of ROUTE_VERBS) {
    const actual = document.paths?.[path]?.[verb]?.operationId;
    if (actual !== expectedIds[path]) {
      fail(`${path} publishes operationId "${String(actual)}"; expected ${expectedIds[path]}`);
    }
  }
}

/** 6, 7, 8 — the exact APP1 guard, no second guard, no role model. */
function checkAdminAuthorization(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  const controllers = [CANONICAL_FILES.customerController, CANONICAL_FILES.grantController];

  for (const relative of controllers) {
    const code = stripComments(read(rootDir, relative) ?? '');
    if (!new RegExp(`@UseGuards\\(\\s*${ADMIN_GUARD}\\s*\\)`).test(code)) {
      fail(`${relative}: does not apply @UseGuards(${ADMIN_GUARD}) to the controller`);
    }
    if (!importSpecifiers(code).some((s) => s.includes('identity/presentation/guards'))) {
      fail(`${relative}: does not import the guard from the delivered APP1 identity module`);
    }
    // A controller that resolved a session itself would be a second auth path
    // whatever it was called. `@ApiCookieAuth` is deliberately not in this list:
    // it publishes the security scheme, it reads nothing.
    for (const forbidden of [
      '\\.cookies',
      'parseCookie',
      'CookiePolicyService',
      'ResolveStaffSessionService',
      'SessionTokenService',
      'adm_session',
      'staffSession',
      'sessionToken',
      'request\\.headers',
    ]) {
      if (new RegExp(forbidden, 'i').test(code)) {
        fail(`${relative}: reads "${forbidden}"; authentication stays APP1's`);
      }
    }
  }

  // 7 — B07 declares no guard of its own, anywhere in the files it owns.
  for (const file of sources(rootDir)) {
    if (/implements\s+CanActivate|@Injectable\(\)[\s\S]{0,80}Guard\b/.test(file.code)) {
      fail(`${file.path}: declares a guard; B07 reuses ${ADMIN_GUARD} and adds none`);
    }
  }

  // 8 — no role or permission vocabulary. APP1-B01 is a binary gate and B07 may
  // not invent an authorization model without an ADR.
  for (const file of sources(rootDir)) {
    if (
      /\brole\b|\bRoles\b|permission|@RequirePermission|hasPermission|isSuperAdmin/i.test(file.code)
    ) {
      fail(`${file.path}: names a role or permission; APP1 has no role model`);
    }
  }

  // 3, 4, 5 — and the published contract says every route is Admin-protected.
  if (document === undefined) return;
  for (const [path, verb] of ROUTE_VERBS) {
    const security = document.paths?.[path]?.[verb]?.security ?? document.security ?? [];
    const schemes = security.flatMap((entry) => Object.keys(entry));
    if (!schemes.includes(ADMIN_SECURITY_SCHEME)) {
      fail(`${path} publishes security [${schemes.join(', ')}]; expected ${ADMIN_SECURITY_SCHEME}`);
    }
  }
}

/** 9, 10, 11, 19 — no search, no mutation, no merge, no global listing. */
function checkForbiddenOperations(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);

  if (document !== undefined) {
    for (const path of Object.keys(document.paths ?? {})) {
      // 9 — a customer *collection* route is a search surface whatever its
      // query parameters are, and there is no path this checkpoint may add one
      // at. The two authorized customer paths are keyed by an id.
      if (/^\/api\/admin\/customers\/?$/.test(path) || /customers?\/search/i.test(path)) {
        fail(`${path} is a customer search or listing surface; B07 publishes none`);
      }
      // 19 — no global grant listing, and no Admin issue or reissue.
      if (/^\/api\/admin\/secure-grants\/?$/.test(path)) {
        fail(`${path} is a global grant listing; a grant list is reached through its Customer`);
      }
      if (/secure-grants\/(issue|reissue)|grants\/issue|\/reissue\b/i.test(path)) {
        fail(`${path} mints or rotates a grant; issuance has no HTTP surface in APP4`);
      }
    }

    // 9 — and no query parameter on the two reads could become a lookup.
    for (const [path, verb] of ROUTE_VERBS) {
      for (const parameter of document.paths?.[path]?.[verb]?.parameters ?? []) {
        const name = String(parameter.name);
        if (String(parameter.in) === 'query') {
          fail(`${path} declares the query parameter "${name}"; B07 takes no filter`);
        }
        if (/email|phone|contact|term|search|q$/i.test(name)) {
          fail(`${path} declares a lookup parameter "${name}"`);
        }
      }
    }
  }

  // 10 — the customer controller carries reads only.
  const customerController = codeOf(rootDir, 'customerController');
  for (const verb of ['@Post(', '@Patch(', '@Put(', '@Delete(']) {
    if (customerController.includes(verb)) {
      fail(
        `${CANONICAL_FILES.customerController}: declares ${verb}; the customer surface is read-only`,
      );
    }
  }

  // 10, 11 — and no B07 file calls a customer write, a merge or an anonymize.
  const writes = [
    'createWithVerifiedContact',
    'addContactPoint',
    'markContactVerified',
    'setPrimaryContact',
    'upsertBusinessProfile',
    'anonymize',
    'findByVerifiedContact',
  ];
  for (const file of sources(rootDir)) {
    for (const method of writes) {
      if (new RegExp(`\\.${method}\\s*\\(`).test(file.code)) {
        fail(`${file.path}: calls ${method}; B07 mutates no customer and resolves none by contact`);
      }
    }
    if (/\bmerge(d)?Into|mergeCustomer|anonymizedAt/i.test(file.code)) {
      fail(`${file.path}: reads merge or anonymization state; both are out of scope`);
    }
  }
}

/** 12, 13, 14, 15, 27 — the contact projection is masked and minimal. */
function checkContactProjection(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  const query = codeOf(rootDir, 'query');

  // 13 — the APP4-P01 masker, reused, with no second implementation.
  if (!/maskContact\s*\(/.test(query)) {
    fail(`${CANONICAL_FILES.query}: does not call maskContact; P01 owns masking`);
  }
  if (!importSpecifiers(query).some((s) => s.includes('contact/mask-contact'))) {
    fail(`${CANONICAL_FILES.query}: does not import the P01 masker`);
  }
  for (const file of sources(rootDir)) {
    // `[\s\S]{0,80}` rather than `[^)]*`: an inline masker's own regex contains
    // parentheses, so a negated-`)` scan stops before reaching the `***` that
    // gives it away — which is exactly the shape this rule exists to catch.
    if (/function\s+mask|const\s+mask\w*\s*=\s*\(|\.replace\([\s\S]{0,80}\*{3}/.test(file.code)) {
      fail(`${file.path}: implements masking; there is exactly one masker and it is P01's`);
    }
  }

  if (document === undefined) return;

  // 14, 15 — the contact shape is exactly the four support fields.
  const contact = document.components?.schemas?.AdminCustomerContactResponse;
  if (contact === undefined) {
    fail('AdminCustomerContactResponse is not published as a component');
  } else {
    const fields = Object.keys(contact.properties ?? {}).sort();
    const expected = ['kind', 'maskedValue', 'primary', 'verified'];
    if (JSON.stringify(fields) !== JSON.stringify(expected)) {
      fail(
        `AdminCustomerContactResponse publishes [${fields.join(', ')}]; expected [${expected.join(', ')}]`,
      );
    }
  }

  const detail = document.components?.schemas?.AdminCustomerDetailResponse;
  if (detail === undefined) {
    fail('AdminCustomerDetailResponse is not published as a component');
  } else {
    const fields = Object.keys(detail.properties ?? {}).sort();
    const expected = ['contacts', 'customerId', 'verifiedAt'];
    if (JSON.stringify(fields) !== JSON.stringify(expected)) {
      fail(
        `AdminCustomerDetailResponse publishes [${fields.join(', ')}]; expected [${expected.join(', ')}]`,
      );
    }
  }

  // 12, 15, 27 — nothing in the whole published contract names a raw contact,
  // a business profile or a credential.
  const forbidden = [
    'normalizedValue',
    'normalized_value',
    'displayValue',
    'display_value',
    'rawValue',
    'e164',
    'verifiedSource',
    'contactPointId',
    'businessProfile',
    'companyName',
    'taxCode',
    'billingContact',
    'passwordHash',
    'sessionToken',
  ];
  const serialized = JSON.stringify(document);
  for (const field of forbidden) {
    if (new RegExp(`"[^"]*${field}[^"]*"\\s*:`, 'i').test(serialized)) {
      fail(`the published contract carries a "${field}" field`);
    }
  }
}

/** 16, 17, 18 — the grant projection is state and expiry, never a credential. */
function checkGrantProjection(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);

  if (document !== undefined) {
    const grant = document.components?.schemas?.AdminSecureGrantResponse;
    if (grant === undefined) {
      fail('AdminSecureGrantResponse is not published as a component');
    } else {
      const fields = Object.keys(grant.properties ?? {}).sort();
      const expected = ['customRequestId', 'expiresAt', 'grantId', 'scopeKind', 'status'];
      if (JSON.stringify(fields) !== JSON.stringify(expected)) {
        fail(
          `AdminSecureGrantResponse publishes [${fields.join(', ')}]; expected [${expected.join(', ')}]`,
        );
      }
      // 16 — an operator cannot answer "is this link live?" without both.
      for (const required of ['status', 'expiresAt']) {
        if (!fields.includes(required)) {
          fail(`AdminSecureGrantResponse has no "${required}"`);
        }
      }
    }
  }

  // 17 — no credential vocabulary anywhere in B07's own source or its contract.
  const credential = ['tokenHash', 'token_hash', 'rawToken', 'digest', 'ciphertext', 'pepper'];
  for (const file of sources(rootDir)) {
    for (const term of credential) {
      if (new RegExp(`\\b${term}\\b`, 'i').test(file.code)) {
        fail(`${file.path}: names "${term}"; no B07 file touches a credential`);
      }
    }
  }
  if (document !== undefined) {
    const serialized = JSON.stringify(document.components?.schemas ?? {});
    for (const term of credential) {
      if (new RegExp(`"[^"]*${term}[^"]*"\\s*:`, 'i').test(serialized)) {
        fail(`the published schemas carry a "${term}" field`);
      }
    }
  }

  // 18 — the repository read is customer-scoped, read-only and omits the digest
  // structurally rather than by mapping it away.
  const port = codeOf(rootDir, 'repositoryPort');
  if (!/listForCustomer\s*\(\s*customerId:\s*CustomerId\s*\)/.test(port)) {
    fail(`${CANONICAL_FILES.repositoryPort}: listForCustomer is not scoped to a CustomerId`);
  }
  // The summary interface body only — not "the next 400 characters", which
  // would sweep in `IssueGrantInput`, whose `tokenHash` is correct and required.
  const summary = /interface\s+SecureAccessGrantSummary\s*\{([\s\S]*?)\n\}/.exec(port)?.[1];
  if (summary === undefined) {
    fail(`${CANONICAL_FILES.repositoryPort}: no SecureAccessGrantSummary read model`);
  } else {
    if (/tokenHash|token_hash/i.test(summary)) {
      fail(`${CANONICAL_FILES.repositoryPort}: the summary read model carries a token hash`);
    }
    for (const field of ['status', 'expiresAt']) {
      if (!new RegExp(`\\b${field}\\b`).test(summary)) {
        fail(`${CANONICAL_FILES.repositoryPort}: the summary read model has no "${field}"`);
      }
    }
  }
  const adapter = codeOf(rootDir, 'repositoryAdapter');
  const body = /async\s+listForCustomer\([\s\S]*?\n {2}}/.exec(adapter)?.[0] ?? '';
  if (body === '') {
    fail(`${CANONICAL_FILES.repositoryAdapter}: no listForCustomer implementation`);
  } else {
    if (!/eq\(secureAccessGrants\.customerId,\s*customerId\)/.test(body)) {
      fail(`${CANONICAL_FILES.repositoryAdapter}: listForCustomer does not filter by customer id`);
    }
    if (/tokenHash/.test(body)) {
      fail(`${CANONICAL_FILES.repositoryAdapter}: listForCustomer selects the token hash`);
    }
    if (/\.insert\(|\.update\(|\.delete\(/.test(body)) {
      fail(`${CANONICAL_FILES.repositoryAdapter}: listForCustomer writes; it is a read`);
    }
    if (!/orderBy\(/.test(body)) {
      fail(`${CANONICAL_FILES.repositoryAdapter}: listForCustomer has no deterministic order`);
    }
  }
}

/** 20, 21, 22, 23 — revocation is B05's, with a mandatory reason. */
function checkRevocation(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);

  if (document !== undefined) {
    const body = document.components?.schemas?.RevokeSecureGrantBody;
    if (body === undefined) {
      fail('RevokeSecureGrantBody is not published as a component');
    } else {
      const fields = Object.keys(body.properties ?? {});
      if (JSON.stringify(fields) !== JSON.stringify(['reason'])) {
        fail(`RevokeSecureGrantBody publishes [${fields.join(', ')}]; expected exactly [reason]`);
      }
      // 20 — required *and* non-blank. A `reason` that may be "" satisfies the
      // schema and violates the CHECK, which is the worst of both.
      if (!(body.required ?? []).includes('reason')) {
        fail('RevokeSecureGrantBody does not require "reason"');
      }
      if ((body.properties?.reason?.minLength ?? 0) < 1) {
        fail('RevokeSecureGrantBody permits a blank reason');
      }
      if (body.additionalProperties !== false) {
        fail('RevokeSecureGrantBody accepts additional properties; the body is strict');
      }
    }
  }

  // 21 — the HTTP path reaches B05, by name.
  const useCase = codeOf(rootDir, 'revokeUseCase');
  if (!/SecureGrantIssuer/.test(useCase) || !/\.revoke\s*\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.revokeUseCase}: does not call SecureGrantIssuer.revoke`);
  }
  if (!importSpecifiers(useCase).some((s) => s.includes('secure-grant.issuer'))) {
    fail(`${CANONICAL_FILES.revokeUseCase}: does not import the B05 lifecycle owner`);
  }

  // 22 — and it does not reach past B05 to the repository's own revoke, which
  // would move the row and write no audit event.
  for (const file of sources(rootDir)) {
    if (/(?:grants|grantRepository|repository)\s*\.\s*revoke\s*\(/.test(file.code)) {
      fail(`${file.path}: calls the repository's revoke directly; B05 owns the transition`);
    }
    if (/\.supersede\s*\(/.test(file.code)) {
      fail(`${file.path}: supersedes a grant; B07 revokes and mints nothing`);
    }
    // 23 — no Admin issue or reissue, in any file B07 owns.
    if (/(?:issuer|grants)\s*\.\s*(?:issue|reissue)\s*\(/.test(file.code)) {
      fail(`${file.path}: issues or reissues a grant; B07 revokes only`);
    }
  }

  // 21 — the actor is the authenticated Admin, taken from the bound context and
  // never from the wire.
  if (!/requireActor\s*\(\s*\)/.test(useCase)) {
    fail(`${CANONICAL_FILES.revokeUseCase}: does not resolve the actor from the request context`);
  }
  if (!/kind\s*!==\s*'ADMIN'/.test(useCase)) {
    fail(`${CANONICAL_FILES.revokeUseCase}: does not refuse a non-Admin actor`);
  }
  if (
    /body\.\w*[Aa]ctor|params\.\w*[Aa]dmin|adminId:\s*(?:body|params|input|command)\./.test(useCase)
  ) {
    fail(`${CANONICAL_FILES.revokeUseCase}: takes the acting Admin from the request`);
  }

  // 21 — and B05 still carries the actor through to its own audit row.
  const issuer = codeOf(rootDir, 'issuer');
  if (!/async\s+revoke\s*\([^)]*actor\??:\s*AuditActor/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: revoke does not accept an audit actor`);
  }
  if (!/recordRevoked\s*\(\s*\{[\s\S]{0,400}actor/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: revoke does not pass the actor to the audit recorder`);
  }
}

/** 24, 25, 26 — no notification data, no schema change, no later-phase content. */
function checkScopeBoundaries(rootDir, fail) {
  // 24 — B07 reaches no notification symbol, table or module.
  for (const file of sources(rootDir)) {
    for (const specifier of importSpecifiers(file.code)) {
      if (/notification/i.test(specifier)) {
        fail(`${file.path}: imports "${specifier}"; APP4-B08 owns notification support`);
      }
    }
    if (
      /notification_intents|outbox_events|notificationIntents|outboxEvents|deliveryAttempt/i.test(
        file.code,
      )
    ) {
      fail(`${file.path}: names notification or outbox persistence; B08 owns it`);
    }
  }

  // 24 — and the module does not import the notification module either.
  const moduleCode = codeOf(rootDir, 'module');
  if (/NotificationModule/.test(moduleCode)) {
    fail(`${CANONICAL_FILES.module}: imports NotificationModule; B07 needs no delivery seam`);
  }
  // The one composition fact worth pinning: the lifecycle owner is imported,
  // not re-provided. A locally bound issuer would be a second lifecycle owner.
  if (!/CustomerModule/.test(moduleCode) || !/IdentityModule/.test(moduleCode)) {
    fail(`${CANONICAL_FILES.module}: does not compose CustomerModule and IdentityModule`);
  }
  if (/SecureGrantIssuer\s*,/.test(/providers:\s*\[([^\]]*)\]/.exec(moduleCode)?.[1] ?? '')) {
    fail(
      `${CANONICAL_FILES.module}: re-provides SecureGrantIssuer; B05's instance is the only one`,
    );
  }

  // 25 — no schema and no migration.
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; APP4-B07 adds none`);
  }
  for (const file of sources(rootDir)) {
    if (/pgTable\(|uniqueIndex\(|alterTable|CREATE TABLE|ALTER TABLE/i.test(file.code)) {
      fail(`${file.path}: declares schema; B07 changes none`);
    }
  }

  // 26 — no APP5–APP7 business content in the published contract or the source.
  const later = [
    'quotation',
    'designCase',
    'designVersion',
    'paymentObligation',
    'paymentAttempt',
    'refund',
    'productionJob',
    'invoice',
  ];
  for (const file of sources(rootDir)) {
    for (const term of later) {
      if (new RegExp(`\\b${term}`, 'i').test(file.code)) {
        fail(`${file.path}: names "${term}"; APP5–APP7 content is not B07's`);
      }
    }
  }
}

/** 15, 27 — the transport, and the generated client the frontend will use. */
function checkTransportAndClient(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);

  // The private-read transport, on both GETs, from one named constant.
  const policy = codeOf(rootDir, 'policy');
  if (!new RegExp(`'${NO_STORE}'`).test(policy)) {
    fail(`${CANONICAL_FILES.policy}: does not declare ${NO_STORE}`);
  }
  const controller = codeOf(rootDir, 'customerController');
  const headers =
    controller.match(/@Header\('Cache-Control',\s*ADMIN_SUPPORT_CACHE_CONTROL\)/g) ?? [];
  if (headers.length !== 2) {
    fail(
      `${CANONICAL_FILES.customerController}: ${String(headers.length)} of 2 reads set ` +
        'Cache-Control from the support policy',
    );
  }
  if (/public|max-age|s-maxage/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: permits shared or timed caching of a private read`);
  }

  // 27 — the generated client names the three operations and no credential.
  const client = read(rootDir, 'client') ?? '';
  const schemas = read(rootDir, 'clientSchemas') ?? '';
  if (client === '') {
    fail(`${CANONICAL_FILES.client} is missing`);
    return;
  }
  for (const symbol of [
    'adminCustomerSupportDetail',
    'adminCustomerSupportGrants',
    'adminSecureGrantRevoke',
  ]) {
    if (!client.includes(symbol)) {
      fail(`${CANONICAL_FILES.client}: does not export ${symbol}`);
    }
  }
  const generated = `${client}\n${schemas}`;
  for (const term of ['tokenHash', 'rawToken', 'normalizedValue', 'displayValue', 'ciphertext']) {
    if (new RegExp(`\\b${term}\\b`).test(generated)) {
      fail(`the generated client names "${term}"`);
    }
  }
  // No hand-written hook belongs in a generated file (IMP-D023).
  if (/useQuery|useMutation|@tanstack/.test(generated)) {
    fail(`${CANONICAL_FILES.client}: carries a TanStack hook; hooks are handwritten elsewhere`);
  }

  if (document === undefined) return;
  // The revoke answers 204: an empty body is one fewer place a credential can
  // ever appear.
  const revokeResponses = Object.keys(document.paths?.[REVOKE_PATH]?.post?.responses ?? {});
  if (!revokeResponses.includes('204')) {
    fail(`${REVOKE_PATH} does not publish a 204; revocation returns no content`);
  }
  for (const status of ['401', '404', '409']) {
    if (!revokeResponses.includes(status)) {
      fail(`${REVOKE_PATH} does not publish a ${status} response`);
    }
  }
}

export function checkApp4B07(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkFilesExist(rootDir, fail);
  checkPublishedSurface(rootDir, fail);
  checkAdminAuthorization(rootDir, fail);
  checkForbiddenOperations(rootDir, fail);
  checkContactProjection(rootDir, fail);
  checkGrantProjection(rootDir, fail);
  checkRevocation(rootDir, fail);
  checkScopeBoundaries(rootDir, fail);
  checkTransportAndClient(rootDir, fail);

  return failures;
}

const SUMMARY =
  'check:app4-b07-contract — exactly three published operations at the canonical Admin customer ' +
  'detail, customer grants and secure-grant revoke routes, each behind the delivered ' +
  'AuthenticatedAdminGuard with no second guard, no role model and no session parsing of its own; ' +
  'no customer list, search or contact lookup, no customer mutation and no merge or anonymization; ' +
  'a contact projection of kind, P01 mask, verified and primary with no raw, normalized, display ' +
  'or source value and no Business Profile; a grant projection of id, request, scope, status and ' +
  'expiry with no token, hash, digest or ciphertext anywhere in the source, the contract or the ' +
  'generated client; a customer-scoped, read-only, deterministically ordered repository read that ' +
  'never selects the digest; a strict revoke body of one non-blank bounded reason answering 204, ' +
  'routed through SecureGrantIssuer.revoke with the actor taken from the bound request context ' +
  'and never from the wire, with no direct repository revoke, no supersede and no issue or ' +
  'reissue; no notification import, table or module; and no schema, migration or APP5–APP7 ' +
  'business content';

function main() {
  const rootDir = process.argv[2] ?? REPO_ROOT;
  const failures = checkApp4B07(rootDir);
  if (failures.length > 0) {
    for (const failure of failures) {
      process.stdout.write(`  ✗ ${failure}\n`);
    }
    process.stdout.write(`\ncheck:app4-b07-contract — ${String(failures.length)} failure(s)\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${SUMMARY}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
