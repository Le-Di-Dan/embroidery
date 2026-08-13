#!/usr/bin/env node
/**
 * What the `APP3-X01` closure gate reads, and the values it holds APP3 to.
 *
 * Kept apart from the rules so the mutation tests can copy exactly this set
 * into a throwaway tree, and so a value nobody may quietly edit sits in one
 * place instead of being spelled out inside a condition.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL_FILES = Object.freeze({
  matrix: 'docs/implementation/reports/APP3-CLOSURE-MATRIX.md',
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  roadmap: 'docs/implementation/10-MASTER-APPLICATION-ROADMAP.md',
  rootPackage: 'package.json',
});

export const REPORT_DIR = 'docs/implementation/reports';

/**
 * The closure register: the block in the phase plan that carries the CURRENT
 * word for every key closure depends on.
 *
 * APP3's status log is append-only prose in which newer blocks were sometimes
 * inserted above older ones, so at `APP3-X01` entry the LAST `APP3-E01 =` line
 * in the file still read `READY — NOT STARTED` and the last `APP3-X01 =` line
 * still read `BLOCKED_BY_APP3-E01`. A gate that resolves such a register by
 * position is reading whichever copy the layout happens to favour. This block
 * is fenced, holds exactly one line per key, and is the only place the gate
 * looks — so historical prose above it stays legal evidence and stops being
 * load-bearing.
 */
export const REGISTER_HEADING = '### 10.1 APP3 closure register';

/** Exactly one line per key, and this is the word each must carry. */
export const REGISTER = Object.freeze({
  APP3: 'COMPLETE — PASS_WITH_FOLLOW_UPS — DELIVERED_FOR_REVIEW',
  'APP3-X01': 'COMPLETE — DELIVERED_FOR_REVIEW',
  'APP3-E01': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-E01-C1': 'COMPLETE — REVIEW_ACCEPTED',
  'FU-APP3-UPLOAD-REVISION-SEAM-01': 'COMPLETE — CLOSED_BY_APP3-E01-C1',
  APP4: 'READY_FOR_PRE_IMPLEMENTATION_AUDIT',
});

/** The verdict vocabulary, and the only verdict an open follow-up allows. */
export const VERDICTS = Object.freeze(['PASS', 'PASS_WITH_FOLLOW_UPS', 'BLOCKED']);

/**
 * Checkpoints that were ruled out by name. A phase that closes while one of
 * them exists on disk has reinterpreted the ruling rather than followed it.
 */
export const FORBIDDEN_CHECKPOINTS = Object.freeze([
  'APP3-E01-C2',
  'APP3-X01-PRE',
  'APP3-X01-G01',
  'APP3-B06C-C1',
]);

/** Frozen artifacts, recomputed at closure and compared with the matrix. */
export const EXPECTED = Object.freeze({
  openapiPaths: 37,
  openapiOperations: 42,
  openapiSchemas: 84,
  openapiHash: 'f39e9e8fca1de08417359aeb299b874c346e21902b21375c9159124ed63d3817',
  clientHash: 'c2fb229f69f4d0033b081e7f2aca7328653c5eeb6bebfb5658feb6fe8ba4a2d6',
  migrations: 34,
  fingerprint: '7abf3708f8acc7da1124677add5a95ef1bdd421e78ea7f735213fbf8030a3569',
  rootScripts: 30,
  tables: 78,
  columns: 843,
});

/**
 * Follow-ups that must still be open at closure, with the disposition each is
 * allowed to carry. Naming them is the point: a closure that simply counted
 * "zero blocking" would also pass on a register somebody had emptied.
 */
export const OPEN_FOLLOW_UPS = Object.freeze({
  'FU-APP3-SESSION-CREDENTIAL-ACCUMULATION-01': 'APP4',
  'FU-APP3-WORKER-BOOT-ORDER-01': 'APP12',
  'FU-APP3-TRANSFORM-BUDGET-01': 'APP12',
  'FU-APP3-STUDIO-TOOL-RAIL-01': 'APP3-S12',
  'FU-APP3-S04-GROUP-AUTHORITY-01': 'Product Owner ruling',
  'FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01': 'FROZEN_APP3_LIMITATION',
  'FU-APP3-A02-D01-CONTRACT-DRIFT-01': 'FROZEN_APP3_LIMITATION',
  'FU-APP3-PLACEMENT-NULLABLE-CONTRACT-01': 'APP4',
  'FU-APP3-CONFLICT-CODE-CONTRACT-01': 'APP4',
  'FU-APP3-DESIGN-SESSION-PEPPER-TEST-01': 'APP4',
  'FU-APP3-G03-QUALITY-AGGREGATE-01': 'VALIDATION_GOVERNANCE.md',
});

/** An owner word that defers the question instead of answering it. */
export const EMPTY_OWNERS = Object.freeze([
  'OWNER_NOT_YET_ASSIGNED',
  'TBD',
  'someone later',
  'a future phase',
  'later APP3',
]);

/**
 * The measured transform figures. `FU-APP3-TRANSFORM-BUDGET-01` may be carried
 * as accepted debt only while the matrix still states what was measured —
 * debt that stops naming its own numbers has become a shrug.
 */
export const TRANSFORM_DEBT = Object.freeze({
  disposition: 'OPEN_WITH_EXPLICIT_ACCEPTED_PHASE_DEBT',
  figures: Object.freeze(['33.4', '48', '20 ms']),
});

/** The cumulative customer capability APP3 must be able to evidence. */
export const CAPABILITIES = Object.freeze([
  'Product Side / Embroidery Area placement',
  'Template lifecycle, version and document',
  'Published Template read',
  'Template media delivery',
  'Anonymous Design Session',
  'Canonical document and geometry (P01/P02)',
  'Native React SVG renderer',
  'Text editing',
  'Transforms',
  'Customer image upload and private preview',
  'Layers',
  'Viewport',
  'Runtime watermark',
  'Undo / redo',
  'Autosave, conflict, resume and expiry',
  'Mobile and touch',
  'Cross-layer journey',
]);

/**
 * Capabilities APP3 did not deliver. Each must be recorded as not delivered —
 * the failure mode a closure invites is a later capability quietly appearing in
 * the delivered column because its checkpoint touched something adjacent.
 */
export const NOT_DELIVERED = Object.freeze([
  'customer identity',
  'request submission',
  'review and quotation',
  'payments and orders',
  'group creation',
  'Template artwork intake',
  'export or download',
  '3D',
  'stitch simulation',
  'digitizing',
  'production readiness',
]);
