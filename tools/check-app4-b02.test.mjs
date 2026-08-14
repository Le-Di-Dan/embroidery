/**
 * Regressions for the `APP4-B02` gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked source.
 *
 * The mutations are the *plausible* mistakes, because those are the ones a gate
 * has to catch: broadening the conflict guard to any `23505`, logging the driver
 * error while debugging a race, putting the contact into the audit summary "for
 * support", adding a controller so a frontend can create a customer, following
 * the merge pointer because the ADR mentions following it forward. Every one of
 * them compiles and most of them pass the happy-path tests.
 *
 * Two cases keep the gate honest rather than merely strict. `reads code rather
 * than prose` is the important one: every file in this checkpoint documents what
 * it deliberately does not do — "never `merged_into_customer_id`", "no
 * `password`", "PostgreSQL `DETAIL` quotes the value" — and a gate that failed on
 * its own explanation would be deleted within a checkpoint.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES, MODULE_DIR, REPO_ROOT, checkApp4B02 } from './check-app4-b02.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-b02-'));
  temporaries.push(dir);
  for (const relative of [
    'apps/api/src',
    'packages/contracts/openapi',
    'packages/database/migrations',
  ]) {
    const source = join(REPO_ROOT, relative);
    const target = join(dir, relative);
    mkdirSync(dirname(target), { recursive: true });
    // `node_modules` holds pnpm's symlinks, which Windows refuses to recreate
    // without elevation — and the gate never reads them anyway.
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

/** Failures after one substitution in a named file. */
function failuresAfterEdit(relative, from, to) {
  const source = real(relative);
  assert.ok(source.includes(from), `${relative} is missing the anchor: ${from.slice(0, 60)}`);
  return checkApp4B02(rootWith({ [relative]: source.replace(from, to) }));
}

describe('APP4-B02 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp4B02(REPO_ROOT), []);
  });

  it('passes against a faithful copy, so the gate is path-independent', () => {
    assert.deepEqual(checkApp4B02(rootWith()), []);
  });

  it('reads code rather than prose', () => {
    // Every forbidden phrase this gate looks for, in a comment.
    const source = `${real(CANONICAL_FILES.service)}
/**
 * merged_into_customer_id, mergedIntoCustomerId: survivor, customer_merge_cases,
 * upsertBusinessProfile, search, ilike, password, credential, login,
 * libphonenumber, toLowerCase(), diagnostics, Logger, console.log, DETAIL,
 * sqlState, error.message, { cause: error }, '23505', drizzle-orm, executeRaw,
 * schema.customers, BEGIN, savepoint, anonymize().
 */
`;
    assert.deepEqual(checkApp4B02(rootWith({ [CANONICAL_FILES.service]: source })), []);
  });
});

describe('APP4-B02 — composition', () => {
  it('rejects a CustomerModule that is never composed', () => {
    const failures = failuresAfterEdit(CANONICAL_FILES.appModule, '    CustomerModule,\n', '');
    assert.ok(mentions(failures, 'CustomerModule appears 0 times'));
  });

  it('rejects dropping the B01 notification composition', () => {
    const failures = failuresAfterEdit(CANONICAL_FILES.appModule, '    NotificationModule,\n', '');
    assert.ok(mentions(failures, 'NotificationModule appears 0 times'));
  });

  it('rejects dropping the B01-C1 policy composition', () => {
    const failures = failuresAfterEdit(CANONICAL_FILES.appModule, '    PolicyModule,\n', '');
    assert.ok(mentions(failures, 'PolicyModule appears 0 times'));
  });

  it('rejects a capability that is not exported for APP4-B04', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.customerModule,
      '    SECURE_ACCESS_GRANT_REPOSITORY,\n    ResolveOrCreateVerifiedCustomer,\n  ],',
      '    SECURE_ACCESS_GRANT_REPOSITORY,\n  ],',
    );
    assert.ok(mentions(failures, 'is not exported'));
  });

  it('rejects a controller on the customer module', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.customerModule,
      '  providers: [',
      '  controllers: [],\n  providers: [',
    );
    assert.ok(mentions(failures, '0 endpoints'));
  });

  it('rejects an HTTP surface anywhere in the module', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      '@Injectable()',
      "@Controller('customers')\n@Injectable()",
    );
    assert.ok(mentions(failures, 'no HTTP surface'));
  });

  it('rejects an OpenAPI decorator', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.evidence,
      'export interface VerifiedContactEvidence {',
      'export interface VerifiedContactEvidence {\n  @ApiProperty() readonly x?: string;',
    );
    assert.ok(mentions(failures, 'no HTTP surface'));
  });

  it('rejects a published customer path in the generated contract', () => {
    const document = JSON.parse(real(CANONICAL_FILES.openapi));
    document.paths['/api/v1/customers'] = { post: { operationId: 'customer_create' } };
    const failures = checkApp4B02(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }),
    );

    assert.ok(mentions(failures, 'publishes customer path'));
  });
});

describe('APP4-B02 — one identity rule', () => {
  it('rejects a second production caller of the creation path', () => {
    const second = `${MODULE_DIR}/application/shadow-identity.service.ts`;
    const failures = checkApp4B02(
      rootWith({
        [second]: `
import type { CustomerRepository } from '../domain/repositories/customer.repository';
export class ShadowIdentity {
  constructor(private readonly customers: CustomerRepository) {}
  async create(): Promise<void> {
    await this.customers.createWithVerifiedContact({} as never);
  }
}
`,
      }),
    );
    assert.ok(mentions(failures, 'production caller(s)'));
  });

  it('rejects a capability that leaves the transaction boundary', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'this.transactions.runInTransaction(async () => {\n        const owner = await this.findActiveOwner(',
      '(async () => {\n        const owner = await this.findActiveOwner(',
    );
    assert.ok(mentions(failures, 'transaction'));
  });

  it('rejects raw SQL in the application layer', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'const CONTACT_ALREADY_VERIFIED',
      "import { executeRaw } from '@embroidery/database';\nconst CONTACT_ALREADY_VERIFIED",
    );
    assert.ok(mentions(failures, 'executeRaw'));
  });
});

describe('APP4-B02 — the conflict guard', () => {
  it('rejects a raw SQLSTATE match', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'error.code === CONTACT_ALREADY_VERIFIED',
      "error.diagnostics.sqlState === '23505'",
    );
    assert.ok(mentions(failures, '23505'));
  });

  it('rejects a guard that does not narrow past the conflict kind', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      "        error.kind === 'CONFLICT' &&\n        error.code === CONTACT_ALREADY_VERIFIED",
      "        error.kind === 'CONFLICT'",
    );
    assert.ok(mentions(failures, 'narrow to one constraint'));
  });

  it('rejects carrying the driver error as a cause', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      "throw new VerifiedIdentityConflictError('CONCURRENT_VERIFICATION_LOSS');",
      "throw new VerifiedIdentityConflictError('CONCURRENT_VERIFICATION_LOSS', { cause: error });",
    );
    assert.ok(mentions(failures, 'cause'));
  });

  it('rejects logging the failure', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'const CONTACT_ALREADY_VERIFIED',
      "import { Logger } from '@nestjs/common';\nconst CONTACT_ALREADY_VERIFIED",
    );
    assert.ok(mentions(failures, 'logs nothing'));
  });

  it('rejects an undeclared failure code', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      "throw new VerifiedIdentityConflictError('CONTACT_OWNED_BY_ANOTHER_CUSTOMER');",
      "throw new VerifiedIdentityConflictError('JUST_MERGE_THEM');",
    );
    assert.ok(mentions(failures, 'undeclared failure'));
  });

  it('tolerates a new failure code that is properly declared', () => {
    const declared = real(CANONICAL_FILES.outcome).replace(
      "  'CUSTOMER_NOT_FOUND',",
      "  'CUSTOMER_NOT_FOUND',\n  'CONTACT_DEACTIVATION_REQUIRED',",
    );
    assert.deepEqual(checkApp4B02(rootWith({ [CANONICAL_FILES.outcome]: declared })), []);
  });
});

describe('APP4-B02 — scope boundaries', () => {
  it('rejects a merge tombstone write', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'return { outcome: ATTACHED, contactPointId: added.id };',
      'await this.customers.merge({ mergedIntoCustomerId: input.customerId });\n' +
        '        return { outcome: ATTACHED, contactPointId: added.id };',
    );
    assert.ok(mentions(failures, 'merge tombstone'));
  });

  it('rejects a business-profile write', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'await this.audit.recordIdentityCreated({',
      'await this.customers.upsertBusinessProfile({} as never);\n    await this.audit.recordIdentityCreated({',
    );
    assert.ok(mentions(failures, 'business profile'));
  });

  it('rejects a search surface', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'export interface AttachVerifiedContactInput {',
      'export interface CustomerSearchInput { readonly ilike: string }\nexport interface AttachVerifiedContactInput {',
    );
    assert.ok(mentions(failures, 'searches or lists'));
  });

  it('rejects re-normalizing a contact', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'normalizedValue: contact.normalized,',
      'normalizedValue: contact.display.toLowerCase(),',
    );
    assert.ok(mentions(failures, 'normalizes a contact itself'));
  });

  it('rejects a direct phone parser', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'const CONTACT_ALREADY_VERIFIED',
      "import { parsePhoneNumber } from 'libphonenumber-js';\nconst CONTACT_ALREADY_VERIFIED",
    );
    assert.ok(mentions(failures, 'parses a phone number itself'));
  });

  it('rejects an evidence contract that takes a raw string', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.evidence,
      "import type { NormalizedContact } from '../contact/contact-value';",
      'type NormalizedContact = { kind: string; normalized: string; display: string };',
    );
    assert.ok(mentions(failures, 'P01 normalized contact'));
  });

  it('rejects a customer credential', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.evidence,
      '  readonly verifiedSource: string;',
      '  readonly verifiedSource: string;\n  readonly password: string;',
    );
    assert.ok(mentions(failures, 'customer credential'));
  });

  it('rejects a schema declaration in the module', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.outcome,
      'export const RESOLVED =',
      "export const extra = pgTable('customer_extras', {});\nexport const RESOLVED =",
    );
    assert.ok(mentions(failures, 'declares schema'));
  });

  it('rejects a migration added by this checkpoint', () => {
    const dir = rootWith();
    writeFileSync(join(dir, 'packages/database/migrations/0035_b02.sql'), '-- no', 'utf8');

    assert.ok(mentions(checkApp4B02(dir), 'adds none'));
  });
});

describe('APP4-B02 — audit evidence', () => {
  it('rejects an unaudited creation', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'await this.audit.recordIdentityCreated({',
      'await Promise.resolve({',
    );
    assert.ok(mentions(failures, 'recordIdentityCreated('));
  });

  it('rejects an unaudited attachment', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'await this.audit.recordContactAttached({',
      'await Promise.resolve({',
    );
    assert.ok(mentions(failures, 'recordContactAttached('));
  });

  it('rejects a normalized contact in the audit summary', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      '        contactKind: input.contactKind,',
      '        contactKind: input.contactKind,\n        normalizedValue: input.normalizedValue,',
    );
    assert.ok(mentions(failures, 'the normalized contact'));
  });

  it('rejects a masked contact in the audit summary', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      '        isPrimary: input.isPrimary,',
      '        isPrimary: input.isPrimary,\n        masked: input.masked,',
    );
    assert.ok(mentions(failures, 'a masked contact'));
  });

  it('rejects a caller-supplied evidence string in the audit summary', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      '        isPrimary: input.isPrimary,',
      '        isPrimary: input.isPrimary,\n        verifiedSource: input.verifiedSource,',
    );
    assert.ok(mentions(failures, 'caller-supplied evidence string'));
  });

  it('rejects an audit writer that bypasses the existing capability', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      'await this.events.append({',
      'await Promise.resolve({',
    );
    assert.ok(mentions(failures, 'existing audit capability'));
  });

  it('rejects an audit row with no request correlation', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      'correlationId: this.requestContext.requireRequestId(),',
      "correlationId: 'unknown',",
    );
    assert.ok(mentions(failures, 'request context'));
  });
});
