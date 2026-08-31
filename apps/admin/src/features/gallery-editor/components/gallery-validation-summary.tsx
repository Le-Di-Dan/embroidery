'use client';

interface GalleryValidationSummaryProps {
  readonly title: string;
  /** Messages in field order; `undefined` entries are fields that are valid. */
  readonly messages: readonly (string | undefined)[];
}

/**
 * The validation summary shown after a rejected submit.
 *
 * It is an `alert`, so the reason a submit did nothing is announced rather than
 * only appearing above the fold. It never replaces the per-field errors — each
 * field still carries its own message through `aria-describedby` — because a
 * summary alone leaves a keyboard operator to work out which control the
 * complaint belongs to.
 *
 * Renders nothing when everything is valid, rather than an empty alert region
 * that would be announced as a change for no reason.
 */
export function GalleryValidationSummary({ title, messages }: GalleryValidationSummaryProps) {
  const present = messages.filter((message): message is string => message !== undefined);
  if (present.length === 0) {
    return null;
  }
  return (
    <div className="gallery-editor__validation" role="alert" data-testid="gallery-validation">
      <p className="gallery-editor__validation-title">{title}</p>
      <ul className="gallery-editor__validation-list">
        {present.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
