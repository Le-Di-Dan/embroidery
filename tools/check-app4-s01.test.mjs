#!/usr/bin/env node
/**
 * Regressions for the `APP4-S01` gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked source.
 *
 * The mutations are the plausible mistakes rather than vandalism: passing the
 * code as a mutation variable, keeping it in `sessionStorage` "so a reload does
 * not lose it", re-masking in the browser because the server's mask wrapped
 * badly, calling issue from the resend handler, and hard-coding the cooldown
 * because the number is right there in the ADR. Every one compiles and most
 * would pass the component suite.
 *
 * One case keeps the gate honest rather than merely strict: `reads code rather
 * than prose` — every file in this feature documents what it deliberately does
 * not do ("never `localStorage`", "no `maskContact`"), and a gate that failed on
 * its own explanation would be deleted within a checkpoint.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES, REPO_ROOT, checkApp4S01 } from './check-app4-s01.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-s01-'));
  temporaries.push(dir);
  for (const relative of [
    'apps/storefront/src',
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
  return run(rootWith({ [relative]: source.replace(from, to) }));
}

function run(dir) {
  const failures = [];
  checkApp4S01(dir, (message) => failures.push(message));
  return failures;
}

describe('APP4-S01 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(run(REPO_ROOT), []);
  });

  it('passes against a faithful copy, so the gate is path-independent', () => {
    assert.deepEqual(run(rootWith()), []);
  });

  it('reads code rather than prose', () => {
    const source = `${real(CANONICAL_FILES.client)}
/**
 * localStorage, sessionStorage, document.cookie, maskContact, maskEmail,
 * normalizePhone, console.error, history.replaceState, zustand, 60000, 600000,
 * fetch(), axios.post, account, profile, đã đăng ký.
 */
`;
    assert.deepEqual(run(rootWith({ [CANONICAL_FILES.client]: source })), []);
  });
});

describe('APP4-S01 — the route', () => {
  it('rejects a missing approved route', () => {
    const dir = rootWith();
    rmSync(join(dir, CANONICAL_FILES.page));
    assert.ok(mentions(run(dir), 'the approved route does not exist'));
  });

  it('rejects a second verification route', () => {
    const dir = rootWith({
      'apps/storefront/src/app/verify-contact/page.tsx': 'export default function P() {}',
    });
    assert.ok(mentions(run(dir), 'a second verification route exists'));
  });
});

describe('APP4-S01 — the design approval', () => {
  it('rejects a consumed row that is not approved', () => {
    const registry = real(CANONICAL_FILES.registry).replace(
      /(\| FIG-VERIFY-CODE-DESKTOP-SENT \|[^\n]*?)APPROVED_FOR_IMPLEMENTATION/,
      '$1REVIEW_REQUIRED',
    );
    assert.ok(
      mentions(
        run(rootWith({ [CANONICAL_FILES.registry]: registry })),
        'not APPROVED_FOR_IMPLEMENTATION',
      ),
    );
  });

  it('rejects a consumed row with no approval evidence', () => {
    const registry = real(CANONICAL_FILES.registry).replace(
      /(\| FIG-VERIFY-CODE-MOBILE-SUCCESS \|[^\n]*?)FIG-APPROVAL-APP4-D01-PO-001/,
      '$1—',
    );
    assert.ok(
      mentions(
        run(rootWith({ [CANONICAL_FILES.registry]: registry })),
        'carries no approval evidence',
      ),
    );
  });
});

describe('APP4-S01 — the transport', () => {
  it('rejects a hand-written API path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.client,
      'const body = await publicVerificationResend(challengeId, { instance: getBrowserApiClient() });',
      'const body = await getBrowserApiClient().post(`/api/public/verification/challenges/${challengeId}/resend`);',
    );
    assert.ok(mentions(failures, 'hard-codes an API URL'));
  });

  it('rejects a raw fetch', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.client,
      'return body.data;\n}\n\n/**\n * Asks for a replacement code',
      'return fetch(`/x`).then((r) => r.json());\n}\n\n/**\n * Asks for a replacement code',
    );
    assert.ok(mentions(failures, 'hard-codes an API URL'));
  });

  it('rejects an operation missing from the curated boundary', () => {
    const boundary = real(CANONICAL_FILES.apiClientIndex).replace(
      '  publicVerificationReadStatus,\n} from',
      '} from',
    );
    assert.ok(
      mentions(
        run(rootWith({ [CANONICAL_FILES.apiClientIndex]: boundary })),
        'does not export publicVerificationReadStatus',
      ),
    );
  });
});

describe('APP4-S01 — the code never escapes', () => {
  it('rejects passing the code as a mutation variable', () => {
    // The ordinary way to write this, and the one that parks the secret in the
    // mutation cache until the next call replaces it.
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      'attempt.mutate();',
      'attempt.mutate(code);',
    );
    assert.ok(mentions(failures, 'passes variables to a mutation'));
  });

  it('rejects keeping the code in session storage', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      'codeRef.current = code;',
      "codeRef.current = code;\n      sessionStorage.setItem('code', code);",
    );
    assert.ok(mentions(failures, 'persists to browser storage'));
  });

  it('rejects logging on the refusal path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      'const normalized = normalizeApiClientError(error);',
      'const normalized = normalizeApiClientError(error);\n      console.error(error);',
    );
    assert.ok(mentions(failures, 'logs or reports'));
  });

  it('rejects putting the challenge in the URL', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      "dispatch({ type: 'CHALLENGE_OPENED', challenge: toChallenge(response) });",
      "history.replaceState({}, '', '?c=1');\n      dispatch({ type: 'CHALLENGE_OPENED', challenge: toChallenge(response) });",
    );
    assert.ok(mentions(failures, 'writes to the URL or history'));
  });

  it('rejects a store replacing the local reducer', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.state,
      "import type { ContactKind } from './contact-draft';",
      "import { createStore } from 'zustand';\nimport type { ContactKind } from './contact-draft';",
    );
    assert.ok(mentions(failures, 'uses a store'));
  });

  it('rejects dropping the mutation reset', () => {
    const failures = failuresAfterEdit(CANONICAL_FILES.controller, 'attempt.reset();', 'void 0;');
    assert.ok(mentions(failures, 'does not reset the attempt mutation'));
  });
});

describe('APP4-S01 — policy values stay on the server', () => {
  it('rejects a hard-coded cooldown', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.state,
      'return Math.max(0, Date.parse(challenge.resendAvailableAt) - nowMs);',
      'return Math.max(0, 60_000 - nowMs);',
    );
    assert.ok(mentions(failures, 'restates a policy duration'));
  });
});

describe('APP4-S01 — resend semantics', () => {
  it('rejects a resend that calls the issue operation', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.client,
      'const body = await publicVerificationResend(challengeId, { instance: getBrowserApiClient() });',
      'const body = await publicVerificationIssue({}, { instance: getBrowserApiClient() });',
    );
    assert.ok(mentions(failures, 'resend does not call the resend operation'));
  });

  it('rejects a resend that keeps the old challenge identity', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.state,
      "        status: 'CODE_ENTRY',\n        challenge: action.challenge,\n        recipientMasked: action.challenge.recipientMasked,\n        notice: 'RESENT',",
      "        status: 'CODE_ENTRY',\n        recipientMasked: action.challenge.recipientMasked,\n        notice: 'RESENT',",
    );
    assert.ok(mentions(failures, 'does not replace the challenge identity'));
  });
});

describe('APP4-S01 — no second primitive', () => {
  it('rejects masking in the browser', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.codeEntry,
      '<p className="contact-verification__destination">{challenge.recipientMasked}</p>',
      '<p className="contact-verification__destination">{maskEmail(challenge.recipientMasked)}</p>',
    );
    assert.ok(mentions(failures, 'masks a contact'));
  });

  it('rejects normalizing in the browser', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.contact,
      'export function isPlausibleContact(kind: ContactKind, value: string): boolean {',
      'export function toE164(value: string): string {\n  return value;\n}\n\nexport function isPlausibleContact(kind: ContactKind, value: string): boolean {',
    );
    assert.ok(mentions(failures, 'normalizes a contact'));
  });

  it('rejects importing from apps/api', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.contact,
      "import { IssueVerificationChallengeBodyContactKind } from '@embroidery/api-client';",
      "import { maskContact } from '../../../../../apps/api/src/modules/customer/domain/contact/mask-contact';",
    );
    assert.ok(mentions(failures, 'masks a contact') || mentions(failures, 'imports from apps/api'));
  });

  it('rejects dropping the server mask from the code-entry card', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.codeEntry,
      '{challenge.recipientMasked}',
      '{/* destination */}',
    );
    assert.ok(mentions(failures, "does not render the server's masked destination"));
  });
});

describe('APP4-S01 — the code shape', () => {
  it('rejects parsing the code as a number', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.codeInput,
      'onChange(digits);',
      'onChange(String(parseInt(digits, 10)));',
    );
    assert.ok(mentions(failures, 'parses the code as a number'));
  });

  it('rejects a code length other than six', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.codeInput,
      'export const VERIFICATION_CODE_LENGTH = 6;',
      'export const VERIFICATION_CODE_LENGTH = 4;',
    );
    assert.ok(mentions(failures, 'the code length is not six'));
  });

  it('rejects dropping the one-time-code autocomplete', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.codeInput,
      'autoComplete="one-time-code"',
      'autoComplete="off"',
    );
    assert.ok(mentions(failures, 'no one-time-code autocomplete'));
  });
});

describe('APP4-S01 — scope', () => {
  it('rejects an account or profile surface', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.screen,
      '{renderCard()}',
      '{renderCard()}\n      <a href="/profile">Hồ sơ</a>',
    );
    assert.ok(mentions(failures, 'reaches for an account, profile or APP5+ business concept'));
  });

  it('rejects enumerating copy', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.copy,
      "    mismatch: 'Mã không đúng. Hãy kiểm tra lại mã trong tin nhắn mới nhất.',",
      "    mismatch: 'Email này đã đăng ký. Mã không đúng.',",
    );
    assert.ok(mentions(failures, 'carries enumerating copy'));
  });
});

describe('APP4-S01 — the backend is untouched', () => {
  it('rejects a fifth verification path appearing under S01', () => {
    const document = JSON.parse(real(CANONICAL_FILES.openapi));
    document.paths['/api/public/verification/challenges/{challengeId}/confirm'] = { post: {} };
    assert.ok(
      mentions(
        run(rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) })),
        'S01 adds none',
      ),
    );
  });

  it('rejects a contract with no masked destination to render', () => {
    const document = JSON.parse(real(CANONICAL_FILES.openapi));
    delete document.components.schemas.VerificationChallengeResponse.properties.recipientMasked;
    assert.ok(
      mentions(
        run(rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) })),
        'publishes no recipientMasked',
      ),
    );
  });
});
