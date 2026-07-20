/**
 * Shared live-catalog connection helper for the DB6-S26 verification
 * checkers. Every checker in this directory takes a disposable database's
 * connection string as `process.argv[2]` and never mutates data — read-only
 * `pg_catalog`/`information_schema` queries only.
 */
import pg from 'pg';

export async function connect(url) {
  if (!url) {
    throw new Error('usage: node <checker>.mjs <postgres-connection-string>');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

export function report(name) {
  const notes = [];
  const problems = [];
  return {
    note: (msg) => notes.push(msg),
    fail: (msg) => problems.push(msg),
    finish: () => {
      for (const n of notes) console.log(`[${name}] ${n}`);
      if (problems.length === 0) {
        console.log(`[${name}] all checks passed`);
        return 0;
      }
      console.log(`\n[${name}] ${problems.length} problem(s):`);
      for (const p of problems) console.log(`  - ${p}`);
      return 1;
    },
  };
}
