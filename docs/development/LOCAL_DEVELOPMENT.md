# Local Development

**Status:** Active
**Scope:** Bootstrap monorepo (CP0–CP0.2) plus the Nginx development gateway (CP0.3, D-036).

## 1. Prerequisites

| Tool    | Version                                       |
| ------- | --------------------------------------------- |
| Node.js | 22.x LTS (repository pins `>=22`)             |
| pnpm    | 11.5.2 (pinned via `packageManager`/Corepack) |
| Docker  | 27.x with Docker Compose v2                   |

Enable the pinned pnpm through Corepack:

```bash
corepack enable
corepack prepare pnpm@11.5.2 --activate
```

## 2. Install dependencies

```bash
pnpm install
```

## 3. Environment configuration

```bash
cp .env.example .env
```

`.env` lives at the repository root and is git-ignored; never commit real
secrets. All variables are documented inside `.env.example`.

All `pnpm docker:*` scripts automatically pass the root `.env` to Docker
Compose when it exists — you never need to remember `--env-file` yourself.
(Raw `docker compose` commands do NOT pick it up automatically, because the
Compose project directory is `infrastructure/compose`.)

**PostgreSQL port conflict:** if the host already runs PostgreSQL on 5432
(common on Windows), set `POSTGRES_PORT=5433` in `.env` and restart the stack.

**Gateway port conflict:** if port 80 is taken, set `GATEWAY_HTTP_PORT=8080`
and browse `http://embroidery.local:8080` / `http://admin.embroidery.local:8080`.

## 4. Hosts-file setup (one-time)

The gateway routes by hostname. Add these entries manually (no script edits
your hosts file — that would require admin rights):

```text
127.0.0.1 embroidery.local
127.0.0.1 admin.embroidery.local
```

- **Windows:** `C:\Windows\System32\drivers\etc\hosts` (edit as Administrator)
- **Linux/macOS:** `/etc/hosts` (edit with sudo)

Hostnames are configurable via `STOREFRONT_HOST`/`ADMIN_HOST` in `.env` if
your environment cannot resolve `.local` names.

## 5. Normal mode: everything behind the gateway

```bash
pnpm docker:dev:up
```

The Nginx gateway is the only public entrypoint:

```text
http://embroidery.local            → storefront
http://embroidery.local/api/...    → NestJS API
http://embroidery.local/healthz    → storefront health
http://admin.embroidery.local          → admin
http://admin.embroidery.local/api/...  → NestJS API
http://admin.embroidery.local/healthz  → admin health
```

Unknown hostnames get `404`. Worker, PostgreSQL and the SonarQube database are
never routed through the gateway. With one replica per app the gateway is a
reverse proxy/router, not a load balancer.

Script reference:

```bash
pnpm docker:dev:config     # validate and print the effective Compose config
pnpm docker:dev:build      # build the dev images
pnpm docker:dev:up         # start gateway + apps + postgres
pnpm docker:dev:ps         # container status
pnpm docker:dev:logs       # recent logs (append args after --, e.g. -- -f api)
pnpm docker:dev:down       # stop the stack (volumes are kept)
```

Sources are bind-mounted with polling-based watching, so hot reload works
through the gateway (WebSocket upgrade headers are configured). Manifest or
config changes require `pnpm docker:dev:build`.

For troubleshooting, the raw command shape is:

```bash
docker compose --env-file .env -f infrastructure/compose/docker-compose.dev.yml <command>
```

## 6. Debug mode: direct application ports

Default developers use the gateway. When you need to hit an app directly:

```bash
pnpm docker:debug:up      # gateway + direct ports 3000/3001/4000
pnpm docker:debug:down
```

| Service    | Direct URL (debug only)          |
| ---------- | -------------------------------- |
| Storefront | http://localhost:3000            |
| Admin      | http://localhost:3001            |
| API        | http://localhost:4000/api/health |

Debug ports bind **loopback only** (`127.0.0.1`) — they are a local developer
convenience, never a LAN/public contract, and remote machines cannot reach
them. In debug mode, browser API calls should still go through the gateway
(same-origin `/api`); no CORS allowlist exists by design.

PostgreSQL is published on loopback (`127.0.0.1:${POSTGRES_PORT:-5432}`) in
**both** modes — a documented exception so the "infrastructure in Docker,
apps local" workflow keeps working:

```bash
pnpm docker:dev:up postgres   # start PostgreSQL only
pnpm dev                      # run all applications locally with hot reload
```

## 7. API routing contract (D-036)

- Browser-visible path: `/api/*` (same origin, via gateway).
- The gateway forwards `/api/*` unchanged; the NestJS API applies global
  prefix `api`, so upstream paths equal public paths (no double prefix, no
  stripping). Health: `GET /api/health`.
- Next.js apps own `/healthz` (outside `/api/*`).
- Browser Axios base: `NEXT_PUBLIC_API_BASE_PATH=/api` (public, same-origin).
- Server Components Axios base: `INTERNAL_API_BASE_URL=http://api:4000/api`
  (server-only; never expose internal hostnames via `NEXT_PUBLIC_*`).
- Forwarded headers: the gateway sets Host, X-Real-IP, X-Forwarded-For/
  Host/Proto/Port and X-Request-ID. `X-Forwarded-Port` carries the **public**
  `GATEWAY_HTTP_PORT` (the port in the browser URL), not Nginx's internal
  container port 8080.
- Request-ID correlation: the gateway computes one effective request id —
  a safe incoming `X-Request-ID` is kept, anything missing/unsafe is replaced
  by a generated id — and uses that **same id** in the upstream request, the
  gateway access log and the `X-Request-ID` response header (also on gateway
  errors). Include it when reporting problems. It is correlation-only, never
  an authentication or authorization token.
- Proxy trust: the API trusts exactly **one** proxy hop — a development
  topology assumption (client → gateway → API; direct debug access is
  loopback-only on the developer's machine, and client-supplied forwarded
  headers there must never drive security decisions). **Production
  trust-proxy configuration must be re-decided with the Gateway API/controller
  topology; the development value does not carry over automatically.**

## 8. Quality gates

```bash
pnpm quality            # format:check + lint + typecheck + test + check:file-size
pnpm format             # write formatting
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm check:file-size    # 400-line source / 600-line test hard limits
pnpm build
```

## 9. SonarQube

SonarQube runs under the optional Compose `quality` profile so the default
stack stays light. The root scripts enable the profile explicitly:

```bash
pnpm docker:quality:up     # start SonarQube + its database (plus the dev stack)
pnpm docker:quality:down   # stop the quality profile stack
```

The SonarQube UI stays on its own development port (`http://localhost:9000`,
loopback only) and is not routed through the gateway.

First-time setup:

1. Open http://localhost:9000 (default login `admin` / `admin`; change it).
2. Create a local project with project key `embroidery-commerce`
   (matching `sonar-project.properties`).
3. Generate a user token (My Account → Security) and put it in `.env` as
   `SONAR_TOKEN`. Never commit the token.
4. Produce coverage, then scan (scanner CLI via Docker on the same network):

```bash
pnpm test:coverage
docker run --rm --network embroidery-quality \
  -e SONAR_HOST_URL=http://sonarqube:9000 \
  -e SONAR_TOKEN="<your token>" \
  -v "$(pwd):/usr/src" \
  sonarsource/sonar-scanner-cli
```

## 10. Worker limitations

The worker has **no queue/broker and processes no real jobs yet** — the
queue/broker is an open decision (O-001). A silent, bootstrap-owned keep-alive
timer (`WorkerLifecycleService`) holds the process open; it performs no work
and emits no periodic logs. It must be removed when real job consumers arrive
with the queue/broker ADR. The worker is never routed through the gateway.

## 11. Cleanup

```bash
pnpm docker:dev:down       # stop the stack, keep data volumes
pnpm docker:clean:volumes  # also remove named volumes (destroys local databases)
pnpm clean                 # remove build outputs and caches
```

## 12. Dependencies intentionally NOT selected yet

Open decisions (authoritative list:
`docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` §2); do not install
these without an ADR: queue/broker (owner APP2), UI component library, form
library, customer OTP/notification provider (APP4, IMP-O006), payment SDK,
concrete object storage, observability vendor, image-processing engine, production
Gateway API controller (no `ingress-nginx`).

Already locked — installed or deliberately *not* needed, do not re-open without
an ADR: ORM/migrations (Drizzle, DB0–DB10), unit/integration runner (Jest,
IMP-D016), generated client (Orval, IMP-D023), component tests (`next/jest` +
jsdom + React Testing Library, IMP-D024), browser E2E (Playwright `1.61.1`,
IMP-D025), **2D rendering — native SVG rendered by React, with no rendering
engine and no interaction library** (IMP-D026), and **staff auth hashing — the
Node built-in `crypto.scrypt`, no dependency** (IMP-D027; Argon2id via
`@node-rs/argon2` is the reviewed no-migration upgrade, not installed). Do not install `konva`,
`react-konva`, `fabric`, `pixi.js` or `interactjs` into any app or package: the
copies under `spikes/` are research-only and `pnpm check:spike-boundaries`
fails the build if they leak into a production manifest.

## 13. Troubleshooting

- **`pnpm install` warns about build scripts** — allowed build scripts are
  pinned in `pnpm-workspace.yaml` (`allowBuilds`).
- **Port already in use** — adjust `GATEWAY_HTTP_PORT` / `*_PORT` in `.env`.
  A locally installed PostgreSQL commonly occupies 5432 → `POSTGRES_PORT=5433`.
- **`embroidery.local` does not resolve** — add the hosts-file entries from
  §4, or test without touching the hosts file:
  `curl --resolve embroidery.local:80:127.0.0.1 http://embroidery.local/healthz`
- **Hot reload not firing inside Compose** — polling is enabled via
  `WATCHPACK_POLLING`/`CHOKIDAR_USEPOLLING`; if edits still don't propagate,
  prefer the "infrastructure in Docker, apps local" workflow (§6).
- **SonarQube fails to start** — it needs ~2 GB free RAM; on Linux hosts raise
  `vm.max_map_count` to at least `262144`.
- **Windows line endings** — the repo enforces LF via `.editorconfig` and
  Prettier (`endOfLine: lf`).
