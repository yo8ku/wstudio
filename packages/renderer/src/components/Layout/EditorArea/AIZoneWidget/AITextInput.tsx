import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

interface FileReferenceItem {
  path: string;
  name: string;
}

interface AtMenuState {
  isOpen: boolean;
  onNavigate?: (direction: 'up' | 'down') => void;
  onSelect?: () => void;
  onBack?: () => void;
}

interface TextUpdateResult {
  value: string;
  caret: number;
}

export interface AITextInputRef {
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
    onBack?: () => void
  ) => void;
}

interface AITextInputProps {
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

function composeDisplayText(text: string, fileReferences: FileReferenceItem[]): string {
  void fileReferences;
  return text;
}

function findAtTrigger(text: string, caret: number): { from: number; to: number; query: string } | null {
  const textBeforeCaret = text.slice(0, caret);
  const atIndex = textBeforeCaret.lastIndexOf('@');
  if (atIndex === -1) {
    return null;
  }

  const charBefore = atIndex > 0 ? textBeforeCaret[atIndex - 1] : ' ';
  if (charBefore !== ' ' && charBefore !== '\n' && atIndex !== 0) {
    return null;
  }

  return {
    from: atIndex,
    to: caret,
    query: textBeforeCaret.slice(atIndex + 1),
  };
}

function applyTextInsertion(
  currentValue: string,
  selectionStart: number,
  selectionEnd: number,
  insertedText: string,
  replaceAtTrigger: boolean
): TextUpdateResult {
  let from = selectionStart;
  let to = selectionEnd;

  if (replaceAtTrigger) {
    const trigger = findAtTrigger(currentValue, selectionStart);
    if (trigger) {
      from = trigger.from;
      to = selectionEnd;
    }
  }

  const nextValue = `${currentValue.slice(0, from)}${insertedText}${currentValue.slice(to)}`;
  return {
    value: nextValue,
    caret: from + insertedText.length,
  };
}

export const AITextInput = forwardRef<AITextInputRef, AITextInputProps>(
  (
    {
      placeholder = '鍚?AI 鎻忚堪鎮ㄦ兂瑕佸仛浠€涔?..',
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
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [text, setText] = useState('');
    const [fileReferences, setFileReferences] = useState<FileReferenceItem[]>([]);
    const textRef = useRef(text);
    const fileReferencesRef = useRef(fileReferences);
    const atMenuStateRef = useRef<AtMenuState>({
      isOpen: isAtMenuOpen ?? false,
      onNavigate: onAtMenuNavigate,
      onSelect: onAtMenuSelect,
      onBack: onAtMenuBack,
    });
    const pendingCaretRef = useRef<number | null>(null);

    const syncCaret = useCallback(() => {
      const textarea = textareaRef.current;
      const pendingCaret = pendingCaretRef.current;
      if (!textarea || pendingCaret === null) {
        return;
      }

      textarea.focus();
      textarea.setSelectionRange(pendingCaret, pendingCaret);
      pendingCaretRef.current = null;
    }, []);

    useEffect(() => {
      atMenuStateRef.current = {
        isOpen: isAtMenuOpen ?? false,
        onNavigate: onAtMenuNavigate,
        onSelect: onAtMenuSelect,
        onBack: onAtMenuBack,
      };
    }, [isAtMenuOpen, onAtMenuBack, onAtMenuNavigate, onAtMenuSelect]);

    useEffect(() => {
      syncCaret();
    }, [text, syncCaret]);

    const emitChange = useCallback(
      (nextText: string, nextFileReferences: FileReferenceItem[]) => {
        textRef.current = nextText;
        fileReferencesRef.current = nextFileReferences;
        setText(nextText);
        setFileReferences(nextFileReferences);
        onChange?.(composeDisplayText(nextText, nextFileReferences));
        onFileReferencesChange?.(nextFileReferences);
      },
      [onChange, onFileReferencesChange]
    );

    const getAnchorPosition = useCallback((): { top: number; left: number } => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return { top: 0, left: 0 };
      }

      const rect = textarea.getBoundingClientRect();
      return {
        top: rect.bottom,
        left: rect.left + 12,
      };
    }, []);

    const updateAtMenuState = useCallback(
      (currentText: string, caret: number) => {
        const trigger = findAtTrigger(currentText, caret);
        if (!trigger) {
          onAtCancel?.();
          return;
        }

        onAtTrigger?.(trigger.query, getAnchorPosition());
      },
      [getAnchorPosition, onAtCancel, onAtTrigger]
    );

    const updateTextValue = useCallback(
      (nextText: string, nextFileReferences: FileReferenceItem[], caret?: number) => {
        emitChange(nextText, nextFileReferences);
        if (typeof caret === 'number') {
          pendingCaretRef.current = caret;
        }
        updateAtMenuState(nextText, caret ?? nextText.length);
      },
      [emitChange, updateAtMenuState]
    );

    const getTextValue = useCallback(() => {
      return composeDisplayText(textRef.current, fileReferencesRef.current);
    }, []);

    const getFileReferenceValue = useCallback(() => {
      return fileReferencesRef.current;
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          textareaRef.current?.focus();
        },
        blur: () => {
          textareaRef.current?.blur();
        },
        getText: () => {
          return getTextValue();
        },
        setText: (value: string) => {
          updateTextValue(value, [], value.length);
        },
        clear: () => {
          updateTextValue('', [], 0);
        },
        insertText: (value: string, replaceAtTrigger: boolean = false) => {
          const textarea = textareaRef.current;
          const selectionStart = textarea?.selectionStart ?? textRef.current.length;
          const selectionEnd = textarea?.selectionEnd ?? selectionStart;
          const next = applyTextInsertion(
            textRef.current,
            selectionStart,
            selectionEnd,
            value,
            replaceAtTrigger
          );
          updateTextValue(next.value, fileReferencesRef.current, next.caret);
        },
        insertFileReference: (filePath: string, fileName: string) => {
          const textarea = textareaRef.current;
          const selectionStart = textarea?.selectionStart ?? textRef.current.length;
          const selectionEnd = textarea?.selectionEnd ?? selectionStart;
          const next = applyTextInsertion(
            textRef.current,
            selectionStart,
            selectionEnd,
            `@${fileName} `,
            true
          );
          const nextReferences = fileReferencesRef.current.some((item) => item.path === filePath)
            ? fileReferencesRef.current
            : [...fileReferencesRef.current, { path: filePath, name: fileName }];
          updateTextValue(next.value, nextReferences, next.caret);
        },
        removeFileReference: (filePath: string) => {
          const nextReferences = fileReferencesRef.current.filter((item) => item.path !== filePath);
          updateTextValue(textRef.current, nextReferences, textareaRef.current?.selectionStart ?? undefined);
        },
        clearAllFileReferences: () => {
          updateTextValue(textRef.current, [], textareaRef.current?.selectionStart ?? undefined);
        },
        getFileReferences: () => {
          return getFileReferenceValue();
        },
        setAtMenuState: (
          menuOpen: boolean,
          onNavigate?: (direction: 'up' | 'down') => void,
          onSelect?: () => void,
          onBack?: () => void
        ) => {
          atMenuStateRef.current = {
            isOpen: menuOpen,
            onNavigate,
            onSelect,
            onBack,
          };
        },
      }),
      [getFileReferenceValue, getTextValue, updateTextValue]
    );

    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        updateTextValue(event.target.value, fileReferencesRef.current, event.target.selectionStart);
      },
      [updateTextValue]
    );

    const handleSelectionChange = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      updateAtMenuState(textRef.current, textarea.selectionStart);
    }, [updateAtMenuState]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const atMenuState = atMenuStateRef.current;
        if (atMenuState.isOpen) {
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            atMenuState.onNavigate?.('up');
            return;
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            atMenuState.onNavigate?.('down');
            return;
          }

          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            atMenuState.onSelect?.();
            return;
          }

          if (event.key === 'ArrowLeft' && event.altKey) {
            event.preventDefault();
            atMenuState.onBack?.();
            return;
          }
        }

        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onSubmit?.(getTextValue(), getFileReferenceValue());
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          if (atMenuState.isOpen) {
            onAtCancel?.();
            return;
          }

          onEscape?.();
        }
      },
      [getFileReferenceValue, getTextValue, onAtCancel, onEscape, onSubmit]
    );

    const stopPropagation = useCallback((event: React.MouseEvent<HTMLDivElement | HTMLTextAreaElement>) => {
      event.stopPropagation();
    }, []);

    const wrapperClassName = useMemo(() => {
      return `ai-text-input-wrapper ${className || ''}`.trim();
    }, [className]);

    return (
      <div className={wrapperClassName} onMouseDown={stopPropagation} onMouseUp={stopPropagation} onClick={stopPropagation}>
        {fileReferences.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              padding: '0 0 6px',
            }}
          >
            {fileReferences.map((item) => (
              <span key={item.path} className="ai-text-file-reference">
                @{item.name}
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="ai-text-editor"
          placeholder={placeholder}
          value={text}
          rows={1}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onKeyUp={handleSelectionChange}
          onClick={handleSelectionChange}
          onSelect={handleSelectionChange}
          onMouseDown={stopPropagation}
          onMouseUp={stopPropagation}
          style={{
            resize: 'none',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        />
      </div>
    );
  }
);

AITextInput.displayName = 'AITextInput';

export default AITextInput;
