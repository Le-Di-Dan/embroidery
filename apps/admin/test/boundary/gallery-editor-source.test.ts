/**
 * The gallery editor's source boundaries (`APP11-A02`).
 *
 * What a rendered test cannot prove: that the whole capability lives behind one
 * route, that it reaches the API only through the operations this checkpoint
 * owns, that no storefront read is opened from an Admin screen, that no control
 * exists for a lifecycle transition the contract does not publish, and that no
 * dependency was added to make ordering work.
 *
 * These are structural facts about the tree, so they are asserted against the
 * source rather than through a DOM that could only ever show the absence of a
 * control on one rendered state.
 *
 * The responsive assertions are made against the stylesheet, which is the
 * smallest method that can settle them in Jest: jsdom applies no CSS. The live
 * 1440/390 evidence is captured separately, in the browser, and recorded in the
 * completion report.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const ADMIN_SRC = join(__dirname, '..', '..', 'src');
const APP_DIR = join(ADMIN_SRC, 'app', '(protected)');
const FEATURE_DIR = join(ADMIN_SRC, 'features', 'gallery-editor');
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

/** Exactly the operations `APP11-A02` consumes, and nothing beside them. */
const OWNED_OPERATIONS = [
  'adminGalleryEntryCreate',
  'adminGalleryEntryDetail',
  'adminGalleryEntryUpdate',
  'adminGalleryEntryReplaceAssets',
  'adminGalleryEntryPublish',
  'adminGalleryEntryUnpublish',
  'adminGalleryAssetCreate',
  'adminGalleryAssetPreview',
  'adminAssetList',
  'adminProductList',
  'adminProductDetail',
] as const;

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
const allCode = code.map((source) => source.text).join('\n');

const stylesheet = collectFiles(join(FEATURE_DIR, 'styles'), /\.scss$/)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

describe('the one route A02 owns', () => {
  it('adds exactly one Admin segment, and it is the editor', () => {
    expect(existsSync(join(APP_DIR, 'gallery', '[entryId]', 'page.tsx'))).toBe(true);
    // Creation is a bootstrap on the list, because the server owns the id the
    // editor is addressed by; media and publication are panels inside it.
    expect(existsSync(join(APP_DIR, 'gallery', 'new'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'gallery', '[entryId]', 'edit'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'gallery', '[entryId]', 'media'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'gallery', '[entryId]', 'publication'))).toBe(false);
    expect(
      readdirSync(join(APP_DIR, 'gallery', '[entryId]'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    ).toEqual([]);
  });

  it('lives inside the authenticated shell, not beside it', () => {
    // The segment is under `(protected)`, whose layout resolves the session.
    // This feature creates no auth path of its own.
    expect(allCode).not.toMatch(/getServerSession|cookies\(\)|redirect\('\/login'\)/);
  });

  it('keeps both gallery route files thin', () => {
    for (const route of ['gallery/page.tsx', 'gallery/[entryId]/page.tsx']) {
      const text = readFileSync(join(APP_DIR, route), 'utf8');
      expect(text).not.toMatch(/useQuery|useMutation|useState|adminGallery|expectedUpdatedAt/);
    }
  });
});

describe('the generated client boundary', () => {
  it('consumes exactly the operations this checkpoint owns', () => {
    const surface = apiClient as Record<string, unknown>;
    for (const operation of OWNED_OPERATIONS) {
      expect(typeof surface[operation]).toBe('function');
      expect(allCode).toContain(operation);
    }
  });

  it('opens no storefront read from an Admin screen', () => {
    // An Admin screen reading the public view of the same rows would be a
    // second, unauthenticated source of truth for what the operator is editing.
    expect(allCode).not.toMatch(/publicGallery|publicSitemap|publicProduct/);
  });

  it('reaches the API through no other transport', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\bfetch\s*\(/);
      expect(source.text).not.toMatch(/from\s+['"]axios['"]/);
      expect(source.text).not.toMatch(/\/api\/admin/);
    }
  });

  it('never deep-imports the generated tree', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/@embroidery\/api-client\/.*generated/);
    }
  });

  it('touches object storage in no way at all', () => {
    // The only address anywhere is a browser object URL over authenticated
    // bytes. There is no bucket, no key, no signed link and no provider SDK.
    expect(allCode).not.toMatch(/minio|amazonaws|s3Client|presign|signedUrl|storageKey|bucket/i);
  });
});

describe('the capability the contract does not have', () => {
  it('offers no archive or restore, because no operation performs one', () => {
    expect(allCode).not.toMatch(/adminGalleryEntryArchive|adminGalleryEntryRestore/);
    expect(allCode).not.toMatch(/\bonArchive\b|\bonRestore\b/);
  });

  it('offers no asset deletion, because no operation performs one', () => {
    expect(allCode).not.toMatch(/adminGalleryAssetDelete|adminAssetDelete/);
  });

  it('has no per-image alt anywhere — there is no field to fill', () => {
    // `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED`: alt is composed from the entry's
    // title and the image's position at render time, and the contract publishes
    // no `altText`. An input for one would collect a value with nowhere to go.
    expect(allCode).not.toMatch(/\baltText\b/);
    const altSources = code.filter((source) => /alt[:=]/.test(source.text));
    for (const source of altSources) {
      expect(source.text).not.toMatch(/onChange=\{[^}]*alt/i);
    }
  });

  it('never chooses a lane, a status or a rendition for a prepared image', () => {
    const prepare = code.find((source) => source.path.endsWith('gallery-asset.service.ts'));
    expect(prepare?.text).toContain('sourceAssetId');
    expect(prepare?.text).toContain('expectedSourceUpdatedAt');
    // The preparation request carries those two values and nothing else.
    expect(prepare?.text).not.toMatch(/classification:|kind:|status:|derivativeKind/);
  });

  it('added no dependency to make ordering or dialogs work', () => {
    expect(allCode).not.toMatch(/dnd-kit|react-beautiful-dnd|draggable|onDragStart|sortablejs/i);
    // `@embroidery/ui` joined the list with the Product Owner brand-system
    // directive. It is a workspace package holding the approved Nét Thêu symbol
    // — one `<svg>` built from one geometry source — and it is deliberately not
    // the kind of thing this guard exists to catch: no drag-and-drop, no dialog
    // primitive, no icon library, no third-party capability. The guard keeps its
    // teeth because the list is still exact.
    const manifest = JSON.parse(readFileSync(join(ADMIN_SRC, '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@embroidery/api-client',
      '@embroidery/contracts',
      '@embroidery/design-document',
      '@embroidery/design-engine',
      '@embroidery/styles',
      '@embroidery/ui',
      '@tanstack/react-query',
      'axios',
      'next',
      'react',
      'react-dom',
      'zustand',
    ]);
  });
});

describe('server state and concurrency', () => {
  it('keeps server state in TanStack Query, never in Zustand', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/zustand|createStore/);
    }
  });

  it('never remembers a concurrency token outside the cached record', () => {
    // The token is read from the authoritative record at command time. A token
    // held in local state is one that survives the response superseding it.
    for (const source of code) {
      expect(source.text).not.toMatch(/useState[^;]*expectedUpdatedAt/);
      expect(source.text).not.toMatch(/useRef[^;]*expectedUpdatedAt/);
    }
  });

  it('retries no mutation automatically', () => {
    // A retry would re-send a token that is already known stale — or prepare a
    // second image, since preparation has no idempotency.
    const mutationModules = code.filter((source) => source.text.includes('useMutation'));
    expect(mutationModules.length).toBeGreaterThan(0);
    for (const source of mutationModules) {
      expect(source.text).toContain('retry: false');
    }
  });

  it('polls nothing and never flushes the cache wholesale', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/setInterval|refetchInterval:\s*\d/);
      expect(source.text).not.toMatch(/\.clear\(\)/);
      expect(source.text).not.toMatch(/invalidateQueries\(\s*\)/);
      expect(source.text).not.toMatch(/resetQueries\(\s*\)/);
    }
  });

  it('invalidates the list root the list feature actually reads under', () => {
    // Two spellings of one cache key is how an invalidation silently stops
    // matching and an operator returns to a stale list.
    const mutations = code.filter((source) => source.text.includes('invalidateQueries'));
    expect(mutations.length).toBeGreaterThan(0);
    for (const source of mutations) {
      expect(source.text).toContain('galleryListKeys.lists()');
      expect(source.text).not.toMatch(/\['admin',\s*'gallery',\s*'list'/);
    }
  });

  it('revokes every object URL it creates, and stores none', () => {
    const preview = code.find((source) => source.path.endsWith('use-gallery-asset-preview.ts'));
    expect(preview?.text).toContain('URL.createObjectURL');
    expect(preview?.text).toContain('URL.revokeObjectURL');
    for (const source of code) {
      expect(source.text).not.toMatch(/localStorage|sessionStorage/);
    }
  });
});

describe('failure handling', () => {
  it('never branches on, or renders, a server message', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/normalized\.message/);
      expect(source.text).not.toMatch(/\.message\.(includes|match|startsWith|toLowerCase)/);
      expect(source.text).not.toMatch(/requestId/);
    }
  });

  it('treats only the exact domain code as a reloadable conflict', () => {
    const failure = code.find((source) => source.path.endsWith('gallery-editor-failure.ts'));
    expect(failure?.text).toContain('GALLERY_ENTRY_VERSION_CONFLICT');
    // A bare 409 is four different things, and reloading repairs only one.
    expect(failure?.text).not.toMatch(/httpStatus === 409/);
  });
});

describe('the frozen artifacts', () => {
  it('changes no backend, worker, database or generated file', () => {
    // A frontend checkpoint that edited a generated client or a migration would
    // be a contract change wearing a UI checkpoint's name.
    for (const forbidden of [
      join(REPO_ROOT, 'packages', 'api-client', 'src', 'generated'),
      join(REPO_ROOT, 'packages', 'database', 'migrations'),
    ]) {
      expect(existsSync(forbidden)).toBe(true);
    }
    // Asserted by `git status` in the completion report; what is checked here is
    // that nothing in this feature reaches across those boundaries at all.
    expect(allCode).not.toMatch(/drizzle|@nestjs|packages\/database|apps\/api/);
  });
});

describe('the approved responsive structure (`868:909`, `870:1368`)', () => {
  it('stacks at mobile and only becomes two columns at the shell breakpoint', () => {
    expect(stylesheet).toMatch(/\.gallery-editor__body[\s\S]{0,200}flex-direction:\s*column/);
    expect(stylesheet).toMatch(
      /@media \(min-width: \$gallery-editor-breakpoint\)[\s\S]{0,300}flex-direction:\s*row/,
    );
  });

  it('lets long content shrink rather than widening the page', () => {
    // The usual cause of horizontal overflow at 390 is a flex item that refuses
    // to shrink below its content width.
    for (const rule of [
      /\.gallery-editor__column[\s\S]{0,200}min-width:\s*0/,
      /\.gallery-editor__title[\s\S]{0,300}overflow-wrap:\s*anywhere/,
      /\.gallery-picker__title[\s\S]{0,200}overflow-wrap:\s*anywhere/,
    ]) {
      expect(stylesheet).toMatch(rule);
    }
    expect(stylesheet).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });

  it('keeps every control at or above the minimum touch target', () => {
    expect(stylesheet).toMatch(/min-height:\s*styles\.\$size-touch-target-min/);
  });

  it('bounds the dialog so its footer is always reachable', () => {
    expect(stylesheet).toMatch(/\.gallery-dialog\b[\s\S]{0,400}max-height:\s*100%/);
  });

  it('uses tokens rather than literal colours', () => {
    expect(stylesheet).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(stylesheet).not.toMatch(/rgba?\(/);
  });

  it('states a requirement in text as well as in colour', () => {
    // `[data-met]` only tints a distinction the row's own symbol already makes.
    expect(stylesheet).toMatch(/\[data-met='true'\]/);
    const panel = code.find((source) => source.path.endsWith('gallery-publication-panel.tsx'));
    expect(panel?.text).toContain('data-met');
    expect(panel?.text).toContain('aria-hidden');
  });
});
