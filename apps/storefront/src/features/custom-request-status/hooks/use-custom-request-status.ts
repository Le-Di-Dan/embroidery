'use client';

import { useCallback } from 'react';

import { useSecureLinkBootstrap, type SecureLinkBootstrap } from '../../secure-link-access';
import { readCustomRequestStatus } from '../api/custom-request-status.client';
import { projectRequestStatus, type RequestStatusView } from '../model/request-status-projection';

/**
 * `/truy-cap`, as APP5 sees it: one grant-scoped request, or one of the three
 * APP4 access states.
 *
 * Everything about *when* the credential is captured, *when* the fragment is
 * stripped and *how long* the credential lives belongs to
 * {@link useSecureLinkBootstrap} — the machinery `APP4-S02` established and
 * this checkpoint reuses rather than re-implements. This hook supplies the one
 * thing that is APP5's: which call the credential is spent on.
 *
 * The projection runs here rather than in a component so that the identifiers
 * B03 returns — `requestId`, `productId`, `productVariantId`, `assetId` — stop
 * at this boundary and never reach the render tree at all.
 */
export type CustomRequestStatusResolution = SecureLinkBootstrap<RequestStatusView>;

export function useCustomRequestStatus(): CustomRequestStatusResolution {
  const resolve = useCallback(
    async (secret: string) => projectRequestStatus(await readCustomRequestStatus(secret)),
    [],
  );
  return useSecureLinkBootstrap(resolve);
}
