/**
 * TipTap 富文本输入组件。
 * 用于内联聊天输入，支持 `@` 文件引用和菜单键盘导航。
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';

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
        class: 'tiptap-file-reference',
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
  insertText: (text: string, replaceAtTrigger?: boolean) => void;
  insertFileReference: (filePath: string, fileName: string) => void;
  removeFileReference: (filePath: string) => void;
  clearAllFileReferences: () => void;
  getFileReferences: () => Array<{ path: string; name: string }>;
  setAtMenuState: (
    isOpen: boolean,
    onNavigate?: (direction: 'up' | 'down') => void,
    onSelect?: () => void,
    onBack?: () => void,
  ) => void;
}

interface TipTapInputProps {
  placeholder?: string;
  onSubmit?: (text: string, fileReferences: Array<{ path: string; name: string }>) => void;
  onEscape?: () => void;
  onChange?: (text: string) => void;
  onAtTrigger?: (query: string, position: { top: number; left: number }) => void;
  onAtCancel?: () => void;
  onFileReferencesChange?: (fileReferences: Array<{ path: string; name: string }>) => void;
  isAtMenuOpen?: boolean;
  onAtMenuNavigate?: (direction: 'up' | 'down') => void;
  onAtMenuSelect?: () => void;
  onAtMenuBack?: () => void;
  className?: string;
}

export const TipTapInput = forwardRef<TipTapInputRef, TipTapInputProps>((
  {
    placeholder = '向AI描述您想要做什么...',
    onSubmit,
    onEscape,
    onChange,
    onAtTrigger,
    onAtCancel,
    onFileReferencesChange,
    isAtMenuOpen,
    onAtMenuNavigate,
    onAtMenuSelect,
    onAtMenuBack,
    className,
  },
  ref,
) => {
  const isAtMenuOpenRef = useRef(isAtMenuOpen);
  const onAtMenuNavigateRef = useRef(onAtMenuNavigate);
  const onAtMenuSelectRef = useRef(onAtMenuSelect);
  const onAtMenuBackRef = useRef(onAtMenuBack);

  useEffect(() => {
    isAtMenuOpenRef.current = isAtMenuOpen;
    onAtMenuNavigateRef.current = onAtMenuNavigate;
    onAtMenuSelectRef.current = onAtMenuSelect;
    onAtMenuBackRef.current = onAtMenuBack;
  }, [isAtMenuOpen, onAtMenuBack, onAtMenuNavigate, onAtMenuSelect]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
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
        if (isAtMenuOpenRef.current) {
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            onAtMenuNavigateRef.current?.('up');
            return true;
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            onAtMenuNavigateRef.current?.('down');
            return true;
          }

          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onAtMenuSelectRef.current?.();
            return true;
          }

          if (event.key === 'ArrowLeft' && event.altKey) {
            event.preventDefault();
            onAtMenuBackRef.current?.();
            return true;
          }
        }

        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onSubmit?.(getPlainText(), getFileReferences());
          return true;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          if (isAtMenuOpenRef.current) {
            onAtCancel?.();
          } else {
            onEscape?.();
          }
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getText());
      checkAtTrigger();

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
    onSelectionUpdate: () => {
      checkAtTrigger();
    },
  });

  const getPlainText = useCallback((): string => {
    if (!editor) {
      return '';
    }

    return editor.getText();
  }, [editor]);

  const getFileReferences = useCallback((): Array<{ path: string; name: string }> => {
    if (!editor) {
      return [];
    }

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

  const checkAtTrigger = useCallback((): void => {
    if (!editor || !onAtTrigger) {
      return;
    }

    const { selection } = editor.state;
    const { $from } = selection;
    const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
    const atIndex = textBefore.lastIndexOf('@');

    if (atIndex !== -1) {
      const charBefore = atIndex > 0 ? textBefore[atIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const query = textBefore.slice(atIndex + 1);
        const coords = editor.view.coordsAtPos($from.pos);
        onAtTrigger(query, { top: coords.bottom, left: coords.left });
        return;
      }
    }

    onAtCancel?.();
  }, [editor, onAtCancel, onAtTrigger]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      editor?.commands.focus();
    },
    blur: () => {
      editor?.commands.blur();
    },
    getText: () => getPlainText(),
    setText: (text: string) => {
      editor?.commands.setContent(text);
    },
    clear: () => {
      editor?.commands.clearContent();
    },
    insertText: (text: string, replaceAtTrigger: boolean = false) => {
      if (!editor || !text) {
        return;
      }

      const chain = editor.chain().focus();

      if (replaceAtTrigger) {
        const { selection } = editor.state;
        const { $from } = selection;
        const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
        const atIndex = textBefore.lastIndexOf('@');

        if (atIndex !== -1) {
          const deleteFrom = $from.pos - (textBefore.length - atIndex);
          chain.deleteRange({ from: deleteFrom, to: $from.pos });
        }
      }

      chain.insertContent(text).run();
    },
    insertFileReference: (filePath: string, fileName: string) => {
      if (!editor) {
        return;
      }

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
      if (!editor) {
        return;
      }

      const { doc } = editor.state;
      let posToDelete: { from: number; to: number } | null = null;

      doc.descendants((node, pos) => {
        if (node.type.name === 'fileReference' && node.attrs.filePath === filePath) {
          posToDelete = { from: pos, to: pos + node.nodeSize };
          return false;
        }
        return undefined;
      });

      if (posToDelete) {
        editor.chain().deleteRange(posToDelete).run();
      }
    },
    clearAllFileReferences: () => {
      if (!editor) {
        return;
      }

      const { doc } = editor.state;
      const positionsToDelete: Array<{ from: number; to: number }> = [];

      doc.descendants((node, pos) => {
        if (node.type.name === 'fileReference') {
          positionsToDelete.push({ from: pos, to: pos + node.nodeSize });
        }
      });

      if (positionsToDelete.length > 0) {
        let chain = editor.chain();
        for (let index = positionsToDelete.length - 1; index >= 0; index -= 1) {
          chain = chain.deleteRange(positionsToDelete[index]);
        }
        chain.run();
      }
    },
    getFileReferences: () => getFileReferences(),
    setAtMenuState: (
      isOpen: boolean,
      onNavigate?: (direction: 'up' | 'down') => void,
      onSelect?: () => void,
      onBack?: () => void,
    ) => {
      isAtMenuOpenRef.current = isOpen;
      onAtMenuNavigateRef.current = onNavigate;
      onAtMenuSelectRef.current = onSelect;
      onAtMenuBackRef.current = onBack;
    },
  }), [editor, getFileReferences, getPlainText]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
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
});

TipTapInput.displayName = 'TipTapInput';

export default TipTapInput;
