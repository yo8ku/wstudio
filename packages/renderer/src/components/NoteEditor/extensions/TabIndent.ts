/**
 * Tab 缩进扩展
 * 功能：处理 Tab 键实现文本缩进
 * 描述：按 Tab 键增加缩进，按 Shift+Tab 减少缩进，支持多行选中缩进
 */

import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

export const TabIndent = Extension.create({
  name: 'tabIndent',

  addKeyboardShortcuts() {
    return {
      // Tab 键：增加缩进
      Tab: ({ editor }) => {
        const { state, view } = editor;
        const { selection, doc } = state;
        const { from, to } = selection;

        // 如果在列表中，使用列表的缩进功能
        if (editor.isActive('listItem') || editor.isActive('taskItem')) {
          return editor.commands.sinkListItem('listItem') || 
                 editor.commands.sinkListItem('taskItem');
        }

        // 检查是否选中了多行
        const $from = doc.resolve(from);
        const $to = doc.resolve(to);
        const startBlock = $from.blockRange($from);
        const endBlock = $to.blockRange($to);

        if (startBlock && endBlock && startBlock.start !== endBlock.start) {
          // 多行选中：为每个块添加缩进
          const tr = state.tr;
          const tabChar = '\t';
          let offset = 0;

          doc.nodesBetween(from, to, (node, pos) => {
            // 只处理顶层块节点
            if (node.isBlock && node.isTextblock) {
              const mappedPos = pos + offset;
              tr.insertText(tabChar, mappedPos + 1);
              offset += tabChar.length;
            }
          });

          if (tr.docChanged) {
            // 保持选区
            const newFrom = from + tabChar.length;
            const newTo = to + offset;
            tr.setSelection(TextSelection.create(tr.doc, newFrom, newTo));
            view.dispatch(tr);
            return true;
          }
        }

        // 单行或光标：插入制表符
        return editor.commands.insertContent('\t');
      },

      // Shift+Tab：减少缩进
      'Shift-Tab': ({ editor }) => {
        const { state, view } = editor;
        const { selection, doc } = state;
        const { from, to } = selection;

        // 如果在列表中，使用列表的减少缩进功能
        if (editor.isActive('listItem') || editor.isActive('taskItem')) {
          return editor.commands.liftListItem('listItem') || 
                 editor.commands.liftListItem('taskItem');
        }

        // 检查是否选中了多行
        const $from = doc.resolve(from);
        const $to = doc.resolve(to);
        const startBlock = $from.blockRange($from);
        const endBlock = $to.blockRange($to);

        const tr = state.tr;
        let offset = 0;
        let modified = false;

        const removeIndent = (pos: number): number => {
          const mappedPos = pos + offset;
          const $pos = tr.doc.resolve(mappedPos + 1);
          const textStart = $pos.parent.textContent;

          if (textStart.startsWith('\t')) {
            tr.delete(mappedPos + 1, mappedPos + 2);
            offset -= 1;
            return 1;
          } else if (textStart.startsWith('  ')) {
            // 也支持删除 2 个空格作为缩进
            tr.delete(mappedPos + 1, mappedPos + 3);
            offset -= 2;
            return 2;
          }
          return 0;
        };

        if (startBlock && endBlock && startBlock.start !== endBlock.start) {
          // 多行选中：为每个块减少缩进
          doc.nodesBetween(from, to, (node, pos) => {
            if (node.isBlock && node.isTextblock) {
              const removed = removeIndent(pos);
              if (removed > 0) modified = true;
            }
          });
        } else {
          // 单行：尝试删除行首的缩进
          const $pos = doc.resolve(from);
          const blockStart = $pos.start();
          const removed = removeIndent(blockStart - 1);
          if (removed > 0) modified = true;
        }

        if (modified && tr.docChanged) {
          // 调整选区
          const newFrom = Math.max(1, from + offset);
          const newTo = Math.max(newFrom, to + offset);
          tr.setSelection(TextSelection.create(tr.doc, newFrom, newTo));
          view.dispatch(tr);
          return true;
        }

        return false;
      },
    };
  },
});
