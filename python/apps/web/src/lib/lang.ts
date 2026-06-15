import type { Extension } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { xml } from "@codemirror/lang-xml";

// Map a language id → the CodeMirror language extension(s). "text" (or unknown)
// returns none (plain text with line numbers).
export function langExtension(name: string): Extension[] {
  switch (name) {
    case "python":
      return [python()];
    case "javascript":
      return [javascript()];
    case "typescript":
      return [javascript({ typescript: true })];
    case "jsx":
      return [javascript({ jsx: true })];
    case "tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "json":
      return [json()];
    case "html":
      return [html()];
    case "css":
      return [css()];
    case "markdown":
      return [markdown()];
    case "sql":
      return [sql()];
    case "yaml":
      return [yaml()];
    case "xml":
      return [xml()];
    default:
      return [];
  }
}

const EXT_MAP: Record<string, string> = {
  py: "python",
  pyw: "python",
  pyi: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  json: "json",
  jsonc: "json",
  html: "html",
  htm: "html",
  vue: "html",
  svelte: "html",
  css: "css",
  scss: "css",
  less: "css",
  md: "markdown",
  markdown: "markdown",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  svg: "xml",
  toml: "text",
};

export function langForFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "text";
}
