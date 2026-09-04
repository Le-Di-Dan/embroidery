/**
 * Serializing a JSON-LD document for embedding in an HTML `<script>` element
 * (`APP11-S04`, generalized by `APP12-H06`).
 *
 * Extracted from `breadcrumb-json-ld.ts` when a second document type — the
 * `APP12-H06` `Product` graph — needed the identical escaping. One serializer
 * rather than two, because the escaping below is a safety property and two
 * copies is two places for one of them to be forgotten.
 */

/**
 * The shape every JSON-LD document in this app has: a `schema.org` context and
 * a type, over JSON-serializable fields.
 *
 * Deliberately not `unknown` or `Record<string, any>`. A builder returns a
 * precise interface that structurally satisfies this, so the serializer accepts
 * it without any builder being able to smuggle a non-serializable value or a
 * caller-supplied raw string past the type system.
 */
export type JsonLdValue = string | number | boolean | readonly JsonLdValue[] | JsonLdObject;

export interface JsonLdObject {
  readonly [key: string]: JsonLdValue | undefined;
}

export interface JsonLdDocument extends JsonLdObject {
  readonly '@context': 'https://schema.org';
  readonly '@type': string;
}

/**
 * Serializes a JSON-LD document for embedding in an HTML `<script>` element.
 *
 * `JSON.stringify` escapes quotes and control characters but not `<`, and an
 * operator-authored title containing `</script>` would otherwise terminate the
 * element and inject whatever followed into the document. Escaping `<` as its
 * unicode form keeps the JSON byte-for-byte equivalent for any parser while
 * making the sequence impossible to write. `&` is escaped for the same reason a
 * step further out — it cannot start a tag, but it is the other character an
 * HTML parser gives meaning to inside raw text.
 *
 * The document is always built by a typed builder from typed fields, so no raw
 * JSON string is ever concatenated into markup.
 */
export function serializeJsonLd(document: JsonLdDocument): string {
  return JSON.stringify(document).replace(/</g, '\\u003c').replace(/&/g, '\\u0026');
}
