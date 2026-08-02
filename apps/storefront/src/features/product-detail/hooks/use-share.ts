'use client';

import { useCallback, useState } from 'react';

import { PRODUCT_DETAIL_COPY } from '../model/product-detail-copy';

/**
 * The browser-local Share action (IMP-D039).
 *
 * Entirely a browser capability: Web Share when the device offers it, clipboard
 * otherwise. No SDK, no network call of our own, no persistence and no
 * analytics — sharing a page is the visitor's act, and recording it would make
 * this page the only anonymous surface that watches back.
 */

export interface ShareState {
  readonly announcement: string;
  readonly share: () => void;
}

interface ShareInput {
  readonly name: string;
  readonly path: string;
  readonly description?: string;
}

/** The canonical, shareable address — origin plus the route helper's path. */
export function canonicalShareUrl(origin: string, path: string): string {
  return `${origin}${path}`;
}

export function useShare({ name, path, description }: ShareInput): ShareState {
  const [announcement, setAnnouncement] = useState('');

  const share = useCallback(() => {
    // Built from the route helper and the current origin only — never from
    // `location.href`, which would carry any query string or fragment the
    // visitor happened to arrive with into everyone else's link.
    const url = canonicalShareUrl(window.location.origin, path);

    const nav = window.navigator;
    if (typeof nav.share === 'function') {
      void nav
        .share({ title: name, url, ...(description === undefined ? {} : { text: description }) })
        .then(() => setAnnouncement(PRODUCT_DETAIL_COPY.shareCompleted))
        .catch((error: unknown) => {
          // Dismissing the native sheet is a decision, not a failure. Reporting
          // it as an error would scold the visitor for changing their mind.
          if (error instanceof Error && error.name === 'AbortError') {
            setAnnouncement('');
            return;
          }
          setAnnouncement(PRODUCT_DETAIL_COPY.shareFailed);
        });
      return;
    }

    const clipboard = nav.clipboard;
    if (clipboard === undefined || typeof clipboard.writeText !== 'function') {
      setAnnouncement(PRODUCT_DETAIL_COPY.shareFailed);
      return;
    }
    void clipboard
      .writeText(url)
      .then(() => setAnnouncement(PRODUCT_DETAIL_COPY.shareCopied))
      .catch(() => setAnnouncement(PRODUCT_DETAIL_COPY.shareFailed));
  }, [name, path, description]);

  return { announcement, share };
}
