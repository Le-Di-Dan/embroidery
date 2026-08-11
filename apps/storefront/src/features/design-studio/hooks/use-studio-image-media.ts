'use client';

/**
 * Turning the image elements on the stage into renderable object URLs
 * (`APP3-S06` §18).
 *
 * `APP3-S02` drew an honest empty frame for every image element, and said why:
 * no route served a Design Session's own image bytes. `APP3-B06C` built one and
 * `APP3-S06` repaired the two things that stopped it working end to end, so the
 * placeholder is now the *fallback* rather than the only answer — it remains
 * exactly what is drawn while media is unavailable, loading or refused.
 *
 * Two resources with different owners, kept apart exactly as the Side background
 * keeps them:
 *
 * - **the bytes are server state**, so TanStack Query owns fetching,
 *   cancellation and failure;
 * - **the object URL is a browser resource**, so an effect owns creating it
 *   and — the part that actually matters — revoking it.
 *
 * ## Nothing here is document state
 *
 * No object URL, `Blob`, loading flag or failure is written into the
 * `APP3-P01` document or into a Zustand store. A URL that survived into a saved
 * design would be a storage address in a persisted document; one that survived
 * into a global store would outlive the component that revoked it. Both are
 * exactly what `blob:` handles must not do, so the map lives in this hook's own
 * render and dies with it.
 *
 * ## Why the key carries the derivative
 *
 * A replacement keeps the element id and changes the media identity. Keying on
 * the element would go on rendering the previous picture under the new identity;
 * keying on the *derivative* means a replacement addresses a different query,
 * different bytes and a different object URL, and the old one is revoked by the
 * effect's own cleanup.
 */
import { useEffect, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { DesignDocument } from '@embroidery/design-document';

import { studioQueryKeys } from '../model/studio-query-keys';
import { fetchSessionAssetBlob } from '../services/studio-session-asset.client';

/** One image the document places, reduced to what fetching it needs. */
interface ImageReference {
  readonly assetId: string;
  readonly derivativeId: string;
}

/**
 * Object URLs by `derivativeId`.
 *
 * Keyed by derivative rather than by element because one Asset may legitimately
 * be placed several times: `APP3-P01-C1` counts decoded pixels per unique Asset
 * precisely so a logo used twenty times costs one decode, and fetching it twenty
 * times would spend twenty reads of the customer's budget for one picture.
 */
export type StudioImageMediaMap = ReadonlyMap<string, string>;

/** Every distinct image the document places, in document order. */
export function imageReferencesOf(document: DesignDocument | null): readonly ImageReference[] {
  if (document === null) return [];
  const seen = new Set<string>();
  const references: ImageReference[] = [];
  for (const element of document.elements) {
    if (element.type !== 'image' || seen.has(element.derivativeId)) continue;
    seen.add(element.derivativeId);
    references.push({ assetId: element.assetId, derivativeId: element.derivativeId });
  }
  return references;
}

export interface StudioImageMediaState {
  readonly media: StudioImageMediaMap;
  /** Derivative ids whose bytes could not be fetched. Drawn as placeholders. */
  readonly failed: ReadonlySet<string>;
}

const EMPTY_MEDIA: StudioImageMediaMap = new Map<string, string>();
const EMPTY_FAILED: ReadonlySet<string> = new Set<string>();

export function useStudioImageMedia(
  sessionId: string | null,
  document: DesignDocument | null,
): StudioImageMediaState {
  const references = imageReferencesOf(document);

  const results = useQueries({
    queries: references.map((reference) => ({
      queryKey: studioQueryKeys.sessionAssetPreview(
        sessionId ?? '',
        reference.assetId,
        reference.derivativeId,
      ),
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (sessionId === null) throw new Error('A preview needs a Session.');
        return fetchSessionAssetBlob(sessionId, reference.assetId, signal);
      },
      enabled: sessionId !== null,
      staleTime: 0,
      // `no-store` on the wire, and nothing retained once nothing renders it:
      // the authorization around these bytes can end while the bytes cannot.
      gcTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });

  /*
   * The fetched blobs, addressed by derivative and stable across renders that
   * changed nothing. `useQueries` returns a fresh array every render, so the
   * effect below depends on this *string* rather than on the array — otherwise
   * every parent render would revoke and recreate every object URL, and the
   * stage would flash its own artwork away on each frame of a drag.
   */
  const blobs = new Map<string, Blob>();
  results.forEach((result, index) => {
    const reference = references[index];
    if (reference === undefined || result.data === undefined) return;
    blobs.set(reference.derivativeId, result.data);
  });
  const identity = [...blobs.keys()].sort().join('|');

  const [state, setState] = useState<StudioImageMediaState>({
    media: EMPTY_MEDIA,
    failed: EMPTY_FAILED,
  });

  useEffect(() => {
    if (blobs.size === 0) {
      setState({ media: EMPTY_MEDIA, failed: EMPTY_FAILED });
      return;
    }

    const created = new Map<string, string>();
    for (const [derivativeId, blob] of blobs) created.set(derivativeId, URL.createObjectURL(blob));
    setState((previous) => ({ media: created, failed: previous.failed }));

    // Runs on a Session change, a document whose images changed, a replacement
    // and unmount. All four are the same event as far as these handles are
    // concerned: they stop being the ones rendered, so they stop existing.
    return () => {
      for (const url of created.values()) URL.revokeObjectURL(url);
      setState({ media: EMPTY_MEDIA, failed: EMPTY_FAILED });
    };
    // `identity` is the set of derivatives that currently have bytes; `blobs` is
    // rebuilt every render and would defeat the comparison, so it is
    // deliberately not a dependency.
  }, [identity, sessionId]);

  const failed = new Set<string>();
  results.forEach((result, index) => {
    const reference = references[index];
    if (reference !== undefined && result.isError) failed.add(reference.derivativeId);
  });

  return { media: state.media, failed };
}
