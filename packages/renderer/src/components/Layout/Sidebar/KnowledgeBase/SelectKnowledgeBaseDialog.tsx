/**
 * Select knowledge base dialog component.
 * Used when the user needs to choose a target knowledge base before uploading files.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { KnowledgeItem } from './types';
import { knowledgeBaseService } from './knowledgeBaseService';
import './SelectKnowledgeBaseDialog.scss';

interface SelectKnowledgeBaseDialogProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (knowledgeBaseId: string) => void;
}

export const SelectKnowledgeBaseDialog: React.FC<SelectKnowledgeBaseDialogProps> = ({
  visible,
  onClose,
  onSelect,
}) => {
  const { t } = useTranslation();
  const translateText = (key: string, defaultValue: string): string =>
    String(t(key, { defaultValue }));
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    if (!visible) {
      return;
    }

    const loadKnowledgeBases = async () => {
      const data = await knowledgeBaseService.loadFromStorage();
      const folders = data.created.filter((item) => item.type === 'folder');
      setKnowledgeBases(folders);

      if (folders.length === 1) {
        setSelectedId(folders[0].id);
      }
    };

    loadKnowledgeBases();
  }, [visible]);

  if (!visible) {
    return null;
  }

  const handleConfirm = () => {
    if (selectedId) {
      onSelect(selectedId);
      onClose();
    }
  };

  const dialogContent = (
    <div className="select-knowledge-base-dialog-overlay" onClick={onClose}>
      <div
        className="select-knowledge-base-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="select-knowledge-base-dialog__header">
          <h3 className="select-knowledge-base-dialog__title">
            {translateText('knowledgeBase.selectDialog.title', 'Select Knowledge Base')}
          </h3>
          <button
            className="select-knowledge-base-dialog__close"
            onClick={onClose}
            title={translateText('knowledgeBase.selectDialog.close', 'Close')}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--ws-foreground)',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

        <div className="select-knowledge-base-dialog__content">
          {knowledgeBases.length === 0 ? (
            <div className="select-knowledge-base-dialog__empty">
              <p>{translateText('knowledgeBase.selectDialog.empty', 'No knowledge bases yet. Create one first.')}</p>
            </div>
          ) : (
            <div className="select-knowledge-base-dialog__list">
              {knowledgeBases.map((knowledgeBase) => (
                <div
                  key={knowledgeBase.id}
                  className={`select-knowledge-base-dialog__item ${
                    selectedId === knowledgeBase.id ? 'select-knowledge-base-dialog__item--selected' : ''
                  }`}
                  onClick={() => setSelectedId(knowledgeBase.id)}
                  style={{
                    padding: '12px 16px',
                    marginBottom: '8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: `1px solid ${
                      selectedId === knowledgeBase.id
                        ? 'var(--ws-primary)'
                        : 'var(--ws-contrast-border)'
                    }`,
                    backgroundColor: selectedId === knowledgeBase.id
                      ? 'var(--ws-primary-background)'
                      : 'transparent',
                  }}
                >
                  <div className="select-knowledge-base-dialog__item-title">
                    {knowledgeBase.title}
                  </div>
                  {knowledgeBase.metadata?.description && (
                    <div className="select-knowledge-base-dialog__item-description">
                      {knowledgeBase.metadata.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="select-knowledge-base-dialog__footer">
          <button
            className="select-knowledge-base-dialog__button select-knowledge-base-dialog__button--cancel"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              marginRight: '8px',
              borderRadius: '4px',
              border: '1px solid var(--ws-contrast-border)',
              backgroundColor: 'var(--ws-button-background)',
              color: 'var(--ws-button-foreground)',
              cursor: 'pointer',
            }}
          >
            {translateText('knowledgeBase.selectDialog.cancel', 'Cancel')}
          </button>
          <button
            className="select-knowledge-base-dialog__button select-knowledge-base-dialog__button--confirm"
            onClick={handleConfirm}
            disabled={!selectedId || knowledgeBases.length === 0}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: selectedId && knowledgeBases.length > 0
                ? 'var(--ws-primary)'
                : 'var(--ws-disabled-background)',
              color: selectedId && knowledgeBases.length > 0
                ? 'var(--ws-primary-foreground)'
                : 'var(--ws-disabled-foreground)',
              cursor: selectedId && knowledgeBases.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            {translateText('knowledgeBase.selectDialog.confirm', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};
