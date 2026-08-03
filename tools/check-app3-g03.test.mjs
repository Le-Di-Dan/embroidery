/**
 * Regressions for the `APP3-G03` anonymous-session authority gate (IMP-D043).
 *
 * Every case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked authority.
 *
 * The cases worth reading twice are the ones that encode *why this gate exists*:
 * `id alone authorizes`, `secret alone authorizes` and `the TTL slides again`
 * are all one small edit away from the state the repository was actually in
 * before IMP-D043 — `findActiveBySecretHash` reads like a one-half check, and
 * two retention documents really did say `last_activity_at + TTL`.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  DECISION_ID,
  EXPECTED_DEPENDENCIES,
  EXPECTED_FACTS,
  REPO_ROOT,
  RULINGS,
  checkApp3G03,
  dependencyTable,
} from './check-app3-g03.mjs';
import { boundedTable, CANONICAL_FILES as G02_FILES } from './check-app3-g02.mjs';
import { CANONICAL_FILES as G01_FILES } from './check-app3-g01.mjs';

const ALL_FILES = { ...G01_FILES, ...G02_FILES, ...CANONICAL_FILES };

const readCanonical = (key) => readFileSync(join(REPO_ROOT, CANONICAL_FILES[key]), 'utf8');
const phaseText = readCanonical('phase');
const specText = readCanonical('spec');
const registerText = readCanonical('register');
const securityText = readCanonical('security');
const schemaText = readCanonical('sessionSchema');
const openapiText = readCanonical('openapi');
const decisionLogText = readCanonical('decisionLog');
const retentionMapText = readCanonical('retentionMap');

const SOURCES = {
  phase: phaseText,
  spec: specText,
  register: registerText,
  security: securityText,
  sessionSchema: schemaText,
  openapi: openapiText,
  decisionLog: decisionLogText,
  retentionMap: retentionMapText,
};

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying every canonical file all three gates read. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app3-g03-'));
  temporaries.push(dir);
  for (const relative of new Set(Object.values(ALL_FILES))) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(dir, relative));
  }
  // The chronology half reads real git history.
  cpSync(join(REPO_ROOT, '.git'), join(dir, '.git'), { recursive: true });
  for (const [relative, text] of Object.entries(edits)) {
    writeFileSync(join(dir, relative), text, 'utf8');
  }
  return dir;
}

const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

/** Failures after one substitution in a named canonical file. */
function failuresAfter(key, from, to) {
  const source = SOURCES[key];
  assert.ok(source.includes(from), `${key} is missing the anchor: ${from.slice(0, 70)}`);
  return checkApp3G03(rootWith({ [CANONICAL_FILES[key]]: source.replace(from, to) }));
}

/** Failures after retuning one row of the §6.6.1 fact table. */
function factRetuned(key, value) {
  return failuresAfter(
    'phase',
    `| \`${key}\` | \`${EXPECTED_FACTS[key]}\` |`,
    `| \`${key}\` | \`${value}\` |`,
  );
}

describe('APP3-G03 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp3G03(REPO_ROOT), []);
  });

  it('records every ruled fact in the bounded §6.6.1 table', () => {
    const facts = boundedTable(phaseText, '### 6.6.1 ', '### 6.6.2 ');
    for (const [key, value] of Object.entries(EXPECTED_FACTS)) {
      assert.equal(facts.get(key), value, `fact ${key}`);
    }
  });

  it('records every reconciled dependency in §6.6.4', () => {
    const rows = dependencyTable(phaseText);
    for (const [key, value] of Object.entries(EXPECTED_DEPENDENCIES)) {
      assert.equal(rows.get(key), value, `dependency ${key}`);
    }
  });

  it('measures the session schema rather than assuming it', () => {
    // PO-10 is a claim about the real table; if this drifts the verdict is void.
    assert.match(schemaText, /sessionSecretHash: text\('session_secret_hash'\)\.notNull\(\)/);
    assert.match(schemaText, /unique\('uq_design_sessions__session_secret_hash'\)/);
    assert.match(schemaText, /expiresAt: instant\('expires_at'\)\.notNull\(\)/);
    assert.match(schemaText, /autosaveRevision: integer\('autosave_revision'\)\.notNull\(\)/);
  });
});

describe('APP3-G03 — ownership needs both halves', () => {
  it('refuses authorization by session id alone', () => {
    const failures = factRetuned('Session id alone authorizes', 'YES');
    assert.ok(mentions(failures, 'Session id alone authorizes'));
  });

  it('refuses authorization by secret alone', () => {
    const failures = factRetuned('Session secret alone authorizes', 'YES');
    assert.ok(mentions(failures, 'Session secret alone authorizes'));
  });

  it('refuses a relaxed ownership requirement', () => {
    const failures = factRetuned('Session ownership requirement', 'SESSION_ID_ONLY');
    assert.ok(mentions(failures, 'Session ownership requirement'));
  });
});

describe('APP3-G03 — the raw secret stays out of everything but the cookie', () => {
  it('refuses the raw secret in a JSON body', () => {
    assert.ok(mentions(factRetuned('Session secret json transport', 'ALLOWED'), 'json transport'));
  });

  it('refuses the raw secret in a URL', () => {
    assert.ok(mentions(factRetuned('Session secret url transport', 'ALLOWED'), 'url transport'));
  });

  it('refuses the raw secret in browser storage', () => {
    const failures = factRetuned('Session secret browser storage', 'LOCAL_STORAGE');
    assert.ok(mentions(failures, 'browser storage'));
  });

  it('refuses persisting the raw secret', () => {
    assert.ok(mentions(factRetuned('Session secret persistence', 'RAW'), 'secret persistence'));
  });
});

describe('APP3-G03 — secret strength and verification', () => {
  it('refuses a weakened secret length', () => {
    assert.ok(mentions(factRetuned('Session secret bytes', '16'), 'Session secret bytes'));
  });

  it('refuses a digest that is not HMAC under a runtime pepper', () => {
    const failures = factRetuned('Session secret digest', 'SHA256_PLAIN');
    assert.ok(mentions(failures, 'Session secret digest'));
  });

  it('refuses dropping constant-time comparison', () => {
    const failures = factRetuned('Session secret comparison', 'STRING_EQUALITY');
    assert.ok(mentions(failures, 'Session secret comparison'));
  });

  it('refuses a pepper fallback', () => {
    const failures = factRetuned('Session pepper absent behaviour', 'GENERATE_DEFAULT');
    assert.ok(mentions(failures, 'pepper absent behaviour'));
  });

  it('notices when the rulings stop stating the HMAC construction', () => {
    const failures = failuresAfter(
      'phase',
      'persists only `HMAC-SHA-256(server pepper, raw secret)`',
      'persists only a digest of the raw secret',
    );
    assert.ok(mentions(failures, 'HMAC-SHA-256 over a runtime pepper'));
  });
});

describe('APP3-G03 — cookie transport', () => {
  it('refuses a missing cookie attribute in the rulings', () => {
    const failures = failuresAfter(
      'phase',
      'production\nattributes `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`',
      'production\nattributes `Secure`, `SameSite=Lax`, `Path=/`',
    );
    assert.ok(mentions(failures, 'HttpOnly'));
  });

  it('refuses a missing cookie attribute in the security document', () => {
    const failures = failuresAfter(
      'security',
      '`__Host-nettheu_ds_<session-id>` with `Secure`, `HttpOnly`,',
      '`__Host-nettheu_ds_<session-id>` with `Secure`,',
    );
    assert.ok(mentions(failures, 'HttpOnly'));
  });

  it('refuses one shared cookie for every session', () => {
    const failures = factRetuned('Session cookie scope', 'ONE_COOKIE_FOR_ALL_SESSIONS');
    assert.ok(mentions(failures, 'Session cookie scope'));
  });

  it('refuses a cookie outliving expires_at', () => {
    const failures = factRetuned('Session cookie max age bound', 'INDEPENDENT');
    assert.ok(mentions(failures, 'cookie max age bound'));
  });

  it('refuses reusing the staff cookie', () => {
    assert.ok(mentions(factRetuned('Session staff cookie reuse', 'ALLOWED'), 'staff cookie reuse'));
  });
});

describe('APP3-G03 — rotation', () => {
  it('refuses rotation that extends the TTL', () => {
    const failures = factRetuned('Session rotation ttl effect', 'EXTENDS');
    assert.ok(mentions(failures, 'rotation ttl effect'));
  });

  it('refuses retaining the previous secret', () => {
    const failures = factRetuned('Session previous secret grace', 'PT60S');
    assert.ok(mentions(failures, 'previous secret grace'));
  });

  it('refuses more than one winning concurrent rotation', () => {
    assert.ok(mentions(factRetuned('Session rotation winners', '2'), 'rotation winners'));
  });

  it('notices when the rulings stop requiring compare-and-swap', () => {
    const failures = failuresAfter(
      'phase',
      'replace\n`session_secret_hash` under **compare-and-swap**',
      'replace\n`session_secret_hash`',
    );
    assert.ok(mentions(failures, 'compare-and-swap'));
  });
});

describe('APP3-G03 — CSRF, origin and enumeration', () => {
  it('refuses credentialed cross-origin use', () => {
    const failures = factRetuned('Session credentialed cors', 'ENABLED');
    assert.ok(mentions(failures, 'credentialed cors'));
  });

  it('refuses accepting a missing Origin on a mutation', () => {
    const failures = factRetuned('Session absent origin on mutation', 'ALLOWED');
    assert.ok(mentions(failures, 'absent origin on mutation'));
  });

  it('refuses existence-revealing errors', () => {
    const failures = factRetuned('Session existence disclosure', 'NOT_FOUND_DISTINCT');
    assert.ok(mentions(failures, 'existence disclosure'));
  });

  it('refuses splitting the safe error shape', () => {
    const failures = factRetuned('Session error disclosure', 'PER_CAUSE');
    assert.ok(mentions(failures, 'error disclosure'));
  });
});

describe('APP3-G03 — retention', () => {
  it('refuses a changed TTL', () => {
    assert.ok(mentions(factRetuned('SESSION_TTL_DAYS', '90'), 'SESSION_TTL_DAYS'));
  });

  it('refuses a sliding TTL', () => {
    const failures = factRetuned('Session ttl basis', 'SLIDING_FROM_LAST_ACTIVITY');
    assert.ok(mentions(failures, 'Session ttl basis'));
  });

  it('refuses reintroducing extension on activity', () => {
    const failures = factRetuned('Session ttl sliding', 'ON_AUTOSAVE');
    assert.ok(mentions(failures, 'Session ttl sliding'));
  });

  it('refuses a changed purge grace', () => {
    assert.ok(mentions(factRetuned('Session purge grace hours', '0'), 'purge grace hours'));
  });

  it('refuses APP3 owning SUBMITTED retention', () => {
    const failures = factRetuned('Session submitted retention owner', 'APP3');
    assert.ok(mentions(failures, 'submitted retention owner'));
  });

  it('refuses purging shared authority', () => {
    const failures = factRetuned('Session purge shared authority', 'CASCADE');
    assert.ok(mentions(failures, 'purge shared authority'));
  });

  it('refuses reverting O-008 to deferred', () => {
    const failures = failuresAfter(
      'decisionLog',
      '> **CLOSED (2026-08-04) by `APP3-G03` / IMP-D043 PO-06.**',
      '> Still deferred.',
    );
    assert.ok(mentions(failures, CANONICAL_FILES.decisionLog));
  });

  it('refuses a design_sessions row that still states last_activity_at as live', () => {
    const failures = failuresAfter(
      'retentionMap',
      '~~last_activity_at + TTL (O-008)~~ → **`created_at` + 30 days, absolute**',
      'last_activity_at + TTL (O-008)',
    );
    assert.ok(mentions(failures, 'last_activity_at + TTL as the live basis'));
  });
});

describe('APP3-G03 — rate and concurrency controls', () => {
  it('refuses altered creation limits', () => {
    const failures = factRetuned('Session creation rate per hour', '500');
    assert.ok(mentions(failures, 'creation rate per hour'));
  });

  it('refuses altered mutation limits', () => {
    const failures = factRetuned('Session mutation rate per minute', '3000');
    assert.ok(mentions(failures, 'mutation rate per minute'));
  });

  it('refuses a durable browser identity', () => {
    const failures = factRetuned('Session durable browser identity', 'COOKIE_UUID');
    assert.ok(mentions(failures, 'durable browser identity'));
  });

  it('refuses a per-browser session quota', () => {
    const failures = factRetuned('Session browser session quota', '3');
    assert.ok(mentions(failures, 'browser session quota'));
  });

  it('refuses persisting raw IP', () => {
    assert.ok(mentions(factRetuned('Session raw ip persistence', 'STORED'), 'raw ip persistence'));
  });

  it('refuses more than one in-flight mutation', () => {
    assert.ok(mentions(factRetuned('Session concurrent mutations', '4'), 'concurrent mutations'));
  });

  it('notices when the security document drops a locked limit', () => {
    const failures = failuresAfter(
      'security',
      '| Session creation | 5 / hour (burst 2 / minute) | ephemeral network key |',
      '| Session creation | as configured | ephemeral network key |',
    );
    assert.ok(mentions(failures, 'session creation'));
  });
});

describe('APP3-G03 — autosave concurrency', () => {
  it('refuses dropping the expected revision', () => {
    const failures = factRetuned('Session mutation revision requirement', 'NONE');
    assert.ok(mentions(failures, 'mutation revision requirement'));
  });

  it('refuses a stale write that still mutates', () => {
    const failures = factRetuned('Session stale write mutation', 'LAST_WRITE_WINS');
    assert.ok(mentions(failures, 'stale write mutation'));
  });

  it('refuses a blind replay loop', () => {
    const failures = factRetuned('Session blind replay loop', 'ALLOWED');
    assert.ok(mentions(failures, 'blind replay loop'));
  });

  it('refuses introducing an idempotency table', () => {
    const failures = factRetuned('Session idempotency table', 'design_session_idempotency');
    assert.ok(mentions(failures, 'idempotency table'));
  });
});

describe('APP3-G03 — the APP5 boundary', () => {
  it('refuses customer identity in APP3', () => {
    const failures = factRetuned('Session customer identity in APP3', 'CUSTOMER_FK');
    assert.ok(mentions(failures, 'customer identity in APP3'));
  });

  it('refuses contact collection in APP3', () => {
    const failures = factRetuned('Session contact collection in APP3', 'EMAIL');
    assert.ok(mentions(failures, 'contact collection in APP3'));
  });

  it('refuses APP3 owning the submit transition', () => {
    const failures = factRetuned('Session submit transition owner', 'APP3');
    assert.ok(mentions(failures, 'submit transition owner'));
  });

  it('refuses an identity-bearing column on the session table', () => {
    const failures = failuresAfter(
      'sessionSchema',
      "templateVersion: integer('template_version'),",
      "templateVersion: integer('template_version'),\n    customerEmail: text('customer_email'),",
    );
    assert.ok(mentions(failures, 'identity-bearing column'));
  });
});

describe('APP3-G03 — database contribution and schema evidence', () => {
  it('refuses claiming a G03 migration contribution', () => {
    assert.ok(mentions(factRetuned('G03_DB_CONTRIBUTION', 'REQUIRED'), 'G03_DB_CONTRIBUTION'));
  });

  it('refuses a removed required column', () => {
    const failures = failuresAfter(
      'sessionSchema',
      "expiresAt: instant('expires_at').notNull(),",
      "expiresAt: instant('expires_at'),",
    );
    assert.ok(mentions(failures, 'expires_at'));
  });

  it('refuses a removed uniqueness constraint on the verifier', () => {
    const failures = failuresAfter(
      'sessionSchema',
      "unique('uq_design_sessions__session_secret_hash').on(t.sessionSecretHash),",
      '',
    );
    assert.ok(mentions(failures, 'unique session_secret_hash'));
  });

  it('refuses a changed LC-07 state set on the table', () => {
    const failures = failuresAfter(
      'sessionSchema',
      "['ACTIVE', 'SUBMITTED', 'EXPIRED', 'DELETED'] as const",
      "['ACTIVE', 'ABANDONED', 'SUBMITTED', 'EXPIRED', 'DELETED'] as const",
    );
    assert.ok(mentions(failures, 'DESIGN_SESSION_STATES'));
  });
});

describe('APP3-G03 — the absence this gate asserts', () => {
  it('refuses a Design Session operation appearing in OpenAPI', () => {
    const document = JSON.parse(openapiText);
    document.paths['/api/design-sessions'] = {
      post: { operationId: 'designSession_create', responses: {} },
    };
    const failures = checkApp3G03(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document, null, 2) }),
    );
    assert.ok(mentions(failures, 'design-sessions'));
  });

  it('refuses a Session operation id even on an unrelated path', () => {
    const document = JSON.parse(openapiText);
    document.paths['/api/anything'] = {
      get: { operationId: 'designSession_get', responses: {} },
    };
    const failures = checkApp3G03(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document, null, 2) }),
    );
    assert.ok(mentions(failures, 'designSession_get'));
  });
});

describe('APP3-G03 — LC-07 is preserved, not extended', () => {
  it('refuses a removed transition', () => {
    const failures = failuresAfter(
      'spec',
      '| TR-LC07-04 | ACTIVE→EXPIRED |',
      '| TR-LC07-09 | ACTIVE→EXPIRED |',
    );
    assert.ok(mentions(failures, 'TR-LC07-04'));
  });

  it('refuses reintroducing ABANDONED', () => {
    const failures = failuresAfter(
      'spec',
      '`ABANDONED` eliminated (merged into\n  EXPIRED).',
      '`ABANDONED` is a distinct state.',
    );
    assert.ok(mentions(failures, 'ABANDONED is eliminated'));
  });
});

describe('APP3-G03 — the decision itself', () => {
  it('refuses a missing decision', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = failuresAfter('register', row, '');
    assert.ok(mentions(failures, `${DECISION_ID} appears 0 times`));
  });

  it('refuses a duplicated decision', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = failuresAfter('register', row, `${row}\n${row}`);
    assert.ok(mentions(failures, `${DECISION_ID} appears 2 times`));
  });

  it('refuses an unlocked decision', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = failuresAfter('register', row, row.replace(/\| LOCKED \|$/, '| PROPOSED |'));
    assert.ok(mentions(failures, `${DECISION_ID} is not LOCKED`));
  });

  it('requires every ruling id in the row', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    for (const ruling of RULINGS) assert.ok(row.includes(ruling), `row records ${ruling}`);
    const failures = failuresAfter(
      'register',
      '**(PO-07) Rate and concurrency controls.**',
      '**Rate limits.**',
    );
    assert.ok(mentions(failures, 'does not record ruling PO-07'));
  });
});

describe('APP3-G03 — predecessor gates', () => {
  it('propagates an APP3-G02 regression', () => {
    const failures = failuresAfter(
      'phase',
      '| `Template transition count` | `6` |',
      '| `Template transition count` | `5` |',
    );
    assert.ok(mentions(failures, 'APP3-G02 regression'));
  });

  it('propagates an APP3-G01 regression', () => {
    const failures = failuresAfter(
      'phase',
      '| `G01_DB_DISPOSITION` | `REQUIRES_APP3_DB01` |',
      '| `G01_DB_DISPOSITION` | `NONE` |',
    );
    assert.ok(mentions(failures, 'regression'));
  });
});
