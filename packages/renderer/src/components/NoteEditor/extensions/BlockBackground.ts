/**
 * 块级背景色扩展
 * 功能：为块级节点（heading、paragraph 等）添加背景色属性支持
 * 描述：通过扩展节点属性，支持给可折叠的块添加背景色
 */

import { Extension } from '@tiptap/core';

export interface BlockBackgroundOptions {
  types: string[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockBackground: {
      /**
       * 设置块背景色
       */
      setBlockBackground: (color: string) => ReturnType;
      /**
       * 移除块背景色
       */
      unsetBlockBackground: () => ReturnType;
    };
  }
}

export const BlockBackground = Extension.create<BlockBackgroundOptions>({
  name: 'blockBackground',

  addOptions() {
    return {
      types: ['heading', 'paragraph', 'blockquote', 'codeBlock'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-background-color'),
            renderHTML: (attributes) => {
              if (!attributes.backgroundColor) {
                return {};
              }

              return {
                'data-background-color': attributes.backgroundColor,
                style: `background-color: ${attributes.backgroundColor}; border-radius: 4px; padding: 2px 4px; margin: -2px -4px;`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setBlockBackground:
        (color: string) =>
        ({ commands }) => {
          return this.options.types.every((type) =>
            commands.updateAttributes(type, { backgroundColor: color })
          );
        },
      unsetBlockBackground:
        () =>
        ({ commands }) => {
          return this.options.types.every((type) =>
            commands.resetAttributes(type, 'backgroundColor')
          );
        },
    };
  },
});
