/**
 * Health/liveness route at /healthz. Simple stable shape — an allowed
 * exception to the standard API envelope (D-034). Lives outside /api/*
 * because that path is reserved for the NestJS API at the gateway (D-036).
 * This is a route handler, not an internal business API call, so the
 * Axios-only rule does not apply here.
 */
export function GET(): Response {
  return Response.json({
    status: 'ok',
    service: 'admin',
    timestamp: new Date().toISOString(),
  });
}
