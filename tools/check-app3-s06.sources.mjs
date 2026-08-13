/**
 * Where `APP3-S06` lives, and how to read it.
 *
 * Split out of `check-app3-s06.mjs` by responsibility, and because one file
 * carrying the paths, the governance rules, the frontend rules and the two
 * cross-layer repairs would cross the repository's soft limit for a checker.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const STOREFRONT = 'apps/storefront';
export const FEATURE = `${STOREFRONT}/src/features/design-studio`;
const DESIGN = 'apps/api/src/modules/design';
const INSPECTION = 'apps/worker/src/jobs/asset-inspection';

/** The one operation `APP3-S06` publishes, and its address. */
export const STATUS_ROUTE = '/api/public/design-sessions/{sessionId}/assets/{assetId}/status';
export const STATUS_OPERATION_ID = 'publicDesignSessionAsset_status';
export const PREVIEW_ROUTE =
  '/api/public/design-sessions/{sessionId}/assets/{assetId}/editor-preview';

/** The four section-10 design rows, and the nodes they must carry. */
export const S06_DESIGN_ROWS = Object.freeze({
  'FIG-STUDIO-IMAGE-DESKTOP-UPLOADING': '608:343',
  'FIG-STUDIO-IMAGE-DESKTOP-NORMALIZING': '608:393',
  'FIG-STUDIO-IMAGE-DESKTOP-READY': '608:441',
  'FIG-STUDIO-IMAGE-DESKTOP-FAILED': '608:503',
});

/**
 * Studio rows belonging to checkpoints that still have not opened.
 *
 * One row per remaining capability: the property under test is that approval
 * stayed **scoped**, and a blanket Studio approval would move every one at once.
 * `FIG-STUDIO-MOBILE-IMAGESHEET` is listed deliberately — it is the mobile image
 * sheet, it is `APP3-S11`'s, and approving the desktop image rows must not carry
 * it along.
 */
export const LATER_STUDIO_ROWS = Object.freeze([
  'FIG-STUDIO-LAYERS-DESKTOP-DEFAULT',
  'FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY',
  'FIG-STUDIO-WATERMARK-DESKTOP-LIGHT',
  'FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED',
  'FIG-STUDIO-MOBILE-STAGE-SELECTED',
  'FIG-STUDIO-MOBILE-IMAGESHEET',
  /*
   * The row that keeps this rule from emptying itself (`APP3-S11`).
   *
   * Every *capability* row above now belongs to a checkpoint that has opened, so
   * a world-aware exclusion would leave the list empty — the failure `APP3-S04`
   * recorded once already, where a rule still ran, still passed, and asserted
   * nothing. This is a handoff annotation: no Studio capability checkpoint
   * consumes it, so it must stay `REVIEW_REQUIRED` for all of them, and a
   * blanket approval still moves it.
   */
  'FIG-APP3-HANDOFF-DEPENDENCY',
]);

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  registry: 'docs/design/FIGMA_DESIGN_INDEX.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  generatedClient: 'packages/api-client/src/generated/embroidery-api.ts',
  curatedClient: 'packages/api-client/src/index.ts',
  rootPackage: 'package.json',

  // The Storefront capability.
  imageInspector: `${FEATURE}/components/studio-image-inspector.tsx`,
  imagePanel: `${FEATURE}/components/studio-image-panel.tsx`,
  statusHook: `${FEATURE}/hooks/use-session-asset-status.ts`,
  imageHook: `${FEATURE}/hooks/use-studio-image.ts`,
  mediaHook: `${FEATURE}/hooks/use-studio-image-media.ts`,
  authority: `${FEATURE}/model/studio-image-authority.ts`,
  copy: `${FEATURE}/model/studio-image-copy.ts`,
  file: `${FEATURE}/model/studio-image-file.ts`,
  placement: `${FEATURE}/model/studio-image-placement.ts`,
  service: `${FEATURE}/services/studio-session-asset.client.ts`,
  queryKeys: `${FEATURE}/model/studio-query-keys.ts`,
  styles: `${FEATURE}/styles/design-studio.scss`,

  // What S06 must leave exactly as it found it, or change in exactly one way.
  stage: `${FEATURE}/components/studio-stage.tsx`,
  stageElement: `${FEATURE}/components/studio-stage-element.tsx`,
  stageScreen: `${FEATURE}/components/studio-stage-screen.tsx`,
  stagePanels: `${FEATURE}/components/studio-stage-panels.tsx`,
  documentStore: `${FEATURE}/store/studio-document.store.ts`,
  textDrawer: `${FEATURE}/components/studio-text-drawer.tsx`,
  textPanel: `${FEATURE}/components/studio-text-panel.tsx`,

  // Repair A — the Session inspection lane.
  lane: `${INSPECTION}/domain/asset-inspection-lane.ts`,
  assetRows: `${INSPECTION}/infrastructure/persistence/asset-rows.ts`,
  inspectionUseCase: `${INSPECTION}/application/asset-inspection.usecase.ts`,
  verification: `${INSPECTION}/application/source-verification.service.ts`,
  sharpPipeline: `${INSPECTION}/infrastructure/image/sharp-pipeline.ts`,
  inspectionRepository: `${INSPECTION}/infrastructure/persistence/sql-asset-inspection.repository.ts`,
  terminalReplay: `${INSPECTION}/infrastructure/persistence/terminal-replay.ts`,
  detailCodec: `${INSPECTION}/domain/inspection-detail.codec.ts`,
  laneSpec: `${INSPECTION}/domain/asset-inspection-lane.spec.ts`,
  laneLiveSpec: `${INSPECTION}/tests/session-inspection-lane.integration.spec.ts`,

  // Repair B — the status projection.
  statusController: `${DESIGN}/presentation/public-design-session-asset-status.controller.ts`,
  statusService: `${DESIGN}/application/design-session-asset-status.service.ts`,
  statusResponse: `${DESIGN}/presentation/schemas/design-session-asset-status.response.ts`,
  port: `${DESIGN}/domain/repositories/design-session-asset-delivery.repository.ts`,
  adapter: `${DESIGN}/infrastructure/persistence/drizzle-design-session-asset-delivery.repository.ts`,
  operationId: 'apps/api/src/openapi/operation-id.ts',
  designModule: `${DESIGN}/design.module.ts`,

  // Repair C — the cloned-Session media grant.
  grant: `${DESIGN}/infrastructure/persistence/design-session-media-grant.sql.ts`,

  // The read limit that closed `FU-APP3-B06C-READ-RATE-LIMIT-01`.
  readGuard: `${DESIGN}/presentation/guards/design-session-read.guard.ts`,
  limiter: `${DESIGN}/infrastructure/rate-limit/design-session-rate-limiter.ts`,
  authConfig: `${DESIGN}/config/design-session-auth.config.ts`,

  // Evidence.
  modelSpec: `${STOREFRONT}/test/unit/studio-image-model.test.ts`,
  componentSpec: `${STOREFRONT}/test/components/studio-image.test.tsx`,
  statusSpec: `apps/api/src/modules/design/design-session-asset-status.spec.ts`,
  statusLiveSpec: 'apps/api/test/integration/design-session-asset-status.integration.spec.ts',
});

export const MIGRATIONS = 'packages/database/migrations';
export const EXPECTED_MIGRATIONS = 34;
export const ROOT_SCRIPTS = 30;

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with its prose removed, so a ban never fires on the rule explaining it. */
export function code(rootDir, key) {
  return (read(rootDir, key) ?? '')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/(^|[^:])\/\/.*$/gm, '$1');
}

export function collect(dir, pattern) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full, pattern));
    else if (pattern.test(entry.name)) files.push(full);
  }
  return files;
}

/**
 * Every production source file of the Studio feature, prose stripped.
 *
 * The whole-feature rules run against this rather than a named list: a rule that
 * only inspected the files it knew about would be satisfied by a *new* file
 * breaking it, which is exactly how a second image fetcher or a mobile editing
 * surface would arrive.
 */
export function featureCode(rootDir) {
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .map((path) => code(rootDir, path.slice(rootDir.length + 1).replaceAll('\\', '/')))
    .join('\n');
}

export function openapi(rootDir) {
  const raw = read(rootDir, 'openapi');
  return raw === undefined ? undefined : JSON.parse(raw);
}

/**
 * The stage screen **and** the composition file it mounts.
 *
 * `APP3-S08` moved the panel mounts out of `StudioStageScreen` into
 * `StudioStagePanels` to stay inside the 400-line limit. The rules below are
 * about *where each capability is mounted*, which is still one decision — so
 * they read the pair rather than one file. A rule anchored to a single path dies
 * the moment one file becomes two (`APP3-B04A`); this is the same repair.
 */
export function compositionCode(rootDir) {
  return `${code(rootDir, 'stageScreen')}\n${code(rootDir, 'stagePanels')}`;
}
