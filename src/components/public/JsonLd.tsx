/**
 * Server-rendered JSON-LD — docs/SEO.md §11 `[LOCKED]`.
 *
 * All structured data is built by typed builders in `lib/seo` and rendered
 * here, in the server component tree. There is no client-side injection, so
 * what a crawler receives is exactly what the page asserts.
 *
 * `JSON.stringify` escapes quotes and backslashes; escaping `<` on top of that
 * is what stops admin-entered text containing a closing script tag from
 * terminating the element early. The block is `application/ld+json`, so the
 * browser parses it as data, not as JavaScript.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      // The payload is JSON produced immediately above — not markup — and is
      // escaped for the one character that matters inside a script element.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
