/**
 * Feature service over the four LC-24 operations `APP3-A04` consumes.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (`FRONTEND_CONVENTIONS` §8).
 * Every failure leaves this module as a `TemplateLifecycleApiError` carrying only
 * the normalized envelope, so no raw transport error reaches React state.
 *
 * Each body is exactly what the contract declares and nothing more. In
 * particular there is no `targetStatus`: the route already says which transition
 * this is, and a body that could name a destination could ask for the
 * `ARCHIVED → PUBLISHED` that LC-24 does not recognise. There is no `force`, no
 * `publishAfterRestore` and no `versionToPublish` either — the publication
 * subject is always the version the token names.
 *
 * No route is spelled here. The generated client owns every URL, and a copy of
 * one in application code is how the two drift after a contract change.
 */
import {
  adminDesignTemplateArchive,
  adminDesignTemplateDetail,
  adminDesignTemplatePublish,
  adminDesignTemplateRestore,
  adminDesignTemplateUnpublish,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  AdminDesignTemplateDetailResponse,
  ArchiveDesignTemplateBody,
  PublishDesignTemplateBody,
  RestoreDesignTemplateBody,
  UnpublishDesignTemplateBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { TemplateLifecycleApiError } from '../model/lifecycle-failure';
import type { LifecycleAction } from '../model/lifecycle-actions';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

async function guarded<T>(work: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await work()).data;
  } catch (error: unknown) {
    throw new TemplateLifecycleApiError(normalizeApiClientError(error));
  }
}

/** The authoritative re-read, shared with the editor's detail query identity. */
export function fetchLifecycleDetail(
  templateId: string,
  signal?: AbortSignal,
): Promise<AdminDesignTemplateDetailResponse> {
  return guarded(() => adminDesignTemplateDetail(templateId, requestOptions(signal)));
}

export interface LifecycleCommandInput {
  readonly templateId: string;
  /**
   * Exactly what the last authoritative detail read returned — `0` for a
   * Template that has no version yet. Never a locally incremented number, never
   * a value carried from the list, and never assumed to be `1`.
   */
  readonly expectedCurrentVersion: number;
  /** Required for archive and restore, absent for publish and unpublish. */
  readonly reason?: string;
}

/**
 * Every lifecycle command returns the **authoritative Template detail** after
 * the transition, so a caller never has to ask what happened. That is why none
 * of these is followed by a re-read on success.
 */
export function sendLifecycleCommand(
  action: LifecycleAction,
  input: LifecycleCommandInput,
  signal?: AbortSignal,
): Promise<AdminDesignTemplateDetailResponse> {
  const options = requestOptions(signal);
  const { templateId, expectedCurrentVersion } = input;

  switch (action) {
    case 'publish': {
      const body: PublishDesignTemplateBody = { expectedCurrentVersion };
      return guarded(() => adminDesignTemplatePublish(templateId, body, options));
    }
    case 'unpublish': {
      const body: UnpublishDesignTemplateBody = { expectedCurrentVersion };
      return guarded(() => adminDesignTemplateUnpublish(templateId, body, options));
    }
    case 'archive': {
      const body: ArchiveDesignTemplateBody = {
        expectedCurrentVersion,
        reason: requireReason(action, input.reason),
      };
      return guarded(() => adminDesignTemplateArchive(templateId, body, options));
    }
    case 'restore': {
      const body: RestoreDesignTemplateBody = {
        expectedCurrentVersion,
        reason: requireReason(action, input.reason),
      };
      return guarded(() => adminDesignTemplateRestore(templateId, body, options));
    }
  }
}

/**
 * A reason-bearing command with no reason is a programming error, not a user
 * error — the dialog validates before it ever reaches here. Failing loudly is
 * what stops an empty string being sent for the server to reject.
 */
function requireReason(action: LifecycleAction, reason: string | undefined): string {
  if (reason === undefined || reason.trim() === '') {
    throw new Error(`APP3-A04: ${action} requires a reason.`);
  }
  return reason;
}
