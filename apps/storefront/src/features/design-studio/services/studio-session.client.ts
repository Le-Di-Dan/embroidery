import {
  CloneDesignSessionBodyMode,
  CreateBlankDesignSessionBodyMode,
  publicDesignSessionCreate,
  publicDesignSessionResume,
  type CreateDesignSessionBody,
  type DesignSessionSnapshotResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { toStudioApiError } from '../model/studio-failure';
import type { StudioPlacementCodes } from '../model/studio-placement';

/**
 * Anonymous Design Session bootstrap and resume (`APP3-B07`).
 *
 * The session secret never appears here. `APP3-B07` is the sole issuer and
 * returns it only as a host-only, `HttpOnly` cookie, so it is not readable by
 * this code even in principle — and resume takes no secret argument, because
 * the browser attaches the cookie to a same-origin request by itself.
 *
 * Both `mode` discriminators come from the generated contract rather than from
 * a string literal. A mistyped literal would be refused by the server for a
 * reason no reviewer could see in the diff.
 */

/** Opens an empty session on the exact placement the visitor is looking at. */
export async function createBlankSession(
  productSlug: string,
  codes: StudioPlacementCodes,
  signal: AbortSignal,
): Promise<DesignSessionSnapshotResponse> {
  const body: CreateDesignSessionBody = {
    mode: CreateBlankDesignSessionBodyMode.BLANK,
    productSlug,
    sideCode: codes.sideCode,
    areaCode: codes.areaCode,
  };
  return sendCreate(body, signal);
}

/**
 * Opens a session cloned from one published Template.
 *
 * The Template is named by its public slug, which is the only Template identity
 * the create body accepts. The server resolves the published version itself, so
 * a version the picker read seconds earlier is never presented as authority —
 * `APP3-B07` remains final at bootstrap time.
 */
export async function createClonedSession(
  productSlug: string,
  codes: StudioPlacementCodes,
  templateSlug: string,
  signal: AbortSignal,
): Promise<DesignSessionSnapshotResponse> {
  const body: CreateDesignSessionBody = {
    mode: CloneDesignSessionBodyMode.CLONE_TEMPLATE,
    productSlug,
    sideCode: codes.sideCode,
    areaCode: codes.areaCode,
    templateSlug,
  };
  return sendCreate(body, signal);
}

async function sendCreate(
  body: CreateDesignSessionBody,
  signal: AbortSignal,
): Promise<DesignSessionSnapshotResponse> {
  try {
    const response = await publicDesignSessionCreate(body, {
      instance: getBrowserApiClient(),
      config: { signal },
    });
    return response.data;
  } catch (error: unknown) {
    throw toStudioApiError(error);
  }
}

/**
 * Re-reads one session and rotates its secret (`APP3-B07`).
 *
 * The id comes from the create response this route is still holding; nothing
 * scans cookies for it and nothing persists it. Expiry and revision belong to
 * the server — the returned snapshot is the truth, and the client neither
 * extends the one nor advances the other.
 */
export async function resumeSession(
  sessionId: string,
  signal: AbortSignal,
): Promise<DesignSessionSnapshotResponse> {
  try {
    const response = await publicDesignSessionResume(sessionId, {
      instance: getBrowserApiClient(),
      config: { signal },
    });
    return response.data;
  } catch (error: unknown) {
    throw toStudioApiError(error);
  }
}
