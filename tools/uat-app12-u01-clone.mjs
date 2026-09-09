/**
 * `APP12-U01` — deriving the disposable UAT world from the persisted G03 truth.
 *
 * §4 of the brief asks for a production-like world built from the *actual*
 * persisted G03 catalog, with the shared database and the shared object store
 * both read-only. This module is the two halves of that derivation:
 *
 *   1. `cloneDatabase` — `pg_dump` of the shared database (a read-only
 *      operation) restored into `embroidery_db7_u01_*` on the run's own
 *      ephemeral PostgreSQL. The whole database, not a G03 subset, so every
 *      identity in the manifest — Product, variant, SKU, Asset, `product_media`
 *      row — survives with the id the manifest publishes and the UAT evidence
 *      can be reconciled against it.
 *   2. `cloneObjectStore` — every object in the shared originals and
 *      derivatives buckets copied, key for key, into the run's ephemeral MinIO.
 *      Keys are preserved because the cloned `assets.storage_key` rows point at
 *      them; a rewritten key would give the clone a catalog of broken images.
 *
 * Two guards make the read-only half structural rather than remembered:
 * `assertDisposableTarget` refuses any target database that is not
 * `embroidery_db7_u01_*`, and the source is only ever opened by `pg_dump` and
 * by S3 `ListObjects`/`GetObject`. Nothing here can write to the shared world.
 *
 * Test/UAT tooling. Never imported by application code.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const storageRequire = createRequire(
  new URL('../packages/object-storage/package.json', import.meta.url),
);

/** The disposable-name contract every APP12 fixture already enforces. */
export function assertDisposableTarget(name) {
  if (!name.startsWith('embroidery_db7_u01_')) {
    throw new Error(
      `Refusing to clone into "${name}": APP12-U01 may only write to a disposable ` +
        'embroidery_db7_u01_* database (brief §3, §4).',
    );
  }
  return name;
}

function run(command, args, { input, capture = false, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: [input === undefined ? 'ignore' : 'pipe', capture ? 'pipe' : 'ignore', 'pipe'],
      shell: false,
    });
    const out = [];
    let err = '';
    child.stdout?.on('data', (chunk) => out.push(chunk));
    child.stderr?.on('data', (chunk) => (err += String(chunk)));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(capture ? Buffer.concat(out) : undefined);
      else reject(new Error(`${command} ${args[0]} exited ${String(code)}: ${err.trim().slice(-500)}`));
    });
    if (input !== undefined) {
      child.stdin.end(input);
    }
  });
}

/** The container id backing one Compose service of this run's project. */
export async function composeContainerId({ projectName, file, service, env }) {
  const id = String(
    await run('docker', ['compose', '-p', projectName, '-f', file, 'ps', '-q', service], {
      capture: true,
      env,
    }),
  ).trim();
  if (id === '') {
    throw new Error(`Compose service "${service}" has no container in ${projectName}.`);
  }
  return id;
}

/**
 * Dumps the shared database and restores it into the run's disposable one.
 *
 * `--no-owner --no-privileges` because the ephemeral cluster has only its own
 * superuser; ownership in the clone is a property of the clone, and nothing the
 * UAT observes depends on it. The dump is taken in the source container and
 * streamed through this process — it never touches the repository.
 *
 * @param {{ sourceContainer: string, sourceUser: string, sourceDatabase: string,
 *           targetContainer: string, targetUser: string, targetDatabase: string,
 *           log?: (m: string) => void }} params
 */
export async function cloneDatabase({
  sourceContainer,
  sourceUser,
  sourceDatabase,
  targetContainer,
  targetUser,
  targetDatabase,
  log = () => {},
}) {
  assertDisposableTarget(targetDatabase);
  log(`dumping ${sourceDatabase} (read-only)`);
  const dump = await run(
    'docker',
    ['exec', sourceContainer, 'pg_dump', '-U', sourceUser, '-d', sourceDatabase, '-Fc'],
    { capture: true },
  );
  log(`dump ${String(dump.length)} bytes; creating ${targetDatabase}`);
  await run('docker', [
    'exec',
    targetContainer,
    'psql',
    '-U',
    targetUser,
    '-d',
    'postgres',
    '-c',
    `create database ${targetDatabase}`,
  ]);
  await run(
    'docker',
    [
      'exec',
      '-i',
      targetContainer,
      'pg_restore',
      '-U',
      targetUser,
      '-d',
      targetDatabase,
      '--no-owner',
      '--no-privileges',
    ],
    { input: dump },
  );
  log(`restored into ${targetDatabase}`);
  return { bytes: dump.length };
}

function s3Client({ endpoint, accessKeyId, secretAccessKey }) {
  const { S3Client } = storageRequire('@aws-sdk/client-s3');
  return new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function listAll(client, bucket) {
  const { ListObjectsV2Command } = storageRequire('@aws-sdk/client-s3');
  const keys = [];
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const item of page.Contents ?? []) keys.push(item.Key);
    token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
  } while (token !== undefined);
  return keys;
}

/**
 * Copies every object of the two shared buckets into the run's own buckets.
 *
 * Read on the source (`ListObjectsV2`, `GetObject`), write only on the target.
 * Keys are preserved so the cloned `assets.storage_key` values resolve.
 *
 * @param {{ source: object, target: object, buckets: {from: string, to: string}[],
 *           log?: (m: string) => void }} params
 */
export async function cloneObjectStore({ source, target, buckets, log = () => {} }) {
  const { CreateBucketCommand, GetObjectCommand, PutObjectCommand } =
    storageRequire('@aws-sdk/client-s3');
  const from = s3Client(source);
  const to = s3Client(target);
  const summary = [];
  try {
    for (const pair of buckets) {
      await to.send(new CreateBucketCommand({ Bucket: pair.to })).catch((error) => {
        // `BucketAlreadyOwnedByYou` is the only acceptable failure: the API's own
        // bootstrap may have created it first.
        if (!/AlreadyOwned|AlreadyExists/.test(String(error?.name ?? error))) throw error;
      });
      const keys = await listAll(from, pair.from);
      for (const key of keys) {
        const object = await from.send(new GetObjectCommand({ Bucket: pair.from, Key: key }));
        const body = Buffer.from(await object.Body.transformToByteArray());
        await to.send(
          new PutObjectCommand({
            Bucket: pair.to,
            Key: key,
            Body: body,
            ContentType: object.ContentType,
          }),
        );
      }
      log(`copied ${String(keys.length)} objects ${pair.from} -> ${pair.to}`);
      summary.push({ from: pair.from, to: pair.to, objects: keys.length });
    }
  } finally {
    from.destroy?.();
    to.destroy?.();
  }
  return summary;
}
