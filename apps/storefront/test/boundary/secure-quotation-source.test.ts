/**
 * @jest-environment node
 *
 * Static boundary checks on the `/truy-cap/bao-gia` production source
 * (`APP6-S01` §5, §6, §8, §16, §17, §21).
 *
 * These guard rules no rendering test can reach. A component test can only show
 * that the paths it drove behaved correctly; these say that the *only* way to
 * behave incorrectly has been removed from the source — no numeric coercion
 * exists to misprice a figure, no field name exists to leak an operator note,
 * no storage address exists to persist a credential, and no route string exists
 * to navigate out of the secure session mid-decision.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FEATURE = join(__dirname, '..', '..', 'src', 'features', 'secure-quotation');
const ROUTE = join(__dirname, '..', '..', 'src', 'app', 'truy-cap', 'bao-gia', 'page.tsx');

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? collect(path) : [path];
  });
}

const files = collect(FEATURE);
const code = files.filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'));
const sources = new Map(code.map((path) => [path, readFileSync(path, 'utf8')]));
const allCode = [...sources.values()].join('\n');

/** Source with comments removed, so prose about a rule is not read as the rule. */
function stripped(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const executable = [...sources.values()].map(stripped).join('\n');

describe('APP6-S01 — the feature layout', () => {
  it('places every production file under a responsibility folder', () => {
    const misplaced = files
      .map((path) => path.slice(FEATURE.length + 1).replace(/\\/g, '/'))
      .filter((relative) => relative !== 'index.ts' && !relative.includes('/'));
    expect(misplaced).toEqual([]);
  });

  it('keeps every source file inside the line limit', () => {
    const oversized = [...sources]
      .map(([path, text]) => ({ path, lines: text.split('\n').length }))
      .filter((file) => file.lines > 400);
    expect(oversized).toEqual([]);
  });

  it('exports only the screen', () => {
    const barrel = readFileSync(join(FEATURE, 'index.ts'), 'utf8');
    expect(barrel.match(/^export /gm)).toHaveLength(1);
    expect(barrel).toContain('SecureQuotationScreen');
  });
});

describe('APP6-S01 — money is never computed', () => {
  it('contains no numeric coercion of any kind', () => {
    for (const pattern of [
      /\bNumber\s*\(/,
      /\bparseFloat\s*\(/,
      /\bparseInt\s*\(/,
      /\btoFixed\s*\(/,
    ]) {
      expect(executable).not.toMatch(pattern);
    }
  });

  it('rounds nothing but the badge day count', () => {
    // `Math` appears exactly once in the whole feature, on a difference between
    // two instants. Money is never rounded, floored or ceiled — every figure on
    // this screen is the server's own string, shown as recorded.
    for (const [path, text] of sources) {
      const uses = stripped(text).match(/\bMath\.[a-zA-Z]+/g) ?? [];
      expect({ path, uses }).toEqual({
        path,
        uses: path.endsWith('quotation-presentation.ts') ? ['Math.ceil'] : [],
      });
    }
  });

  it('never formats a currency through Intl.NumberFormat', () => {
    // A locale-aware number formatter takes a `number`, so reaching it at all
    // would mean an exact decimal string had already been coerced.
    expect(executable).not.toContain('Intl.NumberFormat');
  });

  it('does not import the Admin quotation feature', () => {
    expect(executable).not.toMatch(/apps[\\/]admin|@embroidery\/admin/);
    expect(executable).not.toMatch(/from '.*request-quotation/);
  });
});

describe('APP6-S01 — what may never be named', () => {
  it('names no field the customer contract deliberately withholds', () => {
    for (const forbidden of [
      'adjustmentReason',
      'stitchCount',
      'skuId',
      'customerId',
      'customRequestId',
      'quotationId',
      'grantId',
      'correlationId',
      'outboxId',
      'policyVersionId',
    ]) {
      expect(executable).not.toContain(forbidden);
    }
  });

  it('reaches no browser persistence at all', () => {
    for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
      expect(executable).not.toContain(forbidden);
    }
  });

  it('never navigates away from the secure session for a step-up', () => {
    // §8: leaving this route unmounts the session and destroys the credential
    // that the customer's decision still needs.
    expect(executable).not.toContain('/xac-minh-lien-he');
    expect(executable).not.toMatch(/useRouter|redirect\(|router\.push/);
  });

  it('writes nothing to the console', () => {
    expect(executable).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });
});

describe('APP6-S01 — the transport', () => {
  it('calls the API only through the generated operations', () => {
    expect(executable).not.toMatch(/\bfetch\s*\(/);
    expect(executable).not.toMatch(/axios\.(get|post|put|patch|delete)/);
    // No hand-written path anywhere: a route rename must arrive as a
    // regenerated client, not as a 404 nobody notices.
    expect(executable).not.toContain('/api/public/quotations');
  });

  it('reaches the generated client through the curated barrel', () => {
    expect(allCode).not.toContain('@embroidery/api-client/src/generated');
    const client = sources.get(join(FEATURE, 'api', 'secure-quotation.client.ts')) ?? '';
    expect(client).toContain("from '@embroidery/api-client'");
  });

  it('performs exactly three operations, and no fourth', () => {
    const operations = [...executable.matchAll(/public[A-Z][A-Za-z]*/g)].map((match) => match[0]);
    expect(new Set(operations)).toEqual(
      new Set(['publicQuotationCurrent', 'publicQuotationAccept', 'publicQuotationReject']),
    );
  });
});

describe('APP6-S01 — the route', () => {
  const route = readFileSync(ROUTE, 'utf8');

  it('is a thin server component that mounts the capability', () => {
    expect(route).not.toContain("'use client'");
    expect(route).toContain('SecureLinkQueryProvider');
    expect(route).toContain('SecureQuotationScreen');
    expect(route.split('\n').length).toBeLessThanOrEqual(400);
  });

  it('is excluded from indexing', () => {
    expect(route).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });
});
