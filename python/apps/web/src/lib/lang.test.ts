import { describe, it, expect } from "vitest";
import { langForFilename } from "@/lib/lang";

describe("langForFilename", () => {
  it("maps known extensions to a language", () => {
    expect(langForFilename("main.py")).toBe("python");
    expect(langForFilename("app.tsx")).toBe("tsx");
    expect(langForFilename("util.ts")).toBe("typescript");
    expect(langForFilename("readme.md")).toBe("markdown");
    expect(langForFilename("data.json")).toBe("json");
  });

  it("is case-insensitive on the extension", () => {
    expect(langForFilename("Main.PY")).toBe("python");
  });

  it("falls back to 'text' for unknown / missing extensions", () => {
    expect(langForFilename("notes.xyz")).toBe("text");
    expect(langForFilename("Makefile")).toBe("text");
    expect(langForFilename("archive.tar.gz")).toBe("text");
  });
});
