/**
 * The Admin Design Template HTTP and persistence surfaces, as source text.
 *
 * Four suites scan "the controller" and "the adapter" for properties that no
 * runtime double can show — that a route is absent, that a compare-and-set is in
 * the predicate, that the envelope helper is shared rather than copied. Each of
 * them read one file path directly, and `APP3-B04A` split both files by
 * responsibility to bring them under the CLAUDE.md §6 limit, which would have
 * silently emptied every one of those scans: a `not.toMatch` over a file that no
 * longer holds the code passes for the wrong reason.
 *
 * So the surface is named once, here. A suite asks for the surface it means and
 * gets every file that carries it; the next split moves code without moving any
 * assertion.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DESIGN = join(__dirname, '..');

function readAll(...relativePaths: readonly string[]): string {
  return relativePaths.map((path) => readFileSync(join(DESIGN, path), 'utf8')).join('\n');
}

/** Both Admin Design Template controllers: authoring (B03/B03A/B03B) and lifecycle (B04/B04A). */
export const ADMIN_TEMPLATE_CONTROLLER_SOURCE = readAll(
  'presentation/admin-design-template-authoring.controller.ts',
  'presentation/admin-design-template-lifecycle.controller.ts',
  // The error translation both controllers delegate to. Included because the
  // assertion "this surface turns its own error type into an HTTP exception" is
  // about the surface, not about which file the `catch` ended up in.
  'presentation/design-template-http-errors.ts',
);

/** The lifecycle controller alone, for rules that are about the transitions only. */
export const ADMIN_TEMPLATE_LIFECYCLE_CONTROLLER_SOURCE = readAll(
  'presentation/admin-design-template-lifecycle.controller.ts',
);

/** The whole Drizzle Design Template adapter: reads, authoring writes, lifecycle writes. */
export const ADMIN_TEMPLATE_ADAPTER_SOURCE = readAll(
  'infrastructure/persistence/drizzle-design-template.repository.ts',
  'infrastructure/persistence/design-template-authoring.writes.ts',
  'infrastructure/persistence/design-template-lifecycle.writes.ts',
);
