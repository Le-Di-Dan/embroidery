/**
 * Query-plan capture for the DB9 benchmark harness (DB9-CP1).
 *
 * `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)` — the full form §16 asks
 * for. Plans are normalised to a compact summary rather than committed as
 * raw JSON dumps: the summary is what a reviewer reads, and a megabyte of
 * node tree in Git is not evidence anyone checks.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';

export interface PlanSummary {
  readonly queryId: string;
  /** Distinct node types, outermost first — e.g. `Limit → Index Scan`. */
  readonly nodes: string;
  readonly indexes: readonly string[];
  readonly actualRows: number;
  readonly estimatedRows: number;
  readonly loops: number;
  readonly sharedHit: number;
  readonly sharedRead: number;
  readonly walBytes: number;
  readonly rowsRemovedByFilter: number;
  readonly sortMethod: string | undefined;
  readonly planningMs: number;
  readonly executionMs: number;
  /** True when any node is a Seq Scan — flagged, never auto-condemned (§28). */
  readonly hasSeqScan: boolean;
  /** True when a Sort or Aggregate spilled to disk. */
  readonly spilled: boolean;
}

interface PlanNode {
  'Node Type'?: string;
  'Index Name'?: string;
  'Actual Rows'?: number;
  'Plan Rows'?: number;
  'Actual Loops'?: number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  'WAL Bytes'?: number;
  'Rows Removed by Filter'?: number;
  'Sort Method'?: string;
  Plans?: PlanNode[];
}

interface ExplainResult {
  Plan: PlanNode;
  'Planning Time'?: number;
  'Execution Time'?: number;
}

/** Anything that can run a raw statement — the disposable client's `db`. */
export interface PlanRunner {
  execute(query: ReturnType<typeof sql>): Promise<{ rows: Record<string, unknown>[] }>;
}

function walk(node: PlanNode, visit: (node: PlanNode) => void): void {
  visit(node);
  for (const child of node.Plans ?? []) {
    walk(child, visit);
  }
}

/**
 * Captures a plan for `statement`.
 *
 * WAL accounting is only meaningful for writes, and `ANALYZE` on a write
 * statement genuinely executes it — callers pass write statements only
 * inside a transaction they intend to roll back.
 */
export async function capturePlan(
  runner: PlanRunner,
  queryId: string,
  statement: ReturnType<typeof sql>,
): Promise<PlanSummary> {
  const result = await runner.execute(
    sql`explain (analyze, buffers, wal, format json) ${statement}`,
  );

  const raw = result.rows[0]?.['QUERY PLAN'];
  const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ExplainResult[];
  const root = parsed[0];
  if (root === undefined) {
    throw new Error(`EXPLAIN returned no plan for ${queryId}.`);
  }

  const nodeTypes: string[] = [];
  const indexes = new Set<string>();
  let sharedHit = 0;
  let sharedRead = 0;
  let walBytes = 0;
  let rowsRemovedByFilter = 0;
  let sortMethod: string | undefined;
  let hasSeqScan = false;
  let spilled = false;

  walk(root.Plan, (node) => {
    const type = node['Node Type'];
    if (type !== undefined) {
      nodeTypes.push(type);
      if (type === 'Seq Scan') {
        hasSeqScan = true;
      }
    }
    const indexName = node['Index Name'];
    if (indexName !== undefined) {
      indexes.add(indexName);
    }
    sharedHit += node['Shared Hit Blocks'] ?? 0;
    sharedRead += node['Shared Read Blocks'] ?? 0;
    walBytes += node['WAL Bytes'] ?? 0;
    rowsRemovedByFilter += node['Rows Removed by Filter'] ?? 0;
    if (node['Sort Method'] !== undefined) {
      sortMethod = node['Sort Method'];
      if (node['Sort Method'].includes('Disk')) {
        spilled = true;
      }
    }
  });

  return {
    queryId,
    nodes: nodeTypes.join(' → '),
    indexes: [...indexes],
    actualRows: root.Plan['Actual Rows'] ?? 0,
    estimatedRows: root.Plan['Plan Rows'] ?? 0,
    loops: root.Plan['Actual Loops'] ?? 0,
    sharedHit,
    sharedRead,
    walBytes,
    rowsRemovedByFilter,
    sortMethod,
    planningMs: root['Planning Time'] ?? 0,
    executionMs: root['Execution Time'] ?? 0,
    hasSeqScan,
    spilled,
  };
}

/**
 * Estimate-quality ratio. Values far from 1 mean the planner is guessing —
 * the flag §28 asks for, reported rather than acted on automatically.
 */
export function estimateError(plan: PlanSummary): number {
  if (plan.actualRows === 0) {
    return plan.estimatedRows === 0 ? 1 : Number.POSITIVE_INFINITY;
  }
  return Math.round((plan.estimatedRows / plan.actualRows) * 100) / 100;
}
