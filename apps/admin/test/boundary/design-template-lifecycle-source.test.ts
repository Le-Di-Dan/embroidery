/**
 * `APP3-A04` source boundaries.
 *
 * What a rendered test cannot prove: that no readiness endpoint was invented,
 * that no classifier branches on message text, that the screen reaches the API
 * only through the generated operations, and that the five design rows this
 * checkpoint consumes are the five it was authorised to approve.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'design-template-lifecycle');
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
  it('consumes exactly the five operations APP3-A04 owns', () => {
    for (const operation of [
      'adminDesignTemplateDetail',
      'adminDesignTemplatePublish',
      'adminDesignTemplateUnpublish',
      'adminDesignTemplateArchive',
      'adminDesignTemplateRestore',
    ]) {
      expect(typeof (apiClient as Record<string, unknown>)[operation]).toBe('function');
      expect(code.some((source) => source.text.includes(operation))).toBe(true);
    }
  });

  it('reaches the API only through the generated operations', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\bfetch\s*\(/);
      expect(source.text).not.toMatch(/\baxios\b/);
      expect(source.text).not.toMatch(/from '@embroidery\/api-client\/.*generated/);
    }
  });

  it('never hard-codes an endpoint path', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/['"`]\/api\//);
      expect(source.text).not.toMatch(/https?:\/\//);
    }
  });

  it('invents no readiness endpoint — readiness is computed, never fetched', () => {
    // The rule is about *network* reads, not about the word: `evaluateReadiness`
    // is a pure local function and naming it must not trip this.
    for (const source of code) {
      expect(source.text).not.toMatch(/adminDesignTemplate(Readiness|PublishCheck|Preflight)/);
      expect(source.text).not.toMatch(/useQuery\([\s\S]{0,200}readiness/i);
    }
    expect((apiClient as Record<string, unknown>)['adminDesignTemplateReadiness']).toBeUndefined();

    // Exactly two `queryFn`s exist in this feature: the Template detail and the
    // Product placement. A third would be a read nobody authorised.
    const queryFns = code.reduce(
      (total, source) => total + (source.text.match(/queryFn:/g) ?? []).length,
      0,
    );
    expect(queryFns).toBe(2);
  });

  it('consumes no operation outside its two reads and four commands', () => {
    for (const forbidden of [
      'publicDesignTemplate',
      'publicDesignSession',
      'adminAssetUpload',
      'adminDesignTemplateSaveDocument',
      'adminDesignTemplateAssignScope',
      'adminDesignTemplateCreate',
      'adminDesignTemplateList',
    ]) {
      for (const source of code) {
        expect(source.text).not.toContain(forbidden);
      }
    }
  });
});

describe('failure classification', () => {
  it('branches on the transport status, never on message text', () => {
    const classifier = code.find((source) => /lifecycle-failure\.ts$/.test(source.path));
    expect(classifier).toBeDefined();

    // The classifying function itself, not the whole file: the error class
    // legitimately passes `normalized.message` to `super()` so a thrown value
    // has a message at all, and that must not be mistaken for a branch on it.
    const classify = /export function classifyLifecycleFailure\(([\s\S]*?)\n}/.exec(
      classifier?.text ?? '',
    );
    expect(classify).not.toBeNull();
    expect(classify?.[1]).toMatch(/normalized\.httpStatus/);
    // Never the human-readable text, and never a guessed domain code.
    expect(classify?.[1]).not.toMatch(/\.message/);
    expect(classifier?.text).not.toMatch(/DESIGN_TEMPLATE_[A-Z_]+/);
  });

  it('renders no server message anywhere', () => {
    for (const source of code) {
      // Copy comes from the bounded catalogue; `normalized.message` is carried
      // for logging shape only and must never reach JSX.
      expect(source.text).not.toMatch(/\{\s*\w*[Ee]rror\.message\s*\}/);
      expect(source.text).not.toMatch(/\{\s*normalized\.message\s*\}/);
    }
  });

  it('never replays a failed command', () => {
    const command = code.find((source) => /use-lifecycle-command\.ts$/.test(source.path));
    expect(command).toBeDefined();
    expect(command?.text).toMatch(/retry:\s*false/);
    // The only re-read is the single authoritative one after a conflict.
    expect((command?.text.match(/fetchLifecycleDetail\(/g) ?? []).length).toBe(1);
  });
});

describe('the design authority', () => {
  const registry = readFileSync(join(REPO_ROOT, 'docs', 'design', 'FIGMA_DESIGN_INDEX.md'), 'utf8');
  const A04_ROWS = [
    'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-READY',
    'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-GUARDFAIL',
    'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-PUBLISHCONFIRM',
    'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-ARCHIVE',
    'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-RESTOREBLOCKED',
  ];

  it('approves exactly the five A04 rows', () => {
    expect(A04_ROWS).toHaveLength(5);
    for (const id of A04_ROWS) {
      const row = registry.split('\n').find((line) => line.startsWith(`| ${id} `));
      expect(row).toBeDefined();
      expect(row).toContain('APPROVED_FOR_IMPLEMENTATION');
      expect(row).toContain('APP3-A04 §0 operator review');
    }
  });

  it('approves nothing beyond those five under its own evidence', () => {
    // The assertion is about *this* checkpoint's approval, not the registry's
    // global state: `FIG-STUDIO-EDITING-TABLET-1024` was already approved by
    // `APP3-A01 §0` as a responsive reference, so a blanket "no Studio row is
    // approved" would fail on a row A04 never touched.
    const approvedHere = registry
      .split('\n')
      .filter((line) => line.includes('APP3-A04 §0 operator review'))
      .map((line) => line.split('|')[1]?.trim());

    expect(approvedHere.sort()).toEqual([...A04_ROWS].sort());
    expect(approvedHere.some((id) => id?.startsWith('FIG-STUDIO-'))).toBe(false);
  });
});

describe('the route boundary', () => {
  it('builds the publication link from the one route authority', () => {
    const routeModule = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'src',
        'features',
        'design-templates',
        'model',
        'design-template-route.ts',
      ),
      'utf8',
    );
    expect(routeModule).toContain('adminDesignTemplatePublicationRoute');
    expect(routeModule).toMatch(/\/publication`/);

    // The feature never spells the URL itself.
    for (const source of code) {
      expect(source.text).not.toMatch(/['"`]\/design-templates/);
    }
  });
});

describe('scope boundaries', () => {
  it('adds no TEMPLATE_SOURCE intake and no byte delivery', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/TEMPLATE_SOURCE/);
      expect(source.text).not.toMatch(/FormData|createObjectURL|Blob\b/);
    }
  });

  it('uses no Zustand store', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/zustand/i);
    }
  });
});
