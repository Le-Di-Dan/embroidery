#!/usr/bin/env node
/**
 * `APP3-P03` — the Zod-backed DTO OpenAPI metadata foundation.
 *
 * The defect this checkpoint closed was quiet by nature: runtime validation
 * worked, the API returned the right answers, and every test passed — while the
 * published contract said each request body was an empty object. Nothing failed.
 * That is what makes it recurrable, so this gate is built around one question:
 * *could the empty schema come back without anything going red?*
 *
 * Three ways it could, each asserted against:
 *
 * - a new schema-backed body is added and simply never registered;
 * - the platform is quietly bypassed by hand-decorating one DTO, so the fix
 *   stops being a foundation and becomes a per-feature habit again;
 * - the conversion learns to fall back to `{}` for a construct it cannot
 *   express, turning a loud build failure into a silent hole.
 *
 * The first two are asserted by `check-app3-p03-contract.mjs`, which owns the
 * published half and the canonical file map; this file owns the mechanism, the
 * governance and the accepted predecessors, and runs both.
 *
 * It is mode-aware on `APP3-P03`'s own recorded status: before delivery the
 * platform follow-up must still be open and B03/B06 must still record it as
 * their blocker; after, the follow-up closes and both become ready. There is no
 * third world, and the half-flipped mixture fails.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-p03.mjs [rootDir]
 */
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkApp3B01 } from './check-app3-b01.mjs';
import { checkApp3B01N } from './check-app3-b01n.mjs';
import { checkApp3B02 } from './check-app3-b02.mjs';
import {
  CANONICAL_FILES,
  REPO_ROOT,
  checkApp3P03Contract,
  code,
  read,
} from './check-app3-p03-contract.mjs';

export { CANONICAL_FILES, REPO_ROOT };

const ROOT_SCRIPT_COUNT = 30;

/** The tooling soft caps this checkpoint records; application limits are unchanged. */
export const TOOLING_SOFT_CAPS = Object.freeze({ checker: 450, test: 700 });
export const APPLICATION_LIMITS = Object.freeze({ source: 400, test: 600 });

/**
 * 1 — the conversion authority is Zod's own exporter, configured to refuse.
 *
 * Each option is asserted individually because dropping any one of them is a
 * silent downgrade: without `unrepresentable: 'throw'` an unsupported node
 * becomes `{}` again, without `io: 'input'` a transforming body documents its
 * own parsed output as if a client had to send that, and without
 * `cycles: 'throw'` a recursive schema has no finite published form.
 */
function checkConversionAuthority(rootDir, fail) {
  const source = code(read(rootDir, 'converter') ?? '');
  if (!/z\.toJSONSchema\(/.test(source)) {
    fail(`${CANONICAL_FILES.converter}: the conversion no longer uses Zod's own exporter`);
  }
  for (const [pattern, description] of [
    [/target:\s*'openapi-3\.0'/, 'the OpenAPI 3.0 target'],
    [/io:\s*'input'/, 'the input form'],
    [/unrepresentable:\s*'throw'/, 'the refusal to publish an unrepresentable node'],
    [/cycles:\s*'throw'/, 'the refusal to publish a cyclic schema'],
  ]) {
    if (!pattern.test(source)) {
      fail(`${CANONICAL_FILES.converter}: ${description} is no longer configured`);
    }
  }
  // A fallback is the defect wearing a different hat.
  if (/catch[\s\S]{0,200}?return\s*\{\s*(?:type:\s*'object'|\})/.test(source)) {
    fail(`${CANONICAL_FILES.converter}: a conversion failure falls back to an empty schema`);
  }
  if (!/throw new ZodOpenApiSchemaError/.test(source)) {
    fail(`${CANONICAL_FILES.converter}: a conversion failure no longer throws`);
  }
}

/** 2 — the augmentation refuses a document with an undocumented body. */
function checkAugmentationRefuses(rootDir, fail) {
  const raw = read(rootDir, 'augmentation') ?? '';
  const source = code(raw);
  if (!/INTENTIONALLY_EMPTY_REQUEST_BODIES/.test(source)) {
    fail(`${CANONICAL_FILES.augmentation}: the intentionally-empty allowlist is gone`);
  }
  if (!/throw new ZodOpenApiSchemaError/.test(source)) {
    fail(`${CANONICAL_FILES.augmentation}: an empty request body no longer stops generation`);
  }
  // The allowlist stays a decision, not a blanket. An entry has to justify
  // itself in the completion report, so one appearing here is a finding.
  const allowlist = /INTENTIONALLY_EMPTY_REQUEST_BODIES[^=]*=\s*new Set<string>\(([^)]*)\)/.exec(
    source,
  );
  if (allowlist !== null && allowlist[1].trim() !== '') {
    fail(
      `${CANONICAL_FILES.augmentation}: a body is allowlisted as intentionally empty without review`,
    );
  }
  if (!/registerZodDtos/.test(raw)) {
    fail(`${CANONICAL_FILES.augmentation}: the failure no longer says how to fix the body`);
  }
}

/** 3 — the augmentation is actually wired into the one document builder. */
function checkWiring(rootDir, fail) {
  const builder = code(read(rootDir, 'builder') ?? '');
  if (!/applyZodDtoSchemas\(/.test(builder)) {
    fail(`${CANONICAL_FILES.builder}: the request-body augmentation is not applied`);
  }
  // Order matters: the two later augmentations must never run over a document
  // whose bodies were left empty, so this one runs before them.
  const applied = builder.indexOf('applyZodDtoSchemas(');
  const envelope = builder.indexOf('applyEnvelopeSchemas(');
  if (applied < 0 || envelope < 0 || applied > envelope) {
    fail(`${CANONICAL_FILES.builder}: the request-body augmentation no longer runs first`);
  }
}

/**
 * 4 — runtime validation is untouched.
 *
 * The whole checkpoint is a *publication* change. If publication reached the
 * pipe, a document-generation concern would have gained the power to change
 * what the API accepts.
 */
function checkRuntimeUnchanged(rootDir, fail) {
  const pipe = code(read(rootDir, 'pipe') ?? '');
  if (/zodDtoRegistrations|registerZodDtos|toJSONSchema/.test(pipe)) {
    fail(`${CANONICAL_FILES.pipe}: publication has leaked into the validation path`);
  }
  if (!/zodSchemaOf\(metadata\.metatype\)/.test(pipe)) {
    fail(`${CANONICAL_FILES.pipe}: the pipe no longer reads the schema off the metatype`);
  }
  if (!/safeParse/.test(pipe) || !/BadRequestException/.test(pipe)) {
    fail(`${CANONICAL_FILES.pipe}: the validation contract changed`);
  }
  const dto = code(read(rootDir, 'dto') ?? '');
  if (/toJSONSchema|ApiProperty/.test(dto)) {
    fail(`${CANONICAL_FILES.dto}: the DTO factory took on a publication responsibility`);
  }
  const registry = code(read(rootDir, 'registry') ?? '');
  if (!/zodSchemaOf\(/.test(registry)) {
    fail(`${CANONICAL_FILES.registry}: the registry no longer reads the schema off the class`);
  }
}

/** 5 — no dependency, and no root script, was added. */
function checkNoNewDependency(rootDir, fail) {
  const manifest = JSON.parse(read(rootDir, 'apiManifest') ?? '{}');
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const name of Object.keys(dependencies)) {
    if (/openapi|json-schema|zod-to|nestjs-zod/i.test(name)) {
      fail(`apps/api/package.json added ${name}; the conversion must not need a new dependency`);
    }
  }
  if (dependencies.zod === undefined) fail('apps/api/package.json no longer depends on zod');

  const root = JSON.parse(read(rootDir, 'rootManifest') ?? '{}');
  const count = Object.keys(root.scripts ?? {}).length;
  if (count !== ROOT_SCRIPT_COUNT) {
    fail(`the root package.json declares ${String(count)} scripts; GOV-Q01 fixed it at 30`);
  }
}

/** 6 — the scoped commands and the tooling soft-cap policy are recorded. */
function checkGovernanceRecorded(rootDir, fail) {
  const index = read(rootDir, 'commandIndex') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-P03',
    'CMD-CHECK-APP3-P03-CONTRACT',
    'CMD-TEST-APP3-P03',
    'CMD-TEST-APP3-P03-CONTRACT',
  ]) {
    if (!index.includes(command)) fail(`the scoped command index does not index ${command}`);
  }
  const governance = read(rootDir, 'governance') ?? '';
  for (const [value, description] of [
    [TOOLING_SOFT_CAPS.checker, 'the 450-line tooling checker soft cap'],
    [TOOLING_SOFT_CAPS.test, 'the 700-line tooling test soft cap'],
    [APPLICATION_LIMITS.source, 'the unchanged 400-line application source limit'],
    [APPLICATION_LIMITS.test, 'the unchanged 600-line application test limit'],
  ]) {
    if (!governance.includes(String(value))) {
      fail(`VALIDATION_GOVERNANCE.md does not record ${description}`);
    }
  }
}

/**
 * 7 — the phase status is one of exactly two consistent worlds.
 *
 * Before delivery: the follow-up is open and B03/B06 record it as their blocker.
 * After: it closes naming this checkpoint, and both become ready. A document in
 * which the follow-up is closed while B03 still calls it a blocker describes no
 * state the repository can be in, and is refused rather than half-accepted.
 */
function checkPhaseStatus(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  const delivered = /APP3-P03 = COMPLETE/.test(phase);
  const closed = /FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = COMPLETE — CLOSED_BY_APP3-P03/.test(
    phase,
  );
  const open = /FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_[A-Z_]+/.test(phase);
  const blocked =
    /APP3-B03 = BLOCKED_BY_PLATFORM_ZOD_OPENAPI_FOLLOW_UP/.test(phase) ||
    /APP3-B06 = BLOCKED_BY_PLATFORM_ZOD_OPENAPI_FOLLOW_UP/.test(phase);
  // `APP3-B06` may be READY, or replanned into successors that are themselves
  // recorded — `APP3-G08` replaced it with B06A/B06B. What P03 must never leave
  // behind is a B06 still waiting on *this* follow-up, which `blocked` covers.
  const b06Unblocked =
    /APP3-B06 = READY/.test(phase) ||
    (/APP3-B06 = REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B/.test(phase) &&
      /APP3-B06A = /.test(phase) &&
      /APP3-B06B = /.test(phase));
  const ready = /APP3-B03 = READY — NOT STARTED/.test(phase) && b06Unblocked;

  if (delivered) {
    if (!closed) fail('APP3-P03 is delivered but the platform follow-up is not closed by it');
    if (open) fail('APP3-P03 is delivered while the platform follow-up is still recorded open');
    if (blocked) fail('APP3-P03 is delivered while B03 or B06 still records it as their blocker');
    if (!ready) fail('APP3-P03 is delivered but B03 and B06 are not recorded ready');
  } else {
    if (closed) fail('the platform follow-up is closed by a checkpoint that is not recorded done');
    if (!open) fail('APP3-P03 is not delivered, so the platform follow-up must stay open');
    if (!blocked) fail('APP3-P03 is not delivered, so B03 or B06 must still record its blocker');
  }

  if (!/APP3-B02 = COMPLETE — REVIEW_ACCEPTED/.test(phase)) {
    fail('APP3-B02 is no longer recorded as accepted');
  }
  if (/APP3-B02-C1/.test(phase)) fail('APP3-B02-C1 was invented; it does not exist');
  if (
    !/APPROVED_BOUNDED_TOOLING_SIZE_DEVIATION = B02_PREDECESSOR_GATE_AND_TEST_FILES/.test(phase)
  ) {
    fail('the approved bounded tooling-size deviation is not recorded');
  }
}

/**
 * 8 — the tooling soft caps bind this checkpoint's own files, and the
 * application limits are not relaxed by them.
 */
function checkFileSizes(rootDir, fail) {
  for (const [name, cap] of [
    ['check-app3-p03.mjs', TOOLING_SOFT_CAPS.checker],
    ['check-app3-p03-contract.mjs', TOOLING_SOFT_CAPS.checker],
    ['check-app3-p03.test.mjs', TOOLING_SOFT_CAPS.test],
  ]) {
    const source = read(rootDir, join('tools', name));
    if (source === undefined) {
      fail(`tools/${name} is missing`);
      continue;
    }
    const lines = source.split('\n').length;
    if (lines > cap) fail(`tools/${name} is ${String(lines)} lines, over the ${String(cap)} cap`);
  }
  // The relaxation is for tooling only. A platform source file over 400 lines
  // is still a real violation, and this checkpoint's own files prove it.
  for (const key of ['converter', 'augmentation', 'registry']) {
    const lines = (read(rootDir, key) ?? '').split('\n').length;
    if (lines > APPLICATION_LIMITS.source) {
      fail(`${CANONICAL_FILES[key]} is ${String(lines)} lines, over the application limit`);
    }
  }
  for (const key of ['converterSpec', 'augmentationSpec', 'publicationSpec', 'registrySpec']) {
    const lines = (read(rootDir, key) ?? '').split('\n').length;
    if (lines > APPLICATION_LIMITS.test) {
      fail(`${CANONICAL_FILES[key]} is ${String(lines)} lines, over the application test limit`);
    }
  }
}

/** 9 — the accepted predecessors still pass. */
function checkPredecessors(rootDir, fail) {
  for (const [label, run] of [
    ['APP3-B02', checkApp3B02],
    ['APP3-B01', checkApp3B01],
    ['APP3-B01N', checkApp3B01N],
  ]) {
    const result = run(rootDir);
    for (const violation of Array.isArray(result) ? result : (result.failures ?? [])) {
      fail(`${label} regression: ${violation}`);
    }
  }
}

export function checkApp3P03(rootDir = REPO_ROOT) {
  const failures = checkApp3P03Contract(rootDir);
  const fail = (message) => failures.push(message);

  checkConversionAuthority(rootDir, fail);
  checkAugmentationRefuses(rootDir, fail);
  checkWiring(rootDir, fail);
  checkRuntimeUnchanged(rootDir, fail);
  checkNoNewDependency(rootDir, fail);
  checkGovernanceRecorded(rootDir, fail);
  checkPhaseStatus(rootDir, fail);
  checkFileSizes(rootDir, fail);
  checkPredecessors(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp3P03(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-p03 — ${String(failures.length)} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-p03 — every schema-backed request body publishes the schema that validates it: ' +
      "the conversion is Zod's own exporter configured to refuse an unrepresentable node, a " +
      'cycle and an output-form body rather than fall back to an empty schema; the augmentation ' +
      'runs before every other and refuses a document in which any JSON body — or anything it ' +
      'references — is still empty; every createZodDto consumer is registered and none ' +
      'hand-decorates its way around the platform; the placement body keeps its exact ' +
      'APP3-B01-C1 contract down to the nested Area and its authored descriptions; the generated ' +
      'client types real fields instead of an open bag; runtime validation, the paths, the ' +
      'operations, the APP3-B02 binary route, the dependencies and the 30 root scripts are ' +
      'untouched; and the phase records one of exactly two consistent worlds',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
