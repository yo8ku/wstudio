/**
 * Knowledge base settings panel component.
 * Configures chunking strategy and separators for the selected knowledge base.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { KnowledgeItem } from './types';
import { Select, SelectItem } from '../../../common/Select';

interface KnowledgeBaseSettingsPanelProps {
  visible: boolean;
  item: KnowledgeItem | null;
  onClose: () => void;
  onSave: (itemId: string, settings: KnowledgeBaseSettings, hasChanged: boolean) => Promise<void>;
}

export interface KnowledgeBaseSettings {
  strategy: 'recursive' | 'token' | 'markdown' | 'parent-child';
  chunkSize: number;
  chunkOverlap: number;
  separators: string[];
  parentChunkSize?: number;
  parentChunkOverlap?: number;
  childChunkSize?: number;
  childChunkOverlap?: number;
  childSeparators?: string[];
}

const DEFAULT_SETTINGS: KnowledgeBaseSettings = {
  strategy: 'parent-child',
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
  const { t } = useTranslation();
  const translateText = (key: string, defaultValue: string): string =>
    String(t(key, { defaultValue }));
  const [strategy, setStrategy] = useState<'recursive' | 'token' | 'markdown' | 'parent-child'>(
    DEFAULT_SETTINGS.strategy,
  );
  const [chunkSize, setChunkSize] = useState<number>(DEFAULT_SETTINGS.chunkSize);
  const [chunkOverlap, setChunkOverlap] = useState<number>(DEFAULT_SETTINGS.chunkOverlap);
  const [separators, setSeparators] = useState<string[]>(DEFAULT_SETTINGS.separators);
  const [separatorInput, setSeparatorInput] = useState<string>('');
  const [originalSettings, setOriginalSettings] = useState<KnowledgeBaseSettings | null>(null);

  useEffect(() => {
    if (!(item && item.type === 'folder')) {
      return;
    }

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
    setOriginalSettings({
      strategy: currentStrategy,
      chunkSize: currentChunkSize,
      chunkOverlap: currentChunkOverlap,
      separators: currentSeparators,
    });
  }, [item, visible]);

  if (!visible || !item || item.type !== 'folder') {
    return null;
  }

  const strategyItems: SelectItem[] = [
    {
      value: 'parent-child',
      label: translateText('knowledgeBase.settingsPanel.strategyOptions.parentChild', 'Parent-Child Index (Recommended)'),
    },
    {
      value: 'recursive',
      label: translateText('knowledgeBase.settingsPanel.strategyOptions.recursive', 'Recursive Chunking'),
    },
    {
      value: 'markdown',
      label: translateText('knowledgeBase.settingsPanel.strategyOptions.markdown', 'Semantic Chunking'),
    },
    {
      value: 'token',
      label: translateText('knowledgeBase.settingsPanel.strategyOptions.token', 'Token Chunking'),
    },
  ];

  const handleAddSeparator = () => {
    const nextValue = separatorInput.trim();
    if (nextValue && !separators.includes(nextValue)) {
      setSeparators([...separators, nextValue]);
      setSeparatorInput('');
    }
  };

  const handleRemoveSeparator = (index: number) => {
    setSeparators(separators.filter((_, currentIndex) => currentIndex !== index));
  };

  const hasSettingsChanged = (
    oldSettings: KnowledgeBaseSettings | null,
    newSettings: KnowledgeBaseSettings,
  ): boolean => {
    if (!oldSettings) {
      return false;
    }

    if (
      oldSettings.strategy !== newSettings.strategy ||
      oldSettings.chunkSize !== newSettings.chunkSize ||
      oldSettings.chunkOverlap !== newSettings.chunkOverlap ||
      oldSettings.separators.length !== newSettings.separators.length
    ) {
      return true;
    }

    return oldSettings.separators.some((separator, index) => separator !== newSettings.separators[index]);
  };

  const handleSave = async () => {
    try {
      const settings: KnowledgeBaseSettings = {
        strategy,
        chunkSize,
        chunkOverlap,
        separators,
      };

      await onSave(item.id, settings, hasSettingsChanged(originalSettings, settings));
      setOriginalSettings(settings);
      onClose();
    } catch (error) {
      console.error('Failed to save knowledge base settings:', error);
    }
  };

  const handleReset = () => {
    setStrategy(DEFAULT_SETTINGS.strategy);
    setChunkSize(DEFAULT_SETTINGS.chunkSize);
    setChunkOverlap(DEFAULT_SETTINGS.chunkOverlap);
    setSeparators(DEFAULT_SETTINGS.separators);
    setSeparatorInput('');
  };

  return (
    <div className="knowledge-base-settings-panel">
      <div
        className="knowledge-base-settings-panel__header"
        style={{ borderColor: 'var(--ws-contrast-border)' }}
      >
        <h3 style={{ color: 'var(--ws-editor-foreground)' }}>
          {String(t('knowledgeBase.settingsPanel.title', {
            defaultValue: 'Knowledge Base Settings - {{title}}',
            title: item.title,
          }))}
        </h3>
        <button
          className="knowledge-base-settings-panel__close"
          onClick={onClose}
          style={{ color: 'var(--ws-editor-foreground)' }}
          title={translateText('knowledgeBase.settingsPanel.close', 'Close')}
        >
          ×
        </button>
      </div>

      <div className="knowledge-base-settings-panel__body">
        <div className="knowledge-base-settings-panel__section">
          <div className="knowledge-base-settings-panel__row">
            <label style={{ color: 'var(--ws-editor-foreground)' }}>
              {translateText('knowledgeBase.settingsPanel.strategyLabel', 'Chunking Strategy')}
            </label>
            <Select
              value={strategy}
              onChange={(value) => setStrategy(value as typeof strategy)}
              items={strategyItems}
              placeholder={translateText('knowledgeBase.settingsPanel.strategyPlaceholder', 'Select a chunking strategy')}
              className="chunking-strategy-select"
            />
          </div>
          <div className="setting-hint">
            {strategy === 'parent-child' && translateText('knowledgeBase.settingsPanel.strategyHints.parentChild', 'Parent-child index: use [~S#] and [~E#] markers to split parent chunks and generate child chunks for search automatically.')}
            {strategy === 'recursive' && translateText('knowledgeBase.settingsPanel.strategyHints.recursive', 'Recursive chunking: recursively split content with custom separators. Suitable for most scenarios.')}
            {strategy === 'markdown' && translateText('knowledgeBase.settingsPanel.strategyHints.markdown', 'Semantic chunking: automatically split content by Markdown structure.')}
            {strategy === 'token' && translateText('knowledgeBase.settingsPanel.strategyHints.token', 'Token chunking: split content by token count.')}
          </div>
        </div>

        {strategy !== 'parent-child' && (
          <>
            <div className="knowledge-base-settings-panel__section">
              <div className="knowledge-base-settings-panel__row">
                <label style={{ color: 'var(--ws-editor-foreground)' }}>
                  {translateText('knowledgeBase.settingsPanel.chunkSizeLabel', 'Chunk Size')}
                </label>
                <input
                  type="number"
                  min={100}
                  max={10000}
                  step={100}
                  value={chunkSize}
                  onChange={(event) => setChunkSize(Number.parseInt(event.target.value, 10) || 1000)}
                  className="knowledge-base-settings-panel__input"
                />
              </div>
              <div className="setting-hint">
                {translateText('knowledgeBase.settingsPanel.chunkSizeHint', '(character count, recommended 500-2000)')}
              </div>
            </div>

            <div className="knowledge-base-settings-panel__section">
              <div className="knowledge-base-settings-panel__row">
                <label style={{ color: 'var(--ws-editor-foreground)' }}>
                  {translateText('knowledgeBase.settingsPanel.chunkOverlapLabel', 'Chunk Overlap')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={chunkSize}
                  step={50}
                  value={chunkOverlap}
                  onChange={(event) => setChunkOverlap(Number.parseInt(event.target.value, 10) || 0)}
                  className="knowledge-base-settings-panel__input"
                />
              </div>
              <div className="setting-hint">
                {translateText('knowledgeBase.settingsPanel.chunkOverlapHint', '(character count, recommended 10%-20% of the chunk size)')}
              </div>
            </div>

            <div className="knowledge-base-settings-panel__section">
              <div className="knowledge-base-settings-panel__row">
                <label style={{ color: 'var(--ws-editor-foreground)' }}>
                  {translateText('knowledgeBase.settingsPanel.separatorsLabel', 'Custom Separators')}
                </label>
              </div>
              <div className="setting-hint" style={{ marginBottom: '8px' }}>
                {translateText('knowledgeBase.settingsPanel.separatorsHint', 'Sorted by priority, from top to bottom.')}
              </div>
              <div className="separators-input-group">
                <input
                  type="text"
                  placeholder={translateText('knowledgeBase.settingsPanel.separatorsPlaceholder', 'Enter separators (for example: \\n\\n, 。, ！)')}
                  value={separatorInput}
                  onChange={(event) => setSeparatorInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
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
                  {translateText('knowledgeBase.settingsPanel.addSeparator', 'Add')}
                </button>
              </div>
              <div className="separators-list">
                {separators.map((separator, index) => (
                  <div key={separator + index.toString()} className="separator-item">
                    <span className="separator-value" title={separator}>
                      {separator === '\n' ? '\\n' : separator === '\n\n' ? '\\n\\n' : separator === '\t' ? '\\t' : separator}
                    </span>
                    <button
                      className="separator-remove-button"
                      onClick={() => handleRemoveSeparator(index)}
                      style={{ color: 'var(--ws-editor-foreground)' }}
                      title={translateText('knowledgeBase.settingsPanel.removeSeparator', 'Remove separator')}
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
          {translateText('knowledgeBase.settingsPanel.resetDefault', 'Reset to Default')}
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
          {translateText('knowledgeBase.settingsPanel.save', 'Save')}
        </button>
      </div>
    </div>
  );
};
