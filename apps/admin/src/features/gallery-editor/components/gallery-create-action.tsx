'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { adminGalleryEntryRoute } from '../../gallery-list';
import { GALLERY_EDITOR_COPY } from '../model/gallery-editor-copy';
import { GalleryCreateDialog } from './gallery-create-dialog';

/**
 * The "Tạo mục mới" action the approved list frames draw, restored by
 * `APP11-A02` now that there is an editor behind it.
 *
 * `APP11-A01` deliberately shipped the list without it: the control leads to
 * `/gallery/{entryId}`, and a button that answers a click with a 404 is worse
 * than an absent one. That staging is now closed.
 *
 * ## Why the control lives here and not in the list feature
 *
 * The list is a read-only collection; creating an entry is the first step of
 * the editor's capability, and it is the editor that knows the create body, the
 * slug grammar and the address to navigate to afterwards. The list screen takes
 * this as an opaque node and renders it, so the two features keep their
 * dependency pointing one way — the editor knows about the list's route and
 * cache root, and the list knows nothing about the editor.
 *
 * ## After a successful create
 *
 * The mutation has already seeded the detail cache and invalidated the list
 * root. This component navigates to the editor using the **id the server
 * returned**, never the slug the operator typed: the editor is addressed by
 * identity, and a navigation built from the request rather than the response
 * would be a guess about what was actually created.
 */
export function GalleryCreateAction() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="gallery__primary-action"
        onClick={() => setOpen(true)}
        data-testid="gallery-create-action"
      >
        {GALLERY_EDITOR_COPY.create.open}
      </button>

      {open ? (
        <GalleryCreateDialog
          onClose={() => setOpen(false)}
          onCreated={(entryId) => {
            setOpen(false);
            router.push(adminGalleryEntryRoute(entryId));
          }}
        />
      ) : null}
    </>
  );
}
