import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

// Locks in the marked refactor: renderMarkdown must return a real HTML *string*
// synchronously (the old `marked.parse(...) as string` cast risked a Promise).
describe("renderMarkdown", () => {
  it("returns a synchronous string, not a Promise", () => {
    const out = renderMarkdown("# Hi");
    expect(typeof out).toBe("string");
    expect(out).not.toBeInstanceOf(Promise);
  });

  it("renders common markdown to HTML", () => {
    const html = renderMarkdown("# Title\n\n**bold** and `code`\n\n- a\n- b");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<li>a</li>");
  });

  it("tolerates empty / nullish input", () => {
    expect(renderMarkdown("")).toBe("");
    // @ts-expect-error — guarding the runtime nullish path
    expect(typeof renderMarkdown(undefined)).toBe("string");
  });
});
