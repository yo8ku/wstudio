/**
 * 知识库设置面板组件
 * 功能：提供知识库的分块参数、自定义分块符、嵌入模型等设置
 * 描述：用于配置知识库的处理参数
 */

import React, { useState, useEffect } from 'react';
import { KnowledgeItem } from './types';
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
  /** 切分策略 */
  strategy: 'recursive' | 'token' | 'markdown' | 'parent-child';
  /** 分块大小 */
  chunkSize: number;
  /** 分块重叠大小 */
  chunkOverlap: number;
  /** 自定义分块符 */
  separators: string[];
  /** 父块大小（仅 parent-child 策略） */
  parentChunkSize?: number;
  /** 父块重叠（仅 parent-child 策略） */
  parentChunkOverlap?: number;
  /** 子块大小（仅 parent-child 策略） */
  childChunkSize?: number;
  /** 子块重叠（仅 parent-child 策略） */
  childChunkOverlap?: number;
  /** 子块分隔符（仅 parent-child 策略） */
  childSeparators?: string[];
}

/**
 * 切分策略选项
 */
const CHUNKING_STRATEGIES: SelectItem[] = [
  { value: 'parent-child', label: '父子索引（推荐）' },
  { value: 'recursive', label: '递归切分' },
  { value: 'markdown', label: '语义切分' },
  { value: 'token', label: 'Token 切分' },
];

/**
 * 默认设置值
 */
const DEFAULT_SETTINGS: KnowledgeBaseSettings = {
  strategy: 'parent-child', // 默认使用父子索引
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '。', '！', '？', '.', '!', '?'],
  parentChunkSize: 300,
  childChunkSize: 100,
  childChunkOverlap: 20,
};

export const KnowledgeBaseSettingsPanel: React.FC<KnowledgeBaseSettingsPanelProps> = ({
  visible,
  item,
  onClose,
  onSave,
}) => {
  const [strategy, setStrategy] = useState<'recursive' | 'token' | 'markdown' | 'parent-child'>(
    DEFAULT_SETTINGS.strategy
  );
  const [chunkSize, setChunkSize] = useState<number>(DEFAULT_SETTINGS.chunkSize);
  const [chunkOverlap, setChunkOverlap] = useState<number>(DEFAULT_SETTINGS.chunkOverlap);
  const [separators, setSeparators] = useState<string[]>(DEFAULT_SETTINGS.separators);
  const [separatorInput, setSeparatorInput] = useState<string>('');
  const [originalSettings, setOriginalSettings] = useState<KnowledgeBaseSettings | null>(null);

  // 加载现有设置
  useEffect(() => {
    if (item && item.type === 'folder') {
      const settings = item.metadata?.chunkSettings;

      const currentStrategy = settings?.strategy ?? DEFAULT_SETTINGS.strategy;
      const currentChunkSize = settings?.chunkSize ?? DEFAULT_SETTINGS.chunkSize;
      const currentChunkOverlap = settings?.chunkOverlap ?? DEFAULT_SETTINGS.chunkOverlap;
      const currentSeparators = settings?.separators ?? DEFAULT_SETTINGS.separators;

      setStrategy(currentStrategy);
      setChunkSize(currentChunkSize);
      setChunkOverlap(currentChunkOverlap);
      setSeparators(currentSeparators);
      setSeparatorInput('');

      // 保存原始配置用于比较
      setOriginalSettings({
        strategy: currentStrategy,
        chunkSize: currentChunkSize,
        chunkOverlap: currentChunkOverlap,
        separators: currentSeparators,
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
      oldSettings.strategy !== newSettings.strategy ||
      oldSettings.chunkSize !== newSettings.chunkSize ||
      oldSettings.chunkOverlap !== newSettings.chunkOverlap
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
        strategy,
        chunkSize,
        chunkOverlap,
        separators,
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
    setStrategy(DEFAULT_SETTINGS.strategy);
    setChunkSize(DEFAULT_SETTINGS.chunkSize);
    setChunkOverlap(DEFAULT_SETTINGS.chunkOverlap);
    setSeparators(DEFAULT_SETTINGS.separators);
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
        {/* 切分策略选择 */}
        <div className="knowledge-base-settings-panel__section">
          <div className="knowledge-base-settings-panel__row">
            <label style={{ color: 'var(--ws-editor-foreground)' }}>
              切分策略
            </label>
            <Select
              value={strategy}
              onChange={(value) => setStrategy(value as typeof strategy)}
              items={CHUNKING_STRATEGIES}
              placeholder="请选择切分策略"
              className="chunking-strategy-select"
            />
          </div>
          <div className="setting-hint">
            {strategy === 'parent-child' && '父子索引：使用 [~S#标签] 和 [~E#标签] 标识符切分父块，自动生成子块用于搜索'}
            {strategy === 'recursive' && '递归切分：使用自定义分隔符递归切分，适合大多数场景'}
            {strategy === 'markdown' && '语义切分：自动识别 Markdown 结构切分'}
            {strategy === 'token' && 'Token 切分：按 Token 数量切分'}
          </div>
        </div>

        {/* 分块配置（非父子索引策略显示） */}
        {strategy !== 'parent-child' && (
          <>
            {/* 分块大小 */}
            <div className="knowledge-base-settings-panel__section">
              <div className="knowledge-base-settings-panel__row">
                <label style={{ color: 'var(--ws-editor-foreground)' }}>
                  分块大小
                </label>
                <input
                  type="number"
                  min={100}
                  max={10000}
                  step={100}
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number.parseInt(e.target.value) || 1000)}
                  className="knowledge-base-settings-panel__input"
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
                <input
                  type="number"
                  min={0}
                  max={chunkSize}
                  step={50}
                  value={chunkOverlap}
                  onChange={(e) => setChunkOverlap(Number.parseInt(e.target.value) || 0)}
                  className="knowledge-base-settings-panel__input"
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
                <input
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
                  className="knowledge-base-settings-panel__input"
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
          </>
        )}
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






