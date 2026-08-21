/**
 * The thread colours an Approval Snapshot freezes (TBL-032, `APP6-B11` §11).
 *
 * ### There is no palette to look them up in
 *
 * `approval_snapshot_thread_colors` says so itself, verbatim: *"`color_code` is
 * captured as submitted at approval time and never re-derived from a live
 * palette table — there is no palette catalog table in this schema"*. So the
 * only truthful source for "which colours did the customer approve" is the
 * approved Design Document, and the only truthful `color_code` is the colour
 * value the document actually declares.
 *
 * A DMC or Madeira thread number would be a *better* record and would be
 * invented: nothing in the system maps a CSS colour to a thread, no operator has
 * entered one, and a fabricated code in immutable evidence that authorises a
 * machine file is the worst place in the platform for a guess. `color_name` is
 * therefore left `undefined` — the column is nullable precisely so an
 * unnamed colour can be recorded as unnamed — and the delivered `colorCode` is
 * the document's own string.
 *
 * ### Derived from the frozen document, not from the caller
 *
 * The document passed in is the one `design_versions.design_document` holds and
 * `document_hash` was computed over at `TR-LC08-02`. Nothing here reads a
 * request body. A version whose document is unparseable, or whose elements carry
 * no colour, yields an empty list rather than a refusal: the schema permits a
 * snapshot with no thread-colour children (there is no `NOT NULL` and no
 * "at least one" constraint), and an approval is not the place to start
 * rejecting artwork the workshop already sent and the customer already saw.
 *
 * ### Order is z-order, and it is the position
 *
 * `uq_approval_thread_colors__approval_position` makes `position` the child's
 * identity within a snapshot, so it must be deterministic. The document's
 * element array *is* z-order, bottom first (ADR-DB1-012 §7, preserved by JCS),
 * and within one element `fill` is read before `stroke` — a shape's fill sits
 * under its own outline. First appearance wins and duplicates are dropped, so
 * two shapes in the same red are one thread, which is what a thread list means.
 *
 * The reader is deliberately structural rather than typed against
 * `packages/design-document`. A v1 Catalog document and a v2 COP document are
 * both simply the JSON their row holds, this file must read both without
 * migrating either, and `image` and `group` elements carry no colour at all —
 * so it asks each element for two optional string properties and ignores
 * everything else it finds.
 */

/** One frozen thread colour, in the shape `ApprovalSnapshotRepository` takes. */
export interface ApprovalThreadColor {
  readonly position: number;
  readonly colorCode: string;
  readonly colorName?: string | undefined;
}

/** The two colour-bearing properties v1 elements declare (`text`/`shape`/`freehand`). */
const COLOR_KEYS = ['fill', 'stroke'] as const;

/**
 * The distinct colours the approved document declares, in z-order.
 *
 * @param document the persisted `design_document`, exactly as stored.
 */
export function approvalThreadColorsOf(document: unknown): ApprovalThreadColor[] {
  const elements = elementsOf(document);
  const seen = new Set<string>();
  const colors: ApprovalThreadColor[] = [];

  for (const element of elements) {
    for (const key of COLOR_KEYS) {
      const value = stringPropertyOf(element, key);
      // A blank string is not a colour. `''` would satisfy the `NOT NULL` on
      // `color_code` and record a thread nobody can dye.
      if (value === undefined || value.trim() === '' || seen.has(value)) {
        continue;
      }
      seen.add(value);
      // 1-based: `position` is a human-facing ordinal on a work order, and every
      // other positional column in this schema counts from one.
      colors.push({ position: colors.length + 1, colorCode: value });
    }
  }

  return colors;
}

/** The document's element array, or nothing readable. */
function elementsOf(document: unknown): readonly unknown[] {
  if (typeof document !== 'object' || document === null) {
    return [];
  }
  const elements = (document as Record<string, unknown>)['elements'];
  return Array.isArray(elements) ? elements : [];
}

function stringPropertyOf(element: unknown, key: string): string | undefined {
  if (typeof element !== 'object' || element === null) {
    return undefined;
  }
  const value = (element as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}
