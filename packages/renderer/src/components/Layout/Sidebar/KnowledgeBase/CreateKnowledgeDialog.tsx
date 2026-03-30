/**
 * Create knowledge base dialog component.
 * Supports creating and editing knowledge base metadata.
 */

import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AddFileIcon } from './KnowledgeBaseIcons';
import { KnowledgeItem } from './types';

interface CreateKnowledgeDialogProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (data: KnowledgeBaseData) => void;
  editItem?: KnowledgeItem;
  onEdit?: (id: string, data: KnowledgeBaseData) => void;
}

export interface KnowledgeBaseData {
  name: string;
  cover?: File;
  description: string;
  coverBase64?: string;
}

export const CreateKnowledgeDialog: React.FC<CreateKnowledgeDialogProps> = ({
  visible,
  onClose,
  onCreate,
  editItem,
  onEdit,
}) => {
  const { t } = useTranslation();
  const translateText = (key: string, defaultValue: string): string =>
    String(t(key, { defaultValue }));
  const coverInputRef = useRef<HTMLInputElement>(null);
  const isEditMode = Boolean(editItem);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [coverFile, setCoverFile] = useState<File | undefined>();

  useEffect(() => {
    if (editItem) {
      setName(editItem.title || '');
      setDescription(editItem.metadata?.description || '');
      setCoverPreview(editItem.metadata?.cover || '');
      setCoverFile(undefined);
      return;
    }

    setName('');
    setDescription('');
    setCoverPreview('');
    setCoverFile(undefined);
  }, [editItem, visible]);

  if (!visible) {
    return null;
  }

  const handleCoverChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        setCoverPreview(String(loadEvent.target?.result ?? ''));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = () => {
    if (!name.trim()) {
      alert(translateText('knowledgeBase.createDialog.nameRequired', 'Enter the knowledge base name'));
      return;
    }

    const data: KnowledgeBaseData = {
      name: name.trim(),
      cover: coverFile,
      description: description.trim(),
    };

    if (isEditMode && !coverFile && coverPreview) {
      data.coverBase64 = coverPreview;
    }

    if (isEditMode && editItem && onEdit) {
      onEdit(editItem.id, data);
    } else {
      onCreate(data);
    }

    setName('');
    setDescription('');
    setCoverPreview('');
    setCoverFile(undefined);
  };

  const dialogContent = (
    <div className="create-knowledge-dialog-overlay" onClick={onClose}>
      <div
        className="create-knowledge-dialog"
        onClick={(event) => event.stopPropagation()}
        style={{
          backgroundColor: 'var(--ws-editor-background)',
          borderColor: 'var(--ws-contrast-border)',
          color: 'var(--ws-editor-foreground)',
        }}
      >
        <div
          className="create-knowledge-dialog__header"
          style={{ borderColor: 'var(--ws-contrast-border)' }}
        >
          <h3 style={{ color: 'var(--ws-editor-foreground)' }}>
            {isEditMode
              ? translateText('knowledgeBase.createDialog.editTitle', 'Edit Knowledge Base')
              : translateText('knowledgeBase.createDialog.createTitle', 'Create Knowledge Base')}
          </h3>
          <button
            className="create-knowledge-dialog__close"
            onClick={onClose}
            style={{ color: 'var(--ws-editor-foreground)' }}
            title={translateText('knowledgeBase.createDialog.close', 'Close')}
          >
            ×
          </button>
        </div>

        <div className="create-knowledge-dialog__body">
          <div className="create-knowledge-dialog__section">
            <label style={{ color: 'var(--ws-editor-foreground)' }}>
              {translateText('knowledgeBase.createDialog.nameLabel', 'Knowledge Base Name')}*
            </label>
            <input
              type="text"
              className="create-knowledge-dialog__input"
              placeholder={translateText('knowledgeBase.createDialog.namePlaceholder', 'Enter the knowledge base name')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={{
                backgroundColor: 'var(--ws-input-background)',
                color: 'var(--ws-input-foreground)',
                borderColor: 'var(--ws-contrast-border)',
              }}
            />
          </div>

          <div className="create-knowledge-dialog__section">
            <label style={{ color: 'var(--ws-editor-foreground)' }}>
              {translateText('knowledgeBase.createDialog.coverLabel', 'Cover')}
            </label>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverChange}
              style={{ display: 'none' }}
            />
            <div
              className="create-knowledge-dialog__cover-upload"
              onClick={() => coverInputRef.current?.click()}
              style={{
                backgroundColor: 'var(--ws-input-background)',
                borderColor: 'var(--ws-contrast-border)',
              }}
            >
              {coverPreview ? (
                <img
                  src={coverPreview}
                  alt={translateText('knowledgeBase.createDialog.coverPreviewAlt', 'Cover Preview')}
                  className="cover-preview"
                />
              ) : (
                <div
                  className="cover-placeholder"
                  style={{ color: 'var(--descriptionForeground)' }}
                >
                  <AddFileIcon className="icon-add" />
                  <span>{translateText('knowledgeBase.createDialog.uploadCover', 'Click to upload a cover image')}</span>
                </div>
              )}
            </div>
          </div>

          <div className="create-knowledge-dialog__section">
            <label style={{ color: 'var(--ws-editor-foreground)' }}>
              {translateText('knowledgeBase.createDialog.descriptionLabel', 'Description')}
            </label>
            <textarea
              className="create-knowledge-dialog__textarea"
              placeholder={translateText('knowledgeBase.createDialog.descriptionPlaceholder', 'Enter the knowledge base description')}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              style={{
                backgroundColor: 'var(--ws-input-background)',
                color: 'var(--ws-input-foreground)',
                borderColor: 'var(--ws-contrast-border)',
                resize: 'none',
              }}
            />
          </div>
        </div>

        <div
          className="create-knowledge-dialog__footer"
          style={{ borderColor: 'var(--ws-contrast-border)' }}
        >
          <button
            className="create-knowledge-dialog__button create-knowledge-dialog__button--cancel"
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--ws-editor-foreground)',
              borderColor: 'var(--ws-contrast-border)',
            }}
          >
            {translateText('knowledgeBase.createDialog.cancel', 'Cancel')}
          </button>
          <button
            className="create-knowledge-dialog__button create-knowledge-dialog__button--create"
            onClick={handleCreate}
            disabled={!name.trim()}
            style={{
              backgroundColor: 'var(--ws-button-background)',
              color: 'var(--ws-button-foreground)',
              borderColor: 'var(--ws-contrast-border)',
              opacity: !name.trim() ? 0.5 : 1,
            }}
          >
            {isEditMode
              ? translateText('knowledgeBase.createDialog.save', 'Save')
              : translateText('knowledgeBase.createDialog.create', 'Create')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};
