/**
 * `APP11-A01` source boundaries, and the A01/A02 ownership line.
 *
 * What a rendered test cannot prove: that the screen reaches the API only
 * through the two generated operations this checkpoint owns, that no mutation
 * hook exists anywhere in the feature, that no second read is opened to enrich
 * a row, and that no control addresses the editor route `APP11-A02` has not
 * built yet.
 *
 * ### Scoped so A02 does not have to weaken it
 *
 * The route assertions are deliberately about **A01's own feature and segment**,
 * not about the repository forever. `APP11-A02` will legitimately create
 * `/gallery/[entryId]` and will legitimately import the six withheld
 * operations; a permanent repository-wide absence assertion would have to be
 * deleted on the very next checkpoint, which makes it a speed bump rather than
 * a guard. What stays true after A02 is the shape asserted here: the
 * *gallery-list* feature owns a read-only list, and the editor lives somewhere
 * else.
 *
 * The responsive assertions are made against the stylesheet rather than through
 * a browser, which is the smallest method that can settle them in Jest: jsdom
 * applies no CSS. The live 1440/390 evidence is captured separately, in the
 * browser, and recorded in the completion report.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const APP_DIR = join(__dirname, '..', '..', 'src', 'app', '(protected)');
const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'gallery-list');

/** The six operations `APP11-A02` owns and A01 must not reach. */
const A02_OPERATIONS = [
  'adminGalleryEntryCreate',
  'adminGalleryEntryDetail',
  'adminGalleryEntryUpdate',
  'adminGalleryEntryReplaceAssets',
  'adminGalleryEntryPublish',
  'adminGalleryEntryUnpublish',
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

const stylesheet = collectFiles(join(FEATURE_DIR, 'styles'), /\.scss$/)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

describe('the route A01 owns', () => {
  it('adds exactly one Admin segment, and it is /gallery', () => {
    expect(existsSync(join(APP_DIR, 'gallery', 'page.tsx'))).toBe(true);
    // The canonical address, with no alias beside it.
    expect(existsSync(join(APP_DIR, 'admin', 'gallery'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'collections'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'library'))).toBe(false);
  });

  it('creates no editor or create segment beneath it', () => {
    // `APP11-A02` builds these. A01 shipping either one would be a screen with
    // no content, or a form with no operation behind it.
    const segments = readdirSync(join(APP_DIR, 'gallery'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(segments).toEqual([]);
  });

  it('keeps the route file thin — it composes and nothing else', () => {
    const route = readFileSync(join(APP_DIR, 'gallery', 'page.tsx'), 'utf8');
    expect(route).toContain('GalleryListScreen');
    expect(route).not.toMatch(/useQuery|useState|adminGallery/);
  });
});

describe('the generated client boundary', () => {
  it('consumes exactly the two operations APP11-A01 owns', () => {
    const surface = apiClient as Record<string, unknown>;
    expect(typeof surface['adminGalleryEntryList']).toBe('function');
    expect(typeof surface['adminGalleryAssetPreview']).toBe('function');
    expect(code.some((source) => source.text.includes('adminGalleryEntryList'))).toBe(true);
    expect(code.some((source) => source.text.includes('adminGalleryAssetPreview'))).toBe(true);
  });

  it('withholds every A02 operation from the curated boundary', () => {
    // The module graph, not a convention: A01 could not call these even if a
    // component tried, because they are not exported to this app at all.
    const surface = apiClient as Record<string, unknown>;
    for (const operation of A02_OPERATIONS) {
      expect(surface[operation]).toBeUndefined();
    }
    // `APP11-B03A`'s asset creation has no Admin surface yet either.
    expect(surface['adminGalleryAssetCreate']).toBeUndefined();
  });

  it('reaches the API through no other transport', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\bfetch\s*\(/);
      expect(source.text).not.toMatch(/from\s+['"]axios['"]/);
      // The copy module is exempt from the path rule and only it: it prints the
      // endpoint on screen as an operator-facing annotation, which is display
      // text, not a URL anything requests.
      if (source.path.endsWith('gallery-list-copy.ts')) continue;
      expect(source.text).not.toMatch(/\/api\/admin/);
    }
  });

  it('never deep-imports the generated tree', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/@embroidery\/api-client\/.*generated/);
    }
  });

  it('opens no second read to enrich a row', () => {
    // `linkedProductId` has no public-safe label beside it, and resolving one
    // per row is the N+1 the design package refused. The row carries a signal.
    for (const source of code) {
      for (const operation of ['adminProductDetail', 'adminProductList', 'adminAssetDetail']) {
        expect(source.text).not.toContain(operation);
      }
    }
  });

  it('consumes no public gallery or sitemap operation', () => {
    // An Admin screen reading the storefront's view of the same rows would be a
    // second, unauthenticated source of truth for this list.
    for (const source of code) {
      expect(source.text).not.toMatch(/publicGallery|publicSitemap/);
    }
  });
});

describe('no A02 capability starts here', () => {
  it('names no A02 operation anywhere in the feature', () => {
    for (const source of code) {
      for (const operation of A02_OPERATIONS) {
        expect(source.text).not.toContain(operation);
      }
    }
  });

  it('declares no mutation of any kind', () => {
    for (const source of code) {
      expect(source.text).not.toContain('useMutation');
      expect(source.text).not.toMatch(/\.(post|put|patch|delete)\s*\(/);
    }
  });

  it('builds no create form, modal or dialog', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/<form\b/);
      expect(source.text).not.toMatch(/<dialog\b|role="dialog"/);
      expect(source.text).not.toMatch(/createPortal/);
    }
    // No component file is a form or a dialog either.
    const names = code.map((source) => source.path.split('/').pop() ?? '');
    expect(names.filter((name) => /form|dialog|modal|create|editor/.test(name))).toEqual([]);
  });

  it('ships no navigation to a route that does not exist', () => {
    for (const source of code) {
      // Nothing addresses the editor: no template literal, no concatenation, no
      // route helper. `ADMIN_GALLERY_ROUTE` is the list itself and is used by
      // the shell navigation.
      expect(source.text).not.toMatch(/\/gallery\/\$\{/);
      expect(source.text).not.toMatch(/['"`]\/gallery\/[^'"`]/);
      expect(source.text).not.toMatch(/entryId/);
    }
    // The only `next/link` in the feature is the sign-in recovery, which points
    // at a route that has existed since APP1.
    const links = code.filter((source) => source.text.includes("from 'next/link'"));
    expect(links.map((source) => source.path.split('/').pop())).toEqual([
      'gallery-list-failure-state.tsx',
    ]);
  });

  it('makes no row interactive', () => {
    const rowSources = code.filter((source) =>
      /gallery-list-table\.tsx|gallery-card-list\.tsx/.test(source.path),
    );
    expect(rowSources).toHaveLength(2);
    for (const source of rowSources) {
      // No anchor, no button, no clickable div, no keyboard target: a row is
      // data until A02 gives it a destination.
      expect(source.text).not.toMatch(/onClick|onKeyDown|tabIndex|<Link|<button|<a\b/);
    }
  });
});

describe('no unsupported capability', () => {
  it('carries no vocabulary the gallery model does not have', () => {
    // `gallery_entries` has no category, style or need column — which is why
    // `APP11-D01` removed the category filter from the approved frame — and the
    // list contract publishes no description, SEO field or timestamp.
    for (const source of code) {
      expect(source.text).not.toMatch(
        /\b(categorySlug|styleSlug|needSlug|seoTitle|seoDescription)\b/,
      );
      expect(source.text).not.toMatch(/'(ALL|SCHEDULED|HIDDEN|PENDING_REVIEW|DELETED)'/);
      // `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED`: there is no such field to read.
      expect(source.text).not.toMatch(/\baltText\b/);
    }
  });

  it('computes no page number, offset or total', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\boffset\b/);
      expect(source.text).not.toMatch(/\bpageNumber\b|\btotalPages\b|\btotalCount\b/);
    }
  });

  it('sorts and reorders nothing', () => {
    // The server's `(display_order, id)` order is the order the cursor pages by.
    // A client sort would put the visible list out of step with it, and a drag
    // handle would be an edit this screen has no operation for.
    for (const source of code) {
      expect(source.text).not.toMatch(/\.sort\(/);
      expect(source.text).not.toMatch(/draggable|onDrag|dnd/i);
    }
  });

  it('stores no server state in Zustand and no filter outside the URL', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/zustand|createStore/);
    }
    const filters = code.find((source) => source.path.endsWith('use-gallery-list-filters.ts'));
    expect(filters?.text).toContain('router.replace');
    expect(filters?.text).toContain('scroll: false');
  });
});

describe('failure classification', () => {
  it('never branches on a server message', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/normalized\.message/);
      expect(source.text).not.toMatch(/\.message\.(includes|match|startsWith|toLowerCase)/);
    }
  });

  it('retries nothing automatically and polls nothing', () => {
    const query = code.find((source) => source.path.endsWith('use-gallery-list-query.ts'));
    expect(query?.text).toContain('retry: false');
    for (const source of code) {
      expect(source.text).not.toMatch(/setInterval|refetchInterval:\s*\d/);
    }
  });

  it('never flushes the cache wholesale', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\.clear\(\)/);
      expect(source.text).not.toMatch(/invalidateQueries\(\s*\)/);
      expect(source.text).not.toMatch(/resetQueries\(\s*\)/);
    }
  });

  it('revokes every object URL it creates', () => {
    const cover = code.find((source) => source.path.endsWith('use-gallery-cover-preview.ts'));
    expect(cover?.text).toContain('URL.createObjectURL');
    expect(cover?.text).toContain('URL.revokeObjectURL');
    // The handle never leaves the hook.
    for (const source of code) {
      expect(source.text).not.toMatch(/localStorage|sessionStorage/);
    }
  });
});

describe('the approved responsive structure (`866:905`, `867:946`)', () => {
  it('presents exactly one of the table and the card list at any width', () => {
    expect(stylesheet).toMatch(/\.gallery-collection__desktop[\s\S]{0,200}display:\s*none/);
    expect(stylesheet).toMatch(/\.gallery-collection__mobile[\s\S]{0,400}display:\s*none/);
  });

  it('hides no essential fact behind an overflow menu and scrolls nothing sideways', () => {
    // Every fact the table shows, the card shows: order and status included.
    for (const survivor of [
      '.gallery-card__title',
      '.gallery-card__slug',
      '.gallery-card__facts',
      '.gallery-card__status',
    ]) {
      expect(stylesheet).toContain(survivor);
    }
    expect(stylesheet).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });

  it('lets a long title shrink rather than widening the card', () => {
    // The usual cause of horizontal overflow at 390 is a flex item that refuses
    // to shrink below its content width.
    expect(stylesheet).toMatch(/\.gallery-card__info[\s\S]{0,300}min-width:\s*0/);
    expect(stylesheet).toMatch(/\.gallery-card__title[\s\S]{0,300}overflow-wrap:\s*anywhere/);
  });

  it('uses tokens rather than literal colours', () => {
    expect(stylesheet).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(stylesheet).not.toMatch(/rgba?\(/);
  });
});
