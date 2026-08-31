import type { ReactNode } from 'react';

/**
 * One footer store-presentation column (`APP11-S05`).
 *
 * The four columns share a heading treatment and a stacking rhythm, and
 * `889:1030` states that their internals are never reflowed — only their
 * grouping changes between 4-in-a-row, 2 × 2 and a single stack. One component
 * for all four is what makes that literally true rather than a convention four
 * copies have to keep.
 *
 * The heading is a `<h2>`. The block is a named region inside a page that
 * already owns its `<h1>`, and a plain styled `<p>` here would leave a
 * screen-reader user with four unlabelled lists at the end of every page.
 */
export function StorePresentationColumn({
  heading,
  children,
}: {
  readonly heading: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="store-presentation__column">
      <h2 className="store-presentation__heading">{heading}</h2>
      {children}
    </div>
  );
}
