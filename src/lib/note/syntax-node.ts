import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { SyntaxView } from "@/components/note/syntax-view";

// 영어 구문분석 블럭 — 문장 + 토큰별 수동 라벨을 attr로 보관
export const Syntax = Node.create({
  name: "syntax",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      sentence: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-sentence") ?? "",
        renderHTML: (attrs) => ({ "data-sentence": attrs.sentence }),
      },
      tokens: {
        default: [],
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute("data-tokens") ?? "[]");
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({ "data-tokens": JSON.stringify(attrs.tokens ?? []) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="syntax"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "syntax" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SyntaxView);
  },
});
