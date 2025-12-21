/**
 * TipTap Wikilink 扩展
 * 支持 [[笔记名]] 语法的双向链接
 */

import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface WikilinkOptions {
  HTMLAttributes: Record<string, string>;
  onWikilinkClick?: (title: string) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikilink: {
      setWikilink: (attributes: { title: string }) => ReturnType;
    };
  }
}

// 匹配 [[笔记名]] 语法的正则表达式
const WIKILINK_REGEX = /\[\[([^\]]+)\]\]$/;

export const WikilinkNode = Node.create<WikilinkOptions>({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      onWikilinkClick: undefined,
    };
  },

  addAttributes() {
    return {
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-title'),
        renderHTML: (attributes) => {
          if (!attributes.title) {
            return {};
          }
          return {
            'data-title': attributes.title,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="wikilink"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { 'data-type': 'wikilink', class: 'wikilink' },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      `[[${node.attrs.title}]]`,
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.title}]]`;
  },

  addCommands() {
    return {
      setWikilink:
        (attributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: WIKILINK_REGEX,
        type: this.type,
        getAttributes: (match) => {
          return { title: match[1] };
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { onWikilinkClick } = this.options;

    return [
      new Plugin({
        key: new PluginKey('wikilinkClick'),
        props: {
          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains('wikilink') && onWikilinkClick) {
              const title = target.getAttribute('data-title');
              if (title) {
                onWikilinkClick(title);
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});

export default WikilinkNode;
