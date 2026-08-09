/**
 * `APP3-S01` §26 — copy one existing derivative object to a second key.
 *
 * Runs **inside** the API container, which already holds the object-storage
 * credentials in its process environment. Nothing here reads a credential out,
 * echoes it, logs it or passes it as an argument: the values travel from the
 * env file into the process and are handed straight to the SDK, which is the
 * ordinary way this repository gives tooling access to storage.
 *
 * A copy rather than a fabricated upload: the bytes the browser proof streams
 * are the ones `APP3-W01A` really produced, so the server's size reconciliation
 * compares two real numbers.
 *
 * Usage (from the host):
 *   docker exec -i <api> sh -c 'cd /app/packages/object-storage && node - copy <src> <dst>' < this
 *   docker exec -i <api> sh -c 'cd /app/packages/object-storage && node - delete <key>' < this
 */
const {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');

const bucket = process.env.OBJECT_STORAGE_DERIVATIVES_BUCKET;
const client = new S3Client({
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
  region: process.env.OBJECT_STORAGE_REGION,
  forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  },
});

const [verb, source, target] = process.argv.slice(2);

async function main() {
  if (verb === 'delete') {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: source }));
    console.log(`deleted|${source}`);
    return;
  }
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${source}`,
      Key: target,
      ContentType: 'image/webp',
      MetadataDirective: 'REPLACE',
    }),
  );
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: target }));
  console.log(`${target}|${String(head.ContentLength)}|${String(head.ContentType)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
