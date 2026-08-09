/**
 * @jest-environment node
 *
 * Static boundary checks on the Design Template editor's production source.
 *
 * These assert what a rendered DOM cannot. That the editor never builds a
 * storage URL, never reaches a published or Session asset route, never
 * duplicates the Design Document schema and never computes geometry itself are
 * all properties of the *code*, and every one of them would still look correct
 * on screen the day it stopped being true.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'design-template-editor');
const ROUTE_FILE = join(
  __dirname,
  '..',
  '..',
  'src',
  'app',
  '(protected)',
  'design-templates',
  '[templateId]',
  'page.tsx',
);
const STYLESHEET = join(FEATURE_DIR, 'styles', 'design-template-editor.scss');

/**
 * Strips comments so the rules below inspect executable code only.
 *
 * Without this, a file that *documents* which operations it deliberately avoids
 * fails the very rule asserting it avoids them.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

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
  path,
  text: stripComments(readFileSync(path, 'utf8')),
}));
const routeSource = stripComments(readFileSync(ROUTE_FILE, 'utf8'));
const stylesheet = stripComments(readFileSync(STYLESHEET, 'utf8'));

describe('generated client boundary', () => {
  it('exposes the two operations this screen consumes', () => {
    expect(typeof apiClient.adminDesignTemplateDetail).toBe('function');
    expect(typeof apiClient.adminDesignTemplateSaveDocument).toBe('function');
  });

  it('invokes no lifecycle operation, now that all four are reachable', () => {
    // `APP3-A04` owns publish, unpublish, archive and restore and brought them
    // across the boundary together. The rule this replaces asserted they were
    // *absent*, which was a proxy for "no consumer exists yet" — true until the
    // consumer arrived. What the editor actually rules is that **it** is not
    // that consumer: this screen edits a document and issues no transition.
    for (const operation of [
      'adminDesignTemplatePublish',
      'adminDesignTemplateUnpublish',
      'adminDesignTemplateArchive',
      'adminDesignTemplateRestore',
    ]) {
      expect(typeof (apiClient as Record<string, unknown>)[operation]).toBe('function');
      for (const source of sources) {
        expect(source.text).not.toContain(operation);
      }
    }
  });

  it('navigates to the lifecycle screen rather than performing a transition', () => {
    // The one `APP3-A04` affordance the editor carries. It is a route push
    // through the navigation guard, never a command — so the editor still
    // cannot change a lifecycle state, and a dirty draft still prompts on the
    // way out.
    const screenSource = sources.find((source) =>
      /design-template-editor-screen\.tsx$/.test(source.path),
    );
    expect(screenSource).toBeDefined();
    expect(screenSource?.text).toContain('adminDesignTemplatePublicationRoute');
    expect(screenSource?.text).toMatch(
      /guard\.requestNavigation\(\(\) => \{\s*router\.push\(adminDesignTemplatePublicationRoute/,
    );
  });

  it('reaches the API only through the generated operations', () => {
    for (const source of sources) {
      expect(source.text).not.toMatch(/\bfetch\s*\(/);
      expect(source.text).not.toMatch(/\baxios\b/);
      expect(source.text).not.toMatch(/from '@embroidery\/api-client\/.*generated/);
    }
  });

  it('never hard-codes an endpoint path', () => {
    for (const source of [...sources, { path: 'route', text: routeSource }]) {
      expect(source.text).not.toContain('/api/admin/');
      expect(source.text).not.toContain('/api/public/');
    }
  });

  it('imports each operation group in exactly one module', () => {
    const templateImporters = sources.filter(
      (source) =>
        source.text.includes('adminDesignTemplateDetail') ||
        source.text.includes('adminDesignTemplateSaveDocument'),
    );
    expect(templateImporters).toHaveLength(1);
    expect(templateImporters[0]?.path).toMatch(/design-template-editor\.service\.ts$/);

    const productImporters = sources.filter(
      (source) =>
        source.text.includes('adminProductPlacementGet') ||
        source.text.includes('adminProductSideBackgroundGet'),
    );
    expect(productImporters).toHaveLength(1);
    expect(productImporters[0]?.path).toMatch(/template-placement\.service\.ts$/);
  });
});

describe('asset delivery', () => {
  it('never reaches a published Template or Design Session asset route', () => {
    // `APP3-B05A` serves *published* Template assets and `APP3-B06C` serves
    // Session uploads. Neither is permission to read a draft Template's bytes in
    // the Admin console, and both would be an authorization bypass wearing the
    // shape of a convenience.
    for (const source of sources) {
      expect(source.text).not.toMatch(/publicDesignTemplate/);
      expect(source.text).not.toMatch(/publicDesignSession/);
      expect(source.text).not.toMatch(/editor-preview/);
    }
  });

  it('never builds a storage address of any kind', () => {
    for (const source of sources) {
      expect(source.text).not.toMatch(/minio|s3\.|amazonaws|presign|signedUrl/i);
      expect(source.text).not.toMatch(/\bstorageKey\b|\bbucket\b/i);
    }
  });

  it('creates an object URL only where it is also revoked', () => {
    // One mechanism, one file. An object URL created anywhere else is a handle
    // with no owner and therefore a leak of protected bytes.
    const creators = sources.filter((source) => source.text.includes('createObjectURL'));
    expect(creators).toHaveLength(1);
    expect(creators[0]?.path).toMatch(/use-editor-side-background\.ts$/);
    expect(creators[0]?.text).toContain('revokeObjectURL');
  });

  it('renders no HTML image element for a Template asset', () => {
    for (const source of sources) {
      expect(source.text).not.toMatch(/<img\b/);
      expect(source.text).not.toMatch(/next\/image/);
    }
  });
});

describe('document and geometry authority', () => {
  it('defines no second Design Document schema or validator', () => {
    for (const source of sources) {
      // A schema version written out here would be a second authority the day
      // `APP3-P01` bumps its own.
      expect(source.text).not.toMatch(/schemaVersion\s*:\s*[0-9]/);
      expect(source.text).not.toMatch(/function validateDesignDocument/);
    }
  });

  it('takes the schema version and limits from APP3-P01 alone', () => {
    const document = sources.find((source) => /editor-document\.ts$/.test(source.path));
    expect(document?.text).toContain('CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION');
    expect(document?.text).toContain('DESIGN_DOCUMENT_LIMITS');
    expect(document?.text).toContain('validateDesignDocumentStructure');
  });

  it('names the controlled font registry rather than a family string', () => {
    for (const source of sources) {
      expect(source.text).not.toMatch(/fontFamily\s*:\s*['"]/);
      expect(source.text).not.toMatch(/font-family:\s*['"]/);
    }
  });

  it('computes no transform, matrix or bounds of its own', () => {
    // Every one of these is `@embroidery/design-engine`'s (`IMP-D045`). A
    // renderer implements the contract; it does not restate it.
    for (const source of sources) {
      expect(source.text).not.toMatch(/Math\.(sin|cos|atan2)\b/);
      expect(source.text).not.toMatch(/rotationDeg\s*\*\s*Math\.PI/);
      expect(source.text).not.toMatch(/\bpxPerMm\s*\*/);
    }
  });

  it('draws the stage through the engine', () => {
    const stage = sources.find((source) => /editor-stage\.tsx$/.test(source.path));
    expect(stage?.text).toContain('resolveEffectiveTransform');
    expect(stage?.text).toContain('getElementBounds');
    expect(stage?.text).toContain('containsBounds');
  });
});

describe('rendering architecture', () => {
  it('uses native SVG and no second renderer', () => {
    for (const source of sources) {
      expect(source.text).not.toMatch(/\b(konva|fabric|pixi|three)\b/i);
      expect(source.text).not.toMatch(/getContext\(\s*['"]2d['"]/);
      expect(source.text).not.toMatch(/<canvas\b/);
    }
  });

  it('positions geometry in the viewBox, not with CSS', () => {
    const stage = sources.find((source) => /editor-stage\.tsx$/.test(source.path));
    expect(stage?.text).toContain('viewBox');
    // Inline positional styles and CSS custom properties are both forbidden by
    // `05-FRONTEND-AND-SCSS-STANDARD.md` §8; `APP3-A01` was corrected for it.
    for (const source of sources) {
      expect(source.text).not.toMatch(/style=\{\{/);
      expect(source.text).not.toMatch(/'--[a-z-]+'\s*:/);
    }
  });
});

describe('stylesheet', () => {
  it('uses tokens rather than literal colours', () => {
    expect(stylesheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(stylesheet).not.toMatch(/\brgba?\(/);
    expect(stylesheet).toContain('styles.$color-overlay-scrim');
  });

  it('prefixes every class so the global Admin sheet cannot collide', () => {
    const classNames = stylesheet.match(/^\.[a-z][a-z0-9_-]*/gm) ?? [];
    expect(classNames.length).toBeGreaterThan(0);
    for (const className of classNames) {
      expect(className).toMatch(/^\.template-editor/);
    }
  });

  it('lets the stage shrink instead of overflowing at 1280', () => {
    // A grid track's default minimum is `auto`, so `1fr` would let a wide SVG
    // push the page into a horizontal scrollbar — which `618:3` forbids.
    expect(stylesheet).toContain('minmax(0, 1fr)');
  });

  it('scrolls the inspector vertically and lets nothing inside exceed it', () => {
    // `overflow-x: visible` would be a comment describing something the browser
    // does not do — CSS computes a `visible` axis to `auto` whenever the other
    // is not `visible`, verified in the browser. What actually keeps
    // `APP3-A01`'s clipped inspector from recurring is that the column may
    // shrink and its controls may not exceed it.
    expect(stylesheet).toContain('overflow-y: auto');
    expect(stylesheet).not.toContain('overflow-x: visible');
    expect(stylesheet).toMatch(/\.template-editor-inspector \{[^}]*max-width: 100%;/s);
  });
});

describe('the route', () => {
  it('is the one canonical editor segment, addressed by id', () => {
    expect(routeSource).toContain('templateId');
    expect(routeSource).not.toContain('slug');
  });

  it('does not prefetch the version token on the server', () => {
    expect(routeSource).not.toContain('prefetchQuery');
    expect(routeSource).not.toContain('HydrationBoundary');
  });
});

describe('the initial scope assignment (APP3-A03-C1)', () => {
  it('is on the curated boundary, as this feature is its only consumer', () => {
    expect(typeof apiClient.adminDesignTemplateAssignScope).toBe('function');
  });

  it('is consumed in exactly one module', () => {
    const consumers = sources.filter((source) =>
      source.text.includes('adminDesignTemplateAssignScope'),
    );
    expect(consumers).toHaveLength(1);
    expect(consumers[0]?.path).toMatch(/template-scope\.service\.ts$/);
  });

  it('never spells the scope route', () => {
    // Matched as a **URL literal**, not as the substring `/scope` — which the
    // feature's own `../model/scope-selection` import contains, and which is a
    // module path rather than a route. A rule that fires on an import is not a
    // rule about routes.
    for (const source of sources) {
      expect(source.text).not.toMatch(/['"`][^'"`]*design-templates[^'"`]*scope/);
      expect(source.text).not.toMatch(/design-templates\/\$\{/);
    }
  });

  it('discovers Products through the accepted Admin operation, not the public one', () => {
    const productReaders = sources.filter((source) => source.text.includes('adminProductList'));
    expect(productReaders).toHaveLength(1);

    for (const source of sources) {
      // The public list answers a narrower, published-only model; a draft
      // Product is a perfectly ordinary authoring target.
      expect(source.text).not.toContain('publicProductList');
      expect(source.text).not.toContain('publicProductDetail');
      // And no per-id fan-out, which is the N+1 the list exists to avoid.
      expect(source.text).not.toContain('adminProductDetail');
    }
  });

  it('offers no rescope or clear-scope path anywhere', () => {
    // `APP3-B03B` publishes neither, so a control or a call for either would be
    // a promise the contract cannot keep.
    for (const source of sources) {
      expect(source.text).not.toMatch(/rescope|clearScope|unassignScope|replaceScope/i);
    }
  });

  it('leaves the Template list free of any scope mutation', () => {
    const listFeature = join(__dirname, '..', '..', 'src', 'features', 'design-templates');
    for (const path of collectSources(listFeature)) {
      const text = stripComments(readFileSync(path, 'utf8'));
      expect(text).not.toContain('adminDesignTemplateAssignScope');
      expect(text).not.toMatch(/rescope|clearScope/i);
    }
  });
});
