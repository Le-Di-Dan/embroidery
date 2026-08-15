/**
 * Regressions for the `APP4-B07` Admin support gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. The mutations are the plausible mistakes rather
 * than vandalism — every one of them compiles, and most would pass a happy-path
 * suite:
 *
 * - adding `GET /admin/customers` "so the operator can find someone";
 * - adding an `email` query parameter, because that is how support starts;
 * - returning `normalizedValue` beside the mask, for copy-paste;
 * - returning `tokenHash`, because it is not the token;
 * - selecting `token_hash` in the repository read and dropping it in the mapper;
 * - calling the repository's `revoke` directly, because it is right there;
 * - taking the acting Admin from the request body;
 * - letting the reason be blank;
 * - adding an Admin *issue* route beside the revoke.
 *
 * `reads code rather than prose` matters most here: every file in this
 * checkpoint documents at length what it deliberately does not do — "no
 * `contactPointId`", "no token and no digest", "no `GET /api/admin/customers`
 * list" — and a gate that failed on its own explanation would be deleted within
 * a checkpoint.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  DETAIL_PATH,
  GRANTS_PATH,
  REPO_ROOT,
  REVOKE_PATH,
  checkApp4B07,
} from './check-app4-b07-contract.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-b07-'));
  temporaries.push(dir);
  for (const relative of [
    'apps/api/src',
    'packages/contracts/openapi',
    'packages/api-client/src/generated',
    'packages/database/migrations',
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
  return checkApp4B07(rootWith({ [relative]: source.replace(from, to) }));
}

/** Failures after one edit to the generated OpenAPI document. */
function failuresAfterContractEdit(mutate) {
  const document = JSON.parse(real(CANONICAL_FILES.openapi));
  mutate(document);
  return checkApp4B07(rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }));
}

describe('APP4-B07 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp4B07(REPO_ROOT), []);
  });

  it('passes against a faithful copy, so the gate is path-independent', () => {
    assert.deepEqual(checkApp4B07(rootWith()), []);
  });

  it('reads code rather than prose', () => {
    const source = `${real(CANONICAL_FILES.errors)}
/**
 * tokenHash, rawToken, digest, ciphertext, normalizedValue, displayValue,
 * verifiedSource, contactPointId, businessProfile, companyName, role,
 * permission, anonymize, mergedIntoCustomerId, findByVerifiedContact,
 * this.grants.revoke(), issuer.issue(), issuer.reissue(), NotificationModule,
 * notification_intents, outbox_events, ALTER TABLE, quotation, paymentAttempt,
 * implements CanActivate, CookiePolicyService, adm_session.
 */
`;
    assert.deepEqual(checkApp4B07(rootWith({ [CANONICAL_FILES.errors]: source })), []);
  });

  it('fails when an owned file is missing', () => {
    const dir = rootWith();
    rmSync(join(dir, CANONICAL_FILES.query));
    assert.ok(mentions(checkApp4B07(dir), 'does not exist'));
  });
});

describe('the published surface', () => {
  it('rejects a fourth Admin support route', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/admin/customers/{customerId}/notifications'] = {
        get: { operationId: 'adminCustomerSupport_notifications' },
      };
    });
    assert.ok(mentions(failures, 'B07 owns three'));
  });

  it('rejects a second verb on the customer detail route', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths[DETAIL_PATH].patch = { operationId: 'adminCustomerSupport_update' };
    });
    assert.ok(mentions(failures, 'exactly one get'));
  });

  it('rejects an extra operation anywhere, by count', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/health/extra'] = { get: { operationId: 'x_extra' } };
    });
    assert.ok(mentions(failures, 'expected 52'));
  });

  it('rejects a renamed operation id', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths[GRANTS_PATH].get.operationId = 'adminCustomer_grants';
    });
    assert.ok(mentions(failures, 'expected adminCustomerSupport_grants'));
  });
});

describe('Admin authorization', () => {
  it('rejects dropping the guard from the customer controller', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.customerController,
      '@UseGuards(AuthenticatedAdminGuard)',
      '',
    );
    assert.ok(mentions(failures, 'does not apply @UseGuards'));
  });

  it('rejects dropping the guard from the revoke controller', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.grantController,
      "@Controller('admin/secure-grants')\n@UseGuards(AuthenticatedAdminGuard)",
      "@Controller('admin/secure-grants')",
    );
    assert.ok(mentions(failures, 'does not apply @UseGuards'));
  });

  it('rejects a second guard declared by this checkpoint', () => {
    const source = `${real(CANONICAL_FILES.errors)}
export class AdminSupportGuard implements CanActivate {
  canActivate() { return true; }
}
`;
    const failures = checkApp4B07(rootWith({ [CANONICAL_FILES.errors]: source }));
    assert.ok(mentions(failures, 'declares a guard'));
  });

  it('rejects a role check', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.revokeUseCase,
      "if (actor.kind !== 'ADMIN') {",
      "if (actor.kind !== 'ADMIN' || actor.role !== 'SUPPORT') {",
    );
    assert.ok(mentions(failures, 'names a role or permission'));
  });

  it('rejects a controller that resolves the session itself', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.customerController,
      'constructor(private readonly support: AdminCustomerSupportQuery) {}',
      'constructor(private readonly sessions: ResolveStaffSessionService) {}',
    );
    assert.ok(mentions(failures, 'authentication stays APP1'));
  });

  it('rejects an unprotected published operation', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths[REVOKE_PATH].post.security = [];
    });
    assert.ok(mentions(failures, 'expected adminSession'));
  });
});

describe('no search, no mutation, no merge', () => {
  it('rejects a customer collection route', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/admin/customers'] = { get: { operationId: 'adminCustomer_list' } };
    });
    assert.ok(mentions(failures, 'search or listing surface'));
  });

  it('rejects a contact lookup query parameter', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths[DETAIL_PATH].get.parameters = [
        { name: 'email', in: 'query', schema: { type: 'string' } },
      ];
    });
    assert.ok(mentions(failures, 'takes no filter'));
  });

  it('rejects a mutation on the customer controller', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.customerController,
      "@Get(':customerId/grants')",
      "@Patch(':customerId')\n  @Post(':customerId/contacts')\n  @Get(':customerId/grants')",
    );
    assert.ok(mentions(failures, 'read-only'));
  });

  it('rejects resolving a customer by their contact value', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      'await this.customers.findById(customerId)',
      "await this.customers.findByVerifiedContact('EMAIL', customerId)",
    );
    assert.ok(mentions(failures, 'resolves none by contact'));
  });

  it('rejects reading merge state', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      'customerId: customer.id,',
      'customerId: customer.id,\n      mergedInto: customer.mergedIntoCustomerId,',
    );
    assert.ok(mentions(failures, 'merge or anonymization state'));
  });
});

describe('the contact projection', () => {
  it('rejects a second masker', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      'maskContact(contact.contactKind, contact.normalizedValue)',
      "contact.normalizedValue.replace(/^(.).*@/, '$1***@')",
    );
    assert.ok(mentions(failures, 'implements masking'));
  });

  it('rejects publishing the normalized value beside the mask', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.AdminCustomerContactResponse.properties.normalizedValue = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'a "normalizedValue" field'));
  });

  it('rejects publishing the display value', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.AdminCustomerContactResponse.properties.displayValue = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'a "displayValue" field'));
  });

  it('rejects dropping the verified flag', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.components.schemas.AdminCustomerContactResponse.properties.verified;
    });
    assert.ok(mentions(failures, 'AdminCustomerContactResponse publishes'));
  });

  it('rejects dropping the primary flag', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.components.schemas.AdminCustomerContactResponse.properties.primary;
    });
    assert.ok(mentions(failures, 'AdminCustomerContactResponse publishes'));
  });

  it('rejects a Business Profile expansion', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.AdminCustomerDetailResponse.properties.companyName = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'a "companyName" field'));
  });

  it('rejects a contact point id', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.AdminCustomerContactResponse.properties.contactPointId = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'a "contactPointId" field'));
  });
});

describe('the grant projection', () => {
  it('rejects a published token hash', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.AdminSecureGrantResponse.properties.tokenHash = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'a "tokenHash" field'));
  });

  it('rejects dropping the status', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.components.schemas.AdminSecureGrantResponse.properties.status;
    });
    assert.ok(mentions(failures, 'AdminSecureGrantResponse publishes'));
  });

  it('rejects dropping the expiry', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.components.schemas.AdminSecureGrantResponse.properties.expiresAt;
    });
    assert.ok(mentions(failures, 'AdminSecureGrantResponse publishes'));
  });

  it('rejects a digest in the summary read model', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repositoryPort,
      'export interface SecureAccessGrantSummary {\n  readonly id: GrantId;',
      'export interface SecureAccessGrantSummary {\n  readonly id: GrantId;\n  readonly tokenHash: string;',
    );
    assert.ok(mentions(failures, 'carries a token hash'));
  });

  it('rejects selecting the digest in the shared summary column list', () => {
    // `APP4-B08` factored the projection into `SUMMARY_COLUMNS`, so this is
    // where a digest would now be added — one line above `listForCustomer`,
    // where a body-only scan would never see it.
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repositoryAdapter,
      '  id: secureAccessGrants.id,\n  customRequestId: secureAccessGrants.customRequestId,',
      '  id: secureAccessGrants.id,\n  tokenHash: secureAccessGrants.tokenHash,\n  customRequestId: secureAccessGrants.customRequestId,',
    );
    assert.ok(mentions(failures, 'selects the token hash'));
  });

  it('rejects a summary column list that drops the state', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repositoryAdapter,
      '  status: secureAccessGrants.status,\n',
      '',
    );
    assert.ok(mentions(failures, 'omits "status"'));
  });

  it('rejects an unscoped grant read', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repositoryAdapter,
      '.where(eq(secureAccessGrants.customerId, customerId))',
      '.where(eq(secureAccessGrants.scopeKind, REQUEST_ACCESS))',
    );
    assert.ok(mentions(failures, 'does not filter by customer id'));
  });

  it('rejects an unordered grant read', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repositoryAdapter,
      '.orderBy(desc(secureAccessGrants.createdAt), desc(secureAccessGrants.id));',
      ';',
    );
    assert.ok(mentions(failures, 'no deterministic order'));
  });

  it('rejects a global grant listing', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/admin/secure-grants'] = {
        get: { operationId: 'adminSecureGrant_list' },
      };
    });
    assert.ok(mentions(failures, 'global grant listing'));
  });
});

describe('revocation', () => {
  it('rejects an optional reason', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.RevokeSecureGrantBody.required = [];
    });
    assert.ok(mentions(failures, 'does not require "reason"'));
  });

  it('rejects a blank reason', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.components.schemas.RevokeSecureGrantBody.properties.reason.minLength;
    });
    assert.ok(mentions(failures, 'permits a blank reason'));
  });

  it('rejects a body that accepts more than the reason', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.RevokeSecureGrantBody.properties.actorId = { type: 'string' };
    });
    assert.ok(mentions(failures, 'expected exactly [reason]'));
  });

  it('rejects calling the repository revoke directly', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.revokeUseCase,
      'await this.issuer.revoke(command.grantId, command.reason, this.currentAdminActor());',
      'await this.grants.revoke(command.grantId, command.reason);',
    );
    assert.ok(mentions(failures, "repository's revoke directly"));
  });

  it('rejects minting a replacement grant', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.revokeUseCase,
      'await this.issuer.revoke(command.grantId, command.reason, this.currentAdminActor());',
      'await this.issuer.reissue({ customerId: existing.customerId, customRequestId: existing.customRequestId });',
    );
    assert.ok(mentions(failures, 'issues or reissues a grant'));
  });

  it('rejects taking the acting Admin from the request', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.revokeUseCase,
      'const actor = this.requestContext.requireActor();',
      "const actor = { kind: 'ADMIN', adminId: command.adminId };",
    );
    assert.ok(mentions(failures, 'does not resolve the actor from the request context'));
  });

  it('rejects B05 losing the actor parameter', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'async revoke(grantId: GrantId, reason: string, actor?: AuditActor): Promise<void> {',
      'async revoke(grantId: GrantId, reason: string): Promise<void> {',
    );
    assert.ok(mentions(failures, 'does not accept an audit actor'));
  });

  it('rejects an Admin issue route', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/admin/secure-grants/issue'] = { post: { operationId: 'x_issue' } };
    });
    assert.ok(mentions(failures, 'mints or rotates a grant'));
  });
});

describe('scope boundaries', () => {
  it('rejects reaching notification data', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      "import { maskContact } from '../domain/contact/mask-contact';",
      "import { maskContact } from '../domain/contact/mask-contact';\nimport { NotificationIntentQuery } from '../../notification/application/notification-intent.query';",
    );
    assert.ok(mentions(failures, 'APP4-B08 owns notification support'));
  });

  it('rejects re-providing the B05 lifecycle owner', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.module,
      'providers: [AdminCustomerSupportQuery, RevokeSecureGrantUseCase],',
      'providers: [SecureGrantIssuer, AdminCustomerSupportQuery, RevokeSecureGrantUseCase],',
    );
    assert.ok(mentions(failures, 're-provides SecureGrantIssuer'));
  });

  it('rejects a schema declaration', () => {
    const source = `${real(CANONICAL_FILES.errors)}\nexport const t = pgTable('x', {});\n`;
    const failures = checkApp4B07(rootWith({ [CANONICAL_FILES.errors]: source }));
    assert.ok(mentions(failures, 'declares schema'));
  });

  it('rejects APP5–APP7 business content', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.grantResponse,
      'customRequestId!: string;',
      'customRequestId!: string;\n\n  quotationTotal!: number;',
    );
    assert.ok(mentions(failures, 'APP5–APP7 content is not B07'));
  });

  it('rejects a migration appearing', () => {
    const dir = rootWith();
    writeFileSync(join(dir, 'packages/database/migrations/9999_b07.sql'), 'select 1;', 'utf8');
    assert.ok(mentions(checkApp4B07(dir), 'APP4-B07 adds none'));
  });
});

describe('transport and generated client', () => {
  it('rejects a cacheable customer read', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.customerController,
      "  @Get(':customerId')\n  @Header('Cache-Control', ADMIN_SUPPORT_CACHE_CONTROL)",
      "  @Get(':customerId')",
    );
    assert.ok(mentions(failures, 'of 2 reads set'));
  });

  it('rejects a shared-cacheable support policy', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.policy,
      "export const ADMIN_SUPPORT_CACHE_CONTROL = 'no-store' as const;",
      "export const ADMIN_SUPPORT_CACHE_CONTROL = 'no-store, public, max-age=0' as const;",
    );
    assert.ok(mentions(failures, 'permits shared or timed caching'));
  });

  it('rejects a revoke that returns a body instead of 204', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.paths[REVOKE_PATH].post.responses['204'];
    });
    assert.ok(mentions(failures, 'does not publish a 204'));
  });

  it('rejects a generated client carrying a credential field', () => {
    const source = `${real(CANONICAL_FILES.clientSchemas)}\nexport interface Leak { tokenHash: string }\n`;
    const failures = checkApp4B07(rootWith({ [CANONICAL_FILES.clientSchemas]: source }));
    assert.ok(mentions(failures, 'the generated client names "tokenHash"'));
  });
});
