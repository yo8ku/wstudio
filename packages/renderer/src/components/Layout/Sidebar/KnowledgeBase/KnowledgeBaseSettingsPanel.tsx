/**
 * 知识库设置面板组件
 * 功能：提供知识库的分块参数、自定义分块符、嵌入模型等设置
 * 描述：用于配置知识库的处理参数
 */

import React, { useState, useEffect } from 'react';
import { KnowledgeItem } from './types';
import { Input } from '../../../ui/input';
import { Select, SelectItem } from '../../../common/Select';

interface KnowledgeBaseSettingsPanelProps {
  /** 是否显示面板 */
  visible: boolean;
  /** 要设置的知识库项（仅文件夹类型） */
  item: KnowledgeItem | null;
  /** 关闭面板回调 */
  onClose: () => void;
  /** 保存设置回调 */
  onSave: (itemId: string, settings: KnowledgeBaseSettings, hasChanged: boolean) => Promise<void>;
}

export interface KnowledgeBaseSettings {
  /** 分块大小 */
  chunkSize: number;
  /** 分块重叠大小 */
  chunkOverlap: number;
  /** 自定义分块符 */
  separators: string[];
  /** 嵌入模型名称 */
  embeddingModel: string;
}

/**
 * 默认嵌入模型列表
 */
const DEFAULT_EMBEDDING_MODELS: SelectItem[] = [
  { value: 'BAAI/bge-large-zh-v1.5', label: 'BAAI/bge-large-zh-v1.5' },
  { value: 'BAAI/bge-base-zh-v1.5', label: 'BAAI/bge-base-zh-v1.5' },
  { value: 'BAAI/bge-small-zh-v1.5', label: 'BAAI/bge-small-zh-v1.5' },
  { value: 'text-embedding-ada-002', label: 'text-embedding-ada-002' },
  { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
  { value: 'text-embedding-3-large', label: 'text-embedding-3-large' },
];

/**
 * 默认设置值
 */
const DEFAULT_SETTINGS: KnowledgeBaseSettings = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '。', '！', '？', '.', '!', '?'],
  embeddingModel: 'BAAI/bge-large-zh-v1.5',
};

export const KnowledgeBaseSettingsPanel: React.FC<KnowledgeBaseSettingsPanelProps> = ({
  visible,
  item,
  onClose,
  onSave,
}) => {
  const [chunkSize, setChunkSize] = useState<number>(DEFAULT_SETTINGS.chunkSize);
  const [chunkOverlap, setChunkOverlap] = useState<number>(DEFAULT_SETTINGS.chunkOverlap);
  const [separators, setSeparators] = useState<string[]>(DEFAULT_SETTINGS.separators);
  const [separatorInput, setSeparatorInput] = useState<string>('');
  const [embeddingModel, setEmbeddingModel] = useState<string>(DEFAULT_SETTINGS.embeddingModel);
  const [originalSettings, setOriginalSettings] = useState<KnowledgeBaseSettings | null>(null);

  // 加载现有设置
  useEffect(() => {
    if (item && item.type === 'folder') {
      const settings = item.metadata?.chunkSettings;
      const model = item.metadata?.embeddingModel;

      const currentChunkSize = settings?.chunkSize ?? DEFAULT_SETTINGS.chunkSize;
      const currentChunkOverlap = settings?.chunkOverlap ?? DEFAULT_SETTINGS.chunkOverlap;
      const currentSeparators = settings?.separators ?? DEFAULT_SETTINGS.separators;
      const currentEmbeddingModel = model ?? DEFAULT_SETTINGS.embeddingModel;

      setChunkSize(currentChunkSize);
      setChunkOverlap(currentChunkOverlap);
      setSeparators(currentSeparators);
      setEmbeddingModel(currentEmbeddingModel);
      setSeparatorInput('');

      // 保存原始配置用于比较
      setOriginalSettings({
        chunkSize: currentChunkSize,
        chunkOverlap: currentChunkOverlap,
        separators: currentSeparators,
        embeddingModel: currentEmbeddingModel,
      });
    }
  }, [item, visible]);

  if (!visible || !item || item.type !== 'folder') {
    return null;
  }

  /**
   * 添加自定义分块符
   */
  const handleAddSeparator = () => {
    if (separatorInput.trim() && !separators.includes(separatorInput.trim())) {
      setSeparators([...separators, separatorInput.trim()]);
      setSeparatorInput('');
    }
  };

  /**
   * 删除自定义分块符
   */
  const handleRemoveSeparator = (index: number) => {
    setSeparators(separators.filter((_, i) => i !== index));
  };

  /**
   * 比较两个配置是否相同
   */
  const compareSettings = (
    oldSettings: KnowledgeBaseSettings | null,
    newSettings: KnowledgeBaseSettings
  ): boolean => {
    if (!oldSettings) return false;

    // 比较基本配置
    if (
      oldSettings.chunkSize !== newSettings.chunkSize ||
      oldSettings.chunkOverlap !== newSettings.chunkOverlap ||
      oldSettings.embeddingModel !== newSettings.embeddingModel
    ) {
      return true;
    }

    // 比较分块符数组
    if (oldSettings.separators.length !== newSettings.separators.length) {
      return true;
    }

    for (let i = 0; i < oldSettings.separators.length; i++) {
      if (oldSettings.separators[i] !== newSettings.separators[i]) {
        return true;
      }
    }

    return false;
  };

  /**
   * 处理保存
   */
  const handleSave = async () => {
    try {
      const settings: KnowledgeBaseSettings = {
        chunkSize,
        chunkOverlap,
        separators,
        embeddingModel,
      };

      // 检查配置是否发生变化
      const hasChanged = compareSettings(originalSettings, settings);
      
      await onSave(item.id, settings, hasChanged);
      
      // 更新原始配置为当前配置
      setOriginalSettings(settings);
      // 关闭面板
      onClose();
    } catch (error) {
      // 保存失败时不关闭面板，错误提示已在 onSave 中处理
      console.error('保存设置失败:', error);
    }
  };

  /**
   * 重置为默认设置
   */
  const handleReset = () => {
    setChunkSize(DEFAULT_SETTINGS.chunkSize);
    setChunkOverlap(DEFAULT_SETTINGS.chunkOverlap);
    setSeparators(DEFAULT_SETTINGS.separators);
    setEmbeddingModel(DEFAULT_SETTINGS.embeddingModel);
    setSeparatorInput('');
  };

  return (
    <div className="knowledge-base-settings-panel">
      {/* 面板标题 */}
      <div
        className="knowledge-base-settings-panel__header"
        style={{ borderColor: 'var(--ws-contrast-border)' }}
      >
        <h3 style={{ color: 'var(--ws-editor-foreground)' }}>
          知识库设置 - {item.title}
        </h3>
        <button
          className="knowledge-base-settings-panel__close"
          onClick={onClose}
          style={{ color: 'var(--ws-editor-foreground)' }}
        >
          ×
        </button>
      </div>

      {/* 面板内容 */}
      <div className="knowledge-base-settings-panel__body">
        {/* 分块大小 */}
        <div className="knowledge-base-settings-panel__section">
          <div className="knowledge-base-settings-panel__row">
            <label style={{ color: 'var(--ws-editor-foreground)' }}>
              分块大小
            </label>
            <Input
              type="number"
              min="100"
              max="10000"
              step="100"
              value={chunkSize}
              onChange={(e) => setChunkSize(Number.parseInt(e.target.value) || 1000)}
              style={{
                backgroundColor: 'var(--ws-input-background)',
                color: 'var(--ws-input-foreground)',
                borderColor: 'var(--ws-contrast-border)',
              }}
            />
          </div>
          <div className="setting-hint">（字符数，建议 500-2000）</div>
        </div>

        {/* 分块重叠大小 */}
        <div className="knowledge-base-settings-panel__section">
          <div className="knowledge-base-settings-panel__row">
            <label style={{ color: 'var(--ws-editor-foreground)' }}>
              分块重叠大小
            </label>
            <Input
              type="number"
              min="0"
              max={chunkSize}
              step="50"
              value={chunkOverlap}
              onChange={(e) => setChunkOverlap(Number.parseInt(e.target.value) || 0)}
              style={{
                backgroundColor: 'var(--ws-input-background)',
                color: 'var(--ws-input-foreground)',
                borderColor: 'var(--ws-contrast-border)',
              }}
            />
          </div>
          <div className="setting-hint">（字符数，建议为分块大小的 10-20%）</div>
        </div>

        {/* 自定义分块符 */}
        <div className="knowledge-base-settings-panel__section">
          <div className="knowledge-base-settings-panel__row">
            <label style={{ color: 'var(--ws-editor-foreground)' }}>
              自定义分块符
            </label>
          </div>
          <div className="setting-hint" style={{ marginBottom: '8px' }}>按优先级排序，从上到下</div>
          <div className="separators-input-group">
            <Input
              type="text"
              placeholder="输入分块符（如：\n\n、。、！等）"
              value={separatorInput}
              onChange={(e) => setSeparatorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSeparator();
                }
              }}
              style={{
                backgroundColor: 'var(--ws-input-background)',
                color: 'var(--ws-input-foreground)',
                borderColor: 'var(--ws-contrast-border)',
              }}
            />
            <button
              className="separator-add-button"
              onClick={handleAddSeparator}
              disabled={!separatorInput.trim() || separators.includes(separatorInput.trim())}
              style={{
                backgroundColor: 'var(--ws-button-background)',
                color: 'var(--ws-button-foreground)',
                borderColor: 'var(--ws-contrast-border)',
                opacity: !separatorInput.trim() || separators.includes(separatorInput.trim()) ? 0.5 : 1,
              }}
            >
              添加
            </button>
          </div>
          <div className="separators-list">
            {separators.map((sep, index) => (
              <div key={index} className="separator-item">
                <span className="separator-value" title={sep}>
                  {sep === '\n' ? '\\n' : sep === '\n\n' ? '\\n\\n' : sep === '\t' ? '\\t' : sep}
                </span>
                <button
                  className="separator-remove-button"
                  onClick={() => handleRemoveSeparator(index)}
                  style={{
                    color: 'var(--ws-editor-foreground)',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 嵌入模型选择 */}
        <div className="knowledge-base-settings-panel__section">
          <div className="embedding-model-container">
            <label style={{ color: 'var(--ws-editor-foreground)' }}>
              嵌入模型
            </label>
            <Select
              value={embeddingModel}
              onChange={setEmbeddingModel}
              items={DEFAULT_EMBEDDING_MODELS}
              placeholder="请选择嵌入模型"
              className="embedding-model-select"
              showSearch={true}
            />
          </div>
        </div>

      </div>

      {/* 面板底部 */}
      <div
        className="knowledge-base-settings-panel__footer"
        style={{ borderColor: 'var(--ws-contrast-border)' }}
      >
        <button
          className="knowledge-base-settings-panel__button knowledge-base-settings-panel__button--cancel"
          onClick={handleReset}
          style={{
            backgroundColor: 'transparent',
            color: 'var(--ws-editor-foreground)',
            borderColor: 'var(--ws-contrast-border)',
          }}
        >
          重置默认设置
        </button>
        <button
          className="knowledge-base-settings-panel__button knowledge-base-settings-panel__button--save"
          onClick={handleSave}
          style={{
            backgroundColor: 'var(--ws-button-background)',
            color: 'var(--ws-button-foreground)',
            borderColor: 'var(--ws-contrast-border)',
          }}
        >
          保存
        </button>
      </div>
    </div>
  );
};






