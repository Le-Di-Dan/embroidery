/**
 * Reading the message repository from ordinary TypeScript.
 *
 * Two kinds of caller need a Vietnamese sentence, and only one of them is a
 * React component:
 *
 * - **Components** use next-intl (`useTranslations` / `getTranslations`). That
 *   is the path §5A.9 wires, and it is what new interactive copy should use.
 * - **Copy views** — the `*-copy.ts` modules this repository already had, plus
 *   metadata generators, route models and pure functions — are not components
 *   and have no hook context. They read the same JSON through this module.
 *
 * Both paths end at `messages/vi/*.json`. That is the point: §5A.14's acceptance
 * test is that editing the JSON changes the runtime, and it holds for a sentence
 * printed by a server component's `generateMetadata` exactly as it does for one
 * printed by a button.
 *
 * ## Why the copy views were kept
 *
 * The repository already isolated its copy into per-feature `*-copy.ts`
 * catalogs, imported by name from roughly six hundred components. Rewriting all
 * of them into `t('…')` call sites would have been a mechanical change to every
 * file in both applications during the same checkpoint that rewrites the copy
 * itself — two large diffs on top of each other, and no way to review either.
 * The catalogs stay as the *typed view*; their string literals moved out. What
 * §5A actually forbids is a second authority for the text, and there is none:
 * a catalog now holds keys and shapes, and the sentence lives in JSON.
 */

/** Values interpolated into a message. Numbers are formatted by the caller's locale rules. */
export type MessageValues = Readonly<Record<string, string | number>>;

/**
 * A missing key is a bug, and it must look like one.
 *
 * §5A.13 requires missing-key behaviour to be fail-visible in development and
 * test. Rendering the key, or an empty string, produces a page that looks
 * finished and is not — the exact failure that reaches production. So the
 * lookup throws wherever a developer or a test will see it, and degrades to the
 * key in a production browser rather than taking a customer's page down over a
 * caption.
 */
function onMissing(path: string): string {
  const message = `[i18n] Missing message key: ${path}`;
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(message);
  }
  return path;
}

/**
 * Resolve a dotted key path against a message tree.
 *
 * Returns the raw node, which may be a string, an array (a list of paragraphs
 * or bullets) or a nested object (a whole sub-catalog). Callers narrow.
 */
export function resolveMessageNode(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null || !(segment in node)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/**
 * Substitute `{name}` placeholders.
 *
 * Deliberately not a full ICU implementation. The copy-view path needs simple
 * named substitution — a count, a product name, a date already formatted by its
 * owner — and a component that needs plurals or select has next-intl. A partial
 * ICU parser here would be a second, weaker formatter that disagrees with the
 * real one on the first message that uses it.
 *
 * An unsatisfied placeholder is left in the output rather than blanked, so the
 * missing value is visible in a screenshot instead of being a hole nobody sees.
 */
export function formatMessage(template: string, values?: MessageValues): string {
  if (values === undefined) return template;
  return template.replace(/\{(\w+)\}/gu, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * A bound reader for one message subtree.
 *
 * A copy view calls `messageView(VI_MESSAGES.storefront, 'homepage')` once and
 * then addresses its own keys relatively, so the namespace prefix is written in
 * exactly one place per feature and a feature cannot accidentally read another
 * feature's sentence.
 */
export interface MessageView {
  /** A single string, with optional `{placeholder}` substitution. */
  readonly text: (path: string, values?: MessageValues) => string;
  /** A list of strings — paragraphs, bullets, ordered steps. */
  readonly list: (path: string) => readonly string[];
  /** A whole sub-object of strings, for shapes a component iterates by key. */
  readonly group: <T>(path: string) => T;
  /** A narrower view beneath this one. */
  readonly scope: (path: string) => MessageView;
}

export function messageView(root: unknown, prefix = ''): MessageView {
  const absolute = (path: string): string => (prefix === '' ? path : `${prefix}.${path}`);
  const base = prefix === '' ? root : resolveMessageNode(root, prefix);

  return {
    text(path, values) {
      const node = resolveMessageNode(base, path);
      if (typeof node !== 'string') return onMissing(absolute(path));
      return formatMessage(node, values);
    },
    list(path) {
      const node = resolveMessageNode(base, path);
      if (!Array.isArray(node) || node.some((item) => typeof item !== 'string')) {
        onMissing(absolute(path));
        return [];
      }
      return node as readonly string[];
    },
    group<T>(path: string): T {
      const node = resolveMessageNode(base, path);
      if (typeof node !== 'object' || node === null) {
        onMissing(absolute(path));
        return {} as T;
      }
      return node as T;
    },
    scope(path) {
      return messageView(root, absolute(path));
    },
  };
}
