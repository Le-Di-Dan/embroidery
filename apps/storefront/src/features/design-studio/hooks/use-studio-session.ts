'use client';

import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type {
  DesignSessionScopeResponse,
  DesignSessionSnapshotResponse,
} from '@embroidery/api-client';

import {
  classifyStudioFailure,
  isStudioApiError,
  type StudioFailure,
} from '../model/studio-failure';
import type { StudioPlacementCodes } from '../model/studio-placement';
import {
  createBlankSession,
  createClonedSession,
  resumeSession,
} from '../services/studio-session.client';

/** Which explicit action failed. There is no shared "start failed" state. */
export type StudioStartMode = 'blank' | 'clone';

export interface StudioStartFailure {
  readonly mode: StudioStartMode;
  readonly failure: StudioFailure;
}

export interface StudioSessionState {
  /** The server's snapshot, verbatim. The only Session truth this route has. */
  readonly snapshot: DesignSessionSnapshotResponse | null;
  /**
   * The placement scope the bootstrap response carried (`APP3-S02`).
   *
   * Held beside the snapshot rather than merged into it. `APP3-B07` returns the
   * scope on **create**, which resolved it from the public slug and codes, and
   * omits it on **resume**, which addresses the Session by id alone — the
   * placement did not change, so the server has nothing new to say about it. A
   * resumed snapshot therefore arrives without the geometry the stage needs to
   * draw the garment and the embroidery area.
   *
   * Remembering the create response's own scope is not the same as merging
   * server fields: nothing here invents, extends or advances a value, and the
   * scope of an open Session is fixed for its lifetime. It is cleared with the
   * Session it belongs to and replaced whenever a create response brings a new
   * one.
   */
  readonly scope: DesignSessionScopeResponse | null;
  readonly isStarting: boolean;
  readonly startFailure: StudioStartFailure | null;
  readonly isResuming: boolean;
  readonly isExpired: boolean;
  /** A resume that failed for a reason that was **not** expiry (`APP3-S10`). */
  readonly hasResumeFailed: boolean;
  readonly startBlank: (codes: StudioPlacementCodes) => void;
  readonly startClone: (codes: StudioPlacementCodes, templateSlug: string) => void;
  readonly resume: () => void;
  /**
   * Resumes a Session this runtime is not holding (`APP3-S10`).
   *
   * The id comes from the non-secret resume handle; the browser attaches the
   * `HttpOnly` cookie by itself, which is why there is still no secret argument
   * and still nothing that reads one.
   */
  readonly resumeById: (sessionId: string) => void;
  /** The Session was refused as invalid by a later call, not by resume. */
  readonly expire: () => void;
  /** Discards the dead session so the visitor can start again explicitly. */
  readonly restart: () => void;
}

const HTTP_UNAUTHORIZED = 401;

/**
 * `APP3-B07` refuses an expired, revoked or unknown Session with **401**, not
 * 404: the resume guard authorizes before it resolves, so "no longer valid" and
 * "never yours" are one answer. Anything else is a failure the visitor may
 * retry, and must not be dressed up as an expiry.
 */
function isExpiryRefusal(error: unknown): boolean {
  return isStudioApiError(error) && error.normalized.httpStatus === HTTP_UNAUTHORIZED;
}

/**
 * Anonymous Session bootstrap and resume for the Studio route (`APP3-S01`).
 *
 * ## Session identity is held in memory, and only in memory
 *
 * `APP3-B07` returns the secret solely as a host-only `HttpOnly` cookie, and
 * returns the `sessionId` in the response body. The id is what resume needs and
 * the cookie is what authorizes it — the browser attaches the cookie to a
 * same-origin request by itself, which is why resume takes no secret argument.
 *
 * So the id lives in this component's state for as long as the route is
 * mounted, and — until `APP3-S10` — nowhere else. The secret is never touched at
 * all: `HttpOnly` means this code could not read it even if it tried, and
 * scanning for it is forbidden outright.
 *
 * `APP3-S10` added the one persistence `APP3-G03` allows, and it is not held
 * here: the **non-secret Session id** under a placement-namespaced key, owned by
 * `studio-resume-handle.ts` and read by the screen above. Nothing about this
 * hook's own memory changed, and no Zustand store, URL or cookie carries a
 * Session identity even now.
 *
 * ## Blank and Clone never substitute for one another
 *
 * They are two mutations rather than one with a flag, and neither falls back to
 * the other. A visitor who chose a Template and got an empty canvas would have
 * been told a lie about what happened; a failed clone stays a failed clone.
 */
export function useStudioSession(productSlug: string): StudioSessionState {
  const [snapshot, setSnapshot] = useState<DesignSessionSnapshotResponse | null>(null);
  const [scope, setScope] = useState<DesignSessionScopeResponse | null>(null);
  const [startFailure, setStartFailure] = useState<StudioStartFailure | null>(null);
  const [isExpired, setExpired] = useState(false);

  const create = useMutation({
    mutationFn: (input: {
      readonly mode: StudioStartMode;
      readonly codes: StudioPlacementCodes;
      readonly templateSlug?: string;
    }) => {
      const controller = new AbortController();
      if (input.mode === 'blank') {
        return createBlankSession(productSlug, input.codes, controller.signal);
      }
      if (input.templateSlug === undefined) {
        throw new Error('A clone bootstrap needs a template slug.');
      }
      return createClonedSession(productSlug, input.codes, input.templateSlug, controller.signal);
    },
    retry: false,
    onSuccess: (created) => {
      setSnapshot(created);
      // Bootstrap is the one response that carries the placement scope, so it is
      // the one moment it can be captured.
      setScope(created.scope ?? null);
      setStartFailure(null);
      setExpired(false);
    },
    onError: (error, input) => {
      setStartFailure({ mode: input.mode, failure: classifyStudioFailure(error) });
    },
  });

  const [hasResumeFailed, setResumeFailed] = useState(false);

  const resumption = useMutation({
    mutationFn: (sessionId: string) => {
      const controller = new AbortController();
      return resumeSession(sessionId, controller.signal);
    },
    retry: false,
    onSuccess: (resumed) => {
      setResumeFailed(false);
      // The returned snapshot replaces the held one wholesale. Nothing merges
      // fields, extends `expiresAt` or advances `revision`: the API decides
      // both, and a client that adjusted either would be inventing state.
      setSnapshot(resumed);
    },
    onError: (error) => {
      // Expiry is permanent and everything else is not. A 503 or a dropped
      // connection must not be reported as "your design is gone" — and must not
      // discard the resume handle that still points at a live Session.
      if (isExpiryRefusal(error)) setExpired(true);
      else setResumeFailed(true);
    },
  });

  const start = useCallback(
    (mode: StudioStartMode, codes: StudioPlacementCodes, templateSlug?: string) => {
      // One bootstrap at a time. A second submit while the first is in flight
      // would open a second Session on the same placement and abandon one.
      if (create.isPending) return;
      setStartFailure(null);
      create.mutate({ mode, codes, ...(templateSlug === undefined ? {} : { templateSlug }) });
    },
    [create],
  );

  return {
    snapshot,
    scope,
    isStarting: create.isPending,
    startFailure,
    isResuming: resumption.isPending,
    isExpired,
    hasResumeFailed,
    startBlank: (codes) => {
      start('blank', codes);
    },
    startClone: (codes, templateSlug) => {
      start('clone', codes, templateSlug);
    },
    resume: () => {
      if (snapshot === null || resumption.isPending) return;
      resumption.mutate(snapshot.sessionId);
    },
    resumeById: (sessionId) => {
      if (resumption.isPending) return;
      setResumeFailed(false);
      resumption.mutate(sessionId);
    },
    expire: () => {
      setExpired(true);
    },
    restart: () => {
      // The dead Session is discarded rather than revived. There is no grace
      // secret and no client-side reactivation; the only way forward is a new
      // explicit bootstrap.
      setSnapshot(null);
      setScope(null);
      setExpired(false);
      setResumeFailed(false);
      setStartFailure(null);
    },
  };
}
