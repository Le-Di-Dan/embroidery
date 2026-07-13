# Nginx Development Gateway

Edge gateway for the Docker Compose development stack (decision D-036).

## Role

- Single public browser entrypoint: routes Storefront, Admin and the API by
  hostname and path (`/api/*` → NestJS, `/healthz` → owning Next.js app,
  unknown hosts → 404).
- Reverse proxy/router only. With one replica per application this is **not**
  load balancing, and it is **not** production topology — production will use
  the Kubernetes Gateway API (controller still an open decision; no
  `ingress-nginx`).

## Files

- `nginx.conf` — main config (mounted read-only at `/etc/nginx/nginx.conf`).
- `templates/development.conf.template` — routing/server blocks; the official
  image's entrypoint renders it to `/etc/nginx/conf.d/development.conf` with
  `envsubst`, substituting only defined environment variables
  (`STOREFRONT_HOST`, `ADMIN_HOST`, `GATEWAY_*`). No extra template engine.
- `templates/includes/proxy-headers.conf.template` — shared forwarded/upgrade
  headers (Host, X-Real-IP, X-Forwarded-For/Host/Proto/Port, X-Request-ID,
  WebSocket Upgrade/Connection), rendered to
  `/etc/nginx/conf.d/includes/proxy-headers.conf`. `X-Forwarded-Port` carries
  the **public** `GATEWAY_HTTP_PORT` (80, or e.g. 8085 when overridden), never
  the internal container listen port 8080.

## Notes

- Container listens on internal port **8080**; the host port is
  `GATEWAY_HTTP_PORT` (default 80). The official image starts as root to
  render templates and spawn workers, then runs workers as the unprivileged
  `nginx` user — this is why 8080 (not 80) is used internally, easing a later
  move to a fully non-root runtime.
- Request IDs: the gateway computes one **effective request id**
  (`$effective_request_id`). An incoming `X-Request-ID` is reused only when it
  matches a conservative pattern (`[A-Za-z0-9._-]`, max 64 chars); anything
  else — missing, empty, oversized or unsafe — is replaced by Nginx's native
  `$request_id`, so client input cannot pollute log structure. The **same**
  effective id is sent upstream (`X-Request-ID`), written to the access log
  (`request_id=`), and returned to the client in the `X-Request-ID` response
  header (`always`, including gateway error responses) so support reports can
  be correlated with gateway and API logs. It is a correlation aid only —
  never an authentication or authorization token. No third-party modules.
- No TLS, no proxy caching, no CDN behavior in development. Production
  security headers (full CSP, HSTS) remain open items.
