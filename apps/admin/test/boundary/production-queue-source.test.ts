/**
 * `APP8-A02` source boundaries.
 *
 * What a rendered test cannot prove: that the screen reaches the API only
 * through the one generated operation this checkpoint owns, that no classifier
 * branches on message text, that no second read is opened to enrich a row, that
 * the cache is never flushed wholesale, and that the approved narrow viewport
 * drops exactly one column and keeps every other fact on screen.
 *
 * The viewport assertions are made against the stylesheet rather than through a
 * browser, which is the smallest method that can actually settle them: jsdom
 * applies no CSS, so a rendered test at 1280 would assert nothing about layout,
 * and standing up Playwright for one breakpoint would be a broad run with no
 * demonstrated impact (`APP8-A02` §20.6).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'production-queue');

function collectFiles(dir: string, pattern: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full, pattern));
    else if (pattern.test(entry.name)) files.push(full);
  }
  return files;
}

const sources = collectFiles(FEATURE_DIR, /\.(ts|tsx)$/).map((path) => ({
  path: path.replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8'),
}));

/** Comments explain what a file deliberately avoids; rules must not match them. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const code = sources.map((source) => ({ ...source, text: stripComments(source.text) }));

const stylesheet = collectFiles(join(FEATURE_DIR, 'styles'), /\.scss$/)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

describe('the generated client boundary', () => {
  it('consumes exactly the one operation APP8-A02 owns', () => {
    expect(typeof (apiClient as Record<string, unknown>)['adminProductionJobList']).toBe(
      'function',
    );
    expect(code.some((source) => source.text.includes('adminProductionJobList'))).toBe(true);
  });

  it('reaches the API through no other transport', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\bfetch\s*\(/);
      expect(source.text).not.toMatch(/from\s+['"]axios['"]/);
      // The copy module is exempt from the path rule and only it: `780:29`
      // prints the endpoint on screen as an operator-facing annotation, which
      // is display text, not a URL anything requests.
      if (source.path.endsWith('production-queue-copy.ts')) continue;
      expect(source.text).not.toMatch(/\/api\/admin/);
    }
  });

  it('never deep-imports the generated tree', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/@embroidery\/api-client\/.*generated/);
    }
  });

  it('opens no second read to enrich a row', () => {
    // The design package records the mismatch rather than resolving it: the
    // queue publishes no `orderCode` and no frozen specification, and a label
    // column would have to be filled by a per-row Catalog or order read — the
    // N+1 `788:179` explicitly refused.
    for (const source of code) {
      for (const operation of [
        'adminOrderDetail',
        'adminOrderList',
        'adminProductDetail',
        'adminSkuStockGet',
        'adminProductionJobGet',
      ]) {
        expect(source.text).not.toContain(operation);
      }
    }
  });
});

describe('no unsupported capability', () => {
  it('invents no production operation A02 does not own', () => {
    for (const source of code) {
      for (const forbidden of [
        'adminProductionJobCreate',
        'adminProductionJobTransition',
        'useMutation',
      ]) {
        expect(source.text).not.toContain(forbidden);
      }
    }
  });

  it('carries no vocabulary the production model does not have', () => {
    // A production queue is tempted to grow these. None exists on any accepted
    // authority: there is no priority column, no operator or machine
    // assignment, no SLA and no attempt or claim count.
    for (const source of code) {
      expect(source.text).not.toMatch(
        /\b(priority|slaMinutes|operatorId|machineId|attemptCount)\b/,
      );
      expect(source.text).not.toMatch(/'(QUEUED|RUNNING|BLOCKED|FAILED|CLAIMED|RETRYING|ALL)'/);
    }
  });

  it('computes no page number, offset or total', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\boffset\b/);
      expect(source.text).not.toMatch(/\bpageNumber\b|\btotalPages\b|\btotalCount\b/);
    }
  });

  it('sorts nothing but the query key it must keep canonical', () => {
    // One `.sort()` exists, and it is on the *cache key's* status list so two
    // spellings of one selection address one entry. Nothing sorts rows: the
    // server's `(createdAt, id)` order is the order the cursor pages by, and a
    // second client sort would put the visible list out of step with it.
    const sorts = code.filter((source) => /\.sort\(/.test(source.text));
    expect(sorts.map((source) => source.path.split('/').pop())).toEqual([
      'production-queue-keys.ts',
    ]);
  });
});

describe('failure classification', () => {
  it('never branches on a server message', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/normalized\.message/);
      expect(source.text).not.toMatch(/\.message\.(includes|match|startsWith|toLowerCase)/);
    }
  });

  it('classifies the rejected cursor on the published code, not on prose', () => {
    const failure = code.find((source) => source.path.endsWith('production-queue-failure.ts'));
    expect(failure?.text).toContain('PRODUCTION_CURSOR_INVALID');
    expect(failure?.text).toContain('httpStatus');
  });

  it('retries nothing automatically', () => {
    // `787:149` forbids an automatic retry of a refused command outright, and
    // an Admin read must not loop against a private endpoint either.
    const query = code.find((source) => source.path.endsWith('use-production-queue-query.ts'));
    expect(query?.text).toContain('retry: false');
    for (const source of code) {
      expect(source.text).not.toMatch(/setInterval|setTimeout|refetchInterval:\s*\d/);
    }
  });

  it('never flushes the cache wholesale', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\.clear\(\)/);
      expect(source.text).not.toMatch(/invalidateQueries\(\s*\)/);
      expect(source.text).not.toMatch(/resetQueries\(\s*\)/);
    }
    // The one reset that exists is scoped to this feature's own filtered entry.
    const query = code.find((source) => source.path.endsWith('use-production-queue-query.ts'));
    expect(query?.text).toMatch(
      /resetQueries\(\{ queryKey: productionQueueKeys\.list\(filters\) \}\)/,
    );
  });
});

describe('the approved narrow viewport (`789:85`, `789:157`)', () => {
  it('hides exactly one column, and it is the approval snapshot', () => {
    // Every `display: none` in the feature must belong to the approval column —
    // the table cells, the colgroup track and the skeleton bar that stands for
    // it. A column quietly added to the reduction later fails here rather than
    // in a review.
    const chunks = stylesheet.split('display: none');
    expect(chunks.length).toBeGreaterThan(1);
    for (const preceding of chunks.slice(0, -1)) {
      expect(preceding.slice(-240)).toMatch(/approval/);
    }
  });

  it('keeps job, order, status, both timestamps and the row link at every width', () => {
    for (const survivor of [
      '.production-table__job',
      '.production-table__order',
      '.production-table__col--status',
      '.production-table__col--created',
      '.production-table__col--milestone',
      '.production-table__open',
    ]) {
      expect(stylesheet).toContain(survivor);
    }
    // No column is parked behind an overflow menu either, and nothing scrolls
    // sideways: `789:159` rules both out by name.
    expect(stylesheet).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });
});
