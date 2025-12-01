/**
 * 选择知识库对话框组件
 * 功能：提供选择知识库的UI和交互
 * 描述：用于上传文件时选择目标知识库
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { KnowledgeItem } from './types';
import { knowledgeBaseService } from './knowledgeBaseService';
import './SelectKnowledgeBaseDialog.scss';

interface SelectKnowledgeBaseDialogProps {
  /** 是否显示对话框 */
  visible: boolean;
  /** 关闭对话框回调 */
  onClose: () => void;
  /** 选择知识库回调 */
  onSelect: (knowledgeBaseId: string) => void;
}

export const SelectKnowledgeBaseDialog: React.FC<SelectKnowledgeBaseDialogProps> = ({
  visible,
  onClose,
  onSelect,
}) => {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');

  // 加载知识库列表
  useEffect(() => {
    if (visible) {
      loadKnowledgeBases();
    }
  }, [visible]);

  const loadKnowledgeBases = async () => {
    const data = await knowledgeBaseService.loadFromStorage();
    // 只显示文件夹类型的知识库（type === 'folder'）
    const folders = data.created.filter(item => item.type === 'folder');
    setKnowledgeBases(folders);
    
    // 如果只有一个知识库，默认选中
    if (folders.length === 1) {
      setSelectedId(folders[0].id);
    }
  };

  const handleConfirm = () => {
    if (selectedId) {
      onSelect(selectedId);
      onClose();
    }
  };

  const handleCancel = () => {
    onClose();
  };

  if (!visible) {
    return null;
  }

  const dialogContent = (
    <div className="select-knowledge-base-dialog-overlay" onClick={handleCancel}>
      <div 
        className="select-knowledge-base-dialog" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="select-knowledge-base-dialog__header">
          <h3 className="select-knowledge-base-dialog__title">选择知识库</h3>
          <button
            className="select-knowledge-base-dialog__close"
            onClick={handleCancel}
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
              <p>暂无知识库，请先创建知识库</p>
            </div>
          ) : (
            <div className="select-knowledge-base-dialog__list">
              {knowledgeBases.map((kb) => (
                <div
                  key={kb.id}
                  className={`select-knowledge-base-dialog__item ${
                    selectedId === kb.id ? 'select-knowledge-base-dialog__item--selected' : ''
                  }`}
                  onClick={() => setSelectedId(kb.id)}
                  style={{
                    padding: '12px 16px',
                    marginBottom: '8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: `1px solid ${
                      selectedId === kb.id 
                        ? 'var(--ws-primary)' 
                        : 'var(--ws-contrast-border)'
                    }`,
                    backgroundColor: selectedId === kb.id 
                      ? 'var(--ws-primary-background)' 
                      : 'transparent',
                  }}
                >
                  <div className="select-knowledge-base-dialog__item-title">
                    {kb.title}
                  </div>
                  {kb.metadata?.description && (
                    <div 
                      className="select-knowledge-base-dialog__item-description" >
                      {kb.metadata.description}
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
            onClick={handleCancel}
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
            取消
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
            确定
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};

