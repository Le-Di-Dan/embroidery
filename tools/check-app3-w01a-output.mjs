#!/usr/bin/env node
/**
 * `APP3-W01A` — the output contract: policy, measured quartet, atomic
 * completion.
 *
 * Split from `check-app3-w01a.mjs` by responsibility. That file asserts how the
 * request is *authorized* — the event, the association, the profile, the media
 * admission — and this one asserts what the attempt *produces*: a frozen output
 * policy, four fields measured from the encoder and the counted stream rather
 * than copied from the source row, and a single claim-guarded statement that
 * makes the derivative usable.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-w01a-output.mjs [rootDir]
 */
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { CANONICAL_FILES, REPO_ROOT, code, read } from './check-app3-w01a-files.mjs';

export { CANONICAL_FILES, REPO_ROOT };

/**
 * Every `return { … }` block that carries a `storageKey`, which is exactly the
 * `NormalizedOutput` shape the quartet is written from.
 */
function outputObjects(source) {
  return [...source.matchAll(/return \{[^}]*storageKey[^}]*\}/g)].map((match) => match[0]);
}

/** 7, 8, 9 — output policy, measured quartet and atomic completion. */
function checkOutputContract(rootDir, fail) {
  const policy = code(read(rootDir, 'policy') ?? '');
  const derivative = code(read(rootDir, 'derivative') ?? '');
  const repository = code(read(rootDir, 'repository') ?? '');
  const usecase = code(read(rootDir, 'usecase') ?? '');

  if (!/kind: 'NORMALIZED'/.test(policy)) fail('the output kind is not NORMALIZED');
  if (!/isWatermarked: false/.test(policy)) fail('the output policy does not fix isWatermarked');
  if (!/mediaType: 'image\/webp'/.test(policy)) fail('the output media type is not fixed');
  // The number itself is the shared contract's since `APP3-B01N`; what this
  // policy must not do is declare a second one.
  const shared = code(read(rootDir, 'sharedContract') ?? '');
  if (!/ASSET_NORMALIZATION_POLICY_VERSION = 1/.test(shared)) fail('the policy version is not 1');
  if (!/NORMALIZATION_POLICY_VERSION = ASSET_NORMALIZATION_POLICY_VERSION/.test(policy)) {
    fail('the policy version is not taken from the shared contract');
  }

  // The quartet must come from the encoder and the counted stream. `APP3-W01B`
  // extracted the counted write into a writer both lanes share, so the counting
  // is looked for across the pair — the property is unchanged, only its file.
  const written = `${derivative}\n${code(read(rootDir, 'writer') ?? '')}`;
  for (const [pattern, complaint, corpus] of [
    [/info\.read\(\)/, 'the encoder output report', derivative],
    // Anchored on the field, not the call: `counter.digest()` also appears in
    // the *integrity* comparison, which would satisfy a bare call match even if
    // the written checksum had been replaced by a constant.
    [/checksum: counter\.digest\(\)/, 'the counted checksum', written],
    [/byteSize: BigInt\(counter\.byteSize\)/, 'the counted byte size', written],
    [/widthPx: produced\.width/, 'the measured width', derivative],
    [/heightPx: produced\.height/, 'the measured height', derivative],
  ]) {
    if (!pattern.test(corpus)) fail(`the quartet does not use ${complaint}`);
  }
  // Scoped to the returned output objects. The whole file is the wrong corpus:
  // `APP3-W01B`'s lane discriminator legitimately carries the *source* media
  // type, which says which producer owns the bytes and is never written to a
  // row. What must never happen is the source appearing in the quartet itself.
  for (const output of outputObjects(derivative)) {
    if (/widthPx: source\.|byteSize: source\.byteSize|mediaType: source\.mediaType/.test(output)) {
      fail('the quartet substitutes source Asset metadata');
    }
  }

  // One statement makes it usable, and it is guarded on this attempt's claim.
  if (!/status = 'READY'[\s\S]{0,400}width_px = \$\{input\.widthPx\}/.test(repository)) {
    fail('READY and the quartet are not persisted in one statement');
  }
  if (!/and status = 'PROCESSING'/.test(repository)) {
    fail('finalization is not guarded on this attempt’s claim');
  }
  if (/update assets set|update assets\s/.test(repository)) {
    fail('the normalization repository writes assets.status');
  }
  for (const kind of ['THUMBNAIL', 'CATALOG_PREVIEW']) {
    if (repository.includes(kind)) fail(`the repository references the APP2 kind ${kind}`);
  }
  // No storage call inside a transaction.
  if (
    /runInTransaction\([\s\S]{0,300}(putObjectStream|getObjectStream|deleteObject)/.test(usecase)
  ) {
    fail('an object-storage call happens inside a database transaction');
  }
}
export function checkApp3W01aOutput(rootDir = REPO_ROOT) {
  const failures = [];
  checkOutputContract(rootDir, (message) => failures.push(message));
  return failures;
}

async function main() {
  const failures = checkApp3W01aOutput(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-w01a-output — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-w01a-output — the output policy is frozen at NORMALIZED, unwatermarked WebP with ' +
      'the policy version taken from the shared contract; the quartet comes from the encoder’s ' +
      'own report and the counted stream and never from the source Asset; and READY plus all ' +
      'four fields land in one statement guarded on this attempt’s claim, with no ' +
      'object-storage call inside a transaction and no APP2 derivative kind touched',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
