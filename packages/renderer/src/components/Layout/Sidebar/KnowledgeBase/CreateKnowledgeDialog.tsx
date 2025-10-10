/**
 * 创建知识库对话框组件
 * 功能：提供创建/编辑知识库的UI和交互
 * 描述：支持输入知识库名称、上传封面、添加描述
 */

import React, { useRef, useState, useEffect } from 'react';
import { AddFileIcon } from './KnowledgeBaseIcons';
import { KnowledgeItem } from './types';

interface CreateKnowledgeDialogProps {
  /** 是否显示对话框 */
  visible: boolean;
  /** 关闭对话框回调 */
  onClose: () => void;
  /** 创建知识库回调 */
  onCreate: (data: KnowledgeBaseData) => void;
  /** 编辑模式：要编辑的知识库项 */
  editItem?: KnowledgeItem;
  /** 编辑回调 */
  onEdit?: (id: string, data: KnowledgeBaseData) => void;
}

export interface KnowledgeBaseData {
  /** 知识库名称 */
  name: string;
  /** 封面图片 */
  cover?: File;
  /** 描述 */
  description: string;
  /** 封面 Base64（编辑时使用） */
  coverBase64?: string;
}

export const CreateKnowledgeDialog: React.FC<CreateKnowledgeDialogProps> = ({
  visible,
  onClose,
  onCreate,
  editItem,
  onEdit,
}) => {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const isEditMode = !!editItem;
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [coverFile, setCoverFile] = useState<File | undefined>();

  // 编辑模式：加载现有数据
  useEffect(() => {
    if (editItem) {
      setName(editItem.title || '');
      setDescription(editItem.metadata?.description || '');
      setCoverPreview(editItem.metadata?.cover || '');
      setCoverFile(undefined);
    } else {
      // 创建模式：重置表单
      setName('');
      setDescription('');
      setCoverPreview('');
      setCoverFile(undefined);
    }
  }, [editItem, visible]);

  if (!visible) return null;

  /**
   * 处理封面上传
   */
  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setCoverPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  /**
   * 处理创建/编辑
   */
  const handleCreate = () => {
    if (!name.trim()) {
      alert('请输入知识库名称');
      return;
    }
    
    const data: KnowledgeBaseData = {
      name: name.trim(),
      cover: coverFile,
      description: description.trim(),
    };

    // 如果是编辑模式且没有上传新封面，保留原封面
    if (isEditMode && !coverFile && coverPreview) {
      data.coverBase64 = coverPreview;
    }
    
    if (isEditMode && editItem && onEdit) {
      onEdit(editItem.id, data);
    } else {
      onCreate(data);
    }
    
    // 重置表单
    setName('');
    setDescription('');
    setCoverPreview('');
    setCoverFile(undefined);
  };

  const handleBrowseCover = () => {
    coverInputRef.current?.click();
  };

  return (
    <div className="create-knowledge-dialog-overlay">
      <div 
        className="create-knowledge-dialog" 
        style={{
          backgroundColor: 'var(--editor-bg)',
          borderColor: 'var(--border-color)',
          color: 'var(--editor-fg)',
        }}
      >
        {/* 对话框标题 */}
        <div 
          className="create-knowledge-dialog__header"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <h3 style={{ color: 'var(--editor-fg)' }}>
            {isEditMode ? '编辑知识库' : '创建知识库'}
          </h3>
          <button
            className="create-knowledge-dialog__close"
            onClick={onClose}
            style={{ color: 'var(--editor-fg)' }}
          >
            ×
          </button>
        </div>

        {/* 对话框内容 */}
        <div className="create-knowledge-dialog__body">
          {/* 知识库名称 */}
          <div className="create-knowledge-dialog__section">
            <label style={{ color: 'var(--editor-fg)' }}>知识库名称 *</label>
            <input
              type="text"
              className="create-knowledge-dialog__input"
              placeholder="请输入知识库名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-fg)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          {/* 封面上传 */}
          <div className="create-knowledge-dialog__section">
            <label style={{ color: 'var(--editor-fg)' }}>封面</label>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverChange}
              style={{ display: 'none' }}
            />
            <div 
              className="create-knowledge-dialog__cover-upload"
              onClick={handleBrowseCover}
              style={{
                backgroundColor: 'var(--input-bg)',
                borderColor: 'var(--border-color)',
              }}
            >
              {coverPreview ? (
                <img src={coverPreview} alt="封面预览" className="cover-preview" />
              ) : (
                <div 
                  className="cover-placeholder"
                  style={{ color: 'var(--descriptionForeground)' }}
                >
                  <AddFileIcon className="icon-add" />
                  <span>点击上传封面</span>
                </div>
              )}
            </div>
          </div>

          {/* 描述 */}
          <div className="create-knowledge-dialog__section">
            <label style={{ color: 'var(--editor-fg)' }}>描述</label>
            <textarea
              className="create-knowledge-dialog__textarea"
              placeholder="请输入知识库描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-fg)',
                borderColor: 'var(--border-color)',
                resize: 'none',
              }}
            />
          </div>
        </div>

        {/* 对话框底部 */}
        <div 
          className="create-knowledge-dialog__footer"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <button
            className="create-knowledge-dialog__button create-knowledge-dialog__button--cancel"
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--editor-fg)',
              borderColor: 'var(--border-color)',
            }}
          >
            取消
          </button>
          <button
            className="create-knowledge-dialog__button create-knowledge-dialog__button--create"
            onClick={handleCreate}
            disabled={!name.trim()}
            style={{
              backgroundColor: 'var(--button-bg)',
              color: 'var(--button-fg)',
              borderColor: 'var(--border-color)',
              opacity: !name.trim() ? 0.5 : 1,
            }}
          >
            {isEditMode ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
};

