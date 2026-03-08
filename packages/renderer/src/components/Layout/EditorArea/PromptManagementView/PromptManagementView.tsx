/**
 * 提示词管理视图
 * 功能：在标签页中管理 AI 提示词模板，支持卡片/列表显示和增删改名。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../Icons/Icon';
import { toastService } from '../../../../services/ToastService';
import {
  type PromptTemplate,
  type PromptTemplatesUpdatedDetail,
  getPromptTemplates,
  savePromptTemplates,
  createPromptTemplateId,
  PROMPT_TEMPLATES_UPDATED_EVENT,
  arePromptTemplatesEqual,
} from '../../../../services/PromptTemplateService';
import './PromptManagementView.scss';

type PromptViewMode = 'card' | 'list';
type PromptEditorMode = 'create' | 'edit' | 'rename' | null;

const PROMPT_TEMPLATE_UPDATED_SOURCE = 'prompt-management-view';
const TEXTAREA_SCROLLBAR_HIT_WIDTH = 14;

const normalizeComparableText = (value: string): string => value.trim().toLowerCase();

const formatTime = (timestamp: number): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '-';
  try {
    return new Date(timestamp).toLocaleString();
  } catch (error) {
    return '-';
  }
};

const buildPreviewText = (value: string): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 140) return normalized;
  return `${normalized.slice(0, 140)}...`;
};

const updateTextareaCursorForScrollbar = (
  textarea: HTMLTextAreaElement,
  clientX: number,
): void => {
  const rect = textarea.getBoundingClientRect();
  const hasVerticalScrollbar = textarea.scrollHeight > textarea.clientHeight;
  if (!hasVerticalScrollbar) {
    textarea.style.cursor = 'text';
    return;
  }

  const isInScrollbarZone = clientX >= rect.right - TEXTAREA_SCROLLBAR_HIT_WIDTH;
  textarea.style.cursor = isInScrollbarZone ? 'default' : 'text';
};

export const PromptManagementView: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [viewMode, setViewMode] = useState<PromptViewMode>('card');
  const [searchKeyword, setSearchKeyword] = useState('');

  const [editorMode, setEditorMode] = useState<PromptEditorMode>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftContent, setDraftContent] = useState('');

  const resetEditor = useCallback(() => {
    setEditorMode(null);
    setEditingTemplateId(null);
    setDraftName('');
    setDraftDescription('');
    setDraftContent('');
  }, []);

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadedTemplates = await getPromptTemplates();
      setTemplates(loadedTemplates);
    } catch (error) {
      console.error('[PromptManagementView] 加载提示词失败:', error);
      toastService.error('加载提示词失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    const handlePromptTemplatesUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<PromptTemplatesUpdatedDetail>;
      if (customEvent.detail?.source === PROMPT_TEMPLATE_UPDATED_SOURCE) {
        return;
      }

      try {
        const latestTemplates = await getPromptTemplates();
        setTemplates(prev =>
          arePromptTemplatesEqual(prev, latestTemplates) ? prev : latestTemplates,
        );
      } catch (error) {
        console.error('[PromptManagementView] 同步提示词失败:', error);
      }
    };

    window.addEventListener(PROMPT_TEMPLATES_UPDATED_EVENT, handlePromptTemplatesUpdated as EventListener);
    return () => {
      window.removeEventListener(PROMPT_TEMPLATES_UPDATED_EVENT, handlePromptTemplatesUpdated as EventListener);
    };
  }, []);

  const persistTemplates = useCallback(async (nextTemplates: PromptTemplate[]): Promise<boolean> => {
    const success = await savePromptTemplates(nextTemplates, PROMPT_TEMPLATE_UPDATED_SOURCE);
    if (!success) {
      toastService.error('保存提示词失败');
      return false;
    }
    setTemplates(nextTemplates);
    return true;
  }, []);

  const openCreateEditor = useCallback(() => {
    setEditorMode('create');
    setEditingTemplateId(null);
    setDraftName('');
    setDraftDescription('');
    setDraftContent('');
  }, []);

  const openEditEditor = useCallback((template: PromptTemplate, mode: 'edit' | 'rename') => {
    setEditorMode(mode);
    setEditingTemplateId(template.id);
    setDraftName(template.name);
    setDraftDescription(template.description);
    setDraftContent(template.content);
  }, []);

  const handleEditorSubmit = useCallback(async () => {
    if (!editorMode) return;

    const name = draftName.trim();
    if (!name) {
      toastService.warning('请输入提示词名称');
      return;
    }

    if (editorMode !== 'rename') {
      const content = draftContent.trim();
      if (!content) {
        toastService.warning('请输入提示词内容');
        return;
      }
    }

    const duplicateName = templates.find(template =>
      normalizeComparableText(template.name) === normalizeComparableText(name)
      && template.id !== editingTemplateId,
    );
    if (duplicateName) {
      toastService.warning('提示词名称已存在，请使用其他名称');
      return;
    }

    if (editorMode === 'create') {
      const now = Date.now();
      const newTemplate: PromptTemplate = {
        id: createPromptTemplateId(name),
        name,
        description: draftDescription.trim(),
        content: draftContent.trim(),
        createdAt: now,
        updatedAt: now,
      };
      const success = await persistTemplates([...templates, newTemplate]);
      if (!success) return;
      toastService.success('已创建提示词');
      resetEditor();
      return;
    }

    if (!editingTemplateId) return;

    const targetTemplate = templates.find(template => template.id === editingTemplateId);
    if (!targetTemplate) {
      toastService.error('目标提示词不存在');
      resetEditor();
      return;
    }

    const now = Date.now();
    const nextTemplates = templates.map(template => {
      if (template.id !== editingTemplateId) return template;

      if (editorMode === 'rename') {
        return {
          ...template,
          name,
          updatedAt: now,
        };
      }

      return {
        ...template,
        name,
        description: draftDescription.trim(),
        content: draftContent.trim(),
        updatedAt: now,
      };
    });

    const success = await persistTemplates(nextTemplates);
    if (!success) return;

    toastService.success(editorMode === 'rename' ? '已重命名提示词' : '已更新提示词');
    resetEditor();
  }, [
    draftContent,
    draftDescription,
    draftName,
    editorMode,
    editingTemplateId,
    persistTemplates,
    resetEditor,
    templates,
  ]);

  const handleDeleteTemplate = useCallback(async (template: PromptTemplate) => {
    const confirmed = window.confirm(`确定删除提示词“${template.name}”吗？`);
    if (!confirmed) return;

    const nextTemplates = templates.filter(item => item.id !== template.id);
    const success = await persistTemplates(nextTemplates);
    if (!success) return;

    if (editingTemplateId === template.id) {
      resetEditor();
    }
    toastService.success('已删除提示词');
  }, [editingTemplateId, persistTemplates, resetEditor, templates]);

  const handleActionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, action: () => void) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        action();
      }
    },
    [],
  );

  const filteredTemplates = useMemo(() => {
    const keyword = normalizeComparableText(searchKeyword);
    if (!keyword) return templates;

    return templates.filter(template =>
      normalizeComparableText(template.name).includes(keyword)
      || normalizeComparableText(template.description).includes(keyword)
      || normalizeComparableText(template.content).includes(keyword),
    );
  }, [searchKeyword, templates]);

  const editingTitle = editorMode === 'create'
    ? '新建提示词'
    : editorMode === 'rename'
      ? '重命名提示词'
      : '编辑提示词';

  return (
    <div className="prompt-management-view">
      <div className="prompt-management-view__header">
        <div className="prompt-management-view__title">提示词管理</div>
        <div className="prompt-management-view__meta">
          可用 {filteredTemplates.length}/{templates.length}
        </div>
      </div>

      <div className="prompt-management-view__toolbar">
        <div
          role="button"
          tabIndex={0}
          className="prompt-management-view__action"
          onClick={openCreateEditor}
          onKeyDown={event => handleActionKeyDown(event, openCreateEditor)}
        >
          <Icon name="plus" size={14} />
          <span>新建提示词</span>
        </div>

        <div className="prompt-management-view__view-switch">
          <div
            role="button"
            tabIndex={0}
            title="卡片视图"
            aria-label="卡片视图"
            className={`prompt-management-view__view-switch-item${viewMode === 'card' ? ' is-active' : ''}`}
            onClick={() => setViewMode('card')}
            onKeyDown={event => handleActionKeyDown(event, () => setViewMode('card'))}
          >
            <Icon iconSet="ui" name="card-view" size={14} />
          </div>
          <div
            role="button"
            tabIndex={0}
            title="列表视图"
            aria-label="列表视图"
            className={`prompt-management-view__view-switch-item${viewMode === 'list' ? ' is-active' : ''}`}
            onClick={() => setViewMode('list')}
            onKeyDown={event => handleActionKeyDown(event, () => setViewMode('list'))}
          >
            <Icon iconSet="ui" name="list-icon" size={14} />
          </div>
        </div>

        <div className="prompt-management-view__search">
          <Icon name="search" size={14} />
          <input
            className="prompt-management-view__search-input"
            placeholder="搜索提示词"
            value={searchKeyword}
            onChange={event => setSearchKeyword(event.target.value)}
          />
        </div>
      </div>

      {editorMode && (
        <div className="prompt-management-view__editor">
          <div className="prompt-management-view__editor-title">{editingTitle}</div>
          <div className="prompt-management-view__editor-fields">
            <input
              className="prompt-management-view__input"
              placeholder="提示词名称"
              value={draftName}
              onChange={event => setDraftName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && editorMode === 'rename') {
                  event.preventDefault();
                  void handleEditorSubmit();
                }
              }}
            />
            {editorMode !== 'rename' && (
              <>
                <input
                  className="prompt-management-view__input"
                  placeholder="描述（可选）"
                  value={draftDescription}
                  onChange={event => setDraftDescription(event.target.value)}
                />
                <textarea
                  className="prompt-management-view__textarea"
                  placeholder="提示词内容"
                  value={draftContent}
                  onChange={event => setDraftContent(event.target.value)}
                  onMouseMove={event => {
                    updateTextareaCursorForScrollbar(event.currentTarget, event.clientX);
                  }}
                  onMouseDown={event => {
                    updateTextareaCursorForScrollbar(event.currentTarget, event.clientX);
                  }}
                  onMouseLeave={event => {
                    event.currentTarget.style.cursor = 'text';
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      void handleEditorSubmit();
                    }
                  }}
                />
              </>
            )}
          </div>
          <div className="prompt-management-view__editor-actions">
            <div
              role="button"
              tabIndex={0}
              className="prompt-management-view__action"
              onClick={() => void handleEditorSubmit()}
              onKeyDown={event => handleActionKeyDown(event, () => void handleEditorSubmit())}
            >
              <Icon name="check" size={14} />
              <span>保存</span>
            </div>
            <div
              role="button"
              tabIndex={0}
              className="prompt-management-view__action is-secondary"
              onClick={resetEditor}
              onKeyDown={event => handleActionKeyDown(event, resetEditor)}
            >
              <Icon name="close" size={14} />
              <span>取消</span>
            </div>
          </div>
        </div>
      )}

      <div className="prompt-management-view__content">
        {isLoading ? (
          <div className="prompt-management-view__empty">
            <span>加载中...</span>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="prompt-management-view__empty">
            <span>{templates.length === 0 ? '暂无提示词，请先新建。' : '未搜索到匹配的提示词。'}</span>
          </div>
        ) : (
          <div className={`prompt-management-view__items is-${viewMode}`}>
            {filteredTemplates.map(template => (
              <div
                key={template.id}
                className={`prompt-management-view__item is-${viewMode}`}
              >
                <div className="prompt-management-view__item-header">
                  <div className="prompt-management-view__item-name" title={template.name}>
                    {template.name}
                  </div>
                  <div className="prompt-management-view__item-actions">
                    <div
                      role="button"
                      tabIndex={0}
                      className="prompt-management-view__item-action"
                      onClick={() => openEditEditor(template, 'rename')}
                      onKeyDown={event => handleActionKeyDown(event, () => openEditEditor(template, 'rename'))}
                    >
                      重命名
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      className="prompt-management-view__item-action"
                      onClick={() => openEditEditor(template, 'edit')}
                      onKeyDown={event => handleActionKeyDown(event, () => openEditEditor(template, 'edit'))}
                    >
                      编辑
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      className="prompt-management-view__item-action is-danger"
                      onClick={() => void handleDeleteTemplate(template)}
                      onKeyDown={event => handleActionKeyDown(event, () => void handleDeleteTemplate(template))}
                    >
                      删除
                    </div>
                  </div>
                </div>

                {template.description && (
                  <div className="prompt-management-view__item-description" title={template.description}>
                    {template.description}
                  </div>
                )}

                <div className="prompt-management-view__item-content" title={template.content}>
                  {buildPreviewText(template.content)}
                </div>

                <div className="prompt-management-view__item-meta">
                  更新时间：{formatTime(template.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptManagementView;
