/**
 * The metric cardinality and privacy contract (`APP12-H03` §5).
 *
 * A metric label is the one place in this system where an unbounded value turns
 * a cheap counter into an unbounded time series, and where a value that is
 * merely *logged* becomes a value that is *stored forever, indexed, and served
 * to anyone who can read the metrics plane*. Both failures are silent: nothing
 * throws, the dashboard still renders, and the damage is only visible weeks
 * later as a Prometheus that will not start or as a customer's phone number in
 * a scrape.
 *
 * So labels are not a free-form map here. A label name must be on the allow
 * list, its value must be short and drawn from a bounded vocabulary, and the
 * registry additionally caps how many distinct series one metric may ever
 * create. The name allow list is the primary defence; the denylist below is a
 * second, redundant one that exists to make the *intent* executable — a future
 * checkpoint that widens the allow list still cannot smuggle `orderId` in.
 *
 * `H01`'s redaction policy stays binding on logs and is unchanged by this file;
 * this is the equivalent policy for the metrics plane, which `H01` predates.
 */

/**
 * Every label name the metrics plane may use.
 *
 * `APP12-H03` §5 lists eleven as "allowed examples"; two more are added here
 * because a signal this checkpoint is required to expose has nowhere else to
 * put its dimension, and both are closed vocabularies rather than open text:
 *
 * - `dependency` — §9 requires DB/object-storage system errors to be
 *   instrumented at application boundaries, and the boundary's identity is not
 *   an `operation`;
 * - `invariant` — §9 requires actionable invariant gauges, and one gauge per
 *   invariant name is how a single gauge family carries them.
 */
export const ALLOWED_METRIC_LABEL_NAMES = [
  'service',
  'operation',
  'route_template',
  'method',
  'status_class',
  'outcome',
  'origin',
  'payment_kind',
  'job_type',
  'transition',
  'reason_class',
  'dependency',
  'invariant',
] as const;

export type MetricLabelName = (typeof ALLOWED_METRIC_LABEL_NAMES)[number];

/**
 * Label names that are refused even if a later checkpoint adds them to the
 * allow list. Verbatim from `APP12-H03` §5, normalised to lowercase without
 * separators so `orderId`, `order_id` and `ORDERID` are the same entry.
 */
export const FORBIDDEN_METRIC_LABEL_NAMES = [
  'orderid',
  'ordercode',
  'customerid',
  'phone',
  'email',
  'address',
  'skuid',
  'productslug',
  'slug',
  'requestid',
  'jobid',
  'attemptid',
  'grantid',
  'token',
  'transferreference',
  'reference',
  'filename',
  'file',
  'url',
  'path',
  'exceptionmessage',
  'message',
  'stack',
  'secret',
  'password',
  'credential',
  'userid',
  'ip',
] as const;

/**
 * Structural bans applied to a label name after the exact denylist. A name
 * ending in `id`, or containing any of these fragments, is refused wherever it
 * appears — `paymentId`, `x_token_y`, `customer_email_domain` all fail.
 */
const FORBIDDEN_NAME_FRAGMENTS = [
  'token',
  'secret',
  'password',
  'passwd',
  'credential',
  'private',
  'email',
  'phone',
  'address',
  'url',
  'slug',
  'filename',
] as const;

/** Longest label value the plane will store. Values above this are refused. */
export const MAX_METRIC_LABEL_VALUE_LENGTH = 64;

/**
 * A label value must look like a stable enumeration member, not like data.
 * Lowercase alphanumerics with `_`, `.`, `-`, `/` and `:` — enough for
 * `route_template` (`/api/orders/:orderId`) and `outcome` (`system_error`),
 * and not enough for a name, an address or a sentence. Uppercase is allowed
 * because the domain's own vocabularies (`READY_MADE`, `FULL`, `DELIVERED`)
 * are uppercase and re-casing them at the metric boundary would make a
 * dashboard query stop matching the domain it reports on.
 */
const LABEL_VALUE_PATTERN = /^[A-Za-z0-9_.:/-]+$/;

/** Metric names: Prometheus's own rule, with a mandatory `embroidery_` prefix. */
export const METRIC_NAME_PREFIX = 'embroidery_';
const METRIC_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

export class MetricContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetricContractError';
  }
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** `true` when the name is one this plane may never carry, for any reason. */
export function isForbiddenLabelName(name: string): boolean {
  const normalized = normalizeName(name);
  if ((FORBIDDEN_METRIC_LABEL_NAMES as readonly string[]).includes(normalized)) {
    return true;
  }
  if (normalized.endsWith('id') && normalized !== 'id') {
    return true;
  }
  return FORBIDDEN_NAME_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/** Throws unless every name is allowed, sorted and free of duplicates. */
export function assertLabelNames(metric: string, names: readonly string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      throw new MetricContractError(`Metric "${metric}" declares label "${name}" twice.`);
    }
    seen.add(name);
    if (isForbiddenLabelName(name)) {
      throw new MetricContractError(
        `Metric "${metric}" declares forbidden high-cardinality label "${name}".`,
      );
    }
    if (!(ALLOWED_METRIC_LABEL_NAMES as readonly string[]).includes(name)) {
      throw new MetricContractError(
        `Metric "${metric}" declares label "${name}", which is not on the allow list.`,
      );
    }
  }
}

/** Throws unless the metric name is a valid, prefixed Prometheus name. */
export function assertMetricName(name: string): void {
  if (!METRIC_NAME_PATTERN.test(name)) {
    throw new MetricContractError(`Metric name "${name}" is not a valid Prometheus name.`);
  }
  if (!name.startsWith(METRIC_NAME_PREFIX)) {
    throw new MetricContractError(`Metric name "${name}" must start with "${METRIC_NAME_PREFIX}".`);
  }
}

/**
 * Throws unless the value is short and enumeration-shaped.
 *
 * This is the last gate before a value becomes a permanent series, so it
 * refuses rather than truncates: a truncated phone number is still a phone
 * number, and a truncated UUID is still unbounded.
 */
export function assertLabelValue(metric: string, name: string, value: string): void {
  if (value.length === 0) {
    throw new MetricContractError(`Metric "${metric}" label "${name}" is empty.`);
  }
  if (value.length > MAX_METRIC_LABEL_VALUE_LENGTH) {
    throw new MetricContractError(
      `Metric "${metric}" label "${name}" is ${String(value.length)} characters; ` +
        `the limit is ${String(MAX_METRIC_LABEL_VALUE_LENGTH)}.`,
    );
  }
  if (!LABEL_VALUE_PATTERN.test(value)) {
    throw new MetricContractError(
      `Metric "${metric}" label "${name}" carries a value outside the enumeration character set.`,
    );
  }
}
