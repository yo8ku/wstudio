/**
 * TemplatesView.tsx
 * 模板视图组件
 * 功能：显示模板列表，支持选择模板创建笔记、编辑和删除模板
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNoteStore } from '../../../../stores/noteStore';
import { Icon } from '../../../Icons';
import './ViewStyles.scss';

/**
 * 模板项接口
 */
interface TemplateItem {
  id: string;
  name: string;
  content: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export const TemplatesView: React.FC = () => {
  const { createNote, setCurrentNote } = useNoteStore();
  
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContent, setEditContent] = useState('');

  // 加载模板
  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electron?.ipcRenderer.invoke('template:getAll');
      setTemplates(result || []);
    } catch (error) {
      console.error('[TemplatesView] 加载模板失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // 使用模板创建笔记
  const handleUseTemplate = useCallback(async (template: TemplateItem) => {
    try {
      const note = await createNote('normal');
      if (note) {
        // 更新笔记内容为模板内容
        await window.electron?.ipcRenderer.invoke('note:update', note.id, {
          content: template.content,
          title: `从模板创建: ${template.name}`
        });
        // 重新获取更新后的笔记
        const updatedNote = await window.electron?.ipcRenderer.invoke('note:get', note.id);
        if (updatedNote) {
          setCurrentNote(updatedNote);
        }
      }
    } catch (error) {
      console.error('[TemplatesView] 使用模板创建笔记失败:', error);
    }
  }, [createNote, setCurrentNote]);

  // 开始编辑模板
  const handleEditTemplate = useCallback((template: TemplateItem) => {
    setSelectedTemplate(template);
    setEditName(template.name);
    setEditDescription(template.description || '');
    setEditContent(template.content);
    setIsEditing(true);
  }, []);

  // 保存模板
  const handleSaveTemplate = useCallback(async () => {
    if (!editName.trim()) return;

    try {
      if (selectedTemplate) {
        // 更新现有模板
        await window.electron?.ipcRenderer.invoke('template:update', selectedTemplate.id, {
          name: editName,
          description: editDescription,
          content: editContent
        });
      } else {
        // 创建新模板
        await window.electron?.ipcRenderer.invoke('template:create', {
          name: editName,
          description: editDescription,
          content: editContent
        });
      }
      setIsEditing(false);
      setSelectedTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error('[TemplatesView] 保存模板失败:', error);
    }
  }, [selectedTemplate, editName, editDescription, editContent, loadTemplates]);

  // 删除模板
  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    try {
      await window.electron?.ipcRenderer.invoke('template:delete', templateId);
      loadTemplates();
    } catch (error) {
      console.error('[TemplatesView] 删除模板失败:', error);
    }
  }, [loadTemplates]);

  // 创建新模板
  const handleCreateTemplate = useCallback(() => {
    setSelectedTemplate(null);
    setEditName('');
    setEditDescription('');
    setEditContent('# 新模板\n\n');
    setIsEditing(true);
  }, []);

  // 取消编辑
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setSelectedTemplate(null);
  }, []);

  // 加载中
  if (isLoading) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-text">
          加载中...
        </div>
      </div>
    );
  }

  // 编辑模式
  if (isEditing) {
    return (
      <div className="templates-edit-container">
        <div className="edit-header">
          <span className="edit-title">
            {selectedTemplate ? '编辑模板' : '新建模板'}
          </span>
        </div>
        <div className="edit-form">
          <div className="form-group">
            <label>模板名称</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="输入模板名称"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>描述</label>
            <input
              type="text"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="输入模板描述（可选）"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>内容</label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="输入模板内容"
              className="form-textarea"
              rows={10}
            />
          </div>
        </div>
        <div className="edit-actions">
          <div
            className="action-btn cancel"
            onClick={handleCancelEdit}
            role="button"
            tabIndex={0}
          >
            取消
          </div>
          <div
            className="action-btn save"
            onClick={handleSaveTemplate}
            role="button"
            tabIndex={0}
          >
            保存
          </div>
        </div>
      </div>
    );
  }

  // 空状态
  if (templates.length === 0) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-icon">
          <Icon name="templates" size={48} />
        </div>
        <div className="right-sidebar-empty-text">
          暂无模板
        </div>
        <div className="right-sidebar-empty-hint">
          创建模板以快速生成笔记
        </div>
        <div
          className="empty-action"
          onClick={handleCreateTemplate}
          role="button"
          tabIndex={0}
        >
          创建模板
        </div>
      </div>
    );
  }

  return (
    <div className="templates-view-container">
      <div className="templates-header">
        <span className="templates-count">{templates.length} 个模板</span>
        <div
          className="add-template-btn"
          onClick={handleCreateTemplate}
          role="button"
          tabIndex={0}
          title="新建模板"
        >
          <Icon name="plus" size={14} />
        </div>
      </div>
      <div className="templates-list">
        {templates.map(template => (
          <div key={template.id} className="template-item">
            <div className="template-info" onClick={() => handleUseTemplate(template)}>
              <div className="template-icon">
                <Icon name="templates" size={16} />
              </div>
              <div className="template-content">
                <div className="template-name">{template.name}</div>
                {template.description && (
                  <div className="template-description">{template.description}</div>
                )}
              </div>
            </div>
            <div className="template-actions">
              <div
                className="template-action"
                onClick={() => handleEditTemplate(template)}
                title="编辑"
              >
                <Icon name="edit" size={14} />
              </div>
              <div
                className="template-action delete"
                onClick={() => handleDeleteTemplate(template.id)}
                title="删除"
              >
                <Icon name="trash" size={14} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
