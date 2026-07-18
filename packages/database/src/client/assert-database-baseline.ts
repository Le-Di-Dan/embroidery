/**
 * Fail-fast assertion that the connected server matches the DB6 baseline
 * (DEV-DB6-001, DEV-DB6-002).
 *
 * `initdb` runs once per volume, so a database created before the locale
 * baseline existed keeps `en_US.utf8` forever and cannot be converted in
 * place. Nothing about that state raises an error on its own — text indexes
 * simply get different ordering semantics than DB5 designed for. This check
 * turns that silent divergence into a startup failure.
 */
import { sql } from 'drizzle-orm';
import type { QueryResultRow } from 'pg';

import type { Database } from './create-database-client';

export interface DatabaseBaseline {
  readonly serverVersion: string;
  readonly majorVersion: number;
  readonly encoding: string;
  readonly collate: string;
  readonly ctype: string;
  readonly timeZone: string;
}

const EXPECTED_ENCODING = 'UTF8';
const EXPECTED_COLLATE = 'C';
const EXPECTED_TIME_ZONE = 'UTC';

interface BaselineRow extends QueryResultRow {
  readonly server_version: string;
  readonly encoding: string;
  readonly collate: string;
  readonly ctype: string;
  readonly time_zone: string;
}

export async function readDatabaseBaseline(db: Database): Promise<DatabaseBaseline> {
  const result = await db.execute<BaselineRow>(sql`
    select
      current_setting('server_version') as server_version,
      pg_encoding_to_char(d.encoding) as encoding,
      d.datcollate as collate,
      d.datctype as ctype,
      current_setting('TimeZone') as time_zone
    from pg_database d
    where d.datname = current_database()
  `);

  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('Could not read the database baseline: no row for the current database.');
  }

  return {
    serverVersion: row.server_version,
    majorVersion: Number.parseInt(row.server_version, 10),
    encoding: row.encoding,
    collate: row.collate,
    ctype: row.ctype,
    timeZone: row.time_zone,
  };
}

export function describeBaselineMismatches(
  baseline: DatabaseBaseline,
  expectedMajorVersion: number,
): readonly string[] {
  const problems: string[] = [];

  if (baseline.majorVersion !== expectedMajorVersion) {
    problems.push(
      `server major version is ${baseline.majorVersion}, expected ${expectedMajorVersion} (ADR-DB1-001)`,
    );
  }
  if (baseline.encoding !== EXPECTED_ENCODING) {
    problems.push(`encoding is ${baseline.encoding}, expected ${EXPECTED_ENCODING}`);
  }
  if (baseline.collate !== EXPECTED_COLLATE || baseline.ctype !== EXPECTED_COLLATE) {
    problems.push(
      `collation is ${baseline.collate}/${baseline.ctype}, expected ${EXPECTED_COLLATE}/${EXPECTED_COLLATE} — ` +
        'this database was initialised without POSTGRES_INITDB_ARGS="--locale=C --encoding=UTF8". ' +
        'initdb cannot be re-run in place: reset the volume (see DB6_MULTI_MACHINE_WORKFLOW.md)',
    );
  }
  if (baseline.timeZone !== EXPECTED_TIME_ZONE) {
    problems.push(`TimeZone is ${baseline.timeZone}, expected ${EXPECTED_TIME_ZONE}`);
  }

  return problems;
}

export async function assertDatabaseBaseline(
  db: Database,
  expectedMajorVersion: number,
): Promise<void> {
  const baseline = await readDatabaseBaseline(db);
  const problems = describeBaselineMismatches(baseline, expectedMajorVersion);

  if (problems.length > 0) {
    throw new Error(`Database baseline mismatch:\n  - ${problems.join('\n  - ')}`);
  }
}
