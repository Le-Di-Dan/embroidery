/**
 * The Catalog placement read boundary (`APP3-B07`).
 *
 * `CatalogPlacementModule` states an invariant — placement belongs to
 * Product/Catalog and no Design module imports it — and a Design Session must
 * still open on a *publicly designable* placement, whose single authority is
 * `ProductPlacementQuery`. The resolution was to move the read side down into a
 * provider-only module both sides import.
 *
 * That refactor is easy to undo by accident: one `imports:` entry would pull two
 * controllers plus Identity, Audit and Asset into the Design graph, and one
 * copied query would create a second definition of "publicly designable" that
 * drifts the first time publication rules change. Neither breaks a test that
 * only exercises behaviour, so the boundary is asserted structurally.
 *
 * Source-level assertions on purpose: proving provider *visibility* needs no
 * database, and a live PostgreSQL run would be a slower way to learn less.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');

const read = (relative: string): string => readFileSync(join(SRC, relative), 'utf8');

/** Source with comments stripped, so prose describing a rule never reads as one. */
const code = (text: string): string => text.replace(/^\s*(\/\*|\*|\/\/).*$/gm, '');

const DESIGN_MODULE = code(read('modules/design/design.module.ts'));
const READ_MODULE = code(read('modules/catalog/catalog-placement-read.module.ts'));
const PLACEMENT_MODULE = code(read('modules/catalog/catalog-placement.module.ts'));
const SCOPE_RESOLVER = code(read('modules/design/application/design-session-scope.resolver.ts'));
const PLACEMENT_QUERY = code(read('modules/catalog/application/product-placement.query.ts'));

/** The `imports: [...]` list of a Nest module, as written. */
function moduleImports(source: string): string {
  return /imports:\s*\[([^\]]*)\]/.exec(source)?.[1] ?? '';
}

describe('the Design → Catalog placement boundary', () => {
  it('1 — DesignModule does not import the controller-bearing placement module', () => {
    // The whole point: importing it would drag two controllers and three
    // write-side modules into Design.
    expect(moduleImports(DESIGN_MODULE)).not.toMatch(/\bCatalogPlacementModule\b/);
    expect(DESIGN_MODULE).not.toMatch(/from '\.\.\/catalog\/catalog-placement\.module'/);
  });

  it('2 — the read module has no controller', () => {
    expect(READ_MODULE).not.toMatch(/controllers\s*:/);
    expect(READ_MODULE).not.toMatch(/@Controller\(/);
  });

  it('3 — the read module does not import Design, so the graph stays acyclic', () => {
    expect(READ_MODULE).not.toMatch(/DesignModule/);
    expect(READ_MODULE).not.toMatch(/modules\/design|\.\.\/design\//);
  });

  it('4 — the controller-bearing placement module imports the read module', () => {
    expect(moduleImports(PLACEMENT_MODULE)).toMatch(/\bCatalogPlacementReadModule\b/);
  });

  it('5 — DesignModule imports the read module', () => {
    expect(moduleImports(DESIGN_MODULE)).toMatch(/\bCatalogPlacementReadModule\b/);
  });

  it('6 — the placement controllers resolve the query through the read module', () => {
    // It is no longer provided locally, so the only way the controllers resolve
    // it is the imported read module's export.
    expect(PLACEMENT_MODULE).not.toMatch(/providers:[\s\S]*\bProductPlacementQuery\b[\s\S]*\]/);
    expect(READ_MODULE).toMatch(/exports:[\s\S]*\bProductPlacementQuery\b/);
  });

  it('7 — the Design scope resolver consumes that same query authority', () => {
    expect(SCOPE_RESOLVER).toMatch(/ProductPlacementQuery/);
    expect(SCOPE_RESOLVER).toMatch(/placement\.publicRead\(/);
  });

  it('8 — there is exactly one placement query authority and one repository binding', () => {
    // A second implementation is the failure this guards: two definitions of
    // "publicly designable" that agree until publication rules change.
    expect(SCOPE_RESOLVER).not.toMatch(/\bselect\b|\bfrom\b\s+products|drizzle/i);
    expect(READ_MODULE).toMatch(/PRODUCT_PLACEMENT_REPOSITORY/);
    expect(PLACEMENT_MODULE).not.toMatch(/provide:\s*PRODUCT_PLACEMENT_REPOSITORY/);
  });

  it('9 — no module cycle and no forwardRef was used to hide one', () => {
    for (const source of [DESIGN_MODULE, READ_MODULE, PLACEMENT_MODULE]) {
      expect(source).not.toMatch(/forwardRef/);
    }
    expect(READ_MODULE).not.toMatch(/CatalogPlacementModule/);
  });

  it('10 — no write-side or auth dependency leaked into the read boundary', () => {
    // The read boundary keeps the full rule. It needs a `DatabaseExecutor` and
    // nothing else, so all three would be a leak.
    for (const leaked of ['IdentityModule', 'AuditModule', 'AssetModule']) {
      expect(moduleImports(READ_MODULE)).not.toMatch(new RegExp(`\\b${leaked}\\b`));
    }

    // The Design module keeps the two that are actually about authority.
    // `AssetModule` left this list at `APP12-H01` (FU-APP12-S03-C1-02): APP3-B06B
    // imports it for the `ASSET_REPOSITORY` **port** it exports — a read port,
    // declared and explained at the import — so the rule as written had come to
    // forbid a delivered, documented dependency rather than a leak. What the
    // clause protects on this side is that a *design* module never acquires
    // staff identity or the audit writer, and that is unchanged.
    for (const leaked of ['IdentityModule', 'AuditModule']) {
      expect(moduleImports(DESIGN_MODULE)).not.toMatch(new RegExp(`\\b${leaked}\\b`));
    }
  });

  it('11 — the placement query itself is untouched, so its semantics are unchanged', () => {
    // The extraction moved *where the provider is registered*, never the query.
    expect(PLACEMENT_QUERY).toMatch(/async adminRead\(/);
    expect(PLACEMENT_QUERY).toMatch(/async publicRead\(slug: string\)/);
    expect(PLACEMENT_QUERY).toMatch(/this\.placement\.findPublicPlacement\(slug\)/);
    expect(PLACEMENT_QUERY).toMatch(/publicProductNotFound\(\)/);
  });
});
