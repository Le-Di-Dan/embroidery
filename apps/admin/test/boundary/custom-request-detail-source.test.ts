/**
 * `APP5-A02` source boundaries.
 *
 * What a rendered test cannot prove: that no request endpoint was invented, that
 * no classifier branches on message text, that the screen reaches the API only
 * through the generated operations, that no object URL is persisted anywhere,
 * and that the design rows this checkpoint consumes are rows it was authorised
 * to build against.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'custom-request-detail');
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

function collectSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectSources(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const sources = collectSources(FEATURE_DIR).map((path) => ({
  path: path.replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8'),
}));

/** Comments explain what a file deliberately avoids; rules must not match them. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const code = sources.map((source) => ({ ...source, text: stripComments(source.text) }));

describe('the generated client boundary', () => {
  it('consumes exactly the four operations APP5-A02 owns', () => {
    for (const operation of [
      'adminCustomRequestDetail',
      'adminCustomRequestAssetGet',
      'adminCustomRequestAppendNote',
      'adminCustomRequestTransition',
    ]) {
      expect(typeof (apiClient as Record<string, unknown>)[operation]).toBe('function');
      expect(code.some((source) => source.text.includes(operation))).toBe(true);
    }
  });

  it('calls no operation this checkpoint does not own', () => {
    // The queue read in particular: A02 invalidates the queue's cache key, and
    // reaching for its operation as well would make the detail screen a second
    // place the queue is fetched.
    for (const source of code) {
      expect(source.text).not.toMatch(/adminCustomRequestList\s*\(/);
    }
  });

  it('reaches the API only through the generated operations', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\bfetch\s*\(/);
      expect(source.text).not.toMatch(/\baxios\b/i);
      expect(source.text).not.toMatch(/from '@embroidery\/api-client\/.*generated/);
      // No hand-assembled request path: the generated operation owns the URL.
      expect(source.text).not.toMatch(/['"`]\/api\/admin\//);
    }
  });
});

describe('private evidence', () => {
  it('never persists or serialises an object URL', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/localStorage/);
      expect(source.text).not.toMatch(/sessionStorage/);
      expect(source.text).not.toMatch(/document\.cookie/);
      expect(source.text).not.toMatch(/console\.(log|info|warn|error)/);
    }
  });

  it('revokes every object URL it creates', () => {
    const creators = code.filter((source) => source.text.includes('createObjectURL'));
    expect(creators).toHaveLength(1);
    for (const source of creators) {
      expect(source.text).toContain('revokeObjectURL');
    }
  });

  it('offers no download affordance for a private asset', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\bdownload\b/);
    }
  });
});

describe('failure classification', () => {
  it('never branches on a server message', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/normalized\.message/);
      expect(source.text).not.toMatch(/\.message\.includes/);
    }
  });

  it('never renders a normalized error field to the operator', () => {
    for (const source of code) {
      if (!source.path.endsWith('.tsx')) continue;
      expect(source.text).not.toMatch(/\{[^}]*normalized[^}]*\}/);
      expect(source.text).not.toMatch(/error\.message/);
    }
  });
});

describe('the moderation surface', () => {
  it('never builds a payload naming an APP6 target', () => {
    // The status label table and the action matrix *do* name the APP6 states —
    // truthfully, so a QUOTED request is labelled rather than folded into an
    // APP5 state, and so the matrix can map it to no actions at all. What must
    // never happen is one of them reaching a request body, so the rule is scoped
    // to the files that build one.
    const payloadBuilders = code.filter(
      (source) =>
        source.path.endsWith('moderation-command.ts') ||
        source.path.includes('/services/') ||
        source.path.includes('dialog'),
    );
    expect(payloadBuilders.length).toBeGreaterThan(0);
    for (const source of payloadBuilders) {
      for (const forbidden of [
        'QUOTED',
        'QUOTE_ACCEPTED',
        'DIGITIZING',
        'DESIGN_REVIEW',
        'APPROVED',
      ]) {
        expect(source.text).not.toContain(forbidden);
      }
    }
  });

  it('offers no APP6 action label on any control', () => {
    const actionModel = code.find((source) => source.path.endsWith('moderation-actions.ts'));
    // Every APP6 status is present as a key mapping to `NO_ACTIONS` and nowhere
    // else: no label, no surface, no target.
    for (const status of ['QUOTED', 'QUOTE_ACCEPTED', 'DIGITIZING', 'DESIGN_REVIEW', 'APPROVED']) {
      expect(actionModel?.text).toContain(`${status}: NO_ACTIONS`);
    }
  });

  it('never offers PAUSE as a note kind an operator can pick', () => {
    // The label table renders a historical PAUSE note truthfully; no dialog may
    // put it in a payload.
    const commandModel = code.find((source) => source.path.endsWith('moderation-command.ts'));
    expect(commandModel?.text).not.toContain('PAUSE');
  });

  it('never sends a server-owned field', () => {
    for (const source of code) {
      for (const field of ['expectedFrom', 'actorKind:', 'correlationId']) {
        expect(source.text).not.toContain(field);
      }
    }
  });
});

describe('the design rows this checkpoint builds against', () => {
  const registry = readFileSync(join(REPO_ROOT, 'docs', 'design', 'FIGMA_DESIGN_INDEX.md'), 'utf8');

  it('are all approved for implementation', () => {
    const rows = registry.split('\n').filter((line) => line.includes('FIG-APP5-A02-'));
    expect(rows.length).toBeGreaterThanOrEqual(14);
    for (const row of rows) {
      expect(row).toContain('APPROVED_FOR_IMPLEMENTATION');
    }
  });

  it('cover every node the feature cites', () => {
    const cited = new Set(
      sources.flatMap((source) => [...source.text.matchAll(/`(\d{3}:\d+)`/g)].map((m) => m[1])),
    );
    expect(cited.size).toBeGreaterThan(0);
    for (const node of cited) {
      expect(registry).toContain(`| ${node as string} |`);
    }
  });
});

describe('file sizes', () => {
  it('keeps every runtime source within the 400-line limit', () => {
    for (const source of sources) {
      expect(source.text.split('\n').length).toBeLessThanOrEqual(400);
    }
  });
});
