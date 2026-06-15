"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap, type EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { linter, lintGutter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import {
  autocompletion,
  acceptCompletion,
  moveCompletionSelection,
  closeCompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { langExtension } from "@/lib/lang";
import type { Diagnostic, Completion } from "@/lib/api";

export function CodeEditor({
  value,
  onChange,
  onRun,
  onRunAdvance,
  onSave,
  editable = true,
  language = "python",
  lintSource,
  completionSource,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun?: () => void;
  onRunAdvance?: () => void;
  onSave?: () => void;
  editable?: boolean;
  language?: string;
  lintSource?: (code: string) => Promise<Diagnostic[]>;
  completionSource?: (
    code: string,
    line: number,
    column: number,
  ) => Promise<Completion[]>;
}) {
  // High-precedence keymap so the shortcuts win over default newline/insert.
  const keys = useMemo(() => {
    const binds = [];
    if (onRun)
      binds.push({
        key: "Mod-Enter",
        run: () => {
          onRun();
          return true;
        },
      });
    if (onRunAdvance)
      binds.push({
        key: "Shift-Enter",
        run: () => {
          onRunAdvance();
          return true;
        },
      });
    if (onSave)
      binds.push({
        key: "Mod-s",
        run: () => {
          onSave();
          return true;
        },
      });
    return Prec.highest(keymap.of(binds));
  }, [onRun, onRunAdvance, onSave]);

  // Inline diagnostics: CodeMirror's linter debounces and calls our async
  // source, mapping Ruff's (line, col) to document ranges → squiggles + gutter.
  const lintExt = useMemo(() => {
    if (!lintSource) return [];
    const source = async (view: EditorView): Promise<CmDiagnostic[]> => {
      let diags: Diagnostic[];
      try {
        diags = await lintSource(view.state.doc.toString());
      } catch {
        return [];
      }
      const doc = view.state.doc;
      return diags.map((d) => {
        const line = doc.line(Math.min(Math.max(d.line, 1), doc.lines));
        const from = Math.min(line.from + Math.max(d.column - 1, 0), line.to);
        const endLine = doc.line(Math.min(Math.max(d.end_line, 1), doc.lines));
        let to = Math.min(endLine.from + Math.max(d.end_column - 1, 0), endLine.to);
        if (to <= from) to = Math.min(from + 1, line.to);
        return {
          from,
          to,
          severity: d.severity,
          message: `${d.code}: ${d.message}`,
        };
      });
    };
    return [lintGutter(), linter(source, { delay: 600 })];
  }, [lintSource]);

  // Autocomplete: triggers on identifier chars (and after a dot → the next
  // char). Maps our {label,type} to CodeMirror completions.
  const completeExt = useMemo(() => {
    if (!completionSource) return [];
    const source = async (
      ctx: CompletionContext,
    ): Promise<CompletionResult | null> => {
      const word = ctx.matchBefore(/[A-Za-z_]\w*/);
      if (!word && !ctx.explicit) return null;
      const from = word ? word.from : ctx.pos;
      const doc = ctx.state.doc;
      const lineObj = doc.lineAt(ctx.pos);
      let items: Completion[];
      try {
        items = await completionSource(
          doc.toString(),
          lineObj.number,
          ctx.pos - lineObj.from,
        );
      } catch {
        return null;
      }
      if (!items.length) return null;
      return {
        from,
        validFor: /^[\w]*$/,
        options: items.map((i) => ({
          label: i.label,
          type: i.type || undefined,
        })),
      };
    };
    return [
      // Tab accepts the suggestion (Enter stays a newline); arrows navigate.
      // These commands return false when no popup is open, so the keys fall
      // through to their normal behaviour.
      autocompletion({
        override: [source],
        activateOnTyping: true,
        defaultKeymap: false,
      }),
      Prec.highest(
        keymap.of([
          { key: "Tab", run: acceptCompletion },
          { key: "ArrowDown", run: moveCompletionSelection(true) },
          { key: "ArrowUp", run: moveCompletionSelection(false) },
          { key: "Escape", run: closeCompletion },
        ]),
      ),
    ];
  }, [completionSource]);

  const extensions = useMemo(
    () => [...langExtension(language), ...lintExt, ...completeExt, keys],
    [language, lintExt, completeExt, keys],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={oneDark}
      editable={editable}
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false,
        highlightActiveLineGutter: true,
      }}
      style={{ fontSize: 13.5 }}
    />
  );
}
