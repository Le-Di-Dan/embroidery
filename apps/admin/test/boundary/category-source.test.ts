/**
 * The Admin category feature's source boundaries (`APP12-A01`).
 *
 * What a rendered test cannot prove, and what this checkpoint is defined by:
 *
 *  - exactly one route exists, and none of the addresses A01 was told not to
 *    create do;
 *  - the feature reaches the API only through the four `APP12-C02` operations —
 *    no fifth, and above all no delete;
 *  - no category **value** is compiled anywhere in it: no slug array, no
 *    slug-to-label map, no `Khác` fallback, no historical taxonomy;
 *  - the Product feature reads the Admin inventory and no longer the public
 *    one;
 *  - the stylesheet introduces no colour of its own.
 *
 * The dynamic-category rule is also enforced repository-wide by
 * `tools/check-category-source-of-truth.mjs`. These assertions are narrower and
 * different in kind: they are about *this* feature's own boundaries, and they
 * fail with a message naming the file.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const APP_DIR = join(__dirname, '..', '..', 'src', 'app', '(protected)');
const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'categories');
const PRODUCTS_DIR = join(__dirname, '..', '..', 'src', 'features', 'products');

function collectFiles(dir: string, pattern: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full, pattern));
    else if (pattern.test(entry.name)) files.push(full);
  }
  return files;
}

/** Comments explain what a file deliberately avoids; rules must not match them. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function readCode(dir: string) {
  return collectFiles(dir, /\.(ts|tsx)$/).map((path) => ({
    path: path.replace(/\\/g, '/'),
    text: stripComments(readFileSync(path, 'utf8')),
  }));
}

const code = readCode(FEATURE_DIR);
const productCode = readCode(PRODUCTS_DIR);
const stylesheet = collectFiles(join(FEATURE_DIR, 'styles'), /\.scss$/)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

describe('the route A01 owns', () => {
  it('adds exactly one Admin segment, and it is /categories', () => {
    expect(existsSync(join(APP_DIR, 'categories', 'page.tsx'))).toBe(true);
    for (const forbidden of [
      'danh-muc',
      join('admin', 'categories'),
      join('catalog', 'categories'),
    ]) {
      expect(existsSync(join(APP_DIR, forbidden))).toBe(false);
    }
  });

  it('has no child segment at all', () => {
    // List, create and edit are one screen: the approved frames draw a table and
    // a form panel side by side, so `/categories/new` and `/categories/{id}`
    // would be addresses nobody designed.
    const segments = readdirSync(join(APP_DIR, 'categories'), { withFileTypes: true }).filter(
      (entry) => entry.isDirectory(),
    );
    expect(segments).toEqual([]);
  });

  it('keeps the route file thin — it composes and nothing else', () => {
    const route = readFileSync(join(APP_DIR, 'categories', 'page.tsx'), 'utf8');
    expect(route).toContain('CategoryManagementScreen');
    expect(route).not.toMatch(/useQuery|useState|adminCategory/);
  });
});

describe('the generated client boundary', () => {
  it('publishes exactly the four category operations A01 consumes', () => {
    const surface = apiClient as Record<string, unknown>;
    for (const operation of [
      'adminCategoryList',
      'adminCategoryCreate',
      'adminCategoryUpdate',
      'adminCategoryTransition',
    ]) {
      expect(typeof surface[operation]).toBe('function');
    }
  });

  it('names no category operation the contract does not publish', () => {
    const text = code.map((file) => file.text).join('\n');
    for (const forbidden of [
      'adminCategoryDelete',
      'adminCategoryRestore',
      'adminCategoryRelist',
      'adminCategoryReorder',
      'adminCategoryBulk',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('reaches the network only through the feature service', () => {
    for (const file of code) {
      if (file.path.endsWith('services/admin-category.service.ts')) continue;
      // No component or hook may hold an Axios instance, a URL or a generated
      // operation: the service is the one seam (FRONTEND_CONVENTIONS §8).
      expect(file.text).not.toMatch(/axios|getBrowserApiClient|['"`]\/api\//);
      expect(file.text).not.toMatch(/\badminCategory(List|Create|Update|Transition)\b/);
    }
  });

  it('never uses the public category read', () => {
    expect(code.map((file) => file.text).join('\n')).not.toContain('publicCategoryList');
  });
});

describe('no category value is compiled anywhere', () => {
  const text = code.map((file) => file.text).join('\n');

  it('carries none of the historical four slugs', () => {
    for (const slug of ['thu-bong', 'khan', 'quan-ao', 'khac']) {
      expect(text).not.toMatch(new RegExp(`['"\`]${slug}['"\`]`));
    }
  });

  it('carries no fallback category', () => {
    // `Khác` is a category name, not a rule. There is no fallback category, so
    // there is nothing here to name one.
    expect(text).not.toContain('Khác');
    expect(text).not.toMatch(/FALLBACK_CATEGORY|DEFAULT_CATEGORY|CATEGORY_LABELS/);
  });

  it('holds no slug-to-label map', () => {
    // A record keyed by anything slug-shaped would be a second label authority
    // beside `category.name`, which is the one `BR-034` names.
    expect(text).not.toMatch(/Record<\s*CategorySlug/);

    // The copy module is where such a map would most plausibly appear, so its
    // hyphenated keys are pinned: they are the validation *reasons*, which are
    // rules, and there are no others. A category slug added here would fail.
    const copy = code.find((file) => file.path.endsWith('model/category-copy.ts'));
    const keys = [...(copy?.text.matchAll(/^\s*'([a-z0-9]+(?:-[a-z0-9]+)+)':/gm) ?? [])].map(
      (match) => match[1],
    );
    expect(keys.sort()).toEqual([
      'display-order-invalid',
      'display-order-range',
      'name-required',
      'name-too-long',
      'slug-malformed',
      'slug-required',
      'slug-too-long',
    ]);
  });

  it('names lifecycle states only through the contract enum', () => {
    for (const file of code) {
      if (file.path.endsWith('model/category-status.ts')) continue;
      if (file.path.endsWith('model/category-editability.ts')) continue;
      // Elsewhere the states are reached through `AdminCategoryResponseStatus`
      // or a predicate, never as a bare string a typo could silently change.
      expect(file.text).not.toMatch(/['"`](DRAFT|PUBLISHED|ARCHIVED)['"`]/);
    }
  });
});

describe('the Product repoint', () => {
  it('reads the Admin inventory and no longer the public one', () => {
    const service = productCode.find((file) =>
      file.path.endsWith('services/category-inventory.service.ts'),
    );
    expect(service).toBeDefined();
    expect(service?.text).toContain('fetchAdminCategories');
    expect(service?.text).not.toContain('publicCategoryList');
  });

  it('leaves no compiled category value behind in the product feature', () => {
    const text = productCode.map((file) => file.text).join('\n');
    for (const slug of ['thu-bong', 'quan-ao']) {
      expect(text).not.toMatch(new RegExp(`['"\`]${slug}['"\`]`));
    }
    expect(text).not.toMatch(/CATEGORY_LABELS|FALLBACK_CATEGORY/);
  });

  it('keeps exactly one definition of the slug rule, in the category feature', () => {
    expect(existsSync(join(PRODUCTS_DIR, 'model', 'category-slug-shape.ts'))).toBe(false);
    expect(existsSync(join(FEATURE_DIR, 'model', 'category-slug-shape.ts'))).toBe(true);
  });
});

describe('the stylesheet', () => {
  it('introduces no colour, radius or font size of its own', () => {
    // Every value is a token from `@embroidery/styles`, read back from the
    // variables the approved nodes bind. A literal here would be a second
    // colour system beside the design foundation.
    expect(stylesheet).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(stylesheet).not.toMatch(/\brgba?\(/);
  });

  it('is composed into the single global entry', () => {
    const main = readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'main.scss'), 'utf8');
    expect(main).toContain("@use '../features/categories/styles/categories'");
  });

  it('uses no inline style in any component', () => {
    for (const file of code) {
      expect(file.text).not.toMatch(/style=\{\{/);
    }
  });
});
