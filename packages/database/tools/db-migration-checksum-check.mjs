/**
 * DB6-S27 — migration checksum checker.
 *
 * Found during S27's failure rehearsal: `drizzle-orm`'s migrator only hashes
 * a migration file at the moment it is first applied — it never re-verifies
 * an already-applied file's bytes on a later run, so a cosmetic-looking
 * post-hoc edit to `0000`-`0031` is silently invisible to `pnpm db:migrate`
 * and to `drizzle-kit check` (which only diffs schema.ts against snapshots,
 * not raw SQL bytes). This script closes that gap: it recomputes a SHA-256
 * of every migration file and compares it against the frozen manifest.
 * Usage: node db-migration-checksum-check.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const manifestPath = join(here, 'migration-checksums.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const liveFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const problems = [];

for (const file of Object.keys(manifest)) {
  if (!liveFiles.includes(file)) {
    problems.push(`frozen migration ${file} is missing from migrations/`);
  }
}
for (const file of liveFiles) {
  if (!(file in manifest)) {
    problems.push(
      `${file} is not in the frozen checksum manifest — add it (a genuinely new migration) or investigate`,
    );
    continue;
  }
  const actual = createHash('sha256')
    .update(readFileSync(join(migrationsDir, file)))
    .digest('hex');
  if (actual !== manifest[file]) {
    problems.push(
      `${file} content changed since it was frozen — expected sha256 ${manifest[file]}, got ${actual}`,
    );
  }
}

if (problems.length === 0) {
  console.log(
    `[migration-checksum] all ${liveFiles.length} migration files match the frozen manifest`,
  );
  process.exit(0);
}

console.log(`[migration-checksum] ${problems.length} problem(s):`);
for (const p of problems) console.log(`  - ${p}`);
process.exitCode = 1;
