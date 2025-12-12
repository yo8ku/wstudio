/**
 * TipTap 富文本输入组件
 * 用于内联聊天的输入框，支持 @文件引用 的样式化显示
 */

import React, { useImperativeHandle, forwardRef, useCallback, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Node, mergeAttributes } from '@tiptap/core';

// 文件引用节点扩展
const FileReference = Node.create({
  name: 'fileReference',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      filePath: {
        default: null,
      },
      fileName: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-file-reference]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-file-reference': '',
        'class': 'tiptap-file-reference',
        'data-file-path': node.attrs.filePath,
      }),
      `@${node.attrs.fileName}`,
    ];
  },
});

export interface TipTapInputRef {
  focus: () => void;
  blur: () => void;
  getText: () => string;
  setText: (text: string) => void;
  clear: () => void;
  insertFileReference: (filePath: string, fileName: string) => void;
  removeFileReference: (filePath: string) => void;
  getFileReferences: () => Array<{ path: string; name: string }>;
  /** 更新 @ 菜单状态（用于键盘导航） */
  setAtMenuState: (isOpen: boolean, onNavigate?: (direction: 'up' | 'down') => void, onSelect?: () => void) => void;
}

interface TipTapInputProps {
  placeholder?: string;
  onSubmit?: (text: string, fileReferences: Array<{ path: string; name: string }>) => void;
  onEscape?: () => void;
  onChange?: (text: string) => void;
  onAtTrigger?: (query: string, position: { top: number; left: number }) => void;
  onAtCancel?: () => void;
  onFileReferencesChange?: (fileReferences: Array<{ path: string; name: string }>) => void;
  /** @ 菜单是否打开 */
  isAtMenuOpen?: boolean;
  /** 上下键导航回调 */
  onAtMenuNavigate?: (direction: 'up' | 'down') => void;
  /** 回车选择当前高亮项回调 */
  onAtMenuSelect?: () => void;
  className?: string;
}

export const TipTapInput = forwardRef<TipTapInputRef, TipTapInputProps>(
  ({ placeholder = '向AI描述您想要做什么...', onSubmit, onEscape, onChange, onAtTrigger, onAtCancel, onFileReferencesChange, isAtMenuOpen, onAtMenuNavigate, onAtMenuSelect, className }, ref) => {
    // 使用 ref 存储最新的 props 值，避免闭包捕获旧值
    const isAtMenuOpenRef = useRef(isAtMenuOpen);
    const onAtMenuNavigateRef = useRef(onAtMenuNavigate);
    const onAtMenuSelectRef = useRef(onAtMenuSelect);
    
    // 同步更新 ref 值
    useEffect(() => {
      isAtMenuOpenRef.current = isAtMenuOpen;
      onAtMenuNavigateRef.current = onAtMenuNavigate;
      onAtMenuSelectRef.current = onAtMenuSelect;
    }, [isAtMenuOpen, onAtMenuNavigate, onAtMenuSelect]);
    
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          // 禁用不需要的功能
          heading: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        Placeholder.configure({
          placeholder,
          emptyEditorClass: 'tiptap-empty',
        }),
        FileReference,
      ],
      editorProps: {
        attributes: {
          class: 'tiptap-editor',
          spellcheck: 'false',
          autocomplete: 'off',
          autocorrect: 'off',
          autocapitalize: 'off',
        },
        handleKeyDown: (_view, event) => {
          // 如果 @ 菜单打开，处理上下键和回车键
          // 使用 ref 获取最新值，避免闭包捕获旧值
          if (isAtMenuOpenRef.current) {
            // 上键：向上导航
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              if (onAtMenuNavigateRef.current) {
                onAtMenuNavigateRef.current('up');
              }
              return true;
            }
            // 下键：向下导航
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (onAtMenuNavigateRef.current) {
                onAtMenuNavigateRef.current('down');
              }
              return true;
            }
            // 回车键：选择当前高亮项
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (onAtMenuSelectRef.current) {
                onAtMenuSelectRef.current();
              }
              return true;
            }
          }
          // Enter 提交（不按 Shift，且 @ 菜单未打开）
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (onSubmit) {
              const text = getPlainText();
              const fileRefs = getFileReferences();
              onSubmit(text, fileRefs);
            }
            return true;
          }
          // Escape 关闭
          if (event.key === 'Escape') {
            event.preventDefault();
            if (onAtCancel) {
              onAtCancel();
            }
            if (onEscape) {
              onEscape();
            }
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        if (onChange) {
          onChange(editor.getText());
        }
        // 检测 @ 符号
        checkAtTrigger();
        // 通知文件引用变化
        if (onFileReferencesChange) {
          const refs: Array<{ path: string; name: string }> = [];
          editor.state.doc.descendants((node) => {
            if (node.type.name === 'fileReference') {
              refs.push({
                path: node.attrs.filePath,
                name: node.attrs.fileName,
              });
            }
          });
          onFileReferencesChange(refs);
        }
      },
    });

    // 获取纯文本内容
    const getPlainText = useCallback(() => {
      if (!editor) return '';
      return editor.getText();
    }, [editor]);

    // 获取文件引用列表
    const getFileReferences = useCallback(() => {
      if (!editor) return [];
      const refs: Array<{ path: string; name: string }> = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'fileReference') {
          refs.push({
            path: node.attrs.filePath,
            name: node.attrs.fileName,
          });
        }
      });
      return refs;
    }, [editor]);

    // 检测 @ 触发
    const checkAtTrigger = useCallback(() => {
      if (!editor || !onAtTrigger) return;

      const { selection } = editor.state;
      const { $from } = selection;
      const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
      
      // 查找最后一个 @ 符号
      const atIndex = textBefore.lastIndexOf('@');
      if (atIndex !== -1) {
        const charBefore = atIndex > 0 ? textBefore[atIndex - 1] : ' ';
        // @ 前面是空格或行首
        if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
          const query = textBefore.slice(atIndex + 1);
          // 获取光标位置
          const coords = editor.view.coordsAtPos($from.pos);
          onAtTrigger(query, { top: coords.bottom, left: coords.left });
          return;
        }
      }
      
      // 没有触发 @，取消菜单
      if (onAtCancel) {
        onAtCancel();
      }
    }, [editor, onAtTrigger, onAtCancel]);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      focus: () => {
        editor?.commands.focus();
      },
      blur: () => {
        editor?.commands.blur();
      },
      getText: () => {
        return getPlainText();
      },
      setText: (text: string) => {
        editor?.commands.setContent(text);
      },
      clear: () => {
        editor?.commands.clearContent();
      },
      insertFileReference: (filePath: string, fileName: string) => {
        if (!editor) return;
        
        // 删除 @ 及其后面的查询文本
        const { selection } = editor.state;
        const { $from } = selection;
        const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
        const atIndex = textBefore.lastIndexOf('@');
        
        if (atIndex !== -1) {
          const deleteFrom = $from.pos - (textBefore.length - atIndex);
          editor.chain()
            .focus()
            .deleteRange({ from: deleteFrom, to: $from.pos })
            .insertContent({
              type: 'fileReference',
              attrs: { filePath, fileName },
            })
            .insertContent(' ')
            .run();
        } else {
          // 如果没找到 @，直接插入
          editor.chain()
            .focus()
            .insertContent({
              type: 'fileReference',
              attrs: { filePath, fileName },
            })
            .insertContent(' ')
            .run();
        }
      },
      removeFileReference: (filePath: string) => {
        if (!editor) return;
        
        // 遍历文档找到并删除指定路径的文件引用节点
        const { doc } = editor.state;
        let posToDelete: { from: number; to: number } | null = null;
        
        doc.descendants((node, pos) => {
          if (node.type.name === 'fileReference' && node.attrs.filePath === filePath) {
            posToDelete = { from: pos, to: pos + node.nodeSize };
            return false; // 停止遍历
          }
        });
        
        if (posToDelete) {
          editor.chain()
            .deleteRange(posToDelete)
            .run();
        }
      },
      getFileReferences: () => {
        return getFileReferences();
      },
      setAtMenuState: (isOpen: boolean, onNavigate?: (direction: 'up' | 'down') => void, onSelect?: () => void) => {
        // 直接更新 ref 值，无需重新渲染组件
        isAtMenuOpenRef.current = isOpen;
        onAtMenuNavigateRef.current = onNavigate;
        onAtMenuSelectRef.current = onSelect;
      },
    }), [editor, getPlainText, getFileReferences]);

    // 阻止事件冒泡到 Monaco Editor，但不阻止默认行为（允许文本选择）
    const handleMouseDown = (e: React.MouseEvent) => {
      // 只阻止冒泡，不阻止默认行为，这样文本选择仍然可以工作
      e.stopPropagation();
    };

    const handleMouseUp = (e: React.MouseEvent) => {
      e.stopPropagation();
    };

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
    };

    return (
      <div 
        className={`tiptap-input-wrapper ${className || ''}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
      >
        <EditorContent editor={editor} />
      </div>
    );
  }
);

TipTapInput.displayName = 'TipTapInput';

export default TipTapInput;
