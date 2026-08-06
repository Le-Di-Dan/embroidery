/**
 * Regressions for the `APP3-B06A` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a *working* system: `timingSafeEqual` swapped for
 * `===`, the pepper given a fallback, the cookie found by scanning instead of by
 * derivation, `SESSION_NOT_FOUND` added to the clearing set, a missing `Origin`
 * allowed "like the staff policy does". Every one of those authorizes correctly
 * and hands an attacker something, which is why they are asserted structurally
 * rather than left to a functional test.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  OWNED,
  checkAuthorization,
  checkContext,
  checkCookieAuthority,
  checkOriginPolicy,
  checkRateLimits,
  checkVerifier,
  read,
} from './check-app3-b06a-security.mjs';
import { REPO_ROOT, checkApp3B06A } from './check-app3-b06a.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';

function collector() {
  const failures = [];
  return { failures, fail: (message) => failures.push(message) };
}

const mentions = (failures, needle) => failures.some((failure) => failure.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b06a-'));
  temporaries.push(base);
  const extras = [
    'tools/check-app3-b06a.mjs',
    'tools/check-app3-b06a-security.mjs',
    'tools/check-app3-b06a.test.mjs',
  ];
  for (const relative of [...Object.values(CANONICAL_FILES), ...extras]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // The completion report does not exist while Commit A is prepared.
    }
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-b06a-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const relative = CANONICAL_FILES[key] ?? key;
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

/** One security check against a mutated root. */
function run(check, overrides = {}) {
  const { failures, fail } = collector();
  check(rootWith(overrides), fail);
  return failures;
}

describe('the verifier', () => {
  it('accepts the delivered one', () => {
    assert.deepEqual(run(checkVerifier), []);
  });

  it('rejects a plain-comparison verifier', () => {
    // Authorizes every legitimate session, and leaks the digest byte by byte.
    const failures = run(checkVerifier, {
      verifier: file('verifier').replace('return timingSafeEqual(a, b);', 'return left === right;'),
    });
    assert.ok(mentions(failures, 'not timing-safe'), failures.join('\n'));
  });

  it('rejects an unpeppered digest', () => {
    const failures = run(checkVerifier, {
      verifier: file('verifier').replace(
        "createHmac('sha256', this.config.secretPepper)",
        "createHash('sha256')",
      ),
    });
    assert.ok(mentions(failures, 'not HMAC-SHA-256 under the runtime pepper'), failures.join('\n'));
  });

  it('rejects dropping the fixed-width normalization', () => {
    // `timingSafeEqual` throws on a length mismatch, and the throw is a signal.
    const failures = run(checkVerifier, {
      verifier: file('verifier').replaceAll("createHash('sha256')", 'Buffer.from'),
    });
    assert.ok(mentions(failures, 'not normalized to a fixed width'), failures.join('\n'));
  });

  it('rejects a password hash in the verification role', () => {
    const failures = run(checkVerifier, {
      verifier: `${file('verifier')}\nexport const alt = 'scrypt';\n`,
    });
    assert.ok(
      mentions(failures, 'a password hash is not the ruled verification'),
      failures.join('\n'),
    );
  });

  it('rejects a pepper that stops failing loudly', () => {
    const failures = run(checkVerifier, {
      config: file('config').replaceAll('is required', 'is optional'),
    });
    assert.ok(mentions(failures, 'does not fail loudly'), failures.join('\n'));
  });
});

describe('the cookie authority', () => {
  it('accepts the delivered policy', () => {
    assert.deepEqual(run(checkCookieAuthority), []);
  });

  it('rejects losing the locked prefix', () => {
    const failures = run(checkCookieAuthority, {
      cookies: file('cookies').replace("'__Host-nettheu_ds_'", "'ds_'"),
    });
    assert.ok(mentions(failures, 'locked cookie prefix is gone'), failures.join('\n'));
  });

  it('rejects a name built from an unvalidated id', () => {
    const failures = run(checkCookieAuthority, {
      cookies: file('cookies').replaceAll('isCanonicalSessionId(sessionId)', 'true'),
    });
    assert.ok(
      mentions(failures, 'not validated before it becomes a header name'),
      failures.join('\n'),
    );
  });

  it('rejects extraction that scans instead of matching the derived name', () => {
    const failures = run(checkCookieAuthority, {
      cookies: file('cookies').replace('=== wanted', '.startsWith(DESIGN_SESSION_COOKIE_PREFIX)'),
    });
    assert.ok(mentions(failures, 'does not match the derived name exactly'), failures.join('\n'));
  });

  it('rejects a Domain attribute, which breaks the __Host- prefix', () => {
    const failures = run(checkCookieAuthority, {
      cookies: file('cookies').replace("'Path=/',", "'Domain=example.test',\n      'Path=/',"),
    });
    assert.ok(mentions(failures, 'breaks the __Host- prefix'), failures.join('\n'));
  });

  it('rejects a deletion cookie missing an attribute it was set with', () => {
    for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Max-Age=0']) {
      const failures = run(checkCookieAuthority, {
        cookies: file('cookies').replaceAll(`'${attribute}'`, "'X-Removed'"),
      });
      assert.ok(mentions(failures, `omits ${attribute}`), attribute);
    }
  });
});

describe('the authorization decision', () => {
  it('accepts the delivered service', () => {
    assert.deepEqual(run(checkAuthorization), []);
  });

  it('rejects losing the ACTIVE or expiry check', () => {
    const noActive = run(checkAuthorization, {
      service: file('service').replace("session.status !== 'ACTIVE'", 'false'),
    });
    assert.ok(mentions(noActive, 'ACTIVE check is gone'), noActive.join('\n'));

    const noExpiry = run(checkAuthorization, {
      service: file('service').replace('expiresAt.getTime() <= now.getTime()', 'false'),
    });
    assert.ok(mentions(noExpiry, 'expiry check is gone'), noExpiry.join('\n'));
  });

  it('rejects authorization that writes', () => {
    const failures = run(checkAuthorization, {
      service: `${file('service')}\nconst probe = () => this.sessions.advanceRevision();\n`,
    });
    assert.ok(mentions(failures, 'authorization writes'), failures.join('\n'));
  });

  it('rejects a public message that discloses the reason', () => {
    const failures = run(checkAuthorization, {
      outcomes: file('outcomes').replace(
        "message: 'That design session could not be authorized.'",
        "message: 'That design session has expired.'",
      ),
    });
    assert.ok(mentions(failures, 'discloses a reason'), failures.join('\n'));
  });

  it('rejects clearing a cookie for a session that may simply be unknown', () => {
    // Clearing on SESSION_NOT_FOUND tells the caller which half it got right.
    const failures = run(checkAuthorization, {
      outcomes: file('outcomes').replace(
        "'COOKIE_AMBIGUOUS',\n]",
        "'COOKIE_AMBIGUOUS',\n  'SESSION_NOT_FOUND',\n]",
      ),
    });
    assert.ok(mentions(failures, 'must not clear'), failures.join('\n'));
  });

  it('rejects a reason that stops clearing a dead credential', () => {
    // Targets the pair that is unique to the clearing set: in the reasons enum
    // `MALFORMED_SECRET` is followed by `SESSION_NOT_FOUND`, so a looser pattern
    // would mutate the enum and prove nothing about clearing.
    const outcomes = file('outcomes');
    const pair = "'MALFORMED_SECRET',\n  'SECRET_MISMATCH',";
    assert.ok(outcomes.includes(pair), 'clearing-set ordering changed');
    const failures = run(checkAuthorization, {
      outcomes: outcomes.replace(pair, "'MALFORMED_SECRET',"),
    });
    assert.ok(mentions(failures, 'SECRET_MISMATCH no longer clears'), failures.join('\n'));
  });
});

describe('the origin policy', () => {
  it('accepts the delivered policy', () => {
    assert.deepEqual(run(checkOriginPolicy), []);
  });

  it('rejects dropping Sec-Fetch-Site', () => {
    const failures = run(checkOriginPolicy, {
      origins: file('origins').replaceAll("'sec-fetch-site'", "'x-none'"),
    });
    assert.ok(mentions(failures, 'Sec-Fetch-Site is not checked'), failures.join('\n'));
  });

  it('rejects consulting Referer, which a referrer policy may strip', () => {
    const failures = run(checkOriginPolicy, {
      origins: file('origins').replace(
        "const raw = request.headers['origin'];",
        "const raw = request.headers['origin'] ?? request.headers['referer'];",
      ),
    });
    assert.ok(mentions(failures, 'Referer is consulted'), failures.join('\n'));
  });

  it('rejects an allowlist that is no longer matched exactly', () => {
    const failures = run(checkOriginPolicy, {
      origins: file('origins').replace('this.config.allowedOrigins.includes(normalized)', 'true'),
    });
    assert.ok(mentions(failures, 'not matched exactly'), failures.join('\n'));
  });

  it('rejects the origin check sliding after authorization', () => {
    const guard = file('guard');
    const block =
      /    if \(this\.origins\.evaluate\(request\) === 'REFUSED'\) \{\n[\s\S]*?\n    \}\n/.exec(
        guard,
      );
    assert.ok(block, 'origin block not found in the delivered guard');
    const moved = guard
      .replace(block[0], '')
      .replace('    if (!outcome.authorized) {', `${block[0]}    if (!outcome.authorized) {`);
    const failures = run(checkOriginPolicy, { guard: moved });
    assert.ok(mentions(failures, 'no longer precedes authorization'), failures.join('\n'));
  });
});

describe('the rate limits', () => {
  it('accepts the delivered limits', () => {
    assert.deepEqual(run(checkRateLimits), []);
  });

  it('rejects a changed PO-07 budget', () => {
    const failures = run(checkRateLimits, {
      config: file('config').replace('mutation: { max: 30', 'mutation: { max: 300'),
    });
    assert.ok(mentions(failures, 'not 30/minute'), failures.join('\n'));
  });

  it('rejects a second rate-limit framework', () => {
    const failures = run(checkRateLimits, {
      limiter: `${file('limiter')}\nclass OtherRateLimiter {\n  private readonly windows = new Map();\n}\n`,
    });
    assert.ok(mentions(failures, 'implements a second rate-limit framework'), failures.join('\n'));
  });

  it('rejects a key carrying a secret or digest', () => {
    const failures = run(checkRateLimits, {
      limiter: file('limiter').replace('sessionId, this.config', 'digest(sessionId), this.config'),
    });
    assert.ok(mentions(failures, 'carries digest('), failures.join('\n'));
  });

  it('rejects a network key that is not an HMAC under a runtime salt', () => {
    const failures = run(checkRateLimits, {
      networkKey: file('networkKey').replace(
        "createHmac('sha256', this.salt)",
        "createHash('sha256')",
      ),
    });
    assert.ok(mentions(failures, 'not an HMAC under a runtime salt'), failures.join('\n'));
  });

  it('rejects identity quietly forking its own copy of the primitive', () => {
    const failures = run(checkRateLimits, {
      loginLimiter: file('loginLimiter').replace(
        'extends SlidingWindowRateLimiter',
        'implements Limiter',
      ),
    });
    assert.ok(mentions(failures, 'no longer shares the extracted primitive'), failures.join('\n'));
  });
});

describe('the request context', () => {
  it('accepts the delivered context', () => {
    assert.deepEqual(run(checkContext), []);
  });

  it('rejects a context that exposes the credential', () => {
    for (const field of ['secretHash: string;', 'cookieHeader: string;']) {
      const failures = run(checkContext, {
        context: file('context').replace(
          '  readonly authorizedAt: Date;',
          `  readonly ${field}\n  readonly authorizedAt: Date;`,
        ),
      });
      assert.ok(mentions(failures, 'exposes'), field);
    }
  });

  it('rejects a context missing the id or the revision', () => {
    const failures = run(checkContext, {
      context: file('context').replace('readonly currentRevision: number;', ''),
    });
    assert.ok(mentions(failures, 'omits the id or the revision'), failures.join('\n'));
  });

  it('rejects binding an actor identity to an anonymous session', () => {
    const failures = run(checkContext, {
      guard: `${file('guard')}\nconst probe = () => bindActor('CUSTOMER');\n`,
    });
    assert.ok(mentions(failures, 'binds or asserts an actor identity'), failures.join('\n'));
  });

  it('scopes its scans to the files this checkpoint owns', () => {
    // The design module also holds DB7-era repositories; a scan over the whole
    // module would fail on history rather than on this checkpoint.
    assert.ok(!OWNED.includes('repository'));
    assert.ok(!OWNED.includes('port'));
    assert.ok(OWNED.includes('guard'));
  });
});

describe('the whole gate, against the real repository', () => {
  it('passes, chain and all', () => {
    assert.deepEqual(checkApp3B06A(REPO_ROOT), []);
  });
});
