# System Architecture

**Status:** Approved technical baseline  
**Version:** 0.2.0

## 1. Purpose

This document defines the target logical architecture and the mandatory boundaries of the Embroidery Commerce Platform.

It intentionally does not lock technologies that still require an ADR, including the ORM, asynchronous-job implementation, canvas library, authentication provider, Kubernetes distribution, and concrete S3-compatible object-storage product.

## 2. Architectural drivers

The architecture must support:

- Strong SEO for public storefront pages.
- An interaction-heavy 2D Design Studio.
- Manual quotation and digitizing workflows.
- Immutable design approval and traceable production linkage.
- Exact deposit and final-payment processing.
- Private design, upload, and production assets.
- One Admin at the current business scale.
- Self-hosted production operation.
- Maintainable delivery through Claude in small, reviewable slices.
- Future growth without premature microservices.

## 3. Architectural style

The system uses:

- A monorepo.
- Separate deployable applications.
- A NestJS modular monolith for business APIs.
- Server-first Next.js applications.
- A separate asynchronous worker.
- PostgreSQL as the system-of-record database.
- S3-compatible object storage behind an application-owned port.
- Containerized local and production workloads.
- Kubernetes for production orchestration.

The backend is not a collection of microservices. Business modules are isolated inside one API application and communicate only through approved public contracts, application ports, or domain events.

## 4. Logical system context

```text
Customer browser
    |
    +-- Storefront / Customer Secure Flow (Next.js)
    |       |
    |       +-- Business API (NestJS)
    |       +-- Object upload/download through authorized flows
    |
Admin browser
    |
    +-- Admin application (Next.js)
            |
            +-- Business API (NestJS)

Business API
    |
    +-- PostgreSQL
    +-- Object Storage Port
    +-- Async Job Port
    +-- Payment Provider Adapters
    +-- Verification/Notification Adapters
    +-- Audit and Observability

Worker
    |
    +-- Async Job Port
    +-- PostgreSQL through approved application services/repositories
    +-- Object Storage Port
    +-- External adapters
```

Zalo and Messenger are external contact links only. They do not participate in authoritative business workflows.

## 5. Deployable applications

### 5.1. Storefront

Responsibilities:

- Public storefront.
- SEO landing pages.
- Catalog and gallery.
- Product details.
- Design Studio.
- Guest submission and verification entry.
- Secure customer access.
- Design review and approval.
- Quotation viewing.
- Deposit and final-payment entry.

The storefront must not contain authoritative business rules. It calls the API and renders server or client UI according to the page's needs.

### 5.2. Admin

Responsibilities:

- Catalog and gallery management.
- Product-side and embroidery-area configuration.
- Inventory operations.
- Request review.
- Quotation creation and revision.
- Design-version management.
- Payment reconciliation.
- Production state changes.
- Shipping data entry.
- SEO metadata.
- Audit visibility.

Admin is a separate Next.js application and must not be bundled into the public storefront.

### 5.3. API

Responsibilities:

- Authentication and authorization.
- Business invariants.
- State transitions.
- Catalog, inventory, design, quotation, payment, order, production, asset, gallery, and audit modules.
- Persistence boundaries.
- Secure-link validation.
- Payment callback verification.
- Signed asset access.
- Job creation and transaction coordination.

### 5.4. Worker

Responsibilities may include:

- Mockup rendering.
- Watermark rendering.
- Image normalization.
- Background-removal jobs.
- Asset inspection.
- Notification delivery.
- Expiration and cleanup.
- Payment reconciliation.
- Retryable long-running operations.

The final queue or broker is an open decision. Business code must depend on an application-owned async-job port rather than a concrete vendor API.

## 6. Rendering strategy

The frontend uses server-first hybrid rendering, not universal per-request SSR.

### Static or revalidated server rendering

Use for public, indexable content:

- Home.
- Service pages.
- Categories.
- Product pages.
- Gallery.
- FAQ.
- Policy pages.
- SEO landing pages.

### Dynamic server rendering

Use when data is private or request-specific:

- Secure customer links.
- Current quotation.
- Design-review page.
- Approval state.
- Payment state.

Private pages must be non-indexable.

### Client Components

Use only where browser interaction requires them:

- Design canvas.
- Layer and property panels.
- Undo/redo.
- Touch and pointer interaction.
- Upload progress.
- Interactive Admin controls.

Server Components remain the default in Next.js App Router.

## 7. Frontend API client and state model

### Axios client boundary

All storefront and Admin calls to the internal business API use Axios.

Required structure:

- A shared browser Axios client for browser-originated requests.
- A shared server Axios client for Server Components and server-side composition.
- Feature services built on top of those clients.
- TanStack Query functions call feature services rather than Axios directly from components.
- Authentication, correlation identifiers, timeout behavior, and normalized error mapping are configured centrally.
- `fetch` must not be used for internal application API calls.

Next.js caching or revalidation requirements must be implemented through explicit server-side caching/composition mechanisms without bypassing the Axios rule.

### Standard internal API envelope

JSON responses from internal business APIs use a consistent envelope.

Successful response:

```json
{
  "success": true,
  "code": "PRODUCT_LIST_SUCCESS",
  "message": "Products retrieved successfully",
  "data": {},
  "meta": {
    "requestId": "request-id",
    "timestamp": "2026-07-13T12:00:00.000Z"
  }
}
```

Error response:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "The request data is invalid",
  "errors": [
    {
      "field": "email",
      "code": "INVALID_EMAIL",
      "message": "Email is invalid"
    }
  ],
  "meta": {
    "requestId": "request-id",
    "timestamp": "2026-07-13T12:00:00.000Z"
  }
}
```

The envelope does not replace HTTP status semantics. Controllers must still return the correct HTTP status code.

Allowed exceptions:

- Binary download or streaming responses.
- Health, liveness, and readiness endpoints where platform tooling requires a simpler shape.
- Third-party webhook responses that must follow the provider contract.
- Redirect responses.
- Protocol-specific endpoints that cannot use the JSON envelope.

### TanStack Query

Owns remote/server state:

- Products.
- Inventory views.
- Requests.
- Quotations.
- Design versions.
- Payments.
- Admin lists and detail views.

### Zustand

Owns browser-only interaction state:

- Active editor tool.
- Canvas viewport.
- Selection.
- Drag/resize state.
- Local undo/redo.
- Unsaved scene changes.
- Editor panels and dialogs.

Remote data must not be copied wholesale into Zustand. Persisted design changes flow from editor state through an API mutation, followed by appropriate TanStack Query invalidation or reconciliation.

## 8. Backend module boundaries

Expected business modules include:

- Identity.
- Customer.
- Catalog.
- Inventory.
- Asset.
- Design.
- Quotation.
- Order.
- Payment.
- Production.
- Gallery.
- Notification.
- Audit.

A module owns its:

- Domain model.
- Use cases.
- Persistence interfaces.
- Persistence implementation.
- Public application contracts.
- Events and errors.

A module must not import another module's ORM entities or concrete repositories.

## 9. Data ownership and source of truth

PostgreSQL is the authoritative source for:

- Customers.
- Product metadata.
- Inventory.
- Design-session metadata.
- Design versions.
- Approval snapshots.
- Quotations.
- Orders.
- Payments.
- Production state.
- Audit records.
- Asset metadata.

Object storage is authoritative for binary objects:

- Customer uploads.
- Product images.
- Gallery images.
- Mockup derivatives.
- Internal digitized files.
- Production files.

Database records reference storage objects by stable internal identifiers, not by permanent public URLs.

## 10. Object-storage boundary

Application code depends on an interface such as:

```ts
interface ObjectStoragePort {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObject(input: GetObjectInput): Promise<ReadableStream>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
  createSignedReadUrl(input: SignedReadInput): Promise<string>;
  createSignedUploadUrl(input: SignedUploadInput): Promise<string>;
}
```

Requirements:

- No domain dependency on a specific object-storage product.
- No vendor-specific administration API in business modules.
- Private-by-default buckets or equivalents.
- Authorized, short-lived access.
- Original and production assets are never public.
- Customer previews are controlled derivatives.

## 11. Transaction and consistency rules

Critical operations require explicit transaction boundaries:

- Quotation version creation.
- Approval snapshot creation.
- Payment application.
- Inventory reservation and release.
- Production transition.
- Order completion.

External side effects must not be treated as part of a database transaction. Use an outbox or equivalent reliable-delivery pattern when a transaction must trigger asynchronous work.

Duplicate callbacks and retries must be safe.

## 12. Security boundaries

- Browser input is untrusted.
- Next.js is not an authorization boundary.
- All authoritative authorization occurs in the API.
- Uploads are validated and sanitized server-side.
- SVG is sanitized before use.
- Payment amounts and signatures are verified server-side.
- Secure links are unguessable, revocable or expiring, and scoped.
- Admin authentication requires strong protection.
- Production files and approved internal artifacts are private.
- Customer-visible watermarks are deterrence, not absolute screenshot prevention.

## 13. Development and production deployment

### Development

Docker Compose provides infrastructure and may run all applications.

Supported workflows should include:

- Infrastructure in containers with applications running locally for fast hot reload.
- Entire stack in Docker Compose for environment parity.

#### Development edge gateway (D-036)

Nginx Open Source runs as the default edge gateway of the Compose stack and is
the primary browser entrypoint. It routes by hostname and path:

- `STOREFRONT_HOST` (default `embroidery.local`) → storefront; `ADMIN_HOST`
  (default `admin.embroidery.local`) → admin; `/api/*` on either host → API.
- The API owns the matching global prefix `api`, so gateway and upstream paths
  are identical (health: `GET /api/health`). Next.js apps expose `/healthz`.
- Unknown hostnames return 404. Worker, PostgreSQL and the SonarQube database
  are never routed through the gateway.
- Direct application ports exist only in the documented debug overlay.
- Browsers call the API same-origin via `NEXT_PUBLIC_API_BASE_PATH`; Server
  Components use the server-only `INTERNAL_API_BASE_URL`.
- The gateway forwards Host/X-Real-IP/X-Forwarded-*/X-Request-ID and supports
  WebSocket upgrades for dev hot reload. With one replica per application it
  is a reverse proxy/router, not a load balancer, and it is not production
  topology.

#### Production routing contract

Kubernetes production will use the Gateway API and Kubernetes Services.
`ingress-nginx` will not be used. The concrete Gateway API controller, TLS
strategy and topology remain open decisions requiring an ADR.

### Production

Kubernetes runs stateless applications:

- Storefront.
- Admin.
- API.
- Worker.

Stateful topology remains subject to an ADR:

- PostgreSQL.
- Object storage.
- Queue/broker.
- Backup storage.
- Observability components.

Kubernetes on one physical server is not high availability. External backup, monitoring, power protection, and disaster-recovery procedures remain mandatory.

## 14. Observability

The system must support:

- Structured logs.
- Request correlation.
- Error tracking.
- Health and readiness checks.
- Payment-failure visibility.
- Job-failure visibility.
- Disk and storage alerts.
- Backup alerts.
- External uptime monitoring.
- Admin audit logs.

Specific tools are open decisions.

## 15. Architectural decision process

A new ADR is required before locking or changing:

- ORM.
- API transport and contract-generation strategy.
- Queue/broker.
- Canvas/rendering library.
- Authentication or OTP provider.
- Payment provider implementation.
- Object-storage product.
- Kubernetes distribution or topology.
- Stateful-service placement.
- Testing stack.
- UI component system.

Claude must not silently make these decisions during an implementation task.
