#!/usr/bin/env node
/**
 * Repository secret-disclosure gate.
 *
 * Two failures this repository has actually had, and now cannot repeat:
 *
 * 1. A completion report recorded a live development credential in plaintext.
 *    Reports are committed evidence, so a value written into one is a value
 *    published into history — deleting it later leaves it reachable.
 * 2. Secret-bearing files (`.env`, private keys) becoming tracked.
 *
 * Detection is structural, not a wordlist: a secret **keyword**, a disclosure
 * **connective**, and a **secret-shaped value**. Prose about secrets is the
 * normal content of a security report and must stay writable — "the password was
 * rotated", "the token is not persisted", "credential value is intentionally
 * redacted" are all legitimate, and none of them carries a value.
 *
 * Explicit redaction placeholders are always allowed, so the honest way to
 * describe a secret is also the way that passes.
 *
 * Scope is deliberately narrow. The Figma registry has its own token/identity
 * rules inside `check-figma-design-index.mjs` for a single file; this gate owns
 * documentation and tracked-file safety. They do not overlap.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sep } from 'node:path';
import process from 'node:process';

/** Words that introduce a secret. Matched case-insensitively, whole word. */
const SECRET_KEYWORDS = [
  'password',
  'passphrase',
  'credential',
  'secret',
  'token',
  'api[- ]?key',
  'access[- ]?key',
  'private[- ]?key',
  'mật khẩu',
];

/**
 * How a disclosure reads.
 *
 * One link is not enough: real disclosures chain them — "password **is now** X",
 * "secret **was changed to** X" — so the connective repeats. Repetition is
 * bounded so an unrelated keyword cannot reach across half a sentence to collide
 * with an unrelated token.
 */
// A link never consumes the separator that follows it — otherwise the next link
// in the chain has no leading whitespace left to match, and "is now X" silently
// stops matching after "is".
const CONNECTIVE_LINK =
  // `(?=\\s)` rather than `\\b`: JavaScript word boundaries are ASCII-only, so a
  // link ending in a Vietnamese vowel ("là") would never close on `\\b`.
  '(?:\\s*[:=]|\\s+(?:is|are|was|were|becomes?|became|now|currently|to|the|set|changed|rotated|reset|updated|là|thành|mới|hiện)(?=\\s))';
const CONNECTIVE = `(?:${CONNECTIVE_LINK}){1,4}\\s*`;

/** Wording that explicitly withholds a value. Any of these clears the line. */
const REDACTION_MARKERS = [
  '[redacted]',
  '<redacted>',
  '[secret]',
  '<secret>',
  'not recorded',
  'never recorded',
  'not committed',
  'not persisted',
  'not printed',
  'intentionally redacted',
  'intentionally not',
  'không được ghi lại',
  '***',
  'xxxxx',
];

/** Characters a password uses but an identifier, version or path does not. */
const PASSWORD_SYMBOL = /[!#$%^&*+=?@]/;

/**
 * A **method call**: a dot, an identifier, an open parenthesis.
 *
 * A quoted schema is the one thing these reports write after the word `token`
 * that is neither prose nor a credential — `token: z.string().regex(…)` is the
 * *shape* of the field, and quoting it is the point. A credential cannot contain
 * a member-access call, so this separates the two without exempting a file, a
 * directory or a fenced block.
 *
 * Deliberately `.name(` rather than the looser `name(`: a password ending in an
 * open parenthesis (`Aa1!abcdefgh(`) contains a bare call expression by that
 * looser reading and would have been exempted. The dot is what makes it code.
 *
 * Narrowed here by `APP12-H01` closing `FU-APP12-S03-08`, which inherited two
 * findings — `APP6-B04:93` and the `APP9-G01` row *quoting* it — that were both
 * this false positive. `APP9-G01` recorded the two admissible fixes as
 * "rewording that one APP6 line or narrowing the heuristic"; rewording would
 * have made an accurate quotation of delivered source less accurate, so the
 * heuristic is what moved.
 */
const METHOD_CALL = /\.[A-Za-z_$][\w$]*\(/;

/**
 * Whether a token looks like a secret rather than an identifier.
 *
 * Identifiers in these documents are `SCREAMING_SNAKE`, `camelCase`, `kebab-id`,
 * ISO timestamps, versions and UUIDs — none of which mixes case *and* digits the
 * way a generated or hand-picked password does. Requiring that mix is what keeps
 * `PRODUCT_VERSION_CONFLICT`, `expectedUpdatedAt` and `ADR-APP1-001` writable.
 */
export function looksLikeSecretValue(raw) {
  const value = raw.replace(/^[`'"]+/, '').replace(/[`'"]+[.,;:)]*$/, '');
  if (METHOD_CALL.test(value)) {
    return false;
  }
  if (value.length < 8 || value.length > 256 || /\s/.test(value)) {
    return false;
  }
  // A UUID is an identifier the reports legitimately quote.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return false;
  }
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = PASSWORD_SYMBOL.test(value);
  if (!hasDigit || !(hasLower || hasUpper)) {
    return false;
  }
  return (hasLower && hasUpper) || hasSymbol;
}

const DISCLOSURE_RE = new RegExp(
  `\\b(${SECRET_KEYWORDS.join('|')})\\b${CONNECTIVE}([^\\s]{8,256})`,
  'gi',
);

function isCleared(line) {
  const lower = line.toLowerCase();
  return REDACTION_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Every disclosure in `content`, as `{ line, keyword }`.
 *
 * The matched value is deliberately **not** returned: a checker that echoes the
 * secret it found would publish it into CI output, which is the failure it
 * exists to prevent.
 */
export function findSecretDisclosures(content) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isCleared(line)) {
      return;
    }
    DISCLOSURE_RE.lastIndex = 0;
    let match;
    while ((match = DISCLOSURE_RE.exec(line)) !== null) {
      if (looksLikeSecretValue(match[2])) {
        findings.push({ line: index + 1, keyword: match[1].toLowerCase() });
      }
    }
  });
  return findings;
}

/** Tracked paths that must never hold secret material. */
const SECRET_FILE_RE = /(^|\/)\.env(\.|$)|\.(pem|p12|pfx|key|keystore|jks)$/i;
const SECRET_FILE_ALLOWED = new Set(['.env.example']);

export function findTrackedSecretFiles(files) {
  return files.filter((file) => SECRET_FILE_RE.test(file) && !SECRET_FILE_ALLOWED.has(file));
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((file) => file !== '');
}

function main() {
  const files = trackedFiles();
  const violations = [];

  for (const file of findTrackedSecretFiles(files)) {
    violations.push(`${file}: secret-bearing file must not be tracked.`);
  }

  const documents = files.filter((file) => file.startsWith('docs/') && file.endsWith('.md'));
  for (const file of documents) {
    for (const finding of findSecretDisclosures(readFileSync(file, 'utf8'))) {
      violations.push(
        `${file}:${finding.line}: "${finding.keyword}" is followed by what looks like a plaintext value. ` +
          'Describe the change and withhold the value (for example "[REDACTED]" or "intentionally not recorded").',
      );
    }
  }

  if (violations.length > 0) {
    console.error('Secret-disclosure check failed:');
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    process.exit(1);
  }
  console.log(
    `Secret-disclosure check passed (${documents.length} document(s), ${files.length} tracked file(s)).`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join('/'))) {
  main();
}
