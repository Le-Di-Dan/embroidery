/**
 * The Admin gallery **list** feature's source boundaries, and the line between
 * it and the editor.
 *
 * What a rendered test cannot prove: that the screen reaches the API only
 * through the two generated operations this feature owns, that no mutation hook
 * exists anywhere in it, that no second read is opened to enrich a row, and that
 * the editor address is built in exactly one place rather than spelled out at
 * every call site.
 *
 * ### Scoped so A02 extended it rather than deleting it
 *
 * `APP11-A01` wrote these assertions about **its own feature and segment**
 * rather than about the repository forever, precisely so that the checkpoint
 * that built the editor would not have to delete them. `APP11-A02` has now
 * built `/gallery/[entryId]` and consumes the seven operations A01 withheld, so
 * four assertions moved: the segment now has one child, the list's rows link to
 * it, the curated boundary publishes the editor's operations, and the create
 * action is rendered.
 *
 * Everything else is unchanged, and what remains asserted is the shape that was
 * ever really the point: **this feature** owns a read-only list. It opens no
 * mutation, builds no form or dialog, resolves no second read per row, and
 * reaches no storefront operation — the editor lives somewhere else and this
 * feature does not import it.
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

/**
 * The seven operations the **editor** owns, which this feature must not reach.
 *
 * They are on the curated boundary from `APP11-A02` onward, so the guarantee is
 * no longer "the package does not export them" — it is "this feature does not
 * name them", which is what the assertions below check against the source.
 */
const EDITOR_OPERATIONS = [
  'adminGalleryEntryCreate',
  'adminGalleryEntryDetail',
  'adminGalleryEntryUpdate',
  'adminGalleryEntryReplaceAssets',
  'adminGalleryEntryPublish',
  'adminGalleryEntryUnpublish',
  'adminGalleryAssetCreate',
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

  it('has exactly one child segment, and it is the editor', () => {
    // The editor is the only address beneath the list. There is deliberately no
    // `/gallery/new`: the server owns the id the editor is addressed by, so
    // creation is a bootstrap interaction on the list rather than a route with
    // nothing to edit yet. Publication and media are panels *inside* the editor
    // — three addresses for one screen whose parts share one concurrency token
    // would be three ways to hold a stale one.
    const segments = readdirSync(join(APP_DIR, 'gallery'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(segments).toEqual(['[entryId]']);
    expect(existsSync(join(APP_DIR, 'gallery', '[entryId]', 'page.tsx'))).toBe(true);
    expect(existsSync(join(APP_DIR, 'gallery', 'new'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'gallery', '[entryId]', 'edit'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'gallery', '[entryId]', 'media'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'gallery', '[entryId]', 'publication'))).toBe(false);
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

  it('publishes the editor operations to the app, but not to this feature', () => {
    // `APP11-A02` consumes all seven, so they cross the curated boundary. The
    // guarantee this suite makes is the narrower, truer one asserted below:
    // none of them is named anywhere in the *gallery-list* source.
    const surface = apiClient as Record<string, unknown>;
    for (const operation of EDITOR_OPERATIONS) {
      expect(typeof surface[operation]).toBe('function');
    }
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

describe('no editor capability lives in the list feature', () => {
  it('names no editor operation anywhere in the feature', () => {
    for (const source of code) {
      for (const operation of EDITOR_OPERATIONS) {
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
    // The create action is the editor's; this feature renders it as an opaque
    // node it never constructs, so the dialog, its validation and its mutation
    // all stay outside this source tree.
    for (const source of code) {
      expect(source.text).not.toMatch(/<form\b/);
      expect(source.text).not.toMatch(/<dialog\b|role="dialog"/);
      expect(source.text).not.toMatch(/createPortal/);
    }
    const names = code.map((source) => source.path.split('/').pop() ?? '');
    expect(names.filter((name) => /form|dialog|modal|create|editor/.test(name))).toEqual([]);
  });

  it('imports nothing from the editor feature', () => {
    // The dependency points one way. The editor knows this feature's route
    // helper and cache root; a barrel import back the other way would close
    // that into a cycle between two feature barrels.
    for (const source of code) {
      expect(source.text).not.toContain('gallery-editor');
    }
  });

  it('builds the editor address in exactly one place', () => {
    // One route module owns both gallery addresses, so a row, a card and the
    // create action's redirect cannot drift into three spellings of one URL.
    const routeModule = code.find((source) => source.path.endsWith('gallery-list-route.ts'));
    expect(routeModule?.text).toContain('adminGalleryEntryRoute');

    const builders = code.filter(
      (source) =>
        !source.path.endsWith('gallery-list-route.ts') &&
        /\/gallery\/\$\{|['"`]\/gallery\/[^'"`]/.test(source.text),
    );
    expect(builders).toEqual([]);
  });

  it('navigates by a real link and never by a clickable div', () => {
    const rowSources = code.filter((source) =>
      /gallery-list-table\.tsx|gallery-card-list\.tsx/.test(source.path),
    );
    expect(rowSources).toHaveLength(2);
    for (const source of rowSources) {
      // The destination is carried by `next/link`, which is focusable,
      // announced as a link and openable in a new tab. A row `onClick`, a
      // `tabIndex` on a `<tr>` or a keyboard handler standing in for an anchor
      // would be none of those things.
      expect(source.text).toContain('<Link');
      expect(source.text).toContain('href={row.href}');
      expect(source.text).not.toMatch(/onClick|onKeyDown|tabIndex/);
      // And the whole row is not the target: exactly one link per row.
      expect(source.text.match(/<Link/g)).toHaveLength(1);
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
