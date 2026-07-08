/* The single boundary where untrusted, user-authored HTML (from the Notes
   tab's Tiptap editor) is cleaned before it's allowed to reach the database
   or, later, another CSM's browser via dangerouslySetInnerHTML. Call this
   in the server action that receives a note body from the client — never
   trust that the browser-side editor already sanitized its own output. */

import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "s", "strike", "del", "u",
  "ul", "ol", "li", "blockquote", "code", "pre",
  "h1", "h2", "h3", "a",
];
const ALLOWED_ATTR = ["href"];

// Force every surviving link to open safely in a new tab, regardless of what
// the editor produced — added via a DOMPurify hook (not a post-hoc regex)
// so it runs on the parsed DOM, after href has already been scheme-checked.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export function sanitizeNoteBody(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
