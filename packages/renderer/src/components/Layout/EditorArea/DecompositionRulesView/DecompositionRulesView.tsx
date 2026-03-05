/**
 * 规则管理视图
 * 功能：在标签页中集中管理拆解规则和写作规则文档
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../../Icons/Icon';
import { electronStore } from '../../../../services/ElectronStoreService';
import { toastService } from '../../../../services/ToastService';
import './DecompositionRulesView.scss';

interface DecompositionRule {
  id: string;
  name: string;
  instruction: string;
  enabled: boolean;
  builtin: boolean;
}

interface WritingRuleDocument {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
}

interface DecompositionRulesViewProps {
  initialRules?: DecompositionRule[];
  initialWritingRuleDocuments?: WritingRuleDocument[];
}

const DECOMPOSITION_RULE_STORE_KEY = 'ai-chat-decomposition-rules';
const DECOMPOSITION_RULE_UPDATED_EVENT = 'decomposition-rules-updated';
const DECOMPOSITION_RULE_UPDATED_SOURCE = 'decomposition-rules-view';
const WRITING_RULE_STORE_KEY = 'ai-chat-writing-rule-documents';
const WRITING_RULE_UPDATED_EVENT = 'writing-rules-updated';
const WRITING_RULE_UPDATED_SOURCE = 'decomposition-rules-view';
const RULE_DOCUMENT_EXTENSIONS = new Set(['md', 'txt']);

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const buildRuleIdentityKey = (name: string, instruction: string): string =>
  `${name.trim().toLowerCase()}|${instruction.trim().toLowerCase()}`;

const normalizeComparableRuleDocumentPath = (value: string): string =>
  value.trim().replace(/\\/g, '/').toLowerCase();

const getFileExtension = (filePath: string): string => {
  const normalized = filePath.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === normalized.length - 1) return '';
  return normalized.slice(dotIndex + 1);
};

const isSupportedRuleDocumentFile = (filePath: string): boolean =>
  RULE_DOCUMENT_EXTENSIONS.has(getFileExtension(filePath));

const normalizeStoredDecompositionRules = (value: unknown): DecompositionRule[] => {
  if (!Array.isArray(value)) return [];

  const sanitize = (input: unknown): string =>
    typeof input === 'string' ? input.trim() : '';

  const normalized: DecompositionRule[] = [];
  const seenIds = new Set<string>();

  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;

    const item = rawItem as Record<string, unknown>;
    const name = sanitize(item.name);
    const instruction = sanitize(item.instruction);
    if (!name || !instruction) continue;

    const rawId = sanitize(item.id);
    const ruleId = rawId || `custom-${hashText(`${name}|${instruction}`)}`;
    if (!ruleId || seenIds.has(ruleId)) continue;

    normalized.push({
      id: ruleId,
      name,
      instruction,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      builtin: typeof item.builtin === 'boolean' ? item.builtin : false,
    });
    seenIds.add(ruleId);
  }

  return normalized;
};

const normalizeStoredWritingRuleDocuments = (value: unknown): WritingRuleDocument[] => {
  if (!Array.isArray(value)) return [];

  const sanitize = (input: unknown): string =>
    typeof input === 'string' ? input.trim() : '';
  const normalized: WritingRuleDocument[] = [];
  const seenPathKeys = new Set<string>();

  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;

    const item = rawItem as Record<string, unknown>;
    const rawPath = sanitize(item.path);
    if (!rawPath) continue;

    const pathKey = normalizeComparableRuleDocumentPath(rawPath);
    if (!pathKey || seenPathKeys.has(pathKey)) continue;

    const rawName = sanitize(item.name);
    const rawId = sanitize(item.id);
    normalized.push({
      id: rawId || `writing-doc-${hashText(pathKey)}`,
      name: rawName || rawPath.split(/[/\\]/).pop() || rawPath,
      path: rawPath,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
    });
    seenPathKeys.add(pathKey);
  }

  return normalized;
};

const areDecompositionRulesEqual = (
  left: DecompositionRule[],
  right: DecompositionRule[],
): boolean => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i];
    const r = right[i];
    if (
      l.id !== r.id
      || l.name !== r.name
      || l.instruction !== r.instruction
      || l.enabled !== r.enabled
      || l.builtin !== r.builtin
    ) {
      return false;
    }
  }
  return true;
};

const areWritingRuleDocumentsEqual = (
  left: WritingRuleDocument[],
  right: WritingRuleDocument[],
): boolean => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i];
    const r = right[i];
    if (
      l.id !== r.id
      || l.name !== r.name
      || l.path !== r.path
      || l.enabled !== r.enabled
    ) {
      return false;
    }
  }
  return true;
};

export const DecompositionRulesView: React.FC<DecompositionRulesViewProps> = ({
  initialRules,
  initialWritingRuleDocuments,
}) => {
  const [isLoadingRules, setIsLoadingRules] = useState(true);
  const [isLoadingWritingRuleDocuments, setIsLoadingWritingRuleDocuments] = useState(true);
  const [rules, setRules] = useState<DecompositionRule[]>([]);
  const [writingRuleDocuments, setWritingRuleDocuments] = useState<WritingRuleDocument[]>([]);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleInstruction, setNewRuleInstruction] = useState('');

  const rulesLoadedRef = useRef(false);
  const writingRulesLoadedRef = useRef(false);
  const builtinRulesRef = useRef<DecompositionRule[]>([]);

  const enabledRulesCount = useMemo(
    () => rules.filter(rule => rule.enabled).length,
    [rules],
  );
  const enabledWritingRuleDocumentsCount = useMemo(
    () => writingRuleDocuments.filter(document => document.enabled).length,
    [writingRuleDocuments],
  );

  useEffect(() => {
    let disposed = false;

    const loadRules = async () => {
      try {
        const savedRules = await electronStore.get(DECOMPOSITION_RULE_STORE_KEY);
        if (disposed) return;

        const normalizedFromStore = normalizeStoredDecompositionRules(savedRules);
        const normalizedFromInitial = normalizeStoredDecompositionRules(initialRules ?? []);
        const normalized = normalizedFromStore.length > 0
          ? normalizedFromStore
          : normalizedFromInitial;

        builtinRulesRef.current = normalized
          .filter(rule => rule.builtin)
          .map(rule => ({ ...rule }));
        setRules(normalized);
      } catch (error) {
        console.error('[DecompositionRulesView] 加载拆解规则失败:', error);
        toastService.error('加载拆解规则失败');
      } finally {
        if (!disposed) {
          rulesLoadedRef.current = true;
          setIsLoadingRules(false);
        }
      }
    };

    loadRules();

    return () => {
      disposed = true;
    };
  }, [initialRules]);

  useEffect(() => {
    let disposed = false;

    const loadWritingRuleDocuments = async () => {
      try {
        const savedDocuments = await electronStore.get(WRITING_RULE_STORE_KEY);
        if (disposed) return;

        const normalizedFromStore = normalizeStoredWritingRuleDocuments(savedDocuments);
        const normalizedFromInitial = normalizeStoredWritingRuleDocuments(initialWritingRuleDocuments ?? []);
        const normalized = normalizedFromStore.length > 0
          ? normalizedFromStore
          : normalizedFromInitial;
        setWritingRuleDocuments(normalized);
      } catch (error) {
        console.error('[DecompositionRulesView] 加载写作规则文档失败:', error);
        toastService.error('加载写作规则文档失败');
      } finally {
        if (!disposed) {
          writingRulesLoadedRef.current = true;
          setIsLoadingWritingRuleDocuments(false);
        }
      }
    };

    loadWritingRuleDocuments();

    return () => {
      disposed = true;
    };
  }, [initialWritingRuleDocuments]);

  useEffect(() => {
    if (!rulesLoadedRef.current) return;

    let disposed = false;
    const saveRules = async () => {
      try {
        const success = await electronStore.set(DECOMPOSITION_RULE_STORE_KEY, rules);
        if (!success || disposed) return;

        window.dispatchEvent(new CustomEvent(DECOMPOSITION_RULE_UPDATED_EVENT, {
          detail: {
            source: DECOMPOSITION_RULE_UPDATED_SOURCE,
            updatedAt: Date.now(),
          },
        }));
      } catch (error) {
        console.error('[DecompositionRulesView] 保存拆解规则失败:', error);
      }
    };

    saveRules();

    return () => {
      disposed = true;
    };
  }, [rules]);

  useEffect(() => {
    if (!writingRulesLoadedRef.current) return;

    let disposed = false;
    const saveWritingRuleDocuments = async () => {
      try {
        const success = await electronStore.set(WRITING_RULE_STORE_KEY, writingRuleDocuments);
        if (!success || disposed) return;

        window.dispatchEvent(new CustomEvent(WRITING_RULE_UPDATED_EVENT, {
          detail: {
            source: WRITING_RULE_UPDATED_SOURCE,
            updatedAt: Date.now(),
          },
        }));
      } catch (error) {
        console.error('[DecompositionRulesView] 保存写作规则文档失败:', error);
      }
    };

    saveWritingRuleDocuments();

    return () => {
      disposed = true;
    };
  }, [writingRuleDocuments]);

  useEffect(() => {
    const handleRulesUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<{ source?: string }>;
      if (customEvent.detail?.source === DECOMPOSITION_RULE_UPDATED_SOURCE) {
        return;
      }

      try {
        const savedRules = await electronStore.get(DECOMPOSITION_RULE_STORE_KEY);
        const normalized = normalizeStoredDecompositionRules(savedRules);
        setRules(prev =>
          areDecompositionRulesEqual(prev, normalized) ? prev : normalized,
        );
      } catch (error) {
        console.error('[DecompositionRulesView] 同步拆解规则失败:', error);
      }
    };

    window.addEventListener(DECOMPOSITION_RULE_UPDATED_EVENT, handleRulesUpdated as EventListener);
    return () => {
      window.removeEventListener(DECOMPOSITION_RULE_UPDATED_EVENT, handleRulesUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleWritingRulesUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<{ source?: string }>;
      if (customEvent.detail?.source === WRITING_RULE_UPDATED_SOURCE) {
        return;
      }

      try {
        const savedDocuments = await electronStore.get(WRITING_RULE_STORE_KEY);
        const normalized = normalizeStoredWritingRuleDocuments(savedDocuments);
        setWritingRuleDocuments(prev =>
          areWritingRuleDocumentsEqual(prev, normalized) ? prev : normalized,
        );
      } catch (error) {
        console.error('[DecompositionRulesView] 同步写作规则文档失败:', error);
      }
    };

    window.addEventListener(WRITING_RULE_UPDATED_EVENT, handleWritingRulesUpdated as EventListener);
    return () => {
      window.removeEventListener(WRITING_RULE_UPDATED_EVENT, handleWritingRulesUpdated as EventListener);
    };
  }, []);

  const handleAddRule = useCallback(() => {
    const name = newRuleName.trim();
    const instruction = newRuleInstruction.trim();
    if (!name || !instruction) {
      toastService.warning('请先输入规则名称和规则说明');
      return;
    }

    const identityKey = buildRuleIdentityKey(name, instruction);
    const existingRule = rules.find(
      rule => buildRuleIdentityKey(rule.name, rule.instruction) === identityKey,
    );

    if (existingRule) {
      if (!existingRule.enabled) {
        setRules(prev =>
          prev.map(rule =>
            rule.id === existingRule.id ? { ...rule, enabled: true } : rule,
          ),
        );
        toastService.success('规则已存在，已自动启用');
      } else {
        toastService.info('规则已存在');
      }
      return;
    }

    const uniqueSeed = `${name}|${instruction}|${Date.now().toString()}`;
    setRules(prev => [
      ...prev,
      {
        id: `custom-${hashText(uniqueSeed)}`,
        name,
        instruction,
        enabled: true,
        builtin: false,
      },
    ]);
    setNewRuleName('');
    setNewRuleInstruction('');
    toastService.success('已添加拆解规则');
  }, [newRuleInstruction, newRuleName, rules]);

  const handleToggleRule = useCallback((ruleId: string) => {
    setRules(prev => prev.map(rule =>
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule,
    ));
  }, []);

  const handleDeleteRule = useCallback((ruleId: string) => {
    setRules(prev => prev.filter(rule => !(rule.id === ruleId && !rule.builtin)));
  }, []);

  const handleResetBuiltinRules = useCallback(() => {
    const builtinRules = builtinRulesRef.current.map(rule => ({ ...rule }));
    if (builtinRules.length === 0) {
      toastService.info('当前没有可恢复的内置规则');
      return;
    }

    setRules(prev => {
      const customRules = prev.filter(rule => !rule.builtin);
      return [...builtinRules, ...customRules];
    });
    toastService.success('已恢复内置拆解规则');
  }, []);

  const handleImportWritingRuleDocuments = useCallback(async () => {
    try {
      const dialogResult = await window.electron?.file?.showOpenDialog?.({
        title: '导入写作规则文档',
        filters: [
          { name: '规则文档 (*.md, *.txt)', extensions: ['md', 'txt'] },
          { name: 'Markdown (*.md)', extensions: ['md'] },
          { name: 'Text (*.txt)', extensions: ['txt'] },
        ],
        properties: ['openFile', 'multiSelections'],
      });

      if (!dialogResult || dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return;
      }

      const supportedPaths = dialogResult.filePaths
        .map(path => path.trim())
        .filter(path => path.length > 0 && isSupportedRuleDocumentFile(path));
      if (supportedPaths.length === 0) {
        toastService.error('仅支持导入 .md 或 .txt 文档');
        return;
      }

      if (supportedPaths.length < dialogResult.filePaths.length) {
        toastService.warning(`已忽略 ${dialogResult.filePaths.length - supportedPaths.length} 个非 .md/.txt 文件`);
      }

      const nextDocuments = writingRuleDocuments.map(document => ({ ...document }));
      const indexByPath = new Map<string, number>();
      nextDocuments.forEach((document, index) => {
        indexByPath.set(normalizeComparableRuleDocumentPath(document.path), index);
      });

      let addedCount = 0;
      let enabledCount = 0;

      for (const filePath of supportedPaths) {
        const pathKey = normalizeComparableRuleDocumentPath(filePath);
        const existingIndex = indexByPath.get(pathKey);
        if (typeof existingIndex === 'number') {
          const existingDocument = nextDocuments[existingIndex];
          if (!existingDocument.enabled) {
            nextDocuments[existingIndex] = { ...existingDocument, enabled: true };
            enabledCount += 1;
          }
          continue;
        }

        const documentName = filePath.split(/[/\\]/).pop() || filePath;
        nextDocuments.push({
          id: `writing-doc-${hashText(pathKey)}`,
          name: documentName,
          path: filePath,
          enabled: true,
        });
        indexByPath.set(pathKey, nextDocuments.length - 1);
        addedCount += 1;
      }

      if (addedCount === 0 && enabledCount === 0) {
        toastService.info('没有新的写作规则文档可导入');
        return;
      }

      setWritingRuleDocuments(nextDocuments);
      if (enabledCount > 0) {
        toastService.success(`导入完成：新增 ${addedCount} 个文档，启用已有 ${enabledCount} 个文档`);
      } else {
        toastService.success(`导入完成：新增 ${addedCount} 个写作规则文档`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastService.error(`导入写作规则失败: ${errorMessage}`);
      console.error('[DecompositionRulesView] 导入写作规则失败:', error);
    }
  }, [writingRuleDocuments]);

  const handleToggleWritingRuleDocument = useCallback((documentId: string) => {
    setWritingRuleDocuments(prev => prev.map(document =>
      document.id === documentId ? { ...document, enabled: !document.enabled } : document,
    ));
  }, []);

  const handleDeleteWritingRuleDocument = useCallback((documentId: string) => {
    setWritingRuleDocuments(prev => prev.filter(document => document.id !== documentId));
  }, []);

  const handleClearWritingRuleDocuments = useCallback(() => {
    if (writingRuleDocuments.length === 0) {
      toastService.info('当前没有可清空的写作规则文档');
      return;
    }
    setWritingRuleDocuments([]);
    toastService.success('已清空写作规则文档');
  }, [writingRuleDocuments.length]);

  const handleActionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, action: () => void) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        action();
      }
    },
    [],
  );

  const isLoading = isLoadingRules || isLoadingWritingRuleDocuments;

  return (
    <div className="decomposition-rules-view">
      <div className="decomposition-rules-view__header">
        <div className="decomposition-rules-view__title">拆解规则管理</div>
        <div className="decomposition-rules-view__meta">
          拆解规则 {enabledRulesCount}/{rules.length}
        </div>
      </div>

      <div className="decomposition-rules-view__toolbar">
        <div
          role="button"
          tabIndex={0}
          className="decomposition-rules-view__action"
          onClick={handleResetBuiltinRules}
          onKeyDown={event => handleActionKeyDown(event, handleResetBuiltinRules)}
        >
          <Icon name="refresh" size={14} />
          <span>恢复内置规则</span>
        </div>
      </div>

      <div className="decomposition-rules-view__content">
        {isLoading ? (
          <div className="decomposition-rules-view__empty">
            <span>加载中...</span>
          </div>
        ) : (
          <div className="decomposition-rules-view__sections">
            <div className="decomposition-rules-view__section">
              <div className="decomposition-rules-view__section-title">拆解规则</div>
              <div className="decomposition-rules-view__editor">
                <input
                  className="decomposition-rules-view__input"
                  placeholder="规则名称"
                  value={newRuleName}
                  onChange={event => setNewRuleName(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddRule();
                    }
                  }}
                />
                <input
                  className="decomposition-rules-view__input"
                  placeholder="规则说明"
                  value={newRuleInstruction}
                  onChange={event => setNewRuleInstruction(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddRule();
                    }
                  }}
                />
                <div
                  role="button"
                  tabIndex={0}
                  className="decomposition-rules-view__action"
                  onClick={handleAddRule}
                  onKeyDown={event => handleActionKeyDown(event, handleAddRule)}
                >
                  <Icon name="file-code" size={14} />
                  <span>添加规则</span>
                </div>
              </div>

              {rules.length === 0 ? (
                <div className="decomposition-rules-view__empty-inline">
                  <span>暂无规则</span>
                </div>
              ) : (
                <div className="decomposition-rules-view__list">
                  {rules.map(rule => (
                    <div
                      key={rule.id}
                      className={`decomposition-rules-view__item${rule.enabled ? ' is-enabled' : ''}`}
                      onClick={() => handleToggleRule(rule.id)}
                    >
                      <div className="decomposition-rules-view__item-main">
                        <div className="decomposition-rules-view__item-name-row">
                          <span className="decomposition-rules-view__item-name">{rule.name}</span>
                          {rule.builtin && <span className="decomposition-rules-view__item-tag">内置</span>}
                        </div>
                        <span className="decomposition-rules-view__item-instruction">{rule.instruction}</span>
                      </div>
                      <div className={`decomposition-rules-view__switch${rule.enabled ? ' is-active' : ''}`}>
                        <div className="decomposition-rules-view__switch-thumb" />
                      </div>
                      {!rule.builtin && (
                        <div
                          role="button"
                          tabIndex={0}
                          className="decomposition-rules-view__delete"
                          onClick={event => {
                            event.stopPropagation();
                            handleDeleteRule(rule.id);
                          }}
                          onKeyDown={event => {
                            event.stopPropagation();
                            handleActionKeyDown(event, () => handleDeleteRule(rule.id));
                          }}
                        >
                          <Icon name="delete" size={12} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default DecompositionRulesView;
