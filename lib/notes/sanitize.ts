/* The single boundary where untrusted, user-authored HTML (from the Notes
   tab's Tiptap editor) is cleaned before it's allowed to reach the database
   or, later, another CSM's browser via dangerouslySetInnerHTML. Call this
   in the server action that receives a note body from the client — never
   trust that the browser-side editor already sanitized its own output.

   Uses sanitize-html (pure JS, no jsdom) rather than isomorphic-dompurify:
   the latter's server-side path pulls in jsdom -> html-encoding-sniffer,
   which on Vercel's Node runtime crashed every save with
   "require() of ES Module .../@exodus/bytes/encoding-lite.js ... not
   supported" the instant a note was created — a jsdom-side ESM/CJS
   incompatibility, not anything about the sanitized content itself. */

import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "s", "strike", "del", "u",
  "ul", "ol", "li", "blockquote", "code", "pre",
  "h1", "h2", "h3", "a",
];

export function sanitizeNoteBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"] },
    // Disallowed-scheme hrefs (javascript:, data:, etc.) are dropped by default.
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });
}
