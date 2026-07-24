'use client';

/**
 * Loads the local SVG fixture as inert data.
 *
 * The spike does not choose a sanitizer (out of scope for APP0-R01), but it
 * does prove the shape of the requirement: the fixture is parsed, every
 * script/foreignObject node and every `on*` / `href="javascript:"` attribute is
 * dropped, and nothing is ever executed. The result is plain geometry that the
 * SVG candidate can recolour, which is the capability difference against the
 * canvas engines.
 */
const FORBIDDEN_TAGS = new Set(['script', 'foreignobject', 'iframe', 'use', 'image', 'style']);

export interface SvgFixture {
  readonly viewBox: string;
  readonly nodes: readonly SvgNode[];
  readonly scriptNodesRemoved: number;
}

export interface SvgNode {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
}

let cached: SvgFixture | null = null;

export async function loadSvgFixture(url: string): Promise<SvgFixture> {
  if (cached !== null) {
    return cached;
  }
  const response = await fetch(url);
  const markup = await response.text();
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;
  const nodes: SvgNode[] = [];
  let removed = 0;

  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase();
    if (FORBIDDEN_TAGS.has(tag)) {
      removed += 1;
      continue;
    }
    const attributes: Record<string, string> = {};
    for (const attribute of Array.from(child.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || attribute.value.trim().toLowerCase().startsWith('javascript:')) {
        removed += 1;
        continue;
      }
      attributes[name] = attribute.value;
    }
    nodes.push({ tag, attributes });
  }

  cached = {
    viewBox: root.getAttribute('viewBox') ?? '0 0 100 100',
    nodes,
    scriptNodesRemoved: removed,
  };
  return cached;
}
