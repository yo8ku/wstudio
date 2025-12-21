/**
 * TipTap Tag 扩展
 * 支持 #标签名 语法的标签节点
 */

import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface TagNodeOptions {
  HTMLAttributes: Record<string, string>;
  onTagClick?: (tagName: string) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tagNode: {
      setTag: (attributes: { name: string }) => ReturnType;
    };
  }
}

// 匹配 #标签名 语法的正则表达式（支持中文、英文、数字、下划线、斜杠）
const TAG_REGEX = /#([\w\u4e00-\u9fa5/]+)\s$/;

export const TagNode = Node.create<TagNodeOptions>({
  name: 'tagNode',
  group: 'inline',
  inline: true,
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      onTagClick: undefined,
    };
  },

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-tag'),
        renderHTML: (attributes) => {
          if (!attributes.name) {
            return {};
          }
          return {
            'data-tag': attributes.name,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="tag"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { 'data-type': 'tag', class: 'tag-node' },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      `#${node.attrs.name}`,
    ];
  },

  renderText({ node }) {
    return `#${node.attrs.name}`;
  },

  addCommands() {
    return {
      setTag:
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
        find: TAG_REGEX,
        type: this.type,
        getAttributes: (match) => {
          return { name: match[1] };
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { onTagClick } = this.options;

    return [
      new Plugin({
        key: new PluginKey('tagClick'),
        props: {
          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains('tag-node') && onTagClick) {
              const tagName = target.getAttribute('data-tag');
              if (tagName) {
                onTagClick(tagName);
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

export default TagNode;
