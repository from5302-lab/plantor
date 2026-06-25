"use client";

import { useEffect } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { Details, DetailsSummary, DetailsContent } from "@tiptap/extension-details";
import { Callout } from "@/lib/note/callout";
import { SlashCommand } from "@/lib/note/slash-command";
import { Chem } from "@/lib/note/chem-node";
import { Graph } from "@/lib/note/graph-node";
import { Syntax } from "@/lib/note/syntax-node";
import { MetaBar } from "./meta-bar";
import type { NoteMeta } from "@/lib/note/firestore";

type Props = {
  initialContent: JSONContent;
  meta: NoteMeta | undefined;
  onChange: (patch: { content?: JSONContent }) => void;
  onMetaClick: () => void;
};

export function Editor({ initialContent, meta, onChange, onMetaClick }: Props) {

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      InlineMath.configure({ katexOptions: { throwOnError: false } }),
      BlockMath.configure({ katexOptions: { throwOnError: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Details.configure({ persist: true, HTMLAttributes: { class: "toggle" } }),
      DetailsSummary,
      DetailsContent,
      Callout,
      Chem,
      Graph,
      Syntax,
      SlashCommand,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "제목";
          if (node.type.name === "detailsSummary") return "토글 제목";
          return "'/' 키로 블럭 추가";
        },
      }),
    ],
    immediatelyRender: false,
    content: initialContent,
    onUpdate: ({ editor: ed }) => {
      onChange({ content: ed.getJSON() });
    },
  });

  // 슬래시 메뉴의 과목별 필터링용 — 현재 노트 과목을 확장 storage에 동기화
  useEffect(() => {
    if (editor) editor.storage.slashCommand.subject = meta?.subject;
  }, [editor, meta?.subject]);

  return (
    <div className="note-page">
      <MetaBar meta={meta} onClick={onMetaClick} />
      <EditorContent editor={editor} />
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .note-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 12px 24px 200px;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  .ProseMirror {
    outline: none;
    min-height: 60vh;
    font-size: 16px;
    line-height: 1.65;
    color: rgba(0,0,0,0.88);
    caret-color: rgba(0,0,0,0.85);
  }
  .ProseMirror > * + * { margin-top: 4px; }
  .ProseMirror h1 { font-size: 30px; font-weight: 700; margin: 32px 0 4px; line-height: 1.3; letter-spacing: -0.4px; }
  .ProseMirror h2 { font-size: 24px; font-weight: 700; margin: 28px 0 4px; line-height: 1.3; letter-spacing: -0.3px; }
  .ProseMirror h3 { font-size: 20px; font-weight: 600; margin: 24px 0 4px; line-height: 1.4; }
  .ProseMirror p { margin: 0; padding: 3px 0; }
  .ProseMirror ul { padding-left: 24px; margin: 0; list-style: disc; }
  .ProseMirror ol { padding-left: 24px; margin: 0; list-style: decimal; }
  .ProseMirror ul ul { list-style: circle; }
  .ProseMirror ul ul ul { list-style: square; }
  .ProseMirror li { display: list-item; }
  .ProseMirror li > p { margin: 0; padding: 3px 0; }
  .ProseMirror blockquote {
    border-left: 3px solid rgba(0,0,0,0.85);
    padding-left: 14px;
    margin: 4px 0;
    color: rgba(0,0,0,0.88);
  }
  .ProseMirror code {
    background: rgba(135,131,120,0.15);
    color: #eb5757;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 0.875em;
  }
  .ProseMirror pre {
    background: rgb(247,246,243);
    padding: 16px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 14px;
    line-height: 1.5;
    margin: 4px 0;
  }
  .ProseMirror pre code { background: none; padding: 0; color: rgba(0,0,0,0.85); }
  .ProseMirror hr { border: none; border-top: 1px solid rgba(0,0,0,0.15); margin: 8px 0; }

  /* Task list — 일반 ul보다 뒤에 와서 disc 마커 제거 */
  .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  .ProseMirror ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; padding: 1px 0; list-style: none; }
  .ProseMirror ul[data-type="taskList"] li > label { flex-shrink: 0; margin-top: 6px; user-select: none; }
  .ProseMirror ul[data-type="taskList"] li > div { flex: 1; min-width: 0; }
  .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div { color: rgba(0,0,0,0.35); text-decoration: line-through; }

  /* Math */
  .ProseMirror [data-type="blockMath"] { display: block; text-align: center; margin: 8px 0; padding: 8px; }
  .ProseMirror [data-type="blockMath"]:hover, .ProseMirror [data-type="inlineMath"]:hover {
    background: rgba(0,0,0,0.04);
    border-radius: 3px;
    cursor: pointer;
  }
  .ProseMirror [data-type="inlineMath"] { padding: 0 2px; }

  /* Toggle (details) */
  .ProseMirror .toggle {
    margin: 4px 0;
    padding: 2px 0;
  }
  .ProseMirror .toggle > summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 2px 0;
  }
  .ProseMirror .toggle > summary::-webkit-details-marker { display: none; }
  .ProseMirror .toggle > summary::before {
    content: "▶";
    font-size: 11px;
    color: rgba(0,0,0,0.5);
    margin-top: 6px;
    transition: transform 0.15s;
    flex-shrink: 0;
  }
  .ProseMirror .toggle[open] > summary::before { transform: rotate(90deg); }
  .ProseMirror .toggle > div[data-type="detailsContent"] {
    padding-left: 20px;
    margin-top: 2px;
  }

  /* Callout */
  .ProseMirror div[data-type="callout"] {
    display: flex;
    gap: 10px;
    padding: 14px 16px;
    background: rgb(241,241,239);
    border-radius: 4px;
    margin: 4px 0;
  }
  .ProseMirror div[data-type="callout"] .callout-icon {
    flex-shrink: 0;
    font-size: 18px;
    line-height: 1.5;
    user-select: none;
  }
  .ProseMirror div[data-type="callout"] .callout-body { flex: 1; min-width: 0; }
  .ProseMirror div[data-type="callout"] .callout-body > p { padding: 0; }

  /* Placeholder */
  .ProseMirror p.is-editor-empty:first-child::before,
  .ProseMirror h1.is-empty::before,
  .ProseMirror h2.is-empty::before,
  .ProseMirror h3.is-empty::before,
  .ProseMirror summary.is-empty::before {
    content: attr(data-placeholder);
    color: rgba(0,0,0,0.25);
    float: left;
    height: 0;
    pointer-events: none;
  }

  /* Selection */
  .ProseMirror ::selection { background: rgba(35,131,226,0.28); }
`;
