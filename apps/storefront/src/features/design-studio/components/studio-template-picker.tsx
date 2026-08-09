'use client';

import { STUDIO_COPY } from '../model/studio-copy';
import type { TemplateListState } from '../hooks/use-template-list';

export interface StudioTemplatePickerProps {
  readonly list: TemplateListState;
  readonly selectedSlug: string | null;
  readonly onSelect: (templateSlug: string) => void;
}

/**
 * The compatible published Templates for the current placement (`APP3-B05`).
 *
 * Each row is a real `<button>` with `aria-pressed`, so the whole list is
 * reachable and operable from the keyboard and the selected row is announced.
 * Selection is marked by a text badge as well as by styling, because a state
 * carried only in colour is not a state some visitors can perceive.
 *
 * Continuation is one "load more" action driven by the opaque keyset cursor.
 * There is no page number, offset or total on screen because none exists in the
 * contract, and a failed continuation offers to replay the exact cursor that
 * failed rather than silently restarting from the first page.
 */
export function StudioTemplatePicker({ list, selectedSlug, onSelect }: StudioTemplatePickerProps) {
  if (list.isLoading) {
    return (
      <p className="studio-templates__status" role="status">
        {STUDIO_COPY.templateLoading}
      </p>
    );
  }

  if (list.hasError) {
    return (
      <div className="studio-templates__status">
        <p role="alert">{STUDIO_COPY.templateError}</p>
        <button className="studio-button" onClick={list.retry} type="button">
          {STUDIO_COPY.retry}
        </button>
      </div>
    );
  }

  if (list.isEmpty) {
    return (
      <div className="studio-templates__status">
        <p>{STUDIO_COPY.templateEmpty}</p>
        <p className="studio-templates__hint">{STUDIO_COPY.templateEmptyHint}</p>
      </div>
    );
  }

  return (
    <div className="studio-templates">
      <ul className="studio-templates__list">
        {list.templates.map((template) => {
          const selected = template.slug === selectedSlug;
          return (
            <li key={template.slug}>
              <button
                aria-pressed={selected}
                className={`studio-templates__row${selected ? ' studio-templates__row--selected' : ''}`}
                onClick={() => {
                  onSelect(template.slug);
                }}
                type="button"
              >
                <span className="studio-templates__name">{template.name}</span>
                <span className="studio-templates__version">
                  {STUDIO_COPY.templateVersionPrefix} {template.publishedVersion.version}
                </span>
                {selected ? <span className="studio-templates__badge">✓</span> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {list.hasMore ? (
        <div className="studio-templates__more">
          {list.hasContinuationError ? <p role="alert">{STUDIO_COPY.templateMoreError}</p> : null}
          <button
            className="studio-button"
            disabled={list.isLoadingMore}
            onClick={list.loadMore}
            type="button"
          >
            {list.isLoadingMore
              ? STUDIO_COPY.templateMoreLoading
              : list.hasContinuationError
                ? STUDIO_COPY.retry
                : STUDIO_COPY.templateMore}
          </button>
        </div>
      ) : null}
    </div>
  );
}
