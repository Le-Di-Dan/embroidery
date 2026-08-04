/**
 * The group graph: references, parentage, cycles and depth.
 *
 * Groups are the one place in v1 where elements refer to each other, so they
 * are the one place a document can describe something that cannot exist. Three
 * failures are distinct and get distinct codes, because a caller shows a
 * different message for each: a child that is not in the document
 * (`INVALID_GROUP_REFERENCE`), a child claimed by two groups
 * (`MULTIPLE_GROUP_PARENTS`), and a group that reaches itself (`GROUP_CYCLE`).
 *
 * Depth is measured on the real parent chains rather than assumed, so a
 * document nested eight deep passes and nine deep does not — including when the
 * nesting is spread across groups declared in any order.
 */
import { DESIGN_DOCUMENT_LIMITS } from '../schema/constants';
import type { DesignElement, GroupElement } from '../schema/elements';
import { finding, type DesignDocumentFinding } from '../findings/finding';

function isGroup(element: DesignElement): element is GroupElement {
  return element.type === 'group';
}

/**
 * Validates the group graph of an already structurally-valid element list.
 *
 * Returns findings rather than throwing: a caller wants every broken reference,
 * not the first one.
 */
export function validateGroupGraph(
  elements: readonly DesignElement[],
): readonly DesignDocumentFinding[] {
  const findings: DesignDocumentFinding[] = [];
  const byId = new Map<string, DesignElement>();
  for (const element of elements) byId.set(element.id, element);

  const parentOf = new Map<string, string>();
  const groups = elements.filter(isGroup);

  for (const group of groups) {
    const path = `$.elements[${String(elements.indexOf(group))}].childIds`;
    const seenHere = new Set<string>();
    for (const [index, childId] of group.childIds.entries()) {
      const at = `${path}[${String(index)}]`;
      if (childId === group.id) {
        findings.push(finding('GROUP_CYCLE', at, 'A group cannot contain itself.'));
        continue;
      }
      if (!byId.has(childId)) {
        findings.push(
          finding(
            'INVALID_GROUP_REFERENCE',
            at,
            'This group references an element that does not exist.',
          ),
        );
        continue;
      }
      if (seenHere.has(childId)) {
        findings.push(
          finding('INVALID_GROUP_REFERENCE', at, 'This group lists the same child more than once.'),
        );
        continue;
      }
      seenHere.add(childId);
      const existing = parentOf.get(childId);
      if (existing !== undefined) {
        findings.push(
          finding('MULTIPLE_GROUP_PARENTS', at, 'An element may belong to at most one group.'),
        );
        continue;
      }
      parentOf.set(childId, group.id);
    }
  }

  findings.push(...detectCycles(groups, parentOf));
  findings.push(...measureDepth(elements, parentOf));
  return findings;
}

/**
 * A cycle is any group that reaches itself by following parents.
 *
 * Walking *upward* through `parentOf` is what makes this terminate: each step
 * has at most one successor, so a bounded walk either reaches a root or returns
 * to where it started — no recursion over an arbitrarily branching child list.
 */
function detectCycles(
  groups: readonly GroupElement[],
  parentOf: ReadonlyMap<string, string>,
): readonly DesignDocumentFinding[] {
  const findings: DesignDocumentFinding[] = [];
  const reported = new Set<string>();

  for (const group of groups) {
    const seen = new Set<string>([group.id]);
    let current = parentOf.get(group.id);
    while (current !== undefined) {
      if (seen.has(current)) {
        if (!reported.has(group.id)) {
          reported.add(group.id);
          findings.push(
            finding('GROUP_CYCLE', '$.elements', 'Group membership forms a cycle.', {
              groupCount: groups.length,
            }),
          );
        }
        break;
      }
      seen.add(current);
      current = parentOf.get(current);
    }
  }
  return findings;
}

/** Nesting depth of the deepest element, counted through its parent chain. */
function measureDepth(
  elements: readonly DesignElement[],
  parentOf: ReadonlyMap<string, string>,
): readonly DesignDocumentFinding[] {
  const limit = DESIGN_DOCUMENT_LIMITS.maxGroupDepth;
  let deepest = 0;

  for (const element of elements) {
    let depth = 0;
    const seen = new Set<string>([element.id]);
    let current = parentOf.get(element.id);
    // A cycle is already reported above; the guard only keeps this walk finite.
    while (current !== undefined && !seen.has(current) && depth <= limit + 1) {
      depth += 1;
      seen.add(current);
      current = parentOf.get(current);
    }
    deepest = Math.max(deepest, depth);
  }

  if (deepest > limit) {
    return [
      finding(
        'COMPLEXITY_LIMIT_EXCEEDED',
        '$.elements',
        `Group nesting is ${String(deepest)} deep; the maximum is ${String(limit)}.`,
        { limit, actual: deepest, measure: 'groupDepth' },
      ),
    ];
  }
  return [];
}
