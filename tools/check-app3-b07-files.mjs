/** Shared file map and readers for the `APP3-B07` gate halves. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DESIGN = 'apps/api/src/modules/design';
const CATALOG = 'apps/api/src/modules/catalog';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  report: 'docs/implementation/reports/APP3-B07-COMPLETION-REPORT.md',
  rootManifest: 'package.json',
  apiManifest: 'apps/api/package.json',
  // `APP3-P04` — the generated client, so the response-type rule can prove the
  // two operations this gate owns no longer resolve their success to `void`.
  client: 'packages/api-client/src/generated/embroidery-api.ts',
  clientSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
  controller: `${DESIGN}/presentation/public-design-session.controller.ts`,
  request: `${DESIGN}/presentation/schemas/public-design-session.request.ts`,
  openUseCase: `${DESIGN}/application/open-design-session.use-case.ts`,
  resumeUseCase: `${DESIGN}/application/resume-design-session.use-case.ts`,
  documentAuthority: `${DESIGN}/application/design-document.authority.ts`,
  scopeResolver: `${DESIGN}/application/design-session-scope.resolver.ts`,
  snapshot: `${DESIGN}/application/design-session-snapshot.ts`,
  issuer: `${DESIGN}/infrastructure/crypto/design-session-secret.issuer.ts`,
  cookies: `${DESIGN}/infrastructure/http/design-session-cookie.policy.ts`,
  repository: `${DESIGN}/infrastructure/persistence/drizzle-design-session.repository.ts`,
  designModule: `${DESIGN}/design.module.ts`,
  readModule: `${CATALOG}/catalog-placement-read.module.ts`,
  placementModule: `${CATALOG}/catalog-placement.module.ts`,
  placementQuery: `${CATALOG}/application/product-placement.query.ts`,
  appModule: 'apps/api/src/bootstrap/app.module.ts',
  generationEnv: 'apps/api/src/openapi/generation-environment.ts',
  envExample: '.env.example',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  unitSpec: `${DESIGN}/design-session-bootstrap.spec.ts`,
  liveSpec: 'apps/api/test/integration/design-session-bootstrap.integration.spec.ts',
  boundarySpec: 'apps/api/test/architecture/catalog-placement-boundary.spec.ts',
});

const [ROOT_SCRIPTS, MIGRATIONS] = [30, 34];
const [SOFT_CHECKER, SOFT_TEST, SRC_LIMIT, TEST_LIMIT] = [450, 700, 400, 600];

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Strips comments, so prose describing a refusal never reads as the thing itself. */
export function code(text) {
  return text.replace(/^\s*(\/\*|\*|\/\/).*$/gm, '');
}

const has = (text, pattern) =>
  pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);

/** Asserts every required marker of one file. */
export function requireAll(rootDir, key, required, fail) {
  const body = code(read(rootDir, key) ?? '');
  if (body === '') {
    fail(`${CANONICAL_FILES[key]}: missing`);
    return;
  }
  for (const [pattern, what] of required) {
    if (!has(body, pattern)) fail(`${CANONICAL_FILES[key]}: ${what}`);
  }
}
