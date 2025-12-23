/**
 * 颜色块扩展
 * 功能：创建一个带背景色的包裹节点，可以包含多个块级元素
 * 描述：使用 React Node View 实现，避免装饰器导致的布局抖动
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ColorBlockComponent } from './ColorBlockComponent';

export interface ColorBlockOptions {
  HTMLAttributes: Record<string, string>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    colorBlock: {
      /**
       * 设置颜色块
       */
      setColorBlock: (attributes?: { backgroundColor?: string }) => ReturnType;
      /**
       * 切换颜色块
       */
      toggleColorBlock: (attributes?: { backgroundColor?: string }) => ReturnType;
      /**
       * 取消颜色块
       */
      unsetColorBlock: () => ReturnType;
      /**
       * 更新颜色块背景色
       */
      updateColorBlockBackground: (backgroundColor: string) => ReturnType;
    };
  }
}

export const ColorBlock = Node.create<ColorBlockOptions>({
  name: 'colorBlock',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  content: 'block+',

  group: 'block',

  defining: true,

  addAttributes() {
    return {
      backgroundColor: {
        default: 'rgba(134, 239, 172, 0.4)',
        parseHTML: (element) => element.getAttribute('data-background-color'),
        renderHTML: (attributes) => {
          return {
            'data-background-color': attributes.backgroundColor as string,
            style: `background-color: ${attributes.backgroundColor as string}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="color-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'color-block',
        class: 'color-block-wrapper',
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColorBlockComponent);
  },

  addCommands() {
    return {
      setColorBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attributes);
        },
      toggleColorBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attributes);
        },
      unsetColorBlock:
        () =>
        ({ commands }) => {
          return commands.lift(this.name);
        },
      updateColorBlockBackground:
        (backgroundColor) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { backgroundColor });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-b': () => this.editor.commands.toggleColorBlock(),
    };
  },
});

export default ColorBlock;
