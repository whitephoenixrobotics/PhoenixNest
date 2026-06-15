import { marked } from "marked";

// Render markdown → HTML synchronously. `{ async: false }` pins marked's
// string-returning overload, so callers don't need the unsound
// `marked.parse(...) as string` cast (which would silently render
// "[object Promise]" if marked were ever switched to async mode).
export function renderMarkdown(src: string): string {
  return marked.parse(src ?? "", { async: false });
}
