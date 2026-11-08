import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface MermaidOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface MermaidAttributes {
  code?: string;
  align?: "left" | "center" | "right";
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mermaid: {
      setMermaid: (attributes?: MermaidAttributes) => ReturnType;
    };
  }
}

/**
 * Blok diagram Mermaid. Sumber diagram disimpan sebagai atribut `code`,
 * render dilakukan di client (view), jadi aman untuk dokumen yang dibaca
 * read-only sekalipun.
 */
export const Mermaid = Node.create<MermaidOptions>({
  name: "mermaid",
  group: "block",
  atom: true,
  draggable: true,
  isolating: true,

  addOptions() {
    return { HTMLAttributes: {}, view: null };
  },

  addAttributes() {
    return {
      code: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-code") ?? element.textContent ?? "",
        renderHTML: (attributes) => ({ "data-code": attributes.code ?? "" }),
      },
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align") ?? "center",
        renderHTML: (attributes) => ({ "data-align": attributes.align ?? "center" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "mermaid" }),
      HTMLAttributes.code ?? "",
    ];
  },

  addNodeView() {
    return this.options.view ? ReactNodeViewRenderer(this.options.view) : null;
  },

  addCommands() {
    return {
      setMermaid:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: attributes }),
    };
  },
});
