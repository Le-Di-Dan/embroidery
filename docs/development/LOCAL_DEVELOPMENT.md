# Local Development

**Status:** Active
**Scope:** Bootstrap monorepo created in checkpoint CP0 (updated in CP0.1).

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

## 4. Recommended workflow: infrastructure in Docker, apps local

```bash
pnpm docker:dev:up postgres   # start PostgreSQL only
pnpm dev                      # run all applications with hot reload
```

To run a single app:

```bash
pnpm --filter @embroidery/storefront dev   # http://localhost:3000
pnpm --filter @embroidery/admin dev        # http://localhost:3001
pnpm --filter @embroidery/api dev          # http://localhost:4000/health
pnpm --filter @embroidery/worker dev
```

## 5. Full stack in Docker Compose (root scripts)

The `pnpm docker:*` scripts are the primary entry points. They resolve the
Compose file and root `.env` from the repository root, so they work from any
checkout location and on Windows, macOS and Linux:

```bash
pnpm docker:dev:config     # validate and print the effective Compose config
pnpm docker:dev:build      # build the dev images
pnpm docker:dev:up         # start storefront, admin, api, worker, postgres
pnpm docker:dev:ps         # container status
pnpm docker:dev:logs       # recent logs (append args after --, e.g. -- -f api)
pnpm docker:dev:down       # stop the stack (volumes are kept)
pnpm docker:clean:volumes  # stop everything AND delete named volumes (destroys local databases)
```

Application sources (`src/` directories) are bind-mounted into the dev
containers with polling-based file watching, so code changes hot-reload.
Changes to package manifests or config files require `pnpm docker:dev:build`.

For troubleshooting, the equivalent raw command shape is:

```bash
docker compose --env-file .env -f infrastructure/compose/docker-compose.dev.yml <command>
```

## 6. Port mapping

| Service    | URL                              | Host port |
| ---------- | -------------------------------- | --------- |
| Storefront | http://localhost:3000            | 3000      |
| Admin      | http://localhost:3001            | 3001      |
| API        | http://localhost:4000/health     | 4000      |
| PostgreSQL | localhost:5432 (loopback only)   | 5432      |
| SonarQube  | http://localhost:9000 (loopback) | 9000      |

Ports are overridable via `.env` (`STOREFRONT_PORT`, `ADMIN_PORT`, `API_PORT`,
`POSTGRES_PORT`, `SONARQUBE_PORT`).

## 7. Quality gates

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

## 8. SonarQube

SonarQube runs under the optional Compose `quality` profile so the default
stack stays light. The root scripts enable the profile explicitly:

```bash
pnpm docker:quality:up     # start SonarQube + its database (plus the dev stack)
pnpm docker:quality:down   # stop the quality profile stack
```

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

## 9. Worker limitations

The worker has **no queue/broker and processes no real jobs yet** — the
queue/broker is an open decision (O-001). A silent, bootstrap-owned keep-alive
timer (`WorkerLifecycleService`) holds the process open; it performs no work
and emits no periodic logs. It must be removed when real job consumers arrive
with the queue/broker ADR.

## 10. Cleanup

```bash
pnpm docker:dev:down       # stop the stack, keep data volumes
pnpm docker:clean:volumes  # also remove named volumes (destroys local databases)
pnpm clean                 # remove build outputs and caches
```

## 11. Dependencies intentionally NOT selected yet

Open decisions (see `docs/12-DECISION-LOG.md`); do not install these without
an ADR: ORM/migrations, queue/broker, canvas library, UI component library,
form library, validation library, auth/OTP provider, payment SDK, concrete
object storage, observability vendor, image-processing engine, extended
testing stack.

## 12. Troubleshooting

- **`pnpm install` warns about build scripts** — allowed build scripts are
  pinned in `pnpm-workspace.yaml` (`allowBuilds`).
- **Port already in use** — adjust the `*_PORT` variables in `.env`. A locally
  installed PostgreSQL service commonly occupies 5432; set `POSTGRES_PORT=5433`.
- **Hot reload not firing inside Compose** — polling is enabled via
  `WATCHPACK_POLLING`/`CHOKIDAR_USEPOLLING`; if edits still don't propagate,
  prefer the "infrastructure in Docker, apps local" workflow.
- **SonarQube fails to start** — it needs ~2 GB free RAM; on Linux hosts raise
  `vm.max_map_count` to at least `262144`.
- **Windows line endings** — the repo enforces LF via `.editorconfig` and
  Prettier (`endOfLine: lf`).
