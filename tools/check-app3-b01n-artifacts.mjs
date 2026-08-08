/**
 * The artifacts `APP3-B01N` must leave byte-for-byte alone.
 *
 * Split out of `check-app3-b01n.mjs` because it is a different kind of check:
 * everything here is a *measurement* of a generated or frozen artifact, and it
 * has to reproduce `check:generated`'s tree hash exactly rather than reason
 * about source. A count would not be enough — a checkpoint that swapped one
 * operation for another would keep the count and change the contract — so the
 * digest is the assertion and the counts only make a failure readable.
 *
 * Read-only, cross-platform pure Node.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  isB03ADelivered,
  isB04Delivered,
  isB05Delivered,
  isB03Delivered,
  isB06BDelivered,
  isB08Delivered,
  isP04Delivered,
} from './app3-accepted-surface.mjs';

/**
 * The published surface, frozen **per world** (`APP3-B01-C1`, extended by
 * `APP3-B02`).
 *
 * `APP3-B01N` publishes no HTTP surface at all, and that is the property being
 * asserted — the totals and the digests are only how it is measured. A single
 * frozen digest could not survive the checkpoint that legitimately adds one
 * operation, so there are two exact worlds and no third: the artifacts must
 * match `B01N` before `APP3-B02` and `B02` after it. Both are recomputed here,
 * never trusted from a report.
 */
export const OPENAPI_FACTS = Object.freeze({ paths: 18, operations: 22, schemas: 44 });
export const OPENAPI_FACTS_AFTER_B02 = Object.freeze({ paths: 19, operations: 23, schemas: 45 });
export const OPENAPI_FILE = 'packages/contracts/openapi/openapi.generated.json';
const OPENAPI_SHA256 = '53ef5650c7e09cb93db885b452f2ae0a15ff4237de0eada9991807ce1629349e';
const CLIENT_TREE_SHA256 = '7c44662902317e306d2deecd128b544ab2ad9faf5298bed7d813d3377a6b19bf';
const OPENAPI_SHA256_AFTER_B02 = '38ab7dae47d297471325424496668ca6526fe533915f9df4302f691d7f6be683';
const CLIENT_TREE_SHA256_AFTER_B02 =
  '129883fa61c01c15a19150256f27cdbddc37c92eac3a848b6e22b77bb4629d9c';
// `APP3-P03` republished every schema-backed request body from its Zod schema.
// The *counts* are identical — it adds no path, operation or component — but the
// bytes are not, which is exactly what a digest is for: the surface did not
// grow, its description became true.
const OPENAPI_SHA256_AFTER_P03 = 'd1dfe0479759392e9c57e9a767165cab56c80f0495edab7cf474ac7924244709';
/** `APP3-B07` — the first surface growth since B01N: two Session operations. */
const OPENAPI_SHA256_AFTER_B07 = '6da98f6fc4ef67efeffa97321903b47aaf0698d9b7f635c9f0c941df2ca8c6db';
const CLIENT_TREE_SHA256_AFTER_B07 =
  '9130056543917dda7c3967b8d42ee6630ee3d1e9e1c3140e27aa6d93c1cd6db4';
const OPENAPI_FACTS_AFTER_B07 = Object.freeze({ paths: 21, operations: 25, schemas: 48 });
/** `APP3-B06B` — one more Session operation: the anonymous raster intake. */
const OPENAPI_SHA256_AFTER_B06B =
  'c366677db8b38c59128739b8b6d560de049ed5510dd01cacd1c6c8cd73595cdd';
const CLIENT_TREE_SHA256_AFTER_B06B =
  '6cb189bbdff720920bf10dad4d3520dd962ff8dbd6a57630636d4be8730075c7';
const OPENAPI_FACTS_AFTER_B06B = Object.freeze({ paths: 22, operations: 26, schemas: 49 });
const OPENAPI_SHA256_AFTER_B08 = '698ef2e5eed11fcd3d04a6eb059bb9a4e3a10122563f3017a0d4f3f64b7626b5';
const CLIENT_TREE_SHA256_AFTER_B08 =
  'af1fe9e510f91b8e0a7426a26e9865aa548303fcde36cbb4a90fc99faaa433c7';
const OPENAPI_FACTS_AFTER_B08 = Object.freeze({ paths: 23, operations: 27, schemas: 63 });
/** `APP3-P04` — no new path or operation; the three Session responses become concrete. */
const OPENAPI_SHA256_AFTER_P04 = 'f1413fcaeb7b85d10de9c06f58a2baa13b78548cc1b48cf5cd5962b60e1c027a';
const CLIENT_TREE_SHA256_AFTER_P04 =
  'a05be6cfc7754607d446063dbfc620cc1784c90737e5b517a873e139d8011223';
const OPENAPI_FACTS_AFTER_P04 = Object.freeze({ paths: 23, operations: 27, schemas: 66 });
/** `APP3-B03` — the first Admin Design Template surface: two paths, three operations. */
const OPENAPI_SHA256_AFTER_B03 = '0ec7f52447c1d27247b70aa132afb94839619080ad7fdeaf322013fbb0c5ae0b';
const CLIENT_TREE_SHA256_AFTER_B03 =
  '4dc6d5967345ffd53b3227bfd8e5c1ab872258bf8cae560f91e42fa926eb45e7';
const OPENAPI_FACTS_AFTER_B03 = Object.freeze({ paths: 25, operations: 30, schemas: 72 });
/** `APP3-B03A` — one draft-save operation on one new path. */
const OPENAPI_SHA256_AFTER_B03A =
  '42caeba94149a51b2cb437670093a8435d263e0bf0bbfa35c514229fdaef3bf1';
const CLIENT_TREE_SHA256_AFTER_B03A =
  'f5097275272ada16c47d99ef8fa6be113170b4464d305cdc44d70c737867956e';
const OPENAPI_FACTS_AFTER_B03A = Object.freeze({ paths: 26, operations: 31, schemas: 73 });
/** `APP3-B04` — the three LC-24 lifecycle operations. */
const OPENAPI_SHA256_AFTER_B04 = 'f8a14fedde8f855742efe6b7e54218720df4d099544f664a7c55a3b57ac1d526';
const CLIENT_TREE_SHA256_AFTER_B04 =
  '2ead0316b3a2b5ccecbb588b5a17ff5fd2272700a29fbe645dc4d824897ce433';
const OPENAPI_FACTS_AFTER_B04 = Object.freeze({ paths: 29, operations: 34, schemas: 76 });
/** `APP3-B05` — the two anonymous public Design Template reads. */
const OPENAPI_SHA256_AFTER_B05 = '972490ac5e47e81640cefecf6d5d84b29ade6908dd7a6b41dabd7be27086c18b';
const CLIENT_TREE_SHA256_AFTER_B05 =
  '87951f1b521c02ae411f553c10e8806514496d1cf41a4cb1326608e0c096c1b5';
const OPENAPI_FACTS_AFTER_B05 = Object.freeze({ paths: 31, operations: 36, schemas: 81 });
const CLIENT_TREE_SHA256_AFTER_P03 =
  '3fcc05d01e01fec9c8566348be6aacf7beefdf654a0487f66e061b3234ead7a8';
const PHASE_FILE = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';

function phaseStatus(rootDir) {
  const path = join(rootDir, PHASE_FILE);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/** True once `APP3-B02` has delivered its one public operation. */
function isB02Delivered(rootDir) {
  return /APP3-B02\s*=\s*COMPLETE/.test(phaseStatus(rootDir));
}

/** True once `APP3-P03` has republished the request bodies. */
function isP03Delivered(rootDir) {
  return /APP3-P03\s*=\s*COMPLETE/.test(phaseStatus(rootDir));
}

/** True once `APP3-B07` has published the two Session operations. */
function isB07Delivered(rootDir) {
  return /APP3-B07\s*=\s*COMPLETE/.test(phaseStatus(rootDir));
}
const GENERATED_CLIENT_DIR = 'packages/api-client/src/generated';
const MIGRATION_COUNT = 34;
const HTTP_METHODS = ['get', 'put', 'post', 'patch', 'delete'];

/**
 * The generated client's tree hash, computed exactly as `check:generated` does:
 * path, newline, LF-normalized content, NUL, in sorted order.
 */
function hashGeneratedTree(dir) {
  const files = [];
  const walk = (directory, prefix) => {
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(directory, entry.name), relative);
      else files.push(relative);
    }
  };
  walk(dir, '');

  const combined = createHash('sha256');
  for (const relative of files.sort()) {
    combined.update(relative);
    combined.update('\n');
    combined.update(readFileSync(join(dir, ...relative.split('/')), 'utf8').replace(/\r\n/g, '\n'));
    combined.update('\0');
  }
  return combined.digest('hex');
}

/** 12, 13 — no HTTP surface, no client change, no migration. */
export function checkApp3B01NArtifacts(rootDir, fail) {
  // Three ordered worlds, resolved newest first. `APP3-P03` implies `APP3-B02`
  // — it can only have republished a surface that already existed — so the
  // counts stay the B02 ones and only the digests move.
  // A fourth world: `APP3-B07` is the first checkpoint since B01N to publish new
  // operations, so both the counts and the digests move together. A fifth adds
  // `APP3-B06B`'s single intake operation. Historical constants are kept, not
  // replaced — each world still proves its own artifact, so a rollback to any
  // earlier phase state is still checked against what that state actually
  // published rather than against the newest numbers.
  // `APP3-B03` is the newest world. It is checked first for the same reason
  // every earlier one is: each state still proves its own artifact, so a
  // rollback to any earlier phase is checked against what that phase published
  // rather than against the newest numbers.
  const afterB05 = isB05Delivered(rootDir);
  const afterB04 = afterB05 || isB04Delivered(rootDir);
  const afterB03A = afterB04 || isB03ADelivered(rootDir);
  const afterB03 = afterB03A || isB03Delivered(rootDir);
  const afterP04 = afterB03 || isP04Delivered(rootDir);
  const afterB08 = afterP04 || isB08Delivered(rootDir);
  const afterB06B = afterB08 || isB06BDelivered(rootDir);
  const afterB07 = afterB06B || isB07Delivered(rootDir);
  const afterP03 = afterB07 || isP03Delivered(rootDir);
  const afterB02 = afterP03 || isB02Delivered(rootDir);
  const facts = afterB05
    ? OPENAPI_FACTS_AFTER_B05
    : afterB04
      ? OPENAPI_FACTS_AFTER_B04
      : afterB03A
        ? OPENAPI_FACTS_AFTER_B03A
        : afterB03
          ? OPENAPI_FACTS_AFTER_B03
          : afterP04
            ? OPENAPI_FACTS_AFTER_P04
            : afterB08
              ? OPENAPI_FACTS_AFTER_B08
              : afterB06B
                ? OPENAPI_FACTS_AFTER_B06B
                : afterB07
                  ? OPENAPI_FACTS_AFTER_B07
                  : afterB02
                    ? OPENAPI_FACTS_AFTER_B02
                    : OPENAPI_FACTS;
  const expectedDigest = afterB05
    ? OPENAPI_SHA256_AFTER_B05
    : afterB04
      ? OPENAPI_SHA256_AFTER_B04
      : afterB03A
        ? OPENAPI_SHA256_AFTER_B03A
        : afterB03
          ? OPENAPI_SHA256_AFTER_B03
          : afterP04
            ? OPENAPI_SHA256_AFTER_P04
            : afterB08
              ? OPENAPI_SHA256_AFTER_B08
              : afterB06B
                ? OPENAPI_SHA256_AFTER_B06B
                : afterB07
                  ? OPENAPI_SHA256_AFTER_B07
                  : afterP03
                    ? OPENAPI_SHA256_AFTER_P03
                    : afterB02
                      ? OPENAPI_SHA256_AFTER_B02
                      : OPENAPI_SHA256;
  const expectedTree = afterB05
    ? CLIENT_TREE_SHA256_AFTER_B05
    : afterB04
      ? CLIENT_TREE_SHA256_AFTER_B04
      : afterB03A
        ? CLIENT_TREE_SHA256_AFTER_B03A
        : afterB03
          ? CLIENT_TREE_SHA256_AFTER_B03
          : afterP04
            ? CLIENT_TREE_SHA256_AFTER_P04
            : afterB08
              ? CLIENT_TREE_SHA256_AFTER_B08
              : afterB06B
                ? CLIENT_TREE_SHA256_AFTER_B06B
                : afterB07
                  ? CLIENT_TREE_SHA256_AFTER_B07
                  : afterP03
                    ? CLIENT_TREE_SHA256_AFTER_P03
                    : afterB02
                      ? CLIENT_TREE_SHA256_AFTER_B02
                      : CLIENT_TREE_SHA256;

  const path = join(rootDir, OPENAPI_FILE);
  if (!existsSync(path)) {
    fail('the OpenAPI artifact is missing');
  } else {
    const raw = readFileSync(path);
    const digest = createHash('sha256').update(raw).digest('hex');
    if (digest !== expectedDigest) fail(`the OpenAPI artifact changed (sha256 ${digest})`);

    const document = JSON.parse(raw.toString('utf8'));
    const items = Object.values(document.paths ?? {});
    for (const [measured, expected, label] of [
      [Object.keys(document.paths ?? {}).length, facts.paths, 'paths'],
      [
        items.flatMap((item) => Object.keys(item).filter((m) => HTTP_METHODS.includes(m))).length,
        facts.operations,
        'operations',
      ],
      [Object.keys(document.components?.schemas ?? {}).length, facts.schemas, 'schemas'],
    ]) {
      if (measured !== expected) {
        fail(`the OpenAPI document declares ${String(measured)} ${label}; B01N adds none`);
      }
    }
    // The counts and the digest above are the real assertion. This word ban is a
    // proxy that only held while no delivered operation legitimately said
    // "normalization"; `APP3-B06B`'s intake does.
    if (!isB06BDelivered(rootDir) && JSON.stringify(document).includes('normalization')) {
      fail('an HTTP operation or schema mentions normalization; B01N adds no HTTP surface');
    }
  }

  const tree = hashGeneratedTree(join(rootDir, GENERATED_CLIENT_DIR));
  if (tree !== expectedTree) fail(`the generated client changed (tree hash ${tree})`);

  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; B01N adds none`);
  }
}
