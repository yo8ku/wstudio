import React, { useEffect, useRef, useState } from 'react';
import { usePluginSuggestModalStore } from '../../stores/pluginSuggestModalStore';

const PLUGIN_RUNTIME_SUGGEST_MODAL_QUERY_CHANNEL = 'plugin-runtime:suggest-modal-query';
const PLUGIN_RUNTIME_SELECT_SUGGEST_ITEM_CHANNEL = 'plugin-runtime:select-suggest-item';
const PLUGIN_RUNTIME_SUGGEST_MODAL_HIDDEN_CHANNEL = 'plugin-runtime:suggest-modal-hidden';

export const GlobalPluginSuggestModal: React.FC = () => {
  const {
    isOpen,
    modalId,
    title,
    placeholder,
    query,
    emptyStateText,
    instructions,
    items,
    closeModal,
  } = usePluginSuggestModalStore();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedIndex(0);
  }, [isOpen, items, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen]);

  if (!isOpen || modalId === null) {
    return null;
  }

  const requestClose = (): void => {
    closeModal();
    void window.electron?.ipcRenderer.invoke(PLUGIN_RUNTIME_SUGGEST_MODAL_HIDDEN_CHANNEL, {
      modalId,
    });
  };

  const requestQueryChange = (nextQuery: string): void => {
    void window.electron?.ipcRenderer.invoke(PLUGIN_RUNTIME_SUGGEST_MODAL_QUERY_CHANNEL, {
      modalId,
      query: nextQuery,
    });
  };

  const requestSelect = (itemId: string): void => {
    void window.electron?.ipcRenderer.invoke(PLUGIN_RUNTIME_SELECT_SUGGEST_ITEM_CHANNEL, {
      modalId,
      itemId,
    });
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }

    if (items.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((currentIndex) => {
        return (currentIndex + 1) % items.length;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((currentIndex) => {
        return (currentIndex - 1 + items.length) % items.length;
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const activeItem = items[selectedIndex] ?? items[0];

      if (activeItem !== undefined) {
        requestSelect(activeItem.id);
      }
    }
  };

  return (
    <div
      className="plugin-suggest-modal-overlay"
      onClick={requestClose}
    >
      <div
        className="plugin-suggest-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="plugin-suggest-modal__header">
          <div className="plugin-suggest-modal__title">{title}</div>
          <button
            type="button"
            className="plugin-suggest-modal__close"
            onClick={requestClose}
          >
            关闭
          </button>
        </div>

        <input
          ref={inputRef}
          className="plugin-suggest-modal__input"
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            requestQueryChange(event.target.value);
          }}
          onKeyDown={handleInputKeyDown}
        />

        {instructions.length > 0 ? (
          <div className="plugin-suggest-modal__instructions">
            {instructions.map((instruction) => (
              <div
                key={`${instruction.command}-${instruction.purpose}`}
                className="plugin-suggest-modal__instruction"
              >
                <kbd>{instruction.command}</kbd>
                <span>{instruction.purpose}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="plugin-suggest-modal__results">
          {items.length === 0 ? (
            <div className="plugin-suggest-modal__empty">{emptyStateText}</div>
          ) : items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="plugin-suggest-modal__item"
              data-selected={index === selectedIndex ? 'true' : 'false'}
              onMouseEnter={() => {
                setSelectedIndex(index);
              }}
              onClick={() => {
                requestSelect(item.id);
              }}
            >
              <span className="plugin-suggest-modal__item-title">{item.title}</span>
              {item.description !== null ? (
                <span className="plugin-suggest-modal__item-description">{item.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
