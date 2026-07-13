/**
 * Health/liveness route. Simple stable shape — an allowed exception to the
 * standard API envelope (D-034). This is a route handler, not an internal
 * business API call, so the Axios-only rule does not apply here.
 */
export function GET(): Response {
  return Response.json({
    status: 'ok',
    service: 'admin',
    timestamp: new Date().toISOString(),
  });
}
