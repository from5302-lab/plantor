import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ChemView } from "@/components/note/chem-view";

// 분자식 블럭 — SMILES 문자열을 attr로 보관, NodeView에서 구조식 렌더
export const Chem = Node.create({
  name: "chem",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      smiles: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-smiles") ?? "",
        renderHTML: (attrs) => ({ "data-smiles": attrs.smiles }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chem"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "chem" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChemView);
  },
});
