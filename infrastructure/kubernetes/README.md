# Kubernetes deployment model

Base manifests plus environment overlays, composed with **kustomize built into
`kubectl`** (`kubectl apply -k`). No Helm, no kustomize binary, no cluster
controller: `APP12-H02` §6 asks for the smallest dependency-free
Kubernetes-native shape when no mechanism already owns composition, and this
directory was empty and reserved before H02.

```
base/                  the production deployment model
  config/              non-secret ConfigMap + the Secret contract (names only)
  workloads/           api, worker, storefront, admin, migration Job
  routing/             Gateway API Gateway + HTTPRoutes + HTTP→HTTPS redirect
overlays/production/   external release values; empty until an operator supplies them
overlays/staging/      synthetic values under test control
staging-scaffolding/   disposable PostgreSQL + MinIO — test infrastructure ONLY
```

## Deploying

```sh
node tools/check-release-config.mjs production   # refuses before anything applies
kubectl apply -k infrastructure/kubernetes/overlays/production
```

The preflight is not optional decoration. It renders the overlay, checks every
required key's name and shape, rejects mutable image references and optional
secret references, and **never prints a configured value**. A production overlay
straight from Git fails it, by design: every externally-owned value is empty.

## Two things this directory deliberately does NOT contain

**No `Ingress`, and no ingress-nginx.** `SYSTEM_ARCHITECTURE.md` §13 and
`docs/12-DECISION-LOG.md` D-036 both lock the production edge to the Gateway API
and Kubernetes Services, and state that `ingress-nginx` will not be used. The
concrete Gateway API *controller* remains an open decision requiring an ADR, so
`gatewayClassName` is a per-environment value this repository does not choose.

**No production PostgreSQL, object storage or broker.** The same section lists
stateful topology as subject to an ADR that has not been taken, and §5 of the
H02 prompt forbids moving persistence between in-cluster and managed in either
direction. The applications reach both through configuration (`DATABASE_URL`,
`OBJECT_STORAGE_ENDPOINT`), which is address-agnostic: these manifests run
unchanged against whichever the ADR eventually chooses. `staging-scaffolding/`
supplies disposable instances so the model can be proved end to end without
pre-empting the decision, and is labelled `embroidery.local/disposable: "true"`.

## Configuration changes need a restart

The ConfigMap is a plain resource, not a hashed generator output, so editing it
does not roll the pods. A release changes the image digest and rolls anyway; a
config-only change needs `kubectl rollout restart`. `APP12-H07` owns turning that
into the operator procedure.
