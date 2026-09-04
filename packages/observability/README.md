# @embroidery/observability

Shared operational telemetry for `@embroidery/api` and `@embroidery/worker`:
the metric cardinality and privacy contract, the three instrument types, the
per-process registry, Prometheus text exposition and the internal metrics
listener.

## Status

Implemented by `APP12-H03`. The CP0 boundary was created empty because the
observability tooling was an open decision; `ADR-APP12-001` closes it and this
package is that decision's shared runtime.

## Boundary

**No vendor SDK, and the dependency list is empty.** That is what makes
`src/metrics/metric-label.ts` the only path a label can take to a scrape:
there is no second client library that could mint a metric without passing the
contract. Adding a vendor SDK here still requires an ADR.

The package builds to `dist` and is loaded at runtime by both applications, so
`main` resolves to compiled JavaScript and never to raw TypeScript source
(`IMP-D018`).

## The contract, in one paragraph

A metric name starts with `embroidery_`. A label name must be on
`ALLOWED_METRIC_LABEL_NAMES` and must survive `isForbiddenLabelName`, which
refuses anything ending in `id` and anything containing a token, credential,
address, phone, email, URL, slug or filename fragment. A label value must be
short and enumeration-shaped; a value that is not is **refused, never
truncated**, because a truncated identifier is still an identifier. On top of
all that, each metric family refuses to create more than
`MAX_SERIES_PER_METRIC` distinct series and counts what it dropped.

## What is deliberately not here

Tracing, log shipping and dashboard definitions. Logs are emitted as
newline-delimited JSON by each application's own logging platform and collected
by Grafana Alloy from the container runtime; dashboards and alert rules live in
`infrastructure/monitoring/` as repository source. No trace backend is
introduced — `APP12-H03` §3 requires correlation, not distributed tracing, and
the request/job correlation the applications already carry satisfies it.
