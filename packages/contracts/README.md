# @embroidery/contracts

Cross-application transport contracts shared by storefront, admin, API and worker.

## Current content

- Standard API response envelope (D-034): `ApiSuccessResponse`,
  `ApiErrorResponse`, `ApiResponseMeta`, `ApiFieldError`, `ApiPaginationMeta`
  plus runtime guards for boundary validation.

## Boundary

- Transport shapes only — no business logic, no framework dependencies.
- Backend entities and feature-local DTOs do not belong here.
- Consumed as TypeScript source (just-in-time package, no build step).
