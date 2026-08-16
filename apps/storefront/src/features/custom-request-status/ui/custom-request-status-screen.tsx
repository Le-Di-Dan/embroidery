'use client';

import { SecureLinkShell } from '../../secure-link-access';
import { useCustomRequestStatus } from '../hooks/use-custom-request-status';
import { CUSTOM_REQUEST_STATUS_COPY as COPY } from '../model/custom-request-status-copy';
import { RequestStatusContent } from './request-status-content';

/**
 * `/truy-cap` — the APP4 secure-link shell with the APP5 request inside it.
 *
 * The whole checkpoint in one file: the bootstrap owns the credential and makes
 * one call, the shell draws bootstrap, unavailable and transient exactly as
 * `APP4-D01` drew them, and the authorized branch is the request. `APP5-D01`
 * asked for precisely this and said so on the loading frame (`661:335`) — the
 * grant step is `APP4-S02`'s, APP5 content is built only after a valid grant,
 * and the single "unavailable" state stays APP4's and is not redrawn.
 */
export function CustomRequestStatusScreen() {
  const { state, retry, retrying } = useCustomRequestStatus();

  return (
    <SecureLinkShell
      state={state}
      retry={retry}
      retrying={retrying}
      authorizedAnnouncement={COPY.liveAuthorized}
      renderAuthorized={(view, headingRef) => (
        <RequestStatusContent view={view} headingRef={headingRef} />
      )}
    />
  );
}
