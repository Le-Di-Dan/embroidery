# Staging scaffolding — test infrastructure, not the production model

Everything in this directory exists so the **production deployment model** can
be proved end to end on a disposable cluster. None of it is production topology
and none of it may become production topology by being copied.

`SYSTEM_ARCHITECTURE.md` §13 lists PostgreSQL, object storage, the queue/broker
and backup storage as *stateful topology subject to an ADR*. No ADR has been
taken. `APP12-H02` §5 forbids moving persistence between in-cluster and managed
in either direction, so the base manifests own neither: the applications reach
both through configuration (`DATABASE_URL`, `OBJECT_STORAGE_ENDPOINT`) and the
same manifests run against whichever the ADR eventually chooses.

A staging deployment still needs *something* at those addresses to answer, so
this directory provides the smallest disposable pair:

- `postgres.yaml` — a single-replica PostgreSQL 16 on an `emptyDir`. **Data is
  lost on every pod restart, deliberately.** A PersistentVolumeClaim here would
  look like a durability claim, and this makes none.
- `minio.yaml` — a single-replica MinIO on an `emptyDir`, for the same reason.

Both carry `embroidery.local/disposable: "true"` so nothing can mistake them for
a durable resource, and both are referenced only by the staging overlay.
