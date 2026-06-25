import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { GraphView } from "@/components/note/graph-view";

// 그래프 블럭 — 함수식 문자열을 attr로 보관, NodeView에서 function-plot 렌더
export const Graph = Node.create({
  name: "graph",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      fn: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-fn") ?? "",
        renderHTML: (attrs) => ({ "data-fn": attrs.fn }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="graph"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "graph" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GraphView);
  },
});
