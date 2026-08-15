#!/usr/bin/env node
/**
 * Regressions for the `APP4-S02` gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked source.
 *
 * The mutations are the plausible mistakes rather than vandalism: moving the
 * strip after the request, adding a `?t=` fallback "for links that lose the
 * fragment", keeping the token in `sessionStorage` so a reload still works,
 * passing it as a mutation variable, clearing it on a transient failure while
 * "tidying up the error path", and softening the unavailable copy into
 * something more helpful. Every one compiles, and most would pass the component
 * suite — the strip-order mutation in particular passes every test that does
 * not sample `location.hash` at call time.
 *
 * One case keeps the gate honest rather than merely strict: `reads code rather
 * than prose` — every file in this feature documents at length what it
 * deliberately does not do ("never `sessionStorage`", "no query fallback", "no
 * `báo giá`"), and a gate that failed on its own explanation would be deleted
 * within a checkpoint.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES, REPO_ROOT, checkApp4S02 } from './check-app4-s02.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-s02-'));
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

function run(dir) {
  const failures = [];
  checkApp4S02(dir, (message) => failures.push(message));
  return failures;
}

function failuresAfterEdit(relative, from, to) {
  const source = real(relative);
  assert.ok(source.includes(from), `${relative} is missing the anchor: ${from.slice(0, 70)}`);
  return run(rootWith({ [relative]: source.replace(from, to) }));
}

describe('APP4-S02 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(run(REPO_ROOT), []);
  });

  it('passes against a faithful copy, so the gate is path-independent', () => {
    assert.deepEqual(run(rootWith()), []);
  });

  it('reads code rather than prose', () => {
    const source = `${real(CANONICAL_FILES.client)}
/**
 * localStorage, sessionStorage, document.cookie, indexedDB, zustand,
 * console.error, sendBeacon, gtag, dataLayer, URLSearchParams, useParams,
 * decodeURIComponent, router.push, axios.post, fetch(), /api/public,
 * secure-links/resolve, báo giá, thanh toán, customRequestId, expiresAt.
 */
`;
    assert.deepEqual(run(rootWith({ [CANONICAL_FILES.client]: source })), []);
  });
});

describe('APP4-S02 — route and registry', () => {
  it('refuses a missing route', () => {
    const dir = rootWith();
    rmSync(join(dir, CANONICAL_FILES.page), { force: true });
    assert.ok(mentions(run(dir), 'the approved route does not exist'));
  });

  it('refuses a second secure-link landing route', () => {
    const dir = rootWith({
      'apps/storefront/src/app/secure-access/page.tsx': 'export default function P() {}\n',
    });
    assert.ok(mentions(run(dir), 'a second secure-link landing route exists'));
  });

  it('refuses an unapproved registry row', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.registry,
      '| FIG-SECURELINK-DESKTOP-UNAVAILABLE | Storefront | /truy-cap | Secure-Link Landing | Unavailable — Single Indistinguishable State | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION',
      '| FIG-SECURELINK-DESKTOP-UNAVAILABLE | Storefront | /truy-cap | Secure-Link Landing | Unavailable — Single Indistinguishable State | Desktop 1440 | high-fidelity | REVIEW_REQUIRED',
    );
    assert.ok(mentions(failures, 'is not APPROVED_FOR_IMPLEMENTATION'));
  });
});

describe('APP4-S02 — the generated-client boundary', () => {
  it('refuses a hand-written endpoint', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.client,
      'const body = await publicSecureLinkResolve(requestBody, { instance: getBrowserApiClient() });',
      "const body = (await getBrowserApiClient().post('/api/public/secure-links/resolve', requestBody)).data;",
    );
    assert.ok(mentions(failures, 'hard-codes an API URL'));
  });

  it('refuses a deep import of the generated tree', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.client,
      "} from '@embroidery/api-client';",
      "} from '@embroidery/api-client/src/generated/embroidery-api';",
    );
    assert.ok(mentions(failures, 'deep-imports the generated client tree'));
  });

  it('refuses an operation that never crossed the curated boundary', () => {
    const source = real(CANONICAL_FILES.apiClientIndex).replace(
      "export { publicSecureLinkResolve } from './generated/embroidery-api';",
      '',
    );
    assert.ok(
      mentions(run(rootWith({ [CANONICAL_FILES.apiClientIndex]: source })), 'does not export'),
    );
  });
});

describe('APP4-S02 — the fragment carrier', () => {
  it('refuses an alternate fragment key', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.fragment,
      "export const SECURE_LINK_FRAGMENT_KEY = 't';",
      "export const SECURE_LINK_FRAGMENT_KEY = 'token';",
    );
    assert.ok(mentions(failures, "the fragment key is not exactly 't'"));
  });

  it('refuses a token shape that is not the published one', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.fragment,
      "export const SECURE_LINK_TOKEN_PATTERN_SOURCE = '^[A-Za-z0-9_-]{43}$';",
      "export const SECURE_LINK_TOKEN_PATTERN_SOURCE = '^[A-Za-z0-9_-]{20,64}$';",
    );
    assert.ok(mentions(failures, 'is not the published'));
  });

  it('refuses a query-string fallback', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.fragment,
      'export function readSecureLinkToken(hash: string): string | undefined {',
      `export function readSecureLinkToken(hash: string, search = ''): string | undefined {
  const fallback = new URLSearchParams(search).get(SECURE_LINK_FRAGMENT_KEY);
  if (fallback !== null) return fallback;`,
    );
    assert.ok(mentions(failures, 'reads a token from the query string'));
  });

  it('refuses normalization of the credential bytes', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.fragment,
      'const candidate = hash.slice(SECURE_LINK_FRAGMENT_PREFIX.length);',
      'const candidate = decodeURIComponent(hash.slice(SECURE_LINK_FRAGMENT_PREFIX.length));',
    );
    assert.ok(mentions(failures, 'normalizes the credential bytes'));
  });

  it('refuses a component that can reach the carrier', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.authorized,
      '  const copy = SECURE_LINK_COPY.authorized;',
      '  const copy = SECURE_LINK_COPY.authorized;\n  const debug = window.location.hash;',
    );
    assert.ok(mentions(failures, 'a component reaches the token carrier'));
  });
});

describe('APP4-S02 — strip before request', () => {
  it('refuses a request issued before the strip', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      `    stripSecureLinkFragment(window.history, window.location);

    // 3 — and only now, a request. A missing or malformed fragment makes none
    //     at all: there is nothing to ask, and asking would make fragment
    //     syntax answerable (§14).
    if (token === undefined) {
      dispatch({ type: 'UNAVAILABLE' });
      return;
    }
    tokenRef.current = token;
    resolve.mutate();`,
      `    if (token === undefined) {
      dispatch({ type: 'UNAVAILABLE' });
      return;
    }
    tokenRef.current = token;
    resolve.mutate();
    stripSecureLinkFragment(window.history, window.location);`,
    );
    assert.ok(mentions(failures, 'the resolve request precedes the fragment strip'));
  });

  it('refuses a strip that only runs for a valid token', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      `    stripSecureLinkFragment(window.history, window.location);`,
      `    if (token === undefined) {
      dispatch({ type: 'UNAVAILABLE' });
      return;
    }
    stripSecureLinkFragment(window.history, window.location);`,
    );
    assert.ok(mentions(failures, 'the strip is conditional on a valid token'));
  });

  it('refuses a replacement URL that carries the fragment back', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.fragment,
      '`${location.pathname}${location.search}`',
      '`${location.pathname}${location.search}${location.hash}`',
    );
    assert.ok(mentions(failures, 'the clean URL is not pathname + search alone'));
  });

  it('refuses a pushed history entry', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.fragment,
      'historyApi.replaceState(historyApi.state',
      'historyApi.pushState(historyApi.state',
    );
    assert.ok(mentions(failures, 'pushes a history entry'));
  });

  it('refuses a missing fragment that still calls the API', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      `    if (token === undefined) {
      dispatch({ type: 'UNAVAILABLE' });
      return;
    }
    tokenRef.current = token;`,
      `    if (token === undefined) {
      tokenRef.current = '';
      resolve.mutate();
      return;
    }
    tokenRef.current = token;`,
    );
    assert.ok(mentions(failures, 'still calls the API'));
  });
});

describe('APP4-S02 — token lifetime and secrecy', () => {
  it('refuses browser storage', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      '    tokenRef.current = token;',
      "    tokenRef.current = token;\n    window.sessionStorage.setItem('t', token);",
    );
    assert.ok(mentions(failures, 'persists to browser storage'));
  });

  it('refuses the token as a mutation variable', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      '    resolve.mutate();',
      '    resolve.mutate(token);',
    );
    assert.ok(mentions(failures, 'passes variables to a mutation'));
  });

  it('refuses automatic retry', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      `    retry: false,
  });`,
      `    retry: 3,
  });`,
    );
    assert.ok(mentions(failures, 'does not disable automatic retry'));
  });

  it('refuses a route-local client that caches mutations', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.provider,
      'mutations: { retry: false, gcTime: 0 },',
      'mutations: { retry: false },',
    );
    assert.ok(mentions(failures, 'does not disable retry and caching'));
  });

  it('refuses a success that leaves the token behind', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      `    onSuccess: (grant) => {
      // A verdict exists and it is favourable; the credential has no further use.
      clearToken();`,
      `    onSuccess: (grant) => {`,
    );
    assert.ok(mentions(failures, 'a resolved grant does not clear the token'));
  });

  it('refuses a transient branch that clears the token', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      `      if (outcome === 'TRANSIENT') {
        // No verdict was reached, so the token is kept for a manual retry.
        dispatch({ type: 'TRANSIENT_FAILURE' });
        return;
      }
      clearToken();`,
      `      clearToken();
      if (outcome === 'TRANSIENT') {
        dispatch({ type: 'TRANSIENT_FAILURE' });
        return;
      }`,
    );
    assert.ok(mentions(failures, 'the transient branch does not precede the clear'));
  });

  it('refuses a reducer that carries the token', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.state,
      '  /** Present only in `AUTHORIZED`. */\n  readonly grant?: SecureLinkGrant;',
      '  readonly grant?: SecureLinkGrant;\n  readonly token?: string;',
    );
    assert.ok(mentions(failures, 'the reducer state names a token'));
  });

  it('refuses a console write on the refusal path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      "      clearToken();\n      dispatch({ type: 'UNAVAILABLE' });",
      "      console.error(error);\n      clearToken();\n      dispatch({ type: 'UNAVAILABLE' });",
    );
    assert.ok(mentions(failures, 'logs, reports or beacons'));
  });

  it('refuses a retry that does not guard on a held token', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      "    if (tokenRef.current === '') return;",
      '',
    );
    assert.ok(mentions(failures, 'retry does not guard on a held token'));
  });
});

describe('APP4-S02 — non-enumeration and scope', () => {
  it('refuses cause-specific copy', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.copy,
      "    alertTitle: 'Không mở được liên kết này',",
      "    alertTitle: 'Liên kết đã hết hạn',",
    );
    assert.ok(mentions(failures, 'carries cause-specific copy'));
  });

  it('refuses an unavailable card that accepts a cause', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.unavailable,
      '  headingRef,\n}: {\n  headingRef: RefObject<HTMLHeadingElement | null>;\n}) {',
      '  headingRef,\n  cause,\n}: {\n  headingRef: RefObject<HTMLHeadingElement | null>;\n  cause: string;\n}) {',
    );
    assert.ok(mentions(failures, 'the unavailable card accepts a cause'));
  });

  it('refuses an authorized shell that renders a grant field', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.authorized,
      '      <p className="secure-link-access__caption">',
      '      <p>{grant.customRequestId}</p>\n      <p className="secure-link-access__caption">',
    );
    assert.ok(mentions(failures, 'which no approved frame draws'));
  });

  it('refuses an APP5 commercial concept in a component', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.authorized,
      '      <div className="secure-link-access__slot">',
      '      <div className="secure-link-access__slot">\n        <button type="button">Thanh toán</button>',
    );
    assert.ok(mentions(failures, 'reaches for an APP5+ commercial concept'));
  });

  it('refuses a second card owning an h1', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.screen,
      '    <section className="secure-link-access">',
      '    <section className="secure-link-access">\n      <h1>Truy cập</h1>',
    );
    assert.ok(mentions(failures, 'the screen owns an h1 as well as the cards'));
  });

  it('refuses a second shell landmark', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.screen,
      '    <section className="secure-link-access">',
      '    <main className="secure-link-access">',
    );
    assert.ok(mentions(failures, 'renders a second shell landmark'));
  });
});
