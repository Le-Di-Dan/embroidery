/**
 * Shared runtime for the DB10 backup and restore tools.
 *
 * Every PostgreSQL client program runs *inside* the pinned
 * `postgres:16.14-alpine` container (DEC-DB10-006). Two reasons, both about
 * failure modes rather than convenience:
 *
 * - the client tools are the same build as the server, so version skew — the
 *   most common cause of a restore that "worked" and then did not — cannot
 *   happen;
 * - the connection is a local unix socket, so no password is passed on any
 *   command line, written to any file, or captured in any log. Nothing here
 *   ever handles a credential, which is why nothing here can leak one.
 *
 * Operational tooling, not application code. Nothing imports this at runtime.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';

/** The dev-stack container. Overridable so the same tools work against another host. */
export const DEFAULT_CONTAINER = process.env.DB_BACKUP_CONTAINER ?? 'embroidery-dev-postgres-1';
/** The role the dev image provisions; also overridable. */
export const DEFAULT_ROLE = process.env.DB_BACKUP_ROLE ?? 'embroidery';

/** Exit codes are contractual: callers and tests branch on them. */
export const EXIT = {
  ok: 0,
  failed: 1,
  usage: 2,
  unavailable: 3,
  corrupt: 4,
};

/**
 * Rejects anything that is not a plain PostgreSQL identifier.
 *
 * Database names reach `psql -d` and `createdb` as arguments. `spawnSync`
 * without a shell already prevents word-splitting, but a name containing a
 * quote could still confuse SQL built around it, so the restriction is
 * enforced once, here, rather than trusted at each call site.
 */
export function assertSafeIdentifier(kind, value) {
  if (typeof value !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`${kind} must match /^[a-z_][a-z0-9_]{0,62}$/, received: ${String(value)}`);
  }
  return value;
}

/**
 * Runs a program inside the container, capturing stdout as a buffer.
 *
 * `maxBuffer` is raised because a custom-format dump of the full schema is
 * megabytes even when the tables are nearly empty.
 */
export function execInContainer(container, argv, { stdin, maxBuffer = 512 * 1024 * 1024 } = {}) {
  const result = spawnSync('docker', ['exec', '-i', container, ...argv], {
    encoding: 'buffer',
    input: stdin,
    maxBuffer,
    shell: false,
  });
  return {
    status: result.status ?? EXIT.failed,
    stdout: result.stdout ?? Buffer.alloc(0),
    stderr: (result.stderr ?? Buffer.alloc(0)).toString('utf8').trim(),
    spawnError: result.error,
  };
}

/** Runs `psql -tAc` and returns trimmed stdout, or throws with the server's own message. */
export function psql(container, database, statement, options = {}) {
  const args = ['psql', '-U', DEFAULT_ROLE, '-d', database, '-tAc', statement];
  if (options.expanded === true) {
    args.splice(args.indexOf('-tAc'), 0, '--no-psqlrc');
  }
  const result = execInContainer(container, args);
  if (result.status !== EXIT.ok) {
    throw new Error(`psql failed on "${database}": ${result.stderr || 'no diagnostic'}`);
  }
  return result.stdout.toString('utf8').trim();
}

/** True when the container is present and its server answers. */
export function serverReachable(container, database = 'postgres') {
  const result = execInContainer(container, ['pg_isready', '-U', DEFAULT_ROLE, '-d', database]);
  return result.status === EXIT.ok;
}

export function databaseExists(container, database) {
  const rows = psql(
    container,
    'postgres',
    `select 1 from pg_database where datname = '${database}'`,
  );
  return rows !== '';
}

/**
 * Exact row counts for every table in `public`, in one round trip.
 *
 * `reltuples` is an estimate and would make restore parity unfalsifiable, so
 * this counts for real. `query_to_xml` is the standard way to run a
 * per-table aggregate from a catalog query without a procedural loop.
 */
export function tableRowCounts(container, database) {
  const statement = `
    select table_name || '=' || (
      xpath('/row/c/text()', query_to_xml(
        format('select count(*) as c from public.%I', table_name), false, true, ''))
    )[1]::text
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name`;
  const counts = {};
  for (const line of psql(container, database, statement).split('\n')) {
    if (line.trim() === '') continue;
    const [name, value] = line.trim().split('=');
    counts[name] = Number(value);
  }
  return counts;
}

/**
 * Every identity sequence whose next value would collide with a row already in
 * its table.
 *
 * Row-count parity says the rows arrived; it says nothing about whether the
 * sequence that mints their keys came with them. `pg_restore` loads an identity
 * column through `COPY`, and `COPY` does not advance the owned sequence, so a
 * restore can be byte-perfect and still leave every sequence at its start
 * value. Nothing is wrong until the first insert, which then fails on the
 * **primary key** — a constraint no application-level `ON CONFLICT` guard is
 * written against, because the guard targets the business key. That is exactly
 * how `APP12-V02-C2` began: an Admin image upload returning HTTP 500 in four
 * milliseconds, reported to the operator as an object-storage outage.
 *
 * `last_value` is read through `pg_sequences`, which reports it without
 * consuming a value, so this check is safe to run on a live database.
 * A sequence that has never been called reports `NULL`, and any populated table
 * behind one is drifted by definition.
 */
export function identitySequenceDrift(container, database) {
  const statement = `
    select c.relname || '=' || coalesce(s.last_value::text, 'never') || '=' || (
      xpath('/row/c/text()', query_to_xml(
        format('select max(%I) as c from public.%I', a.attname, c.relname), false, true, ''))
    )[1]::text
    from pg_class c
    join pg_attribute a
      on a.attrelid = c.oid and a.attnum > 0 and a.attidentity <> ''
    left join pg_sequences s
      on s.schemaname = 'public'
     and s.sequencename = replace(pg_get_serial_sequence(c.relname, a.attname), 'public.', '')
    where c.relkind = 'r' and c.relnamespace = 'public'::regnamespace
    order by c.relname`;
  const drifted = [];
  for (const line of psql(container, database, statement).split('\n')) {
    if (line.trim() === '') continue;
    const [table, last, max] = line.trim().split('=');
    if (max === '' || max === undefined) continue;
    const highest = Number(max);
    const current = last === 'never' ? 0 : Number(last);
    if (current < highest) {
      drifted.push({ table, sequenceLastValue: last, maxId: highest });
    }
  }
  return drifted;
}

/**
 * Advances every identity sequence to its table's highest key.
 *
 * `setval(..., max(id), true)` marks the value as consumed, so the next insert
 * receives `max + 1`. Tables the drift report did not name are left untouched:
 * a sequence that is legitimately *ahead* of its rows (values burned by rolled
 * back transactions) is correct as it stands, and pulling it back would create
 * the collision this repairs.
 */
export function resyncIdentitySequences(container, database, drifted) {
  for (const { table } of drifted) {
    assertSafeIdentifier('table', table);
    psql(
      container,
      database,
      `select setval(pg_get_serial_sequence('public.${table}', a.attname),
                     (xpath('/row/c/text()', query_to_xml(
                        format('select max(%I) as c from public.%I', a.attname, '${table}'),
                        false, true, '')))[1]::text::bigint,
                     true)
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
        where c.relname = '${table}'
          and c.relnamespace = 'public'::regnamespace
          and a.attnum > 0 and a.attidentity <> ''`,
    );
  }
  return drifted.length;
}

/** The applied-migration count from the drizzle journal schema, or null if absent. */
export function migrationJournalCount(container, database) {
  try {
    const value = psql(
      container,
      database,
      "select count(*) from drizzle.__drizzle_migrations where to_regclass('drizzle.__drizzle_migrations') is not null",
    );
    return value === '' ? null : Number(value);
  } catch {
    return null;
  }
}

export function serverVersion(container) {
  return psql(container, 'postgres', 'show server_version');
}

export async function sha256OfFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

export async function fileSize(path) {
  return (await stat(path)).size;
}

export async function readManifest(path) {
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  for (const field of ['backupId', 'artifact', 'artifactSha256', 'format', 'rowCounts']) {
    if (parsed[field] === undefined) {
      throw new Error(`manifest is missing required field "${field}": ${path}`);
    }
  }
  return parsed;
}

/**
 * Parses `--key value` and `--flag` arguments.
 *
 * Deliberately minimal and strict: an unknown key is a usage error rather
 * than a silently ignored typo, because a typo in `--out` on a backup tool
 * means the backup is somewhere nobody will look for it.
 */
export function parseArgs(argv, { keys, flags }) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(`unexpected argument: ${token}`);
    }
    const name = token.slice(2);
    if (flags.includes(name)) {
      parsed[name] = true;
      continue;
    }
    if (!keys.includes(name)) {
      throw new Error(`unknown option: --${name}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`--${name} requires a value`);
    }
    parsed[name] = value;
    i += 1;
  }
  return parsed;
}
