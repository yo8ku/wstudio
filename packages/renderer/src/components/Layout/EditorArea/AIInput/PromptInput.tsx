/**
 * AI 提示输入组件。
 * 基于 CodeMirror 提供轻量输入、文件引用和 @ 菜单交互能力。
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorView, keymap, placeholder as codeMirrorPlaceholder } from '@codemirror/view';

interface FileReferenceItem {
  readonly path: string;
  readonly name: string;
}

interface AtTriggerMatch {
  readonly from: number;
  readonly to: number;
  readonly query: string;
}

const resolveAtTrigger = (text: string, cursor: number): AtTriggerMatch | null => {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const prefixText = text.slice(0, safeCursor);
  const atIndex = prefixText.lastIndexOf('@');
  if (atIndex < 0) {
    return null;
  }

  const charBefore = atIndex > 0 ? prefixText[atIndex - 1] : ' ';
  if (charBefore !== ' ' && charBefore !== '\n' && charBefore !== '\t') {
    return null;
  }

  return {
    from: atIndex,
    to: safeCursor,
    query: prefixText.slice(atIndex + 1),
  };
};

export interface PromptInputRef {
  focus: () => void;
  blur: () => void;
  getText: () => string;
  setText: (text: string) => void;
  clear: () => void;
  insertText: (text: string, replaceAtTrigger?: boolean) => void;
  insertFileReference: (filePath: string, fileName: string) => void;
  removeFileReference: (filePath: string) => void;
  clearAllFileReferences: () => void;
  getFileReferences: () => FileReferenceItem[];
  setAtMenuState: (
    isOpen: boolean,
    onNavigate?: (direction: 'up' | 'down') => void,
    onSelect?: () => void,
    onBack?: () => void,
  ) => void;
}

interface PromptInputProps {
  placeholder?: string;
  onSubmit?: (text: string, fileReferences: FileReferenceItem[]) => void;
  onEscape?: () => void;
  onChange?: (text: string) => void;
  onAtTrigger?: (query: string, position: { top: number; left: number }) => void;
  onAtCancel?: () => void;
  onFileReferencesChange?: (fileReferences: FileReferenceItem[]) => void;
  isAtMenuOpen?: boolean;
  onAtMenuNavigate?: (direction: 'up' | 'down') => void;
  onAtMenuSelect?: () => void;
  onAtMenuBack?: () => void;
  className?: string;
}

export const PromptInput = forwardRef<PromptInputRef, PromptInputProps>(({
  placeholder = '向 AI 描述您想做什么...',
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
}, ref) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isAtMenuOpenRef = useRef(Boolean(isAtMenuOpen));
  const onSubmitRef = useRef(onSubmit);
  const onEscapeRef = useRef(onEscape);
  const onChangeRef = useRef(onChange);
  const onAtTriggerRef = useRef(onAtTrigger);
  const onAtCancelRef = useRef(onAtCancel);
  const onFileReferencesChangeRef = useRef(onFileReferencesChange);
  const onAtMenuNavigateRef = useRef(onAtMenuNavigate);
  const onAtMenuSelectRef = useRef(onAtMenuSelect);
  const onAtMenuBackRef = useRef(onAtMenuBack);
  const fileReferencesRef = useRef<FileReferenceItem[]>([]);
  const [fileReferences, setFileReferences] = useState<FileReferenceItem[]>([]);

  useEffect(() => {
    isAtMenuOpenRef.current = Boolean(isAtMenuOpen);
    onSubmitRef.current = onSubmit;
    onEscapeRef.current = onEscape;
    onChangeRef.current = onChange;
    onAtTriggerRef.current = onAtTrigger;
    onAtCancelRef.current = onAtCancel;
    onFileReferencesChangeRef.current = onFileReferencesChange;
    onAtMenuNavigateRef.current = onAtMenuNavigate;
    onAtMenuSelectRef.current = onAtMenuSelect;
    onAtMenuBackRef.current = onAtMenuBack;
  }, [
    isAtMenuOpen,
    onAtCancel,
    onAtMenuBack,
    onAtMenuNavigate,
    onAtMenuSelect,
    onAtTrigger,
    onChange,
    onEscape,
    onFileReferencesChange,
    onSubmit,
  ]);

  const syncFileReferences = useCallback((nextReferences: FileReferenceItem[]): void => {
    fileReferencesRef.current = nextReferences;
    setFileReferences(nextReferences);
    onFileReferencesChangeRef.current?.(nextReferences);
  }, []);

  const getPlainText = useCallback((): string => (
    viewRef.current?.state.doc.toString() ?? ''
  ), []);

  const emitTextState = useCallback((view: EditorView): void => {
    const text = view.state.doc.toString();
    onChangeRef.current?.(text);

    const trigger = resolveAtTrigger(text, view.state.selection.main.head);
    if (!trigger) {
      onAtCancelRef.current?.();
      return;
    }

    const coordinates = view.coordsAtPos(trigger.to);
    if (!coordinates) {
      return;
    }

    onAtTriggerRef.current?.(trigger.query, {
      top: coordinates.bottom,
      left: coordinates.left,
    });
  }, []);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const state = EditorState.create({
      doc: '',
      extensions: [
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.lineWrapping,
        codeMirrorPlaceholder(placeholder),
        EditorView.theme({
          '&': {
            minHeight: '20px',
            width: '100%',
          },
          '.cm-editor': {
            minHeight: '20px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontSize: '13px',
            lineHeight: '1.5',
          },
          '.cm-content': {
            padding: '8px 10px',
            minHeight: '20px',
            caretColor: 'var(--ws-input-foreground)',
          },
          '.cm-placeholder': {
            color: 'var(--ws-input-placeholder-foreground, rgba(128, 128, 128, 0.7))',
          },
          '&.cm-focused': {
            outline: 'none',
          },
          '.cm-line': {
            padding: '0',
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: 'var(--ws-input-foreground)',
          },
          '&.cm-focused .cm-selectionBackground, ::selection': {
            backgroundColor: 'var(--ws-editor-selectionBackground, rgba(38, 79, 120, 0.35))',
          },
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged && !update.selectionSet) {
            return;
          }

          emitTextState(update.view);
        }),
        EditorView.domEventHandlers({
          keydown: (_event, view) => {
            const nativeEvent = _event;
            if (isAtMenuOpenRef.current) {
              if (nativeEvent.key === 'ArrowUp') {
                nativeEvent.preventDefault();
                onAtMenuNavigateRef.current?.('up');
                return true;
              }

              if (nativeEvent.key === 'ArrowDown') {
                nativeEvent.preventDefault();
                onAtMenuNavigateRef.current?.('down');
                return true;
              }

              if (nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) {
                nativeEvent.preventDefault();
                onAtMenuSelectRef.current?.();
                return true;
              }

              if (nativeEvent.key === 'ArrowLeft' && nativeEvent.altKey) {
                nativeEvent.preventDefault();
                onAtMenuBackRef.current?.();
                return true;
              }
            }

            if (nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) {
              nativeEvent.preventDefault();
              onSubmitRef.current?.(view.state.doc.toString(), fileReferencesRef.current);
              return true;
            }

            if (nativeEvent.key === 'Escape') {
              nativeEvent.preventDefault();
              if (isAtMenuOpenRef.current) {
                onAtCancelRef.current?.();
              } else {
                onEscapeRef.current?.();
              }
              return true;
            }

            return false;
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: hostRef.current,
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [emitTextState, placeholder]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      viewRef.current?.focus();
    },
    blur: () => {
      viewRef.current?.contentDOM.blur();
    },
    getText: () => getPlainText(),
    setText: (text: string) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: text,
        },
        selection: {
          anchor: text.length,
        },
      });
    },
    clear: () => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: '',
        },
        selection: {
          anchor: 0,
        },
      });
      syncFileReferences([]);
    },
    insertText: (text: string, replaceAtTrigger: boolean = false) => {
      const view = viewRef.current;
      if (!view || text.length === 0) {
        return;
      }

      const selection = view.state.selection.main;
      const trigger = replaceAtTrigger
        ? resolveAtTrigger(view.state.doc.toString(), selection.head)
        : null;
      const from = trigger?.from ?? selection.from;
      const to = trigger?.to ?? selection.to;
      const nextAnchor = from + text.length;

      view.dispatch({
        changes: {
          from,
          to,
          insert: text,
        },
        selection: {
          anchor: nextAnchor,
        },
      });
      view.focus();
    },
    insertFileReference: (filePath: string, fileName: string) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      if (!fileReferencesRef.current.some((item) => item.path === filePath)) {
        syncFileReferences([
          ...fileReferencesRef.current,
          {
            path: filePath,
            name: fileName,
          },
        ]);
      }

      const selection = view.state.selection.main;
      const trigger = resolveAtTrigger(view.state.doc.toString(), selection.head);
      if (trigger) {
        view.dispatch({
          changes: {
            from: trigger.from,
            to: trigger.to,
            insert: '',
          },
          selection: {
            anchor: trigger.from,
          },
        });
      }

      view.focus();
    },
    removeFileReference: (filePath: string) => {
      syncFileReferences(
        fileReferencesRef.current.filter((item) => item.path !== filePath),
      );
    },
    clearAllFileReferences: () => {
      syncFileReferences([]);
    },
    getFileReferences: () => fileReferencesRef.current,
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
  }), [emitTextState, getPlainText, syncFileReferences]);

  const stopMousePropagation = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
  };

  return (
    <div
      className={`prompt-input-wrapper ${className || ''}`}
      onMouseDown={stopMousePropagation}
      onMouseUp={stopMousePropagation}
      onClick={stopMousePropagation}
    >
      {fileReferences.length > 0 && (
        <div className="prompt-input-file-references">
          {fileReferences.map((item) => (
            <span key={item.path} className="prompt-file-reference">
              @{item.name}
            </span>
          ))}
        </div>
      )}
      <div ref={hostRef} className="prompt-input-editor" />
    </div>
  );
});

PromptInput.displayName = 'PromptInput';

export default PromptInput;
