import { Node, mergeAttributes, wrappingInputRule } from "@tiptap/core";

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "callout" }),
      ["div", { class: "callout-icon", contenteditable: "false" }, "💡"],
      ["div", { class: "callout-body" }, 0],
    ];
  },

  addInputRules() {
    return [
      wrappingInputRule({
        find: /^::\s$/,
        type: this.type,
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-c": () =>
        this.editor.commands.toggleWrap(this.name),
    };
  },
});
