/**
 * Regressions for the `APP4-A01` Admin support gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. The mutations are the plausible mistakes rather
 * than vandalism — every one of them compiles, most would pass the component
 * suites, and several are the *kinder* version of the code:
 *
 * - keeping the typed contact "so the operator can retry";
 * - putting the customer id in the URL "so the screen can be linked to";
 * - deciding a duplicate replay from a remembered id, which is what anyone
 *   writes before learning the concurrent case exists;
 * - matching a notification to a customer by its masked recipient, which looks
 *   exactly like a join;
 * - offering a "phát hành lại" button on REISSUE_REQUIRED, the single most
 *   helpful thing the screen could do and the one it has no authority for;
 * - flipping the grant to revoked on click.
 *
 * Two of them also guard the gate against itself: the credential-name and
 * business-resend rules must fire on a *call* or a *field read*, never on the
 * copy that promises those things are not shown, or the gate would fail on its
 * own reassurance and be deleted within a checkpoint.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES, REPO_ROOT, checkApp4A01 } from './check-app4-a01.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-a01-'));
  temporaries.push(dir);
  for (const relative of [
    'apps/admin/src',
    'apps/admin/test/components',
    'packages/api-client/src',
    'packages/contracts/openapi',
    'docs/design',
  ]) {
    const source = join(REPO_ROOT, relative);
    const target = join(dir, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, {
      recursive: true,
      filter: (from) => !from.includes('node_modules') && !from.includes(`${sep}dist`),
    });
  }
  // The two backend files the gate reads for `APP4-A01-C1`, copied individually
  // rather than by pulling in all of `apps/api/src`. Without them every
  // throwaway root would be missing the producer, the binding rules would fire
  // unconditionally, and their own mutation tests would pass for the wrong
  // reason — proving nothing while looking green.
  for (const relative of [CANONICAL_FILES.grantNotifier, CANONICAL_FILES.notificationRequest]) {
    const target = join(dir, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO_ROOT, relative), target);
  }
  for (const [relative, content] of Object.entries(edits)) {
    const target = join(dir, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return dir;
}

function failuresAfterEdit(relative, from, to) {
  const original = readFileSync(join(REPO_ROOT, relative), 'utf8');
  assert.ok(original.includes(from), `anchor not found in ${relative}: ${from}`);
  return checkApp4A01(rootWith({ [relative]: original.replace(from, to) }));
}

function mentions(failures, fragment) {
  return failures.some((failure) => failure.includes(fragment));
}

describe('the pristine tree', () => {
  it('passes', () => {
    assert.deepEqual(checkApp4A01(REPO_ROOT), []);
  });
});

describe('route and shell', () => {
  it('rejects a second Admin customer-support route', () => {
    const failures = checkApp4A01(
      rootWith({
        'apps/admin/src/app/(protected)/support/customer-lookup/page.tsx':
          'export default function Page() { return null; }\n',
      }),
    );
    assert.ok(mentions(failures, 'A01 owns exactly /support/customer-access'));
  });

  it('rejects a customer id in the route constant', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.route,
      "export const ADMIN_CUSTOMER_ACCESS_ROUTE = '/support/customer-access';",
      "export const ADMIN_CUSTOMER_ACCESS_ROUTE = '/support/customer-access';\nexport const withCustomer = (customerId) => `/support/customer-access?customerId=${customerId}`;",
    );
    assert.ok(mentions(failures, 'must be a bare path'));
  });

  it('rejects dropping the screen from the Admin navigation', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.nav,
      '    href: ADMIN_CUSTOMER_ACCESS_ROUTE,',
      "    href: '/support/customer-access',",
    );
    assert.ok(mentions(failures, 'spells the route literally'));
  });
});

describe('design approval', () => {
  it('rejects a row that lost the amendment approval', () => {
    const registry = readFileSync(join(REPO_ROOT, CANONICAL_FILES.registry), 'utf8');
    const failures = checkApp4A01(
      rootWith({
        [CANONICAL_FILES.registry]: registry.replace(
          '| FIG-ADMIN-DELIVERY-DESKTOP-REPLAYDUPLICATE ',
          '| FIG-ADMIN-DELIVERY-DESKTOP-REPLAYDUPLICATE-X ',
        ),
      }),
    );
    assert.ok(mentions(failures, 'FIG-ADMIN-DELIVERY-DESKTOP-REPLAYDUPLICATE: no registry row'));
  });
});

describe('the exact lookup', () => {
  it('rejects persisting the contact draft', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.lookupPanel,
      '    setContact(event.target.value);',
      "    setContact(event.target.value);\n            localStorage.setItem('a01-last-contact', event.target.value);",
    );
    assert.ok(mentions(failures, 'persists support state to web storage'));
  });

  it('rejects letting the browser remember the contact field', () => {
    // Anchored on the JSX, not the doc comment above it: comments are stripped
    // before the gate reads the file, so a mutation that only edited prose would
    // pass and prove nothing.
    const failures = failuresAfterEdit(
      CANONICAL_FILES.lookupPanel,
      '          autoComplete="off"\n',
      '          autoComplete="email"\n',
    );
    assert.ok(mentions(failures, 'sets autoComplete="email"'));
  });

  it('rejects a suggestion list beside the field', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.lookupPanel,
      'spellCheck={false}',
      'spellCheck={false}\n          list="customer-typeahead"',
    );
    assert.ok(mentions(failures, 'builds a customer search surface'));
  });

  it('rejects keying the cache on a contact', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.keys,
      "  customer: (customerId: string) => [...ROOT, 'customer', customerId] as const,",
      "  customer: (customerId: string) => [...ROOT, 'customer', customerId] as const,\n  byContact: (contact: string) => [...ROOT, 'contact', contact] as const,",
    );
    assert.ok(mentions(failures, 'derived from a contact value'));
  });

  it('rejects turning the lookup into a cached query', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.lookupHook,
      '  const mutation = useMutation({',
      '  const cached = useQuery({ queryKey: [1], queryFn: () => null });\n  const mutation = useMutation({',
    );
    assert.ok(mentions(failures, 'caches the lookup'));
  });
});

describe('contacts and credentials', () => {
  it('rejects a client-side masker', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.customerPanel,
      'export function CustomerContactPanel(',
      'function maskEmail(value: string) {\n  return value;\n}\n\nexport function CustomerContactPanel(',
    );
    assert.ok(mentions(failures, 'masks a contact client-side'));
  });

  it('rejects rendering a credential field', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.grantPanel,
      '              <dd data-testid="grant-scope">{grant.scopeKind}</dd>',
      '              <dd data-testid="grant-scope">{grant.tokenHash}</dd>',
    );
    assert.ok(mentions(failures, 'names a credential field'));
  });

  it('accepts copy that names credentials only to promise they are hidden', () => {
    // The gate must not fire on its own reassurance.
    const copy = readFileSync(join(REPO_ROOT, CANONICAL_FILES.copy), 'utf8');
    assert.ok(copy.includes('digest'));
    assert.deepEqual(checkApp4A01(REPO_ROOT), []);
  });
});

describe('the grant region', () => {
  it('rejects rewriting the persisted status', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.liveness,
      "  if (grant.status === 'REVOKED') return 'revoked';",
      "  if (Date.parse(grant.expiresAt) < now.getTime()) grant.status = 'EXPIRED';\n  if (grant.status === 'REVOKED') return 'revoked';",
    );
    assert.ok(mentions(failures, 'rewrites the persisted status'));
  });
});

describe('the revoke flow', () => {
  it('rejects an optimistic revoke', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.revokeHook,
      '          onSuccess: () => {',
      '          onMutate: () => {\n            setSucceeded(true);\n          },\n          onSuccess: () => {',
    );
    assert.ok(mentions(failures, 'writes grant state optimistically'));
  });

  it('rejects flushing the whole Admin cache after a revoke', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.revokeHook,
      'void queryClient.invalidateQueries({ queryKey: customerAccessKeys.grants(customerId) });',
      'void queryClient.invalidateQueries();',
    );
    assert.ok(mentions(failures, 'flushes the whole Admin cache'));
  });

  it('rejects invalidating a query the revoke did not affect', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.revokeHook,
      'void queryClient.invalidateQueries({ queryKey: customerAccessKeys.grants(customerId) });',
      'void queryClient.invalidateQueries({ queryKey: customerAccessKeys.grants(customerId) });\n    void queryClient.invalidateQueries({ queryKey: customerAccessKeys.notifications(customerId) });',
    );
    assert.ok(mentions(failures, 'invalidates a query the revoke did not affect'));
  });

  it('rejects dropping the reason validation', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.revokeDialog,
      '    const validated = validateRevokeReason(reason);',
      '    const validated = { ok: true as const, value: reason };',
    );
    assert.ok(mentions(failures, 'does not validate the reason before sending'));
  });
});

describe('the notification region', () => {
  it('rejects binding a notification by its masked recipient', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.notificationPanel,
      '  const intent = notifications?.intents[0] ?? null;',
      '  const intent =\n    notifications?.intents.find((candidate) => candidate.recipientMasked === mask) ?? null;',
    );
    assert.ok(mentions(failures, 'compares a masked recipient'));
  });

  it('rejects downloading every notification and filtering client-side', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      '      { status: AdminNotificationIntentListStatus.FAILED, customerId },',
      '      {},',
    );
    assert.ok(mentions(failures, 'does not ask the server for FAILED notifications'));
  });

  it('rejects polling the worker', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.queriesHook,
      '    queryFn: ({ signal }) => fetchCustomerNotifications(id, signal),',
      '    queryFn: ({ signal }) => fetchCustomerNotifications(id, signal),\n    refetchInterval: 3000,',
    );
    assert.ok(mentions(failures, 'polls'));
  });
});

describe('the replay outcome', () => {
  it('rejects inferring a duplicate from a remembered replay id', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayHook,
      "            result.outcome === NotificationReplayResponseOutcome.CREATED ? 'created' : 'existing',",
      "            result.replayIntentId === lastReplay ? 'existing' : 'created',",
    );
    assert.ok(mentions(failures, 'infers a duplicate from a remembered replay id'));
  });

  it('rejects inferring the outcome from a clock', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayHook,
      '      mutation.mutate(intentId, {',
      '      const started = Date.now();\n      mutation.mutate(intentId, {',
    );
    assert.ok(mentions(failures, 'reads a clock to decide the replay outcome'));
  });

  it('rejects collapsing the three replay conflicts', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.failure,
      "  REPLAY_SOURCE_UNAVAILABLE: 'source-unavailable',",
      '',
    );
    assert.ok(mentions(failures, 'does not map REPLAY_SOURCE_UNAVAILABLE'));
  });

  it('rejects branching on the backend message', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.failure,
      '  const byCode = REPLAY_CODES[normalized.code];',
      "  const byCode = normalized.message.includes('reissue') ? 'reissue-required' : REPLAY_CODES[normalized.code];",
    );
    assert.ok(mentions(failures, 'branches on a backend message string'));
  });

  it('rejects invalidating a query the replay did not affect', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayHook,
      '              queryKey: customerAccessKeys.notifications(customerId),',
      '              queryKey: customerAccessKeys.grants(customerId),',
    );
    assert.ok(mentions(failures, 'does not invalidate the Customer notification query'));
  });

  it('rejects minting a new credential from the support screen', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.notificationPanel,
      '  const intent = notifications?.intents[0] ?? null;',
      '  const reissue = () => issueVerificationChallenge({ contactKind: "EMAIL" });\n  const intent = notifications?.intents[0] ?? null;',
    );
    assert.ok(mentions(failures, 'calls a business issue or resend'));
  });
});

describe('transport and scope', () => {
  it('rejects a hand-written API URL', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      '  return guarded(() => adminCustomerSupportDetail(customerId, requestOptions(signal)));',
      '  return fetch(`/api/admin/customers/${customerId}`).then((response) => response.json());',
    );
    assert.ok(mentions(failures, 'hand-writes an API URL'));
  });

  it('rejects a deep import of the generated tree', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      "} from '@embroidery/api-client';",
      "} from '@embroidery/api-client/src/generated/embroidery-api';",
    );
    assert.ok(mentions(failures, 'deep-imports the generated tree'));
  });

  it('rejects naming /retry anywhere', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.service,
      'export function replayNotification(',
      "const legacy = '/retry';\n\nexport function replayNotification(",
    );
    assert.ok(mentions(failures, 'names /retry'));
  });

  it('rejects an operation appearing beside the A01 world', () => {
    const openapi = readFileSync(join(REPO_ROOT, CANONICAL_FILES.openapi), 'utf8');
    const document = JSON.parse(openapi);
    document.paths['/api/admin/customers'] = { get: { operationId: 'adminCustomer_list' } };
    const failures = checkApp4A01(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }),
    );
    assert.ok(mentions(failures, 'A01 expects 53'));
  });
});

/**
 * `APP4-A01-C1` — the gate now checks that something can satisfy the filter.
 *
 * The first case is the exact defect the original A01 shipped with: every
 * consumer-side rule passed, and the notification region was empty in
 * production because no producer wrote the binding. Reverting the producer must
 * now fail this gate, or the same gap ships again.
 */
describe('the production binding behind the Customer-bound region', () => {
  it('catches the producer no longer binding the notification', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.grantNotifier,
      '      recipientContactPointId: target.id,',
      '',
    );
    assert.ok(mentions(failures, "A01's Customer-filtered region would be empty in production"));
  });

  it('catches the intake contract losing the optional reference', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.notificationRequest,
      'readonly recipientContactPointId?: string | undefined;',
      '',
    );
    assert.ok(mentions(failures, 'no producer can bind one'));
  });
});
