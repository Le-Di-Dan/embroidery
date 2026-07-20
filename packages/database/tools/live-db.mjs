/**
 * Shared live-catalog connection helper for the DB6-S26 verification
 * checkers. Every checker in this directory takes a disposable database's
 * connection string as `process.argv[2]` and never mutates data — read-only
 * `pg_catalog`/`information_schema` queries only.
 */
import pg from 'pg';

/** Mirrors `redactUrl` from `src/config/database-config.ts` — never echo a credential. */
export function redactUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password !== '') parsed.password = '***';
    return parsed.toString();
  } catch {
    return '<unparseable database url>';
  }
}

export async function connect(url) {
  if (!url) {
    console.error('usage: node <checker>.mjs <postgres-connection-string>');
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    console.error(`connection failed for ${redactUrl(url)}: ${err.code ?? err.message}`);
    process.exit(2);
  }
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
