/**
 * The request shape the authenticated-admin guard populates.
 *
 * Structural, so the presentation layer does not import an HTTP-server type. The
 * guard attaches only the safe session view — never the raw token or cookie.
 */
import type { ResolvedStaffSession } from '../application/resolve-staff-session.service';

export interface StaffAuthenticatedRequest {
  readonly headers: Record<string, unknown>;
  /** Trusted client IP resolved from the proxy hop (Express `req.ip`). */
  readonly ip?: string;
  staffSession?: ResolvedStaffSession;
}
