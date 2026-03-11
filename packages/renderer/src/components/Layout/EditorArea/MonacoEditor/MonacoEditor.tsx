/**
 * Monaco 缂栬緫鍣ㄥ皝瑁呯粍锟?
 * 鍔熻兘锛氶泦锟?Monaco 缂栬緫鍣ㄥ拰蹇嵎閿敮锟?
 * 鎻忚堪锛氭敮鎸佷唬鐮佺紪杈戙€佷富棰樺垏锟?锟斤拷蹇嵎閿搷浣滐紙濡?Ctrl+S 淇濆瓨锟?
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { VSCodeCommandCenter } from '../../../../command-center';
import '../../../../command-center/VSCodeCommandCenter.scss';
import { MonacoContextMenu } from '../MonacoContextMenu/MonacoContextMenu';
import { useMonacoContextMenu } from '../MonacoContextMenu/useMonacoContextMenu';
import '../MonacoContextMenu/MonacoContextMenu.scss';
import './MonacoEditor.scss';
import { AIZoneWidget } from '../AIZoneWidget/AIZoneWidget';
import { GhostTextWidget } from '../GhostTextWidget/GhostTextWidget';
import { CodeDecorationManager } from '../CodeDecorationManager/CodeDecorationManager';
import { AIRewriteWidget } from '../AIRewriteWidget/AIRewriteWidget';
import { builtinAI } from '../../../../services/BuiltinAIService';
import { snippetService } from '../../../../services/SnippetService';
import type { Snippet } from '@note-studio/shared';
import { initializeMonaco } from '../../../../hooks/useMonacoInit';
import { getCachedModels, getModelConfig } from '../../../../services/ModelCacheService';
import { aiService } from '../../../../services/ai/AIService';
import { isModelEnabled, loadModelEnabledStatesFromDB } from '../../../../services/ai';
import { ragProcessingService } from '../../../../services/RAGProcessingService';
import { toastService } from '../../../../services/ToastService';
import { estimateTokens } from '../../../../utils/tokenCounter';
import { getModelInputTokenLimit } from '../../../../utils/modelTokenLimit';
import { SelectKnowledgeBaseDialog } from '../../Sidebar/KnowledgeBase/SelectKnowledgeBaseDialog';
import { knowledgeBaseService } from '../../Sidebar/KnowledgeBase/knowledgeBaseService';
import { FileParser, VectorStore } from '@note-studio/global-rag';
import { ModelCapabilityDetector } from '../../../../services/modelCapabilityDetector';
import { ModelCapability } from '../../../../types/modelCapabilities';
import { DEFAULT_CHAT_SETTINGS } from '../../../AIChatSettings/AIChatSettings';
import { getAIZoneSystemPromptAsync } from '../../../../services/ai/SystemPrompt';
import type { LinkAnchorSuggestionItem, LinkTargetSuggestionItem } from '../../../../types/electron';

const MAX_INLINE_CHAT_HISTORY_MESSAGES = 12;
const MONACO_EDITOR_DEBUG_LOGS = false;

const monacoDebugLog = (...args: unknown[]): void => {
  if (!MONACO_EDITOR_DEBUG_LOGS) {
    return;
  }
  globalThis.console.log(...args);
};

const formatModelDisplayName = (modelId?: string): string => {
  if (!modelId) {
    return '';
  }
  const colonIndex = modelId.indexOf(':');
  if (colonIndex > 0) {
    return modelId.substring(colonIndex + 1);
  }
  return modelId;
};

const getProviderDisplayName = (providerId: string, modelId?: string): string => {
  if (modelId) {
    const lowerModelId = modelId.toLowerCase();
    if (lowerModelId.includes('glm') || lowerModelId.includes('zhipu')) {
      return '鏅鸿氨AI';
    }
    if (lowerModelId.includes('deepseek')) {
      return 'DeepSeek';
    }
    if (lowerModelId.includes('qwen')) {
      return '閫氫箟鍗冮棶';
    }
    if (lowerModelId.includes('baichuan')) {
      return '鐧惧窛鏅鸿兘';
    }
  }
  const providerNames: Record<string, string> = {
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    groq: 'Groq',
    gemini: 'Google',
    modelscope: '榄斿绀惧尯',
    zenmux: 'Zenmux',
    custom: '锟皆讹拷锟斤拷'
  };
  return providerNames[providerId.toLowerCase()] || providerId;
};

// 鍏ㄥ眬鏍囪锛氶槻姝㈤噸澶嶆敞锟?jsonc 璇█
let jsoncLanguageRegistered = false;
let wikilinkCompletionRegistered = false;
type MonacoPosition = monaco.Position;
type MonacoTextModel = monaco.editor.ITextModel;

interface MonacoEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
  onCompositionStateChange?: (isComposing: boolean, value?: string) => void;
  tabId?: string;  // 褰撳墠鏍囩椤礗D
  tabTitle?: string;  // 褰撳墠鏍囩椤垫爣锟?
  filePath?: string;  // 褰撳墠鏂囦欢璺緞
}

const BOOTSTRAP_MONACO_THEME_ID = 'note-studio-editor-theme-bootstrap';

const sanitizeMonacoThemeId = (rawId: string | undefined, fallback = 'note-studio-editor-theme'): string => {
  const normalized = (rawId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || fallback;
};

const resolveThemeMode = (): 'light' | 'dark' => {
  if (typeof document === 'undefined') {
    return 'dark';
  }
  const mode =
    document.documentElement.getAttribute('data-theme-mode') ||
    document.body.getAttribute('data-theme-type');
  return mode === 'light' ? 'light' : 'dark';
};

const readCssVariable = (name: string): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

const applyBootstrapMonacoTheme = (monacoInstance: Monaco) => {
  const mode = resolveThemeMode();
  const isLight = mode === 'light';
  const background = readCssVariable('--ws-editor-background') || (isLight ? '#ffffff' : '#1e1e1e');
  const foreground = readCssVariable('--ws-editor-foreground') || (isLight ? '#1f1f1f' : '#d4d4d4');

  monacoInstance.editor.defineTheme(BOOTSTRAP_MONACO_THEME_ID, {
    base: isLight ? 'vs' : 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': background,
      'editor.foreground': foreground,
    },
  });
  monacoInstance.editor.setTheme(BOOTSTRAP_MONACO_THEME_ID);
};

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  language = 'markdown',
  onChange,
  onCompositionStateChange,
  tabId,
  tabTitle,
  filePath
}) => {
  const [currentTheme, setCurrentTheme] = useState<string>(BOOTSTRAP_MONACO_THEME_ID);
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const [pendingTheme, setPendingTheme] = useState<any>(null);
  const [isEditorReady, setIsEditorReady] = useState<boolean>(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onCompositionStateChangeRef = useRef(onCompositionStateChange);
  const commandCenterRef = useRef<VSCodeCommandCenter | null>(null);
  const isSyncingScrollRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isImeComposingRef = useRef(false);
  const compositionCleanupRef = useRef<(() => void) | null>(null);

  // AI 鍔熻兘鐩稿叧
  const aiZoneWidgetRef = useRef<AIZoneWidget | null>(null);
  const ghostTextRef = useRef<GhostTextWidget | null>(null);
  const decorationManagerRef = useRef<CodeDecorationManager | null>(null);
  const currentGhostWidgetRef = useRef<GhostTextWidget | null>(null);
  const originalLineCountRef = useRef<number | null>(null); // 璁板綍鎻掑叆绌鸿鍓嶇殑鍘熷琛屾暟
  const aiRewriteWidgetRef = useRef<AIRewriteWidget | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const availableModelsRef = useRef<string[]>([]); // 鐢ㄤ簬鍦ㄩ棴鍖呬腑璁块棶鏈€鏂扮殑 availableModels
  const [showSelectKnowledgeBaseDialog, setShowSelectKnowledgeBaseDialog] = useState(false);
  const forceApplyColorsRef = useRef<(() => void) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null); // 鐢ㄤ簬鍙栨秷 AI 璇锋眰
  
  // 棰滆壊閫夋嫨锟?MutationObserver 鐨勬竻鐞嗗嚱锟?
  const colorPickerObserverCleanupRef = useRef<(() => void) | null>(null);

  // 璋冭瘯锛氭墦鍗扮粍浠舵覆鏌撲俊锟?
  monacoDebugLog('[MonacoEditor] Rendering with:', {
    tabId,
    tabTitle,
    language,
    contentLength: value?.length || 0,
    contentPreview: value?.substring(0, 50)
  });

  useEffect(() => {
    onCompositionStateChangeRef.current = onCompositionStateChange;
  }, [onCompositionStateChange]);


  useEffect(() => {
    const loadAvailableModels = async () => {
      try {
        // 棣栧厛浠庢暟鎹簱鍔犺浇妯″瀷鍚敤鐘舵€侊紙纭繚 isModelEnabled 鑳芥纭伐浣滐級
        await loadModelEnabledStatesFromDB();
        
        // 浼樺厛浠庢暟鎹簱鍔犺浇妯″瀷閰嶇疆
        const cachedModels = await getCachedModels();
        
        if (cachedModels && cachedModels.length > 0) {
          // 鎻愬彇妯″瀷ID鍒楄〃锛堟牸寮忥細ProviderName:modelId锛夛紝骞惰繃婊ゆ帀绂佺敤鐨勬ā锟?
          const modelIds = cachedModels
            .filter(model => {
              // 浠庢ā鍨婭D涓彁鍙栧疄闄呯殑妯″瀷鍚嶇О锛堟牸寮忥細configName:modelName锟?
              const modelName = model.modelId.includes(':') ? model.modelId.split(':')[1] : model.modelId;
              return isModelEnabled(modelName);
            })
            .map(model => model.modelId);
          setAvailableModels(modelIds);
          availableModelsRef.current = modelIds; // 鍚屾鏇存柊 ref
          monacoDebugLog('[MonacoEditor] 浠庢暟鎹簱鍔犺浇宸插惎鐢ㄧ殑妯″瀷锛屾暟锟?', modelIds.length);
        } else {
          // 濡傛灉鏁版嵁搴撲腑娌℃湁妯″瀷閰嶇疆锛屽洖閫€鍒板唴缃瓵I鏈嶅姟
          monacoDebugLog('[MonacoEditor] 鏁版嵁搴撲腑娌℃湁妯″瀷閰嶇疆锛屼娇鐢ㄥ唴缃瓵I鏈嶅姟');
          const models = await builtinAI.getModels();
          if (models.length > 0) {
            setAvailableModels(models);
            availableModelsRef.current = models; // 鍚屾鏇存柊 ref
          } else {
            setAvailableModels([]);
            availableModelsRef.current = []; // 鍚屾鏇存柊 ref
          }
        }
      } catch (error) {
        console.error('[MonacoEditor] 鍔犺浇妯″瀷閰嶇疆澶辫触:', error);
        // 鍑洪敊鏃跺洖閫€鍒板唴缃瓵I鏈嶅姟
        try {
          const models = await builtinAI.getModels();
          const modelsArray = models || [];
          setAvailableModels(modelsArray);
          availableModelsRef.current = modelsArray; // 鍚屾鏇存柊 ref
        } catch (fallbackError) {
          console.error('[MonacoEditor] 鍥為€€鍒板唴缃瓵I鏈嶅姟涔熷け锟?', fallbackError);
          setAvailableModels([]);
          availableModelsRef.current = []; // 鍚屾鏇存柊 ref
        }
      }
    };

    loadAvailableModels();
    
    // 鐩戝惉妯″瀷閰嶇疆鏇存柊浜嬩欢
    const handleModelConfigUpdate = async () => {
      monacoDebugLog('[MonacoEditor] AI閰嶇疆宸叉洿鏂帮紝閲嶆柊鍔犺浇妯″瀷鍒楄〃...');
      await loadAvailableModels();
    };
    
    // 鐩戝惉妯″瀷鍚敤鐘舵€佸彉鍖栦簨锟?
    const handleModelEnabledChanged = async () => {
      monacoDebugLog('[MonacoEditor] 妯″瀷鍚敤鐘舵€佸凡鍙樺寲锛岄噸鏂板姞杞芥ā鍨嬪垪锟?..');
      await loadAvailableModels();
    };
    
    // 鐩戝惉妯″瀷缂撳瓨鏇存柊浜嬩欢
    const handleModelsCacheUpdated = async () => {
      monacoDebugLog('[MonacoEditor] 妯″瀷缂撳瓨宸叉洿鏂帮紝閲嶆柊鍔犺浇妯″瀷鍒楄〃...');
      await loadAvailableModels();
    };
    
    // 鐩戝惉绐楀彛浜嬩欢锛堝綋AI閰嶇疆鏇存柊鏃惰Е鍙戯級
    window.addEventListener('ai-model-config-updated', handleModelConfigUpdate);
    window.addEventListener('ai-config-updated', handleModelConfigUpdate);
    window.addEventListener('model-enabled-changed', handleModelEnabledChanged);
    window.addEventListener('models-cache-updated', handleModelsCacheUpdated);
    
    return () => {
      window.removeEventListener('ai-model-config-updated', handleModelConfigUpdate);
      window.removeEventListener('ai-config-updated', handleModelConfigUpdate);
      window.removeEventListener('model-enabled-changed', handleModelEnabledChanged);
      window.removeEventListener('models-cache-updated', handleModelsCacheUpdated);
    };
  }, []);

  // 锟?availableModels 鍙樺寲鏃讹紝鏇存柊宸插瓨鍦ㄧ殑 AIZoneWidget
  useEffect(() => {
    if (aiZoneWidgetRef.current && availableModels.length > 0) {
      monacoDebugLog('[MonacoEditor] availableModels updated, syncing AIZoneWidget');
      // 鏇存柊 AIZoneWidget 锟?options
      aiZoneWidgetRef.current.updateAvailableModels(availableModels);
    }
  }, [availableModels]);

  // 缁勪欢鍗歌浇鏃舵竻鐞嗛鑹查€夋嫨鍣ㄨ瀵熷櫒
  useEffect(() => {
    return () => {
      if (colorPickerObserverCleanupRef.current) {
        colorPickerObserverCleanupRef.current();
        colorPickerObserverCleanupRef.current = null;
      }
    };
  }, []);

  /**
   * 娓呴櫎涔嬪墠锟?diff 鍐呭鍜岀┖锟?
   * 杩欐槸涓€涓€氱敤鍑芥暟锛岀敤浜庡湪閲嶆柊鐢熸垚鎴栨柊璇锋眰鏃舵竻闄や箣鍓嶇殑 diff 鐘讹拷?
   */
  const cleanupPreviousDiff = useCallback(() => {
    // 绔嬪嵆娓呴櫎涔嬪墠锟?Ghost Text Widget锛堝鏋滃瓨鍦級
    if (currentGhostWidgetRef.current) {
      monacoDebugLog('[MonacoEditor] 娓呴櫎涓婁竴娆＄殑 diff 棰勮锛堥噸鏂扮敓鎴愭垨鏂拌姹傦級');
      currentGhostWidgetRef.current.dispose();
      currentGhostWidgetRef.current = null;
    }
    
    // 娓呴櫎涔嬪墠鎻掑叆鐨勭┖琛岋紙鏃犺 widget 鏄惁瀛樺湪锛岄兘瑕佹竻闄ょ┖琛岋級
    // 淇濆瓨涓婁竴娆＄殑鍘熷琛屾暟锛岀敤浜庢竻闄ょ┖锟?
    const previousOriginalLineCount = originalLineCountRef.current;
    
    // 鑾峰彇褰撳墠锟?zoneBottomLine锛岀敤浜庢竻锟?GhostTextWidget 鎻掑叆鐨勭┖锟?
    const currentZoneBottomLine = aiZoneWidgetRef.current?.getZoneBottomLineNumber();
    
    if (editorRef.current) {
      const editor = editorRef.current;
      const model = editor.getModel();
      if (model) {
        const currentLineCount = model.getLineCount();
        
        // 绛栫暐1: 濡傛灉鏈夎褰曠殑鍘熷琛屾暟锛屼娇鐢ㄥ畠鏉ユ竻闄ょ┖锟?
        if (previousOriginalLineCount !== null && currentLineCount > previousOriginalLineCount) {
          // 浠庢枃妗ｆ湯灏惧悜鍓嶆煡鎵撅紝鎵惧埌绗竴涓潪绌鸿
          let lastNonEmptyLine = previousOriginalLineCount;
          
          // 浠庢渶鍚庝竴琛屽悜鍓嶆鏌ュ埌鍘熷琛屾暟涔嬪悗
          for (let lineNum = currentLineCount; lineNum > previousOriginalLineCount; lineNum--) {
            const lineContent = model.getLineContent(lineNum);
            // 濡傛灉琛屼笉涓虹┖锛堟湁闈炵┖鐧藉瓧绗︼級锛屾壘鍒版渶鍚庨潪绌鸿
            if (lineContent.trim().length > 0) {
              lastNonEmptyLine = lineNum;
              break;
            }
          }
          
          // 濡傛灉鏈€鍚庨潪绌鸿灏忎簬褰撳墠琛屾暟锛岃鏄庢枃妗ｆ湯灏炬湁杩炵画鐨勭┖琛岄渶瑕佸垹锟?
          if (lastNonEmptyLine < currentLineCount) {
            const linesToRemove = currentLineCount - lastNonEmptyLine;
            const startLine = lastNonEmptyLine + 1;
            const endLine = currentLineCount;
            
            monacoDebugLog('[MonacoEditor] remove trailing blank lines:', linesToRemove, startLine, endLine);
            
            // 鍒犻櫎锟?startLine 锟?endLine 鐨勬墍鏈夎
            if (startLine === previousOriginalLineCount + 1) {
              // 浠庡師濮嬭鏁扮殑鏈熬鍒犻櫎鍒版枃妗ｆ湯锟?
              const originalLineEndColumn = model.getLineMaxColumn(previousOriginalLineCount);
              const endLineColumn = model.getLineMaxColumn(endLine);
              
              editor.executeEdits('inline-chat-cleanup', [{
                range: new monaco.Range(previousOriginalLineCount, originalLineEndColumn, endLine, endLineColumn),
                text: '',
                forceMoveMarkers: true
              }]);
            } else {
              // 锟?startLine 鐨勭1鍒楀垹闄ゅ埌 endLine 鐨勬渶鍚庡垪
              const startColumn = 1;
              const endLineColumn = model.getLineMaxColumn(endLine);
              
              editor.executeEdits('inline-chat-cleanup', [{
                range: new monaco.Range(startLine, startColumn, endLine, endLineColumn),
                text: '',
                forceMoveMarkers: true
              }]);
            }
          }
        }
        
        // 绛栫暐2: 娓呴櫎锟?zoneBottomLine 涔嬪悗鐨勬墍鏈夎繛缁┖琛岋紙娓呴櫎 GhostTextWidget 鎻掑叆鐨勭┖琛岋級
        // 閲嶆柊鑾峰彇褰撳墠琛屾暟锛堝洜涓虹瓥锟?鍙兘宸茬粡淇敼浜嗘枃妗ｏ級
        const updatedLineCount = model.getLineCount();
        if (currentZoneBottomLine !== undefined && currentZoneBottomLine > 0 && currentZoneBottomLine <= updatedLineCount) {
          // 锟?zoneBottomLine 涔嬪悗寮€濮嬫鏌ワ紝鎵惧埌绗竴涓潪绌鸿
          let firstNonEmptyLineAfterZone = updatedLineCount + 1; // 鍒濆鍖栦负瓒呭嚭鑼冨洿鐨勶拷?
          
          // 锟?zoneBottomLine + 1 寮€濮嬪悜鍚庢煡鎵撅紝鎵惧埌绗竴涓潪绌鸿
          for (let lineNum = currentZoneBottomLine + 1; lineNum <= updatedLineCount; lineNum++) {
            // 纭繚琛屽彿鏈夋晥锛堥噸鏂版鏌ュ綋鍓嶈鏁帮級
            const actualLineCount = model.getLineCount();
            if (lineNum < 1 || lineNum > actualLineCount) continue;
            const lineContent = model.getLineContent(lineNum);
            if (lineContent.trim().length > 0) {
              firstNonEmptyLineAfterZone = lineNum;
              break;
            }
          }
          
          // 濡傛灉锟?zoneBottomLine + 1 锟?firstNonEmptyLineAfterZone - 1 閮芥槸绌鸿锛屾竻闄ゅ畠锟?
          if (firstNonEmptyLineAfterZone > currentZoneBottomLine + 1) {
            const startLine = currentZoneBottomLine + 1;
            const endLine = firstNonEmptyLineAfterZone - 1;
            const linesToRemove = endLine - startLine + 1;
            
            monacoDebugLog('[MonacoEditor] remove blank lines inserted after GhostTextWidget:', linesToRemove, startLine, endLine);
            
            // 鍒犻櫎锟?startLine 锟?endLine 鐨勬墍鏈夎
            const startColumn = 1;
            const endLineColumn = model.getLineMaxColumn(endLine);
            
            editor.executeEdits('inline-chat-cleanup-ghost', [{
              range: new monaco.Range(startLine, startColumn, endLine, endLineColumn),
              text: '',
              forceMoveMarkers: true
            }]);
          } else if (firstNonEmptyLineAfterZone > updatedLineCount) {
            // 濡傛灉锟?zoneBottomLine + 1 鍒版枃妗ｆ湯灏鹃兘鏄┖琛岋紝娓呴櫎瀹冧滑
            const startLine = currentZoneBottomLine + 1;
            const endLine = model.getLineCount(); // 閲嶆柊鑾峰彇褰撳墠琛屾暟
            
            if (startLine <= endLine) {
              const linesToRemove = endLine - startLine + 1;
              
              monacoDebugLog('[MonacoEditor] remove trailing blank lines inserted after GhostTextWidget:', linesToRemove, startLine, endLine);
              
              // 鍒犻櫎锟?startLine 锟?endLine 鐨勬墍鏈夎
              const startColumn = 1;
              const endLineColumn = model.getLineMaxColumn(endLine);
              
              editor.executeEdits('inline-chat-cleanup-ghost', [{
                range: new monaco.Range(startLine, startColumn, endLine, endLineColumn),
                text: '',
                forceMoveMarkers: true
              }]);
            }
          }
        }
        
        // 绛栫暐3: 濡傛灉娌℃湁璁板綍鐨勫師濮嬭鏁帮紝浣嗕粠鏂囨。鏈熬鏈夎繛缁┖琛岋紝涔熷皾璇曟竻锟?
        const finalLineCount = model.getLineCount(); // 閲嶆柊鑾峰彇褰撳墠琛屾暟
        if (previousOriginalLineCount === null && finalLineCount > 0) {
          // 浠庢枃妗ｆ湯灏惧悜鍓嶆煡鎵撅紝鎵惧埌鏈€鍚庝竴涓潪绌鸿
          let lastNonEmptyLine = finalLineCount;
          for (let lineNum = finalLineCount; lineNum >= 1; lineNum--) {
            // 纭繚琛屽彿鏈夋晥
            if (lineNum < 1 || lineNum > model.getLineCount()) continue;
            const lineContent = model.getLineContent(lineNum);
            if (lineContent.trim().length > 0) {
              lastNonEmptyLine = lineNum;
              break;
            }
          }
          
          // 濡傛灉鏈€鍚庨潪绌鸿灏忎簬褰撳墠琛屾暟锛岃鏄庢枃妗ｆ湯灏炬湁杩炵画鐨勭┖琛岄渶瑕佸垹锟?
          const currentFinalLineCount = model.getLineCount();
          if (lastNonEmptyLine < currentFinalLineCount) {
            const linesToRemove = currentFinalLineCount - lastNonEmptyLine;
            const startLine = lastNonEmptyLine + 1;
            const endLine = currentFinalLineCount;
            
            // 纭繚琛屽彿鏈夋晥
            if (startLine >= 1 && endLine >= startLine && endLine <= model.getLineCount()) {
              monacoDebugLog('[MonacoEditor] remove blank lines at document end:', linesToRemove, startLine, endLine);
              
              // 鍒犻櫎锟?startLine 锟?endLine 鐨勬墍鏈夎
              const startColumn = 1;
              const endLineColumn = model.getLineMaxColumn(endLine);
              
              editor.executeEdits('inline-chat-cleanup', [{
                range: new monaco.Range(startLine, startColumn, endLine, endLineColumn),
                text: '',
                forceMoveMarkers: true
              }]);
            }
          }
        }
        
        // 閲嶇疆鍘熷琛屾暟璁板綍锛屼互渚块噸鏂扮敓鎴愭椂閲嶆柊璁板綍
        originalLineCountRef.current = null;
      }
    }
  }, []);

  // 鏍囩椤靛垏鎹㈡椂锛屾仮澶嶅搴旀爣绛鹃〉鐨勫唴鑱旇亰澶╋紝骞舵竻鐞嗕箣鍓嶇殑 diff
  useEffect(() => {
    if (!tabId || !editorRef.current) {
      return;
    }

    // 娓呯悊涔嬪墠鏍囩椤电殑 diff 鍐呭鍜岀┖琛岋紙濡傛灉瀛樺湪锟?
    cleanupPreviousDiff();

    // 妫€鏌ユ槸鍚︽湁璇ユ爣绛鹃〉鐨勫唴鑱旇亰澶╁疄锟?
    const existingInstance = AIZoneWidget.getInstanceByTabId(tabId);
    if (existingInstance) {
      // 濡傛灉瀹炰緥瀛樺湪锛岀洿鎺ヤ娇鐢紙涓嶉渶瑕侀噸鏂拌皟锟?show()锛屽洜涓烘爣绛鹃〉鍒囨崲鏃讹紝鍐呰仈鑱婂ぉ浼氳嚜鍔ㄦ樉绀猴級
      // show() 鏂规硶浼氶噸鏂板垱锟?DOM锛屽鑷撮棯锟?
      aiZoneWidgetRef.current = existingInstance;
      
      // 褰撴爣绛鹃〉鍒囨崲鍥炴潵鏃讹紝寤惰繜瑙﹀彂甯冨眬鎭㈠锛岀‘淇濇爣绛鹃〉宸茬粡瀹屽叏婵€锟?
      // 浣跨敤寤惰繜纭繚 React 宸茬粡瀹屾垚鏍囩椤电殑鏄剧ず/闅愯棌鎿嶄綔
      // 甯冨眬鎭㈠锟?onDidLayoutChange 涓殑 wasHidden 閫昏緫澶勭悊
      // 杩欓噷鍙渶瑕佺‘淇濆疄渚嬭姝ｇ‘寮曠敤鍗冲彲
    }
  }, [tabId]); // cleanupPreviousDiff 娌℃湁渚濊禆椤癸紝寮曠敤绋冲畾锛屼笉闇€瑕佹斁鍦ㄤ緷璧栭」锟?

  /**
   * 鍒濆锟?diff 鏄剧ず
   * 杩欐槸涓€涓€氱敤鍑芥暟锛岀敤浜庡垱锟?GhostTextWidget 骞跺噯澶囨樉锟?diff 鍐呭
   * @returns 杩斿洖鍖呭惈 ghostWidget 锟?zoneBottomLine 鐨勫锟?
   */
  const initializeDiffDisplay = useCallback(() => {
    if (!editorRef.current) {
      console.error('[MonacoEditor] editorRef.current 涓虹┖锛屾棤娉曞垵濮嬪寲 diff 鏄剧ず');
      return null;
    }

    const editor = editorRef.current;
    const position = editor.getPosition();
    if (!position) {
      console.error('[MonacoEditor] failed to get editor position');
      return null;
    }

    // 鑾峰彇 AIZoneWidget 搴曢儴杈规鐨勮锟?
    let zoneBottomLine = aiZoneWidgetRef.current?.getZoneBottomLineNumber() || position.lineNumber;
    
    // 纭繚琛屽彿鏈夋晥锛堣嚦灏戜负 1锟?
    if (zoneBottomLine < 1) {
      console.warn('[InlineChat] zoneBottomLine 鏃犳晥:', zoneBottomLine, '浣跨敤鍏夋爣浣嶇疆:', position.lineNumber);
      zoneBottomLine = Math.max(1, position.lineNumber);
    }
    
    monacoDebugLog('[InlineChat] Zone 搴曢儴琛屽彿:', zoneBottomLine, '鍘熷鍏夋爣琛屽彿:', position.lineNumber);
    
    // 纭繚鐩爣琛屽瓨鍦紝濡傛灉涓嶅瓨鍦ㄥ垯鍏堟彃鍏ョ┖锟?
    const model = editor.getModel();
    if (model) {
      const totalLines = model.getLineCount();
      // 璁板綍鎻掑叆绌鸿鍓嶇殑鍘熷琛屾暟
      originalLineCountRef.current = totalLines;
      monacoDebugLog('[InlineChat] 鏂囨。鎬昏锟?', totalLines, '鐩爣琛屽彿:', zoneBottomLine);
      
      if (zoneBottomLine > totalLines) {
        // 鍦ㄦ枃妗ｆ湯灏炬彃鍏ョ┖琛岋紝浣跨洰鏍囪鍙锋湁锟?
        const lastLine = model.getLineMaxColumn(totalLines);
        editor.executeEdits('inline-chat-prepare', [{
          range: new monaco.Range(totalLines, lastLine, totalLines, lastLine),
          text: '\n'.repeat(zoneBottomLine - totalLines),
          forceMoveMarkers: true
        }]);
        monacoDebugLog('[InlineChat] inserted blank lines:', zoneBottomLine - totalLines);
      }
    }
    
    // 鍐嶆纭繚娓呴櫎涔嬪墠锟?Ghost Text Widget锛堝鏋滃瓨鍦紝鍙岄噸淇濋櫓锟?
    if (currentGhostWidgetRef.current) {
      monacoDebugLog('[InlineChat] 鍐嶆娓呴櫎涓婁竴娆＄殑 diff 棰勮锛堝弻閲嶄繚闄╋級');
      currentGhostWidgetRef.current.dispose();
      currentGhostWidgetRef.current = null;
    }
    
    // 鍒涘缓鏂扮殑 Ghost Text Widget 鐢ㄤ簬鏄剧ず diff 鏁堟灉锛堜粠搴曢儴杈规涓嬩竴琛屽紑濮嬶級
    const ghostWidget = new GhostTextWidget(editor, {
      onAccept: (text: string) => {
        monacoDebugLog('[InlineChat] 鐢ㄦ埛鎺ュ彈浜嗕唬锟?', text.substring(0, 50));
        // 浠ｇ爜宸茬粡琚彃鍏ワ紝娓呯悊 widget
        ghostWidget.dispose();
        currentGhostWidgetRef.current = null;
        // 鐢ㄦ埛鎺ュ彈浜嗕唬鐮侊紝閲嶇疆鍘熷琛屾暟璁板綍锛堝洜涓轰唬鐮佸凡缁忚鎻掑叆锛屼笉闇€瑕佹竻闄わ級
        originalLineCountRef.current = null;
      },
      onReject: () => {
        monacoDebugLog('[InlineChat] user rejected generated code');
        ghostWidget.dispose();
        currentGhostWidgetRef.current = null;
        // 鐢ㄦ埛鎷掔粷浜嗕唬鐮侊紝淇濇寔鍘熷琛屾暟璁板綍锛屼互渚垮湪鍏抽棴鏃舵竻闄ょ┖锟?
      }
    });
    
    // 淇濆瓨锟?ref 锟?
    currentGhostWidgetRef.current = ghostWidget;
    
    return {
      ghostWidget,
      zoneBottomLine
    };
  }, []);

  // 澶勭悊鍐呰仈鑱婂ぉ娑堟伅鍙戯拷?
  const handleSendInlineChatMessage = useCallback(async (
    message: string, 
    includeSelection: boolean, 
    selectedModel?: string
  ) => {
    // 娓呴櫎涔嬪墠锟?diff 鍐呭鍜岀┖锟?
    cleanupPreviousDiff();
    
    monacoDebugLog('[MonacoEditor] handleSendInlineChatMessage 琚皟锟? message:', message, 'selectedModel:', selectedModel);
    if (!editorRef.current) {
      console.error('[MonacoEditor] editorRef.current is null, cannot send message');
      return;
    }

    // 濡傛灉宸叉湁姝ｅ湪杩涜鐨勮姹傦紝鍏堝彇娑堝畠
    if (abortControllerRef.current) {
      monacoDebugLog('[MonacoEditor] abort previous request');
      abortControllerRef.current.abort();
    }

    // 鍒涘缓鏂扮殑 AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const editor = editorRef.current;
    const position = editor.getPosition();
    if (!position) return;

    // 瑙勮寖鍖栫敤鎴疯緭鍏ワ紝绉婚櫎 @file 寮曠敤鍗犱綅锟?
    let sanitizedMessage = message.replace(/@file:[^\s]+/g, '').trim();
    

    // 妫€锟?@鐭ヨ瘑锟?璇硶锛堟敮锟?@鐭ヨ瘑搴撳悕锟?锟?@鐭ヨ瘑搴揑D锟?
    const knowledgeBaseMentions: Array<{ id: string; name: string; mention: string }> = [];
    
    // 棣栧厛锛屼粠宸ュ叿鏍忛€夋嫨鐨勭煡璇嗗簱涓幏鍙栵紙浼樺厛绾ф渶楂橈級
    if (aiZoneWidgetRef.current) {
      const selectedFiles = aiZoneWidgetRef.current.getSelectedFiles();
      const knowledgeBaseItems = selectedFiles.filter(file => file.type === 'knowledge-base' && file.kbId);
      
      for (const item of knowledgeBaseItems) {
        if (item.kbId) {
          try {
            const kb = await knowledgeBaseService.findItem(item.kbId);
            if (kb && kb.type === 'folder') {
              // 妫€鏌ユ槸鍚﹀凡缁忔坊鍔犺繃锛堥伩鍏嶉噸澶嶏級
              if (!knowledgeBaseMentions.find(kb => kb.id === item.kbId)) {
                knowledgeBaseMentions.push({
                  id: kb.id,
                  name: kb.title,
                  mention: `@${kb.title}`
                });
                monacoDebugLog(`[InlineChat] 浠庡伐鍏锋爮妫€娴嬪埌鐭ヨ瘑锟? ${kb.title} (${kb.id})`);
              }
            }
          } catch (error) {
            console.warn(`[InlineChat] 浠庡伐鍏锋爮鑾峰彇鐭ヨ瘑搴撳け锟? ${item.kbId}`, error);
          }
        }
      }
    }
    
    // 鐒跺悗锛屼粠杈撳叆妗嗘枃鏈腑妫€锟?@鐭ヨ瘑锟?寮曠敤
    const knowledgeBaseMentionRegex = /@([^\s@]+)/g;
    let match: RegExpExecArray | null;
    
    while ((match = knowledgeBaseMentionRegex.exec(message)) !== null) {
      const mention = match[1];
      // 璺宠繃 @file: 鏍煎紡
      if (mention.startsWith('file:')) {
        continue;
      }
      
      // 灏濊瘯閫氳繃鍚嶇О鎴朓D鏌ユ壘鐭ヨ瘑锟?
      try {
        const knowledgeBases = await knowledgeBaseService.loadFromStorage();
        let foundKnowledgeBase: { id: string; name: string } | null = null;
        
        // 鍏堝皾璇曢€氳繃ID鏌ユ壘锛堝鏋渕ention鏄疘D鏍煎紡锛屽 kb_xxx锟?
        if (mention.startsWith('kb_')) {
          const kb = await knowledgeBaseService.findItem(mention);
          if (kb && kb.type === 'folder') {
            foundKnowledgeBase = { id: kb.id, name: kb.title };
          }
        }
        
        // 濡傛灉娌℃壘鍒帮紝灏濊瘯閫氳繃鍚嶇О鏌ユ壘
        if (!foundKnowledgeBase) {
          for (const kb of knowledgeBases.created) {
            if (kb.type === 'folder' && (kb.title === mention || kb.id === mention)) {
              foundKnowledgeBase = { id: kb.id, name: kb.title };
              break;
            }
          }
        }
        
        if (foundKnowledgeBase) {
          // 妫€鏌ユ槸鍚﹀凡缁忔坊鍔犺繃锛堥伩鍏嶉噸澶嶏級
          if (!knowledgeBaseMentions.find(kb => kb.id === foundKnowledgeBase!.id)) {
            knowledgeBaseMentions.push({
              id: foundKnowledgeBase.id,
              name: foundKnowledgeBase.name,
              mention: `@${mention}`
            });
            monacoDebugLog(`[InlineChat] 浠庤緭鍏ユ鏂囨湰妫€娴嬪埌鐭ヨ瘑锟? ${foundKnowledgeBase.name} (${foundKnowledgeBase.id})`);
          }
        }
      } catch (error) {
        console.warn(`[InlineChat] 鏌ユ壘鐭ヨ瘑搴撳け锟? ${mention}`, error);
      }
    }

    // 绉婚櫎 @鐭ヨ瘑锟?寮曠敤鍗犱綅绗︼紙鍙Щ闄ゅ畬鏁寸殑 @mention 鏍煎紡锛屼繚鐣欏叾浠栧唴瀹癸級
    knowledgeBaseMentions.forEach(({ mention }) => {
      // 浣跨敤鍗曡瘝杈圭晫纭繚鍙尮閰嶅畬鏁寸殑 @mention
      const escapedMention = mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      sanitizedMessage = sanitizedMessage.replace(new RegExp(`\\s*${escapedMention}\\s*`, 'g'), ' ').trim();
    });

    // 鑾峰彇閫変腑鐨勬枃鏈紙濡傛灉闇€瑕佸寘鍚級
    let selectedText = '';
    if (includeSelection) {
      // 浼樺厛锟?AIZoneWidget 鑾峰彇閫変腑鏂囨湰锛堝洜涓哄彲鑳藉凡缁忔竻闄や簡缂栬緫鍣ㄤ腑鐨勯€変腑鐘舵€侊級
      if (aiZoneWidgetRef.current) {
        const widgetSelectedText = (aiZoneWidgetRef.current as any).selectedText;
        if (widgetSelectedText) {
          selectedText = widgetSelectedText;
          monacoDebugLog('[MonacoEditor] 锟?AIZoneWidget 鑾峰彇閫変腑鏂囨湰:', selectedText);
        }
      }
      
      // 濡傛灉 AIZoneWidget 涓病鏈夛紝灏濊瘯浠庣紪杈戝櫒鑾峰彇
      if (!selectedText) {
        const selection = editor.getSelection();
        if (selection && !selection.isEmpty()) {
          selectedText = editor.getModel()?.getValueInRange(selection) || '';
          monacoDebugLog('[MonacoEditor] 浠庣紪杈戝櫒鑾峰彇閫変腑鏂囨湰:', selectedText);
        }
      }
    }

    try {
      // 浣跨敤閫変腑鐨勬ā鍨嬫垨榛樿妯″瀷
      const modelToUse = selectedModel || availableModels[0] || 'OpenAI:gpt-4o';
      
      monacoDebugLog('[InlineChat] 鍙戦€佹秷鎭埌妯″瀷:', modelToUse);

      // 鑾峰彇妯″瀷閰嶇疆
      const modelConfig = await getModelConfig(modelToUse);
      if (!modelConfig) {
        throw new Error(`鏈壘鍒版ā鍨嬮厤缃細${modelToUse}`);
      }

      monacoDebugLog('[InlineChat] 浣跨敤閰嶇疆:', modelConfig.configName);

      // 鎻愬彇瀹為檯鐨勬ā鍨婭D锛堝幓鎺夋彁渚涘晢鍓嶇紑锟?
      const [providerId, actualModelId] = modelToUse.split(':');
      
      monacoDebugLog('[InlineChat] 鎻愪緵锟?', providerId, '妯″瀷:', actualModelId);

      // 鑾峰彇妯″瀷鐨勮緭鍏oken闄愬埗
      const modelInputTokenLimit = getModelInputTokenLimit(providerId, actualModelId);
      monacoDebugLog('[InlineChat] 妯″瀷杈撳叆token闄愬埗:', modelInputTokenLimit);

      // 1. 鏂囦欢鍚戦噺妫€绱細鑾峰彇鏂囦欢宸ュ叿鏍忕殑鎵€鏈夋枃浠讹紝杩涜鍚戦噺鎼滅储
      let ragChunks: Array<{ text: string; embedding: number[]; metadata: { filePath: string; fileName: string; chunkIndex: number; totalChunks: number } }> = [];
      let fileContents: Array<{ path: string; name: string; content: string }> = [];
      // 鏂囦欢鍚戦噺鎼滅储缁撴灉
      let fileVectorSearchResults: Array<{
        filePath: string;
        fileName: string;
        results: Array<{
          id: string;
          text: string;
          metadata: Record<string, unknown>;
          score: number;
        }>;
      }> = [];
      
      // 鏈€灏忔枃浠跺ぇ灏忛槇鍊硷紙2KB锛夛紝灏忎簬姝ゅぇ灏忕殑鏂囦欢鐩存帴璇诲彇鍏ㄦ枃
      const MIN_FILE_SIZE_FOR_VECTOR = 2 * 1024;
      
      if (aiZoneWidgetRef.current) {
        const selectedFiles = aiZoneWidgetRef.current.getSelectedFiles();
        monacoDebugLog('[InlineChat] getSelectedFiles() 杩斿洖:', selectedFiles);
        
        // 杩囨护鍑烘枃浠剁被鍨嬬殑椤癸紙鎺掗櫎鐭ヨ瘑搴擄級
        const fileItems = selectedFiles.filter(file => !file.type || file.type === 'file');
        monacoDebugLog('[InlineChat] 杩囨护鍚庣殑鏂囦欢锟?', fileItems);
        
        if (fileItems.length > 0) {
          // 鍒嗙澶ф枃浠讹紙甯︾紦瀛樺唴瀹癸級
          const largeFiles: Array<{ path: string; name: string; type?: string; kbId?: string; content: string }> = [];
          
          for (const file of fileItems) {
            try {
              // 璇诲彇鏂囦欢鍐呭鏉ュ垽鏂ぇ锟?
              const content = await window.electronAPI?.fs?.readFile?.(file.path, 'utf-8');
              if (!content) {
                console.warn(`[InlineChat] 鏂囦欢鍐呭涓虹┖: ${file.path}`);
                continue;
              }
              
              const fileSize = new Blob([content]).size;
              monacoDebugLog(`[InlineChat] 鏂囦欢 "${file.name}" 澶у皬: ${fileSize} bytes`);
              
              if (fileSize >= MIN_FILE_SIZE_FOR_VECTOR) {
                largeFiles.push({ ...file, content }); // 淇濆瓨鍐呭锛岄伩鍏嶉噸澶嶈锟?
              } else {
                // 灏忔枃浠剁洿鎺ユ坊鍔犲埌 fileContents
                fileContents.push({
                  path: file.path,
                  name: file.name,
                  content: content
                });
                monacoDebugLog(`[InlineChat] small file "${file.name}" uses full content directly, length: ${content.length}`);
              }
            } catch (readError) {
              console.warn(`[InlineChat] 璇诲彇鏂囦欢澶辫触: ${file.path}`, readError);
            }
          }
          
          monacoDebugLog(`[InlineChat] large files (>= 2KB): ${largeFiles.length}, small files added directly: ${fileContents.length}`);
          
          // 澶勭悊澶ф枃浠讹細杩涜鍚戦噺鎼滅储
          if (largeFiles.length > 0) {
            try {
              // 鐢熸垚鏌ヨ鍚戦噺锛堜娇鐢ㄤ簯锟?Embedding API锟?
              const query = sanitizedMessage.trim() || '请基于文件内容回答问题';
              const queryResult = await window.electron?.cloudEmbedding?.generate(query);
              
              if (!queryResult?.success || !queryResult.data?.vectors?.[0]) {
                console.warn('[InlineChat] cloud embedding query failed, fallback to full text');
                // 鍥為€€鍒拌鍙栧叏锟?
                for (const file of largeFiles) {
                  try {
                    const content = await window.electron?.ipcRenderer?.invoke('file:read', file.path);
                    if (content?.success && content.data?.content) {
                      fileContents.push({
                        path: file.path,
                        name: file.name,
                        content: content.data.content
                      });
                    }
                  } catch {
                    console.warn(`[InlineChat] 璇诲彇鏂囦欢澶辫触: ${file.name}`);
                  }
                }
              } else {
                const queryEmbedding = queryResult.data.vectors[0];
                monacoDebugLog('[InlineChat] 鏌ヨ鍚戦噺鐢熸垚瀹屾垚锛岀淮锟?', queryEmbedding.length);
              
                // 瀵规瘡涓ぇ鏂囦欢杩涜鍚戦噺鎼滅储
                for (const file of largeFiles) {
                  try {
                    monacoDebugLog(`[InlineChat] 鍚戦噺鎼滅储鏂囦欢: ${file.name}`);
                    
                    // 妫€鏌ユ枃浠舵槸鍚﹀凡绱㈠紩
                    const isIndexedResponse = await window.electron?.ipcRenderer.invoke(
                      'workspace-index-db:is-file-indexed',
                      file.path
                    );
                    const isIndexed = isIndexedResponse?.success && isIndexedResponse?.data;
                    
                    // 濡傛灉鏂囦欢鏈储寮曪紝瑙﹀彂浼樺厛绱㈠紩
                    if (!isIndexed) {
                      monacoDebugLog(`[InlineChat] 鏂囦欢 "${file.name}" 鏈储寮曪紝瑙﹀彂浼樺厛绱㈠紩...`);
                      
                      // 鏄剧ず浼樺厛绱㈠紩鐘讹拷?
                      aiZoneWidgetRef.current?.updateThinkingText('姝ｅ湪浼樺厛瑙ｆ瀽鏂囨。缁撴瀯');
                      
                      // 璋冪敤浼樺厛绱㈠紩 API
                      const indexResponse = await window.electron?.ipcRenderer.invoke(
                        'workspace-index-db:priority-index-file',
                        file.path
                      );
                      
                      if (!indexResponse?.success) {
                        console.warn(`[InlineChat] priority index failed: ${file.name}, fallback to full text`);
                        // 绱㈠紩澶辫触锛屼娇鐢ㄧ紦瀛樼殑鍏ㄦ枃鍐呭
                        fileContents.push({
                          path: file.path,
                          name: file.name,
                          content: file.content
                        });
                        // 鎭㈠鎬濊€冪姸锟?
                        aiZoneWidgetRef.current?.updateThinkingText('锟斤拷锟剿硷拷锟斤拷锟?..');
                        continue;
                      }
                      
                      monacoDebugLog(`[InlineChat] 鏂囦欢 "${file.name}" 浼樺厛绱㈠紩瀹屾垚`);
                      // 鎭㈠鎬濊€冪姸锟?
                      aiZoneWidgetRef.current?.updateThinkingText('锟斤拷锟剿硷拷锟斤拷锟?..');
                    }
                    
                    // 璋冪敤涓昏繘绋嬬殑鍚戦噺鎼滅储 API锛堜娇锟?source 瀛楁杩涜甯︽潯浠舵悳绱級
                    const searchResponse = await window.electron?.ipcRenderer.invoke(
                      'workspace-index-db:search-by-file-path',
                      file.path,
                      queryEmbedding,
                      3 // topK: 姣忎釜鏂囦欢杩斿洖锟?涓浉鍏崇埗锟?
                    );
                    
                    if (!searchResponse?.success) {
                      console.warn(`[InlineChat] 鍚戦噺鎼滅储澶辫触: ${searchResponse?.error || '鏈煡閿欒'}`);
                    }
                    
                    const searchResults = searchResponse?.success ? searchResponse.data : null;
                    
                    monacoDebugLog(`[InlineChat] 鍚戦噺鎼滅储缁撴灉:`, {
                      success: searchResponse?.success,
                      resultsCount: searchResults?.length || 0
                    });
                    
                    if (searchResults && searchResults.length > 0) {
                      // 锟?SearchResult 杞崲锟?fileVectorSearchResults 鏈熸湜鐨勬牸锟?
                      const transformedResults = searchResults.map((r: { parentId: string; parentContent: string; childContent: string; filePath: string; score: number }) => ({
                        id: r.parentId,
                        text: r.parentContent, // 浣跨敤鐖跺潡鍐呭浣滀负鍙傝€冩枃锟?
                        metadata: { filePath: r.filePath, childContent: r.childContent },
                        score: r.score
                      }));
                      
                      fileVectorSearchResults.push({
                        filePath: file.path,
                        fileName: file.name,
                        results: transformedResults
                      });
                      monacoDebugLog(`[InlineChat] 文件 "${file.name}" 搜索到 ${searchResults.length} 个相关父块`);
                    } else {
                      // 鍚戦噺鎼滅储鏃犵粨鏋滐紝灏濊瘯鑾峰彇鐖跺潡鍐呭锛堝凡鍒囧垎浣嗘湭鍚戦噺鍖栫殑鎯呭喌锟?
                      monacoDebugLog(`[InlineChat] file "${file.name}" has no vector search result, fallback to parent blocks: ${file.path}`);
                      
                      const parentsResponse = await window.electron?.ipcRenderer.invoke(
                        'workspace-index-db:get-parents-by-file',
                        file.path
                      );
                      monacoDebugLog('[InlineChat] parent block query result:', parentsResponse);
                      
                      if (parentsResponse?.success && parentsResponse.data?.length > 0) {
                        // 鏈夌埗鍧楁暟鎹紝浣跨敤鐖跺潡鍐呭锛堝凡鍒囧垎浣嗘湭鍚戦噺鍖栵級
                        const parents = parentsResponse.data as Array<{ parentId: string; content: string; chunkIndex: number }>;
                        monacoDebugLog(`[InlineChat] file "${file.name}" found ${parents.length} parent blocks, using parent block content`);
                        
                        // 灏嗙埗鍧楀唴瀹逛綔涓烘悳绱㈢粨鏋滐紙锟?chunkIndex 鎺掑簭锛屽彇锟?涓級
                        const sortedParents = parents.sort((a, b) => a.chunkIndex - b.chunkIndex).slice(0, 3);
                        const transformedResults = sortedParents.map((p) => ({
                          id: p.parentId,
                          text: p.content,
                          metadata: { filePath: file.path },
                          score: 1 - p.chunkIndex * 0.1 // 鎸夐『搴忕粰鍒嗘暟
                        }));
                        
                        fileVectorSearchResults.push({
                          filePath: file.path,
                          fileName: file.name,
                          results: transformedResults
                        });
                      } else {
                        // 娌℃湁鐖跺潡鏁版嵁锛屽洖閫€鍒拌鍙栧叏锟?
                        monacoDebugLog(`[InlineChat] file "${file.name}" has no parent block data, fallback to full text`);
                        const content = await window.electronAPI?.fs?.readFile?.(file.path, 'utf-8');
                        if (content) {
                          fileContents.push({
                            path: file.path,
                            name: file.name,
                            content: content
                          });
                        }
                      }
                    }
                  } catch (error) {
                    console.warn(`[InlineChat] 鍚戦噺鎼滅储鏂囦欢澶辫触: ${file.path}`, error);
                    // 鎼滅储澶辫触鏃跺洖閫€鍒拌鍙栧叏锟?
                    try {
                      const content = await window.electronAPI?.fs?.readFile?.(file.path, 'utf-8');
                      if (content) {
                        fileContents.push({
                          path: file.path,
                          name: file.name,
                          content: content
                        });
                      }
                    } catch (readError) {
                      console.warn(`[InlineChat] fallback file read also failed: ${file.path}`, readError);
                    }
                  }
                }
                
                monacoDebugLog(`[InlineChat] 文件向量搜索完成: ${fileVectorSearchResults.length} 个文件有结果, ${fileContents.length} 个文件使用全文`);
              }
            } catch (error) {
              console.error('[InlineChat] 鏂囦欢鍚戦噺鎼滅储澶辫触锛屽洖閫€鍒拌鍙栧叏锟?', error);
              // 鍚戦噺鎼滅储鏁翠綋澶辫触鏃讹紝鍥為€€鍒拌鍙栨墍鏈夊ぇ鏂囦欢鍏ㄦ枃
              for (const file of largeFiles) {
                fileContents.push({
                  path: file.path,
                  name: file.name,
                  content: file.content
                });
              }
            }
          }
        }
      }

      // 璁剧疆AI Provider
      await aiService.setProvider(modelConfig.providerId, {
        id: modelConfig.id || 'default',
        name: modelConfig.name || modelConfig.configName,
        apiKey: modelConfig.apiKey,
        apiEndpoint: modelConfig.apiEndpoint,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        modelId: actualModelId
      });

      // 姝ラ2锛氬悜閲忔锟?- 瀵规瘡涓煡璇嗗簱杩涜鍚戦噺鎼滅储
      let vectorSearchResults: Array<{
        knowledgeBaseId: string;
        knowledgeBaseName: string;
        results: Array<{
          id: string;
          text: string;
          metadata: {
            filePath?: string;
            fileName?: string;
            fileType?: string;
            chunkIndex?: number;
            totalChunks?: number;
            [key: string]: unknown;
          };
          score: number;
        }>;
      }> = [];

      if (knowledgeBaseMentions.length > 0) {
        monacoDebugLog(`[InlineChat] 妫€娴嬪埌鐭ヨ瘑搴撳紩锟? ${knowledgeBaseMentions.map(kb => kb.name).join(', ')}`);
        monacoDebugLog(`[InlineChat] 寮€濮嬪悜閲忔锟?..`);

        try {
          // 鍒濆锟?VectorStore
          const vectorStore = new VectorStore();
          await vectorStore.initialize();

          // 骞惰妫€绱㈡墍鏈夌煡璇嗗簱
          const searchPromises = knowledgeBaseMentions.map(async (kb) => {
            try {
              // 鑾峰彇鐭ヨ瘑搴撻厤锟?
              const kbItem = await knowledgeBaseService.findItem(kb.id);
              if (!kbItem || kbItem.type !== 'folder') {
                console.warn(`[InlineChat] 鐭ヨ瘑搴撲笉瀛樺湪鎴栫被鍨嬩笉姝ｇ‘: ${kb.id}`);
                return null;
              }

              monacoDebugLog(`[InlineChat] 浣跨敤浜戠 Embedding API (鐭ヨ瘑锟? ${kb.name})`);

              // 鎵ц鍚戦噺妫€锟?
              // 浣跨敤 sanitizedMessage 浣滀负鏌ヨ锛堝凡绉婚櫎鐭ヨ瘑搴撳紩鐢級
              const query = sanitizedMessage.trim() || '璇峰熀浜庣煡璇嗗簱鍐呭鍥炵瓟闂';
              
              // 鐢熸垚鏌ヨ鍚戦噺锛堜娇鐢ㄤ簯锟?Embedding API锛屼笌绱㈠紩鏃朵繚鎸佷竴鑷达級
              const queryResult = await window.electron?.cloudEmbedding?.generate(query);
              
              if (!queryResult?.success || !queryResult.data?.vectors?.[0]) {
                console.warn(`[InlineChat] 浜戠鏌ヨ鍚戦噺鐢熸垚澶辫触 (鐭ヨ瘑锟? ${kb.name})`);
                return {
                  knowledgeBaseId: kb.id,
                  knowledgeBaseName: kb.name,
                  results: [],
                };
              }
              
              const queryEmbedding = queryResult.data.vectors[0];
              monacoDebugLog(`[InlineChat] 鐭ヨ瘑锟?"${kb.name}" 鏌ヨ鍚戦噺鐢熸垚瀹屾垚锛岀淮锟? ${queryEmbedding.length}`);
              
              // 鎼滅储鍚戦噺瀛樺偍
              const results = await vectorStore.search(query, queryEmbedding, {
                topK: 5, // 姣忎釜鐭ヨ瘑搴撹繑鍥炲墠5涓粨锟?
                filterMetadata: {
                  knowledgeBaseId: kb.id, // 杩囨护鏉′欢锛氬彧妫€绱㈣鐭ヨ瘑搴撶殑鍐呭
                },
              });

              monacoDebugLog(`[InlineChat] 知识库 "${kb.name}" 检索到 ${results.length} 个结果`);

              return {
                knowledgeBaseId: kb.id,
                knowledgeBaseName: kb.name,
                results: results,
              };
            } catch (error) {
              console.error(`[InlineChat] 妫€绱㈢煡璇嗗簱 "${kb.name}" 澶辫触:`, error);
              // 杩斿洖绌虹粨鏋滐紝涓嶄腑鏂叾浠栫煡璇嗗簱鐨勬锟?
              return {
                knowledgeBaseId: kb.id,
                knowledgeBaseName: kb.name,
                results: [],
              };
            }
          });

          // 绛夊緟鎵€鏈夋绱㈠畬锟?
          const searchResults = await Promise.all(searchPromises);
          vectorSearchResults = searchResults.filter((result): result is NonNullable<typeof result> => result !== null);

          monacoDebugLog(`[InlineChat] 鍚戦噺妫€绱㈠畬鎴愶紝鍏辨锟?${vectorSearchResults.length} 涓煡璇嗗簱`);

          // 鍏抽棴 VectorStore
          await vectorStore.close();
        } catch (error) {
          console.error('[InlineChat] 鍚戦噺妫€绱㈠け锟?', error);
          // 缁х画鎵ц锛屼笉浣跨敤妫€绱㈢粨锟?
          vectorSearchResults = [];
        }
      }

      // 妫€鏌ユ槸鍚︽槸妯″瀷鍒ゆ柇闂锛堝湪鏋勫缓 prompt 涔嬪墠妫€鏌ワ級
      const isModelQuestion = /(你是谁|你是什么模型|你是什么AI|你是什么助手|什么模型|什么AI|介绍一下你自己)/i.test(sanitizedMessage);

      if (isModelQuestion) {
        // 鐗规畩鍥炵瓟閫昏緫 - 蹇呴』浣跨敤鎸囧畾鐨勭瓟锟?
        const specialAnswer = '我是当前编辑器内的 AI 助手，可以帮助你分析代码、解释问题、修改内容，并结合当前工作区上下文提供支持。';
        
        // 鏄剧ず鐗规畩鍥炵瓟
        if (aiZoneWidgetRef.current) {
          aiZoneWidgetRef.current.appendMessage('assistant', specialAnswer);
        }
        return;
      }

      // 鍑嗗鑱婂ぉ鍘嗗彶锛氬紩鐢ㄥ唴鑱旈潰鏉夸腑鐨勫杞锟?
      const existingHistory = aiZoneWidgetRef.current?.getChatHistory() ?? [];
      const chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = existingHistory.map((historyMessage) => ({
        role: historyMessage.role,
        content: historyMessage.content
      }));

      // 鏋勫缓鐢ㄦ埛娑堟伅鍐呭
      // 鏍煎紡锛氬弬鑰冩枃妗ｏ細\n...\n鐢ㄦ埛闂锛歺xxx
      let referenceDocuments = '';
      let documentIndex = 1;

      // 姝ラ3锛氭坊鍔犲悜閲忔绱㈢粨鏋滃埌鍙傝€冩枃锟?
      if (vectorSearchResults.length > 0) {
        const hasResults = vectorSearchResults.some(kb => kb.results.length > 0);
        
        if (hasResults) {
          // 璁＄畻妫€绱㈢粨鏋滅殑鏈€锟?token 鏁帮紙棰勭暀绌洪棿缁欏叾浠栧唴瀹癸級
          const reservedTokens = 4000;
          const maxSearchResultTokens = Math.max(2000, modelInputTokenLimit - reservedTokens);
          let currentSearchResultTokens = 0;

          // 閬嶅巻姣忎釜鐭ヨ瘑搴撶殑妫€绱㈢粨锟?
          for (const kbResult of vectorSearchResults) {
            if (kbResult.results.length === 0) {
              continue;
            }

            // 鎸夌浉浼煎害鍒嗘暟鎺掑簭锛堜粠楂樺埌浣庯級
            const sortedResults = [...kbResult.results].sort((a, b) => b.score - a.score);

            // 娣诲姞姣忎釜妫€绱㈢粨锟?
            for (const result of sortedResults) {
              const fileName = result.metadata.fileName || result.metadata.filePath || '鏈煡鏂囦欢';
              
              // 鏍煎紡锛歔鏂囦欢鍚峕\n鍐呭锛堜究浜庡ぇ妯″瀷寮曠敤鏃舵樉绀烘枃浠跺悕锟?
              const docContent = `[${fileName}]\n${result.text}\n`;
              const docTokens = estimateTokens(docContent);

              if (currentSearchResultTokens + docTokens > maxSearchResultTokens) {
                console.warn(`[InlineChat] 妫€绱㈢粨锟?token 鏁板凡杈鹃檺鍒讹紝鍋滄娣诲姞鏇村缁撴灉`);
                break;
              }

              referenceDocuments += docContent + '\n';
              currentSearchResultTokens += docTokens;
              documentIndex++;
            }
          }

          monacoDebugLog(`[InlineChat] search result tokens: ${currentSearchResultTokens}/${maxSearchResultTokens}`);
        } else {
          console.warn('[InlineChat] all knowledge base search results are empty');
        }
      }

      // 姝ラ4锛氭坊鍔犳枃浠跺悜閲忔悳绱㈢粨鏋滃埌鍙傝€冩枃锟?
      if (fileVectorSearchResults.length > 0) {
        monacoDebugLog(`[InlineChat] append ${fileVectorSearchResults.length} file vector search results`);
        
        // 璁＄畻鏂囦欢鎼滅储缁撴灉鐨勬渶锟?token 锟?
        const reservedTokens = 4000;
        const maxFileSearchTokens = Math.max(2000, modelInputTokenLimit - reservedTokens);
        let currentFileSearchTokens = 0;
        
        for (const fileResult of fileVectorSearchResults) {
          if (fileResult.results.length === 0) continue;
          
          // 鎸夌浉浼煎害鍒嗘暟鎺掑簭锛堜粠楂樺埌浣庯級
          const sortedResults = [...fileResult.results].sort((a, b) => b.score - a.score);
          
          for (const result of sortedResults) {
            // 鏍煎紡锛歔鏂囦欢鍚峕\n鍐呭锛堜究浜庡ぇ妯″瀷寮曠敤鏃舵樉绀烘枃浠跺悕锟?
            const docContent = `[${fileResult.fileName}]\n${result.text}\n`;
            const docTokens = estimateTokens(docContent);
            
            if (currentFileSearchTokens + docTokens > maxFileSearchTokens) {
              console.warn(`[InlineChat] 鏂囦欢鎼滅储缁撴灉 token 鏁板凡杈鹃檺鍒讹紝鍋滄娣诲姞鏇村缁撴灉`);
              break;
            }
            
            referenceDocuments += docContent + '\n';
            currentFileSearchTokens += docTokens;
            documentIndex++;
          }
        }
        
        monacoDebugLog(`[InlineChat] 鏂囦欢鎼滅储缁撴灉 token 锟? ${currentFileSearchTokens}/${maxFileSearchTokens}`);
      }

      // 娣诲姞鏂囦欢鍐呭鍒板弬鑰冩枃妗ｏ紙鍥為€€鏂规锛氭湭琚储寮曠殑鏂囦欢锟?
      if (ragChunks.length > 0) {
        const chunksByFile = ragChunks.reduce<Record<string, Array<typeof ragChunks[number]>>>((acc, chunk) => {
          const fileKey = chunk.metadata.filePath || chunk.metadata.fileName;
          if (!acc[fileKey]) {
            acc[fileKey] = [];
          }
          acc[fileKey].push(chunk);
          return acc;
        }, {});

        Object.values(chunksByFile).forEach((chunks) => {
          if (chunks.length === 0) {
            return;
          }
          const [{ metadata }] = chunks;
          const chunkTexts = chunks
            .map((chunk) => chunk.text)
            .join('\n\n');

          referenceDocuments += `[${metadata.fileName}]\n${chunkTexts}\n\n`;
          documentIndex++;
        });
      } else if (fileContents.length > 0) {
        // 鐩存帴浣跨敤鏂囦欢鍐呭锛堝洖閫€鏂规锛氬悜閲忔悳绱㈠け璐ユ垨鏂囦欢鏈绱㈠紩锟?
        monacoDebugLog(`[InlineChat] using full content of ${fileContents.length} files as fallback`);
        fileContents.forEach((file) => {
          referenceDocuments += `[${file.name}]\n${file.content}\n\n`;
          documentIndex++;
        });
      }

      // 娣诲姞閫変腑鐨勬枃鏈埌鍙傝€冩枃锟?
      if (selectedText) {
        referenceDocuments += `[閫変腑浠ｇ爜]\n\`\`\`${language}\n${selectedText}\n\`\`\`\n\n`;
        documentIndex++;
      }

      // 鏋勫缓鏈€缁堢殑鐢ㄦ埛娑堟伅
      let finalPrompt = '';
      
      if (referenceDocuments.trim()) {
        // 鏈夊弬鑰冩枃妗ｆ椂锛屼娇锟?RAG 鏍煎紡
        const userQuery = sanitizedMessage.trim() || '请基于上述文档内容回答问题。';
        // 鏍规嵁鏉ユ簮绫诲瀷閫夋嫨涓嶅悓鐨勬彁绀鸿
        const hasKnowledgeBase = vectorSearchResults.length > 0 && vectorSearchResults.some(kb => kb.results.length > 0);
        const hasFileReference = fileVectorSearchResults.length > 0 || fileContents.length > 0;
        
        let referenceLabel = '杩欐槸浣犻渶瑕佸弬鑰冪殑鏂囨。鐗囨';
        if (hasKnowledgeBase && !hasFileReference) {
          referenceLabel = '锟斤拷锟斤拷锟斤拷锟斤拷要锟轿匡拷锟斤拷知识锟斤拷片锟斤拷';
        } else if (hasFileReference && !hasKnowledgeBase) {
          referenceLabel = '杩欐槸浣犻渶瑕佸弬鑰冪殑鏂囦欢鐗囨';
        }
        
        finalPrompt = `${referenceLabel}：\n######################\n${referenceDocuments.trim()}\n######################\n\n用户的问题是：${userQuery}\n\n请根据以上文档内容回答用户的问题。`;
      } else {
        // 娌℃湁鍙傝€冩枃妗ｆ椂锛岀洿鎺ヤ娇鐢ㄧ敤鎴烽棶锟?
        finalPrompt = sanitizedMessage.trim();
      }

      // 灏嗗畬鏁寸殑 prompt 涓庡巻鍙叉暣鍚堬紝纭繚鏈€鍚庝竴鏉＄敤鎴锋秷鎭负褰撳墠闂
      if (finalPrompt.trim()) {
        if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user') {
          chatHistory[chatHistory.length - 1] = {
            role: 'user',
            content: finalPrompt
          };
        } else {
          chatHistory.push({
            role: 'user',
            content: finalPrompt
          });
        }
      }

      const modelDisplayName = modelConfig.displayName || formatModelDisplayName(modelToUse);
      const providerDisplayName = getProviderDisplayName(providerId, actualModelId);
      
      // 鍒ゆ柇鏄惁锟?RAG 涓婁笅鏂囷紙@鏂囦欢寮曠敤銆佺煡璇嗗簱寮曠敤銆佸悜閲忔绱㈢粨鏋溿€佸弬鑰冩枃妗ｏ級
      const hasRagContext = vectorSearchResults.length > 0 || 
                            fileVectorSearchResults.length > 0 ||
                            fileContents.length > 0 || 
                            ragChunks.length > 0 || 
                            knowledgeBaseMentions.length > 0 ||
                            referenceDocuments.trim().length > 0;
      
      monacoDebugLog('[InlineChat] RAG 涓婁笅鏂囨锟?', {
        vectorSearchResults: vectorSearchResults.length,
        fileVectorSearchResults: fileVectorSearchResults.length,
        fileContents: fileContents.length,
        ragChunks: ragChunks.length,
        knowledgeBaseMentions: knowledgeBaseMentions.length,
        referenceDocuments: referenceDocuments.trim().length > 0,
        hasRagContext
      });
      
      // 鏍规嵁鏄惁锟?RAG 涓婁笅鏂囬€夋嫨涓嶅悓锟?System Prompt锛堜粠 AI-Zone.md 鏂囦欢鍔ㄦ€佸姞杞斤級
      const systemMessage = await getAIZoneSystemPromptAsync(hasRagContext);

      const trimmedHistory = chatHistory.length > MAX_INLINE_CHAT_HISTORY_MESSAGES
        ? chatHistory.slice(chatHistory.length - MAX_INLINE_CHAT_HISTORY_MESSAGES)
        : chatHistory;

      const requestMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: systemMessage },
        ...trimmedHistory
      ];

      // 输出最终请求消息和 token 估算，便于排查上下文拼装问题。
      try {
        const messagesTokenSum = requestMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
        monacoDebugLog('[InlineChat] ========= final request messages =========');
        monacoDebugLog('[InlineChat] message count:', requestMessages.length);
        requestMessages.forEach((msg, index) => {
          monacoDebugLog(`[InlineChat] message ${index + 1} (${msg.role}):`);
          monacoDebugLog(`[InlineChat] ${msg.content}`);
          monacoDebugLog(`[InlineChat] estimated tokens: ${estimateTokens(msg.content)}`);
          monacoDebugLog('[InlineChat] ---');
        });
        monacoDebugLog(`[InlineChat] total estimated tokens: ${messagesTokenSum}`);
        monacoDebugLog('[InlineChat] =======================================');
        monacoDebugLog('[InlineChat] requestMessages JSON:', JSON.stringify(requestMessages, null, 2));
      } catch (e) {
        console.warn('[InlineChat] failed to log request messages:', e);
      }

      let accumulatedCode = '';
      let isFirstChunk = true;
      
      // 浣跨敤灏佽鐨勫嚱鏁板垵濮嬪寲 diff 鏄剧ず
      const diffDisplay = initializeDiffDisplay();
      if (!diffDisplay) {
        console.error('[MonacoEditor] 鍒濆锟?diff 鏄剧ず澶辫触');
        return;
      }
      
      const { ghostWidget, zoneBottomLine } = diffDisplay;
      
      // 鑾峰彇娣卞害鎬濊€冪姸锟?
      const isDeepThinkingEnabled = aiZoneWidgetRef.current?.getDeepThinkingEnabled() ?? true;
      
      // 妫€娴嬫ā鍨嬫槸鍚︽敮鎸佹繁搴︽€濓拷?
      let shouldShowThinking = isDeepThinkingEnabled;
      if (isDeepThinkingEnabled) {
        // 瀵逛簬鏌愪簺涓嶆敮鎸佹ā鍨嬭鎯匒PI鐨勬湇鍔″晢锛堝榄斿绀惧尯锛夛紝璺宠繃API妫€娴嬩互鎻愬崌閫熷害
        const skipAPIDetection = providerId === 'ModelScope';
        
        const capabilityDetector = new ModelCapabilityDetector();
        const detectionResult = await capabilityDetector.detectCapabilities(
          actualModelId,
          modelConfig.apiEndpoint,
          modelConfig.apiKey,
          skipAPIDetection
        );
        const supportsReasoning = detectionResult.success && 
          detectionResult.capabilities.includes(ModelCapability.REASONING);
        
        // 鏇存柊鏄惁闇€瑕佹樉绀烘繁搴︽€濊€冭繃绋嬶紙鏍规嵁瀹為檯妫€娴嬬粨鏋滐級
        shouldShowThinking = isDeepThinkingEnabled && supportsReasoning;
        
        monacoDebugLog('[InlineChat] 娣卞害鎬濊€冪姸锟?', {
          enabled: isDeepThinkingEnabled,
          supportsReasoning,
          shouldShowThinking
        });
        
        // 濡傛灉妫€娴嬪埌妯″瀷涓嶆敮鎸佹帹鐞嗭紝璁板綍璀﹀憡
        if (isDeepThinkingEnabled && !supportsReasoning) {
          monacoDebugLog('[InlineChat] reasoning unsupported by model, fallback to normal mode');
        }
      }
      
      // 浣跨敤 aiService 鐨勬祦寮廇PI
      await aiService.generateTextStream({
        model: actualModelId,
        messages: requestMessages,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        reasoning: shouldShowThinking ? { 
          enabled: true,
          thinkingBudget: DEFAULT_CHAT_SETTINGS.thinkingBudget // 浣跨敤榛樿鎬濊€冮锟?
        } : undefined,
        signal: abortController.signal // 浼狅拷?AbortSignal 浠ユ敮鎸佸彇锟?
      }, {
        onContent: (chunk: string) => {
          // 妫€鏌ユ槸鍚﹀凡琚彇锟?
          if (abortController.signal.aborted) {
            return;
          }

          // 鏀跺埌绗竴锟?chunk 鏃讹紝閫氱煡 AIZoneWidget 鏄剧ず鐢ㄦ埛闂
          if (isFirstChunk) {
            isFirstChunk = false;
            aiZoneWidgetRef.current?.onAIResponseStart();
          }

          // 绱Н浠ｇ爜
          accumulatedCode += chunk;
          
          // 瀹炴椂鏇存柊 Ghost Text 鏄剧ず diff 鏁堟灉锛堜粠搴曢儴杈规涓嬩竴琛屽紑濮嬶級
          ghostWidget.updateTextAtLine(accumulatedCode, zoneBottomLine);
        },
        onReasoning: (reasoning: string) => {
          // 妫€鏌ユ槸鍚﹀凡琚彇锟?
          if (abortController.signal.aborted) {
            return;
          }
          // 鍐呰仈鑱婂ぉ涓嶆樉绀烘帹鐞嗚繃绋嬶紝鍙褰曟棩锟?
          monacoDebugLog('[InlineChat] 鎺ㄧ悊鐗囨:', reasoning.substring(0, 100));
        }
      });

      // 妫€鏌ユ槸鍚﹀凡琚彇娑堬紝濡傛灉宸插彇娑堝垯涓嶆墽琛屽畬鎴愬锟?
      if (abortController.signal.aborted) {
        monacoDebugLog('[InlineChat] request aborted, skip completion handling');
        return;
      }

      monacoDebugLog('[InlineChat] AI 鍝嶅簲瀹屾垚');

      // 灏嗗姪鎵嬪洖澶嶅啓鍏ュ巻鍙诧紝渚夸簬鍚庣画澶氳疆瀵硅瘽寮曠敤
      if (aiZoneWidgetRef.current) {
        const MAX_ASSISTANT_HISTORY_LENGTH = 4000;
        let assistantHistoryMessage = accumulatedCode.trim();

        if (!assistantHistoryMessage) {
          assistantHistoryMessage = 'AI 已完成本次代码修改。';
        } else if (assistantHistoryMessage.length > MAX_ASSISTANT_HISTORY_LENGTH) {
          assistantHistoryMessage = `${assistantHistoryMessage.slice(0, MAX_ASSISTANT_HISTORY_LENGTH)}\n...[内容已截断，避免历史消息过长]`;
        }

        aiZoneWidgetRef.current.appendMessage('assistant', assistantHistoryMessage);
      }
      
      // 鍐嶆妫€鏌ユ槸鍚﹀凡琚彇娑堬紙鍙兘锟?appendMessage 杩囩▼涓鍙栨秷锟?
      if (abortController.signal.aborted) {
        monacoDebugLog('[InlineChat] request aborted, skip completion handling');
        return;
      }
      
      // 閫氱煡 AIZoneWidget 鍥炲瀹屾垚
      aiZoneWidgetRef.current?.onAIResponseComplete();
    } catch (error) {
      // 濡傛灉鏄彇娑堟搷浣滐紝涓嶆樉绀洪敊璇俊锟?
      if (error instanceof Error && error.name === 'AbortError') {
        monacoDebugLog('[InlineChat] 璇锋眰宸茶鐢ㄦ埛鍙栨秷');
        // 娓呯悊 AbortController
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        return;
      }

      console.error('[InlineChat] 璋冪敤 AI 鏈嶅姟澶辫触:', error);
      
      // 鍋滄鐢熸垚鐘舵€侊紙涓嶆浛鎹㈡彁闂唴瀹癸紝閿欒淇℃伅灏嗗湪 diff 鍖哄煙鏄剧ず锟?
      if (aiZoneWidgetRef.current) {
        // 鎵嬪姩鍋滄鐢熸垚锛屼絾涓嶈皟锟?stopGeneration锛堝洜涓洪偅浼氭爣璁颁负鍙栨秷锟?
        const widget = aiZoneWidgetRef.current as any;
        widget.isGenerating = false;
        widget.updateSendButton();
        widget.hideThinkingState();
        
        // 鎭㈠搴曢儴宸ュ叿锟?
        if (widget.bottomToolbar) {
          widget.bottomToolbar.style.display = 'flex';
        }
        // 鏇存柊宸ュ叿鏍忔樉绀猴紙闅愯棌鍙栨秷宸ュ叿鏍忥紝鎭㈠涓烘枃浠跺伐鍏锋爮鎴栭殣钘忥級
        if (widget.updateSelectedFilesToolbar) {
          widget.updateSelectedFilesToolbar();
        }
      }
      
      // 锟?diff 鍖哄煙锛坓host text widget锛夋樉绀洪敊璇俊鎭紝鑰屼笉鏄浛鎹㈡彁闂唴锟?
      if (editorRef.current && aiZoneWidgetRef.current) {
        const editor = editorRef.current;
        const zoneBottomLine = aiZoneWidgetRef.current.getZoneBottomLineNumber();
        
        // 格式化错误信息，优先给出可读的用户提示。
        let errorMessage = '调用 AI 服务失败\n\n';
        if (error instanceof Error) {
          let errorDetail = error.message;
          
          if (error.name === 'RateLimitError' || error.message.includes('RateLimitError')) {
            try {
              const jsonMatch = error.message.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const errorData = JSON.parse(jsonMatch[0]);
                if (errorData.errors && errorData.errors.message) {
                  errorDetail = errorData.errors.message;
                } else if (errorData.message) {
                  errorDetail = errorData.message;
                }
              }
            } catch (e) {
              void e;
            }
            
            if (errorDetail.includes('quota') || errorDetail.includes('閰嶉') || errorDetail.includes('exceeded')) {
              errorMessage = `API 配额已用完\n\n${errorDetail}\n\n建议：\n1. 稍后再试\n2. 或切换到其他模型`;
            } else {
              errorMessage = `请求频率受限\n\n${errorDetail}`;
            }
          } else {
            errorMessage += `错误: ${errorDetail}`;
            if (error.name && error.name !== 'Error') {
              errorMessage += `\n\n类型: ${error.name}`;
            }
          }
        } else {
          errorMessage += `错误: ${String(error)}`;
        }
        
        // 濡傛灉宸叉湁 ghost widget锛屽厛娓呴櫎锟?
        if (currentGhostWidgetRef.current) {
          currentGhostWidgetRef.current.dispose();
          currentGhostWidgetRef.current = null;
        }
        
        // 鍒涘缓鏂扮殑 ghost text widget 鏄剧ず閿欒淇℃伅
        const errorGhostWidget = new GhostTextWidget(editor, {
          onReject: () => {
            errorGhostWidget.dispose();
            if (currentGhostWidgetRef.current === errorGhostWidget) {
              currentGhostWidgetRef.current = null;
            }
          }
        });
        
        const errorPosition: monaco.IPosition = {
          lineNumber: zoneBottomLine,
          column: 1
        };
        errorGhostWidget.show(errorPosition, errorMessage);
        currentGhostWidgetRef.current = errorGhostWidget;
      }
    } finally {
      // 娓呯悊 AbortController锛堝鏋滆繖鏄綋鍓嶇殑璇锋眰锟?
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }, [tabId, tabTitle, language, availableModels]);

  // 鎵撳紑鍐呰仈鑱婂ぉ
  const handleOpenInlineChat = useCallback((skipRecreate: boolean = false) => {
    monacoDebugLog('[MonacoEditor] ========== handleOpenInlineChat 琚皟锟?==========');
    monacoDebugLog('[MonacoEditor] skipRecreate:', skipRecreate);
    monacoDebugLog('[MonacoEditor] editorRef.current:', editorRef.current);
    
    if (!editorRef.current) {
      console.warn('[MonacoEditor] editorRef.current 涓嶅瓨鍦紝杩斿洖');
      return;
    }

    const editor = editorRef.current;
    const selection = editor.getSelection();
    const position = editor.getPosition();
    monacoDebugLog('[MonacoEditor] selection:', selection, 'position:', position);

    if (!position) {
      console.warn('[MonacoEditor] position 涓嶅瓨鍦紝杩斿洖');
      return;
    }

    // 鑾峰彇閫変腑鐨勬枃鏈紙濡傛灉鏈夛級
    const selectedText = selection && !selection.isEmpty() 
      ? editor.getModel()?.getValueInRange(selection) 
      : undefined;

    // 璁＄畻鍐呰仈鑱婂ぉ鏄剧ず鐨勮鍙凤細濡傛灉鏈夐€変腑鍐呭锛屾樉绀哄湪閫変腑鍐呭鐨勪笅鏂癸紙缁撴潫琛屽彿鐨勪笅涓€琛岋級
    let targetLineNumber: number;
    if (selection && !selection.isEmpty()) {
      // 鏈夐€変腑鍐呭锛屾樉绀哄湪閫変腑鍐呭鐨勪笅鏂癸紙缁撴潫琛屽彿鐨勪笅涓€琛岋級
      const model = editor.getModel();
      const totalLines = model ? model.getLineCount() : 1;
      // 鏄剧ず鍦ㄩ€変腑鍐呭鐨勪笅涓€琛岋紝鑰屼笉鏄€変腑鍐呭鐨勬渶鍚庝竴锟?
      targetLineNumber = Math.min(totalLines, selection.endLineNumber + 1);
      monacoDebugLog('[MonacoEditor] 鏈夐€変腑鍐呭锛屽唴鑱旇亰澶╂樉绀哄湪閫変腑鍐呭涓嬫柟:', {
        selectionStartLine: selection.startLineNumber,
        selectionEndLine: selection.endLineNumber,
        targetLineNumber,
        totalLines
      });
    } else {
      // 娌℃湁閫変腑鍐呭锛屾樉绀哄湪褰撳墠鍏夋爣浣嶇疆
      targetLineNumber = position.lineNumber;
      monacoDebugLog('[MonacoEditor] 娌℃湁閫変腑鍐呭锛屽唴鑱旇亰澶╂樉绀哄湪褰撳墠鍏夋爣浣嶇疆:', targetLineNumber);
    }

    // 濡傛灉宸插瓨锟?Zone Widget 涓斾笉闇€瑕侀噸鏂板垱寤猴紝鐩存帴杩斿洖
    if (aiZoneWidgetRef.current && skipRecreate) {
      return;
    }

    // 濡傛灉宸插瓨鍦ㄨ鏍囩椤电殑 Zone Widget锛屾鏌ユ槸鍚﹂渶瑕侀噸鏂板垱锟?
    if (tabId) {
      const existingInstance = AIZoneWidget.getInstanceByTabId(tabId);
      if (existingInstance && existingInstance.isVisible()) {
        // 妫€鏌ユā鍨嬩笅鎷夋鏄惁瀛樺湪
        const dropdownContainer = existingInstance.getDomNode()?.querySelector('.ai-zone-input-model-dropdown');
        const shouldHaveDropdown = availableModels && availableModels.length > 0;
        const isMissingDropdown = shouldHaveDropdown && !dropdownContainer;
        
        // 濡傛灉宸插瓨鍦ㄤ笖鍙锛屼笖涓嶉渶瑕侀噸鏂板垱寤猴紝涓旀ā鍨嬩笅鎷夋瀛樺湪锛岀洿鎺ヨ繑锟?
        if (skipRecreate && !isMissingDropdown) {
          aiZoneWidgetRef.current = existingInstance;
          return;
        }
        // 鍚﹀垯鍏堥攢姣佹棫瀹炰緥锛堝寘鎷ā鍨嬩笅鎷夋缂哄け鐨勬儏鍐碉級
        // 閿€姣佸墠鍏堟竻闄ゆ敼鍐欐搷浣滅殑楂樹寒瑁呴グ
        if (aiRewriteWidgetRef.current) {
          aiRewriteWidgetRef.current.clearRewriteHighlight();
        }
        existingInstance.dispose();
      }
    }

    // 濡傛灉宸插瓨锟?Zone Widget锛堝彲鑳芥槸鍏朵粬鏍囩椤电殑锛夛紝淇濆瓨褰撳墠杈撳叆鍐呭鍚庡啀閿€锟?
    let existingInputValue = '';
    if (aiZoneWidgetRef.current) {
      const inputElement = aiZoneWidgetRef.current.getInputElement();
      if (inputElement) {
        existingInputValue = inputElement.value.trim();
      }
      // 鍙湁褰撳墠瀹炰緥涓嶆槸褰撳墠鏍囩椤电殑瀹炰緥鏃讹紝鎵嶉攢锟?
      if (!tabId || aiZoneWidgetRef.current.getTabId() !== tabId) {
        // 閿€姣佸墠鍏堟竻闄ゆ敼鍐欐搷浣滅殑楂樹寒瑁呴グ
        if (aiRewriteWidgetRef.current) {
          aiRewriteWidgetRef.current.clearRewriteHighlight();
        }
        aiZoneWidgetRef.current.dispose();
      }
      aiZoneWidgetRef.current = null;
    }

    // 鍒涘缓鏂扮殑 Zone Widget锛屼紶锟?tabId
    // 浼樺厛浣跨敤 availableModelsRef.current锛岀‘淇濅娇鐢ㄦ渶鏂扮殑锟?
    const modelsToUse = availableModelsRef.current.length > 0 ? availableModelsRef.current : availableModels;
    monacoDebugLog('[MonacoEditor] 鍒涘缓 AIZoneWidget', {
      availableModelsCount: availableModels?.length || 0,
      availableModelsRefCount: availableModelsRef.current?.length || 0,
      modelsToUseCount: modelsToUse?.length || 0,
      availableModels: availableModels,
      availableModelsRef: availableModelsRef.current,
      modelsToUse: modelsToUse
    });
    aiZoneWidgetRef.current = new AIZoneWidget(editor, {
      availableModels: modelsToUse,
      onSubmit: (message: string, includeSelection: boolean, selectedModel?: string) => {
        handleSendInlineChatMessage(message, includeSelection, selectedModel);
      },
      onStop: () => {
        // 鍙栨秷褰撳墠锟?AI 璇锋眰
        if (abortControllerRef.current) {
          monacoDebugLog('[MonacoEditor] 鐢ㄦ埛鐐瑰嚮鍙栨秷锛屾鍦ㄥ彇娑堣锟?..');
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
      },
      onAccept: () => {
        // 鎺ュ彈 AI 鐢熸垚锟?diff 鍐呭
        monacoDebugLog('[MonacoEditor] 鐢ㄦ埛鐐瑰嚮鎺ュ彈锛屽紑濮嬪簲锟?diff 鍐呭');
        
        if (currentGhostWidgetRef.current) {
          // 璋冪敤 GhostTextWidget 鐨勫叕鍏辨柟娉曟潵鎺ュ彈鍐呭
          currentGhostWidgetRef.current.acceptGhostText();
          currentGhostWidgetRef.current = null;
          
          // 閲嶇疆鍘熷琛屾暟璁板綍锛堝洜涓哄唴瀹瑰凡琚帴鍙楋紝涓嶉渶瑕佹竻闄ょ┖琛岋級
          originalLineCountRef.current = null;
          
          monacoDebugLog('[MonacoEditor] diff content applied');
        } else {
          console.warn('[MonacoEditor] 娌℃湁鍙帴鍙楃殑 diff 鍐呭');
        }
      },
      onClearDiff: () => {
        // 娓呴櫎 diff 鍐呭锛堜笉鍏抽棴鍐呰仈鑱婂ぉ锟?
        monacoDebugLog('[MonacoEditor] 娓呴櫎褰撳墠瀵硅瘽锟?diff 鍐呭');
        
        // 鍙栨秷姝ｅ湪杩涜鐨勮锟?
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        
        // 娓呴櫎鏀瑰啓鎿嶄綔鐨勯珮浜锟?
        if (aiRewriteWidgetRef.current) {
          aiRewriteWidgetRef.current.clearRewriteHighlight();
        }
        
        // 浣跨敤缁熶竴鐨勬竻鐞嗗嚱鏁版竻锟?diff 鍐呭鍜岀┖锟?
        cleanupPreviousDiff();
      },
      onClose: () => {
        monacoDebugLog('[MonacoEditor] inline chat closed, cleanup diff and blank lines');
        
        // 鍏抽棴鏃朵篃鍙栨秷姝ｅ湪杩涜鐨勮锟?
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        
        // 娓呴櫎鏀瑰啓鎿嶄綔鐨勯珮浜锟?
        if (aiRewriteWidgetRef.current) {
          aiRewriteWidgetRef.current.clearRewriteHighlight();
        }
        
        // 浣跨敤缁熶竴鐨勬竻鐞嗗嚱鏁版竻锟?diff 鍐呭鍜岀┖锟?
        cleanupPreviousDiff();
        
        // 娓呯悊 AI Zone Widget
        if (aiZoneWidgetRef.current) {
          aiZoneWidgetRef.current.dispose();
          aiZoneWidgetRef.current = null;
        }
      }
    }, tabId);

    // 鏄剧ず Zone Widget锛堜娇鐢ㄨ绠楃殑鐩爣琛屽彿锟?
    aiZoneWidgetRef.current.show(targetLineNumber, selectedText);

    // 濡傛灉鏈変箣鍓嶇殑杈撳叆鍐呭锛屾仮澶嶅畠
    if (existingInputValue) {
      setTimeout(() => {
        const inputElement = aiZoneWidgetRef.current?.getInputElement();
        if (inputElement) {
          inputElement.value = existingInputValue;
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 50);
    }
  }, [handleSendInlineChatMessage, availableModels, tabId]);

  // 澶勭悊涓婁紶鐭ヨ瘑搴擄紙鏄剧ず閫夋嫨瀵硅瘽妗嗭級
  const handleUploadToKnowledgeBase = useCallback(() => {
    if (!filePath || !tabTitle) {
      toastService.error('鏃犳硶鑾峰彇鏂囦欢淇℃伅');
      return;
    }

    // 妫€鏌ユ槸鍚︽槸鏂囦欢锛堜笉鏄墖娈垫枃浠舵垨鐗规畩鏂囦欢锟?
    if (filePath.startsWith('snippet:') || 
        filePath.startsWith('settings:') || 
        filePath.startsWith('theme-config:')) {
      toastService.error('璇ユ枃浠剁被鍨嬩笉鏀寔涓婁紶鍒扮煡璇嗗簱');
      return;
    }

    // 妫€鏌ユ枃浠剁被鍨嬫槸鍚︽敮锟?
    if (!FileParser.isSupportedFileType(tabTitle)) {
      const extension = FileParser.getFileExtension(tabTitle);
      const supportedTypes = FileParser.getSupportedFileTypes().join(', ');
      toastService.error(
        `不支持的文件类型: .${extension}\n支持的文件类型: ${supportedTypes}`
      );
      return;
    }

    // 鏄剧ず閫夋嫨鐭ヨ瘑搴撳璇濇
    setShowSelectKnowledgeBaseDialog(true);
  }, [filePath, tabTitle]);

  // 澶勭悊閫夋嫨鐭ヨ瘑搴撳悗鐨勪笂锟?
  const handleSelectKnowledgeBase = useCallback(async (knowledgeBaseId: string) => {
    if (!filePath || !tabTitle) {
      toastService.error('鏃犳硶鑾峰彇鏂囦欢淇℃伅');
      return;
    }

    // 绔嬪嵆鍏抽棴瀵硅瘽妗嗭紝閬垮厤UI鍗￠】
    setShowSelectKnowledgeBaseDialog(false);

    // 鑾峰彇鏂囦欢锟?
    const fileName = tabTitle || filePath.split(/[/\\]/).pop() || '鏈煡鏂囦欢';

    try {
      // 妫€鏌ユ枃浠舵槸鍚︽鍦ㄥ鐞嗕腑锛堥槻姝㈤噸澶嶄笂浼狅級
      const latestData = await knowledgeBaseService.loadFromStorage();
      const latestKnowledgeBase = latestData.created.find(kb => kb.id === knowledgeBaseId);
      if (latestKnowledgeBase?.children) {
        const findExistingFile = (items: typeof latestKnowledgeBase.children): typeof latestKnowledgeBase.children[0] | undefined => {
          for (const item of items) {
            if (item.type === 'file' && item.title === fileName) {
              return item;
            }
            if (item.children) {
              const found = findExistingFile(item.children);
              if (found) return found;
            }
          }
          return undefined;
        };
        
        const existingFile = findExistingFile(latestKnowledgeBase.children);
        if (existingFile) {
          const processingStatus = existingFile.metadata?.processingStatus;
          if (processingStatus === 'processing' || processingStatus === 'pending') {
            toastService.warning(`文件 "${fileName}" 正在上传中，请等待处理完成。`);
            return;
          }
        }
      }
      
      // 鍏堟鏌ユ枃浠跺唴瀹归暱搴︼紙鏈€锟?300 瀛楃锟?
      const fileReadResult = await window.electron?.file?.read(filePath);
      if (!fileReadResult?.success || !fileReadResult.data?.content) {
        toastService.error(`鏃犳硶璇诲彇鏂囦欢: ${fileName}`);
        return;
      }
      
      // 鍘婚櫎绌虹櫧瀛楃锛堜絾淇濈暀鎹㈣绗︼級锛岄槻姝㈡伓鎰忎笂浼犵┖鍐呭
      const contentWithoutSpaces = fileReadResult.data.content.replace(/[^\S\n]/g, '');
      const contentLength = contentWithoutSpaces.length;
      const MIN_DOCUMENT_LENGTH = 300;
      
      if (contentLength < MIN_DOCUMENT_LENGTH) {
        toastService.error(
          `文档 "${fileName}" 过短（${contentLength} 字符），最少需要 ${MIN_DOCUMENT_LENGTH} 字符`
        );
        return;
      }
      
      // 鍏堝皢鏂囦欢娣诲姞鍒扮煡璇嗗簱鏈嶅姟涓紙绔嬪嵆鏄剧ず锟?
      await knowledgeBaseService.addFileToKnowledgeBase(knowledgeBaseId, filePath, fileName);

      // 鏇存柊澶勭悊鐘舵€佷负 processing
      await knowledgeBaseService.updateFileProcessingStatus(filePath, 'processing', 10);

      // 绔嬪嵆瑙﹀彂鐭ヨ瘑搴撳埛鏂颁簨浠讹紝鏇存柊UI鏄剧ず澶勭悊鐘讹拷?
      window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
        detail: { knowledgeId: knowledgeBaseId }
      }));

      // 鑷姩鎵撳紑鐭ヨ瘑搴撴爣绛鹃〉
      try {
        const data = await knowledgeBaseService.loadFromStorage();
        const knowledgeBase = data.created.find(kb => kb.id === knowledgeBaseId);
        
        if (knowledgeBase) {
          // 瑙﹀彂鎵撳紑鐭ヨ瘑搴撲簨浠讹紝鑷姩鎵撳紑瀵瑰簲鐭ヨ瘑搴撴爣绛鹃〉
          window.dispatchEvent(new CustomEvent('open-knowledge', {
            detail: {
              id: knowledgeBase.id,
              title: knowledgeBase.title,
              description: knowledgeBase.metadata?.description || '',
              items: data.created,
              knowledgeData: {
                id: knowledgeBase.id,
                items: data.created
              }
            }
          }));
        }
      } catch (error) {
        console.error('[MonacoEditor] 鎵撳紑鐭ヨ瘑搴撴爣绛鹃〉澶辫触:', error);
      }

      // 杩涘害鏇存柊鍥炶皟鍑芥暟
      const handleProgress = async (progressFilePath: string, progress: number) => {
        await knowledgeBaseService.updateFileProcessingStatus(progressFilePath, 'processing', progress);
        // 瑙﹀彂鐭ヨ瘑搴撳埛鏂颁簨浠讹紝鏇存柊UI鏄剧ず
        window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
          detail: { knowledgeId: knowledgeBaseId }
        }));
      };

      // 鍚庡彴寮傛澶勭悊鏂囦欢锛堝垎鍧椼€佸祵鍏ャ€佸瓨鍌級
      ragProcessingService.uploadFilesToKnowledgeBase(
        [filePath],
        knowledgeBaseId,
        { onProgress: handleProgress }
      ).then(() => {
        // 澶勭悊瀹屾垚锛屾洿鏂扮姸鎬佷负 completed
        knowledgeBaseService.updateFileProcessingStatus(filePath, 'completed', 100).then(() => {
          // 瑙﹀彂鐭ヨ瘑搴撳埛鏂颁簨浠讹紝鏇存柊UI鏄剧ず
          window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId: knowledgeBaseId }
          }));
        }).catch(() => {
          // 闈欓粯澶勭悊閿欒
        });
      }).catch((error) => {
        // 澶勭悊澶辫触锛屾洿鏂扮姸鎬佷负 error
        knowledgeBaseService.updateFileProcessingStatus(filePath, 'error', 0).then(() => {
          // 瑙﹀彂鐭ヨ瘑搴撳埛鏂颁簨浠讹紝鏇存柊UI鏄剧ず
          window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId: knowledgeBaseId }
          }));
        }).catch(() => {
          // 闈欓粯澶勭悊閿欒
        });
        
        // 鏄剧ず閿欒鎻愮ず
        const errorMessage = error instanceof Error ? error.message : String(error);
        let displayMessage = '锟较达拷知识锟斤拷失锟斤拷';
        
        // 鎻愬彇鏇村弸濂界殑閿欒淇℃伅
        if (errorMessage.includes('Failed to process file paths') || errorMessage.includes('澶勭悊鏂囦欢璺緞澶辫触')) {
          displayMessage = '鏂囦欢澶勭悊澶辫触锛岃妫€鏌ユ枃浠舵牸寮忔垨閲嶈瘯';
        } else if (errorMessage.includes('锟斤拷锟斤拷锟侥硷拷时锟斤拷锟斤拷锟斤拷锟斤拷')) {
          // 鎻愬彇鍏蜂綋鐨勯敊璇俊锟?
          const match = errorMessage.match(/锟斤拷锟斤拷锟侥硷拷时锟斤拷锟斤拷锟斤拷锟斤拷\s*(.+)/);
          if (match && match[1]) {
            displayMessage = `鏂囦欢澶勭悊澶辫触: ${match[1].substring(0, 100)}`;
          } else {
            displayMessage = '文件处理失败，请检查文件内容或稍后重试';
          }
        } else if (errorMessage.includes('鍚戦噺瀛樺偍鏈垵濮嬪寲')) {
          displayMessage = '鍚戦噺瀛樺偍鏈垵濮嬪寲锛岃閲嶈瘯';
        } else if (errorMessage.includes('瓒呮椂')) {
          displayMessage = '澶勭悊瓒呮椂锛岃妫€鏌ユ枃浠跺ぇ灏忔垨缃戠粶杩炴帴';
        } else if (errorMessage) {
          // 濡傛灉閿欒淇℃伅杈冪煭涓旀湁鎰忎箟锛岀洿鎺ユ樉锟?
          if (errorMessage.length < 100) {
            displayMessage = errorMessage;
          } else {
            // 灏濊瘯鎻愬彇鍏抽敭閿欒淇℃伅
            const lines = errorMessage.split('\n');
            const firstLine = lines[0] || errorMessage;
            displayMessage = firstLine.length < 100 ? firstLine : firstLine.substring(0, 50) + '...';
          }
        }
        
        toastService.error(displayMessage);
        console.error('[MonacoEditor] 鏂囦欢澶勭悊澶辫触:', {
          error,
          errorMessage,
          filePath,
          knowledgeBaseId,
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastService.error(`娣诲姞鏂囦欢澶辫触: ${errorMessage}`);
    }
  }, [filePath, tabTitle]);

  // 鍙抽敭鑿滃崟
  const contextMenu = useMonacoContextMenu({
    editor: editorRef.current,
    onOpenInlineChat: handleOpenInlineChat,
    onUploadToKnowledgeBase: handleUploadToKnowledgeBase,
    tabId,
    tabTitle
  });

  const handleEditorChange = (value: string | undefined) => {
    if (onChange && value !== undefined) {
      onChange(value);
    }
  };

  // Monaco 缂栬緫鍣ㄦ寕杞藉墠 - 閰嶇疆璇█鏀寔
  const handleEditorWillMount = (monaco: Monaco) => {
    monacoDebugLog('[MonacoEditor] 缂栬緫鍣ㄦ寕杞藉墠閰嶇疆');
    applyBootstrapMonacoTheme(monaco);
    
    // 閰嶇疆 JSON/JSONC 璇█鐨勮瘖鏂€夐」锛堝惎鐢ㄥ疄鏃惰娉曢敊璇彁绀猴級
    // 瀹氫箟鐗囨锟?JSON Schema锛堢敤浜庨獙璇佺墖娈垫牸寮忥級
    const snippetSchema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '鐗囨鍚嶇О锛岀敤浜庢樉绀哄拰鍖哄垎鐗囨',
          minLength: 1
        },
        prefix: {
          type: 'string',
          description: '锟斤拷锟斤拷前缀锟斤拷锟斤拷锟筋）锟斤拷锟斤拷锟斤拷锟皆讹拷锟斤拷全锟斤拷应锟斤拷锟斤拷唯一',
          minLength: 1,
          pattern: '^[a-zA-Z0-9_-]+$'
        },
        body: {
          type: 'string',
          description: '鐗囨鍐呭',
          minLength: 1
        },
        description: {
          type: 'string',
          description: '鐗囨鎻忚堪锛堝彲閫夛級'
        },
        language: {
          type: 'string',
          description: '代码语言，例如 javascript、python、html、css',
        },
        tags: {
          type: 'string',
          description: '标签，可选，多个标签使用逗号分隔',
        }
      },
      required: ['name', 'prefix', 'body'],
      additionalProperties: false
    };
    
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: true,  // 鍏佽娉ㄩ噴锛堟敮锟?JSONC锟?
      schemas: [
        {
          uri: 'http://internal/snippet-schema.json',
          fileMatch: ['snippet:///*'],  // 鍖归厤 snippet:/// 寮€澶寸殑鎵€鏈夋枃锟?
          schema: snippetSchema
        }
      ],
      enableSchemaRequest: false,
      schemaValidation: 'error',  // Schema 楠岃瘉閿欒绾у埆璁剧疆锟?error
      schemaRequest: 'warning',
      trailingCommas: 'warning',  // 灏鹃殢閫楀彿璀﹀憡
      comments: 'ignore'  // 蹇界暐娉ㄩ噴閿欒
    });
    
    monacoDebugLog('[MonacoEditor] JSON diagnostics configured');
    monacoDebugLog('[MonacoEditor] Schema 閰嶇疆璇︽儏:', {
      validate: true,
      fileMatch: ['snippet:///*'],
      schemaUri: 'http://internal/snippet-schema.json',
      requiredFields: snippetSchema.required
    });
    
    // 鍙湪绗竴娆℃椂娉ㄥ唽 jsonc 璇█
    if (!jsoncLanguageRegistered) {
      monacoDebugLog('[MonacoEditor] 棣栨娉ㄥ唽 jsonc 璇█');
      
      // 妫€鏌ユ槸鍚﹀凡娉ㄥ唽 jsonc 璇█
      const languages = monaco.languages.getLanguages();
      const hasJsonc = languages.some(lang => lang.id === 'jsonc');
      
      monacoDebugLog('[MonacoEditor] Monaco 鏀寔鐨勮瑷€:', languages.map(l => l.id));
      monacoDebugLog('[MonacoEditor] 鏄惁宸叉敮锟?jsonc:', hasJsonc);
      
      // 鍙湪鏈敞鍐屾椂娉ㄥ唽
      if (!hasJsonc) {
        // 娉ㄥ唽 jsonc 璇█
        monaco.languages.register({ id: 'jsonc' });
        monacoDebugLog('[MonacoEditor] jsonc language registered');
      }
      
      // 鈿狅笍鈿狅笍鈿狅笍 鍏抽敭鍙戠幇锛氫笉瑕佷负 jsonc 璁剧疆鑷畾锟?tokenizer锟?
      // 鍘熷洜锟?
      // 1. Monaco 鍐呯疆锟?JSON tokenizer 琚敤锟?Markdown 浠ｇ爜鍧楃殑 JSON 楂樹寒
      // 2. 濡傛灉鎴戜滑锟?jsonc 璁剧疆鑷畾锟?tokenizer锛孧onaco 鍙兘浼氭贩锟?json 锟?jsonc
      // 3. 杩欎細瀵艰嚧 Markdown 涓殑 JSON 浠ｇ爜鍧楀け鍘昏娉曢珮锟?
      //
      // 瑙ｅ喅鏂规锟?
      // 1. 鍙敞锟?jsonc 璇█锛堣 Monaco 鐭ラ亾瀹冨瓨鍦級
      // 2. 鍙缃瑷€閰嶇疆锛堟嫭鍙峰尮閰嶃€佹敞閲婄瓑锟?
      // 3. 涓嶈锟?tokenizer - 锟?jsonc 鑷姩缁ф壙 json 锟?tokenizer
      monacoDebugLog('[MonacoEditor] 鈿狅笍 璺宠繃璁剧疆 jsonc tokenizer锛岃鍏剁户锟?json 锟?tokenizer');
      
      // 璁剧疆璇█閰嶇疆锛堟嫭鍙峰尮閰嶃€佽嚜鍔ㄧ缉杩涚瓑锟?
      monaco.languages.setLanguageConfiguration('jsonc', {
        comments: {
          lineComment: '//',
          blockComment: ['/*', '*/'],
        },
        brackets: [
          ['{', '}'],
          ['[', ']'],
        ],
        autoClosingPairs: [
          { open: '{', close: '}' },
          { open: '[', close: ']' },
          { open: '"', close: '"' },
        ],
        surroundingPairs: [
          { open: '{', close: '}' },
          { open: '[', close: ']' },
          { open: '"', close: '"' },
        ],
      });
      
      monacoDebugLog('[MonacoEditor] jsonc language configuration completed');
      
      // 鏍囪宸叉敞锟?
      jsoncLanguageRegistered = true;
    } else {
      monacoDebugLog('[MonacoEditor] jsonc 璇█宸叉敞鍐岋紝璺宠繃閲嶅娉ㄥ唽');
    }
    
    // 娉ㄥ唽鐗囨鑷姩琛ュ叏鎻愪緵锟?
    monacoDebugLog('[MonacoEditor] snippet completion provider registered');
    if (!wikilinkCompletionRegistered) {
      const wikilinkLanguageIds = ['markdown', 'plaintext'];
      const buildLinkRange = (position: MonacoPosition, queryText: string) => ({
        startLineNumber: position.lineNumber,
        startColumn: position.column - queryText.length,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const getTrailingLinkCloser = (model: MonacoTextModel, position: MonacoPosition) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const startIndex = Math.max(0, position.column - 1);
        return lineContent.slice(startIndex, startIndex + 2);
      };

      for (const languageId of wikilinkLanguageIds) {
        monaco.languages.registerCompletionItemProvider(languageId, {
          triggerCharacters: ['[', '#'],
          provideCompletionItems: async (model, position) => {
            try {
              const lineContent = model.getLineContent(position.lineNumber);
              const textUntilPosition = lineContent.substring(0, position.column - 1);
              const trailingLinkCloser = getTrailingLinkCloser(model, position);

              const anchorMatch = textUntilPosition.match(/\[\[([^\]|#\]]+)#([^\]|]*)$/);
              if (anchorMatch) {
                const targetReference = anchorMatch[1].trim();
                const rawAnchorQuery = anchorMatch[2];
                const anchorQuery = rawAnchorQuery.trim();
                const anchors = await window.electron?.ipcRenderer.invoke(
                  'link:getAnchors',
                  targetReference,
                  anchorQuery
                ) as LinkAnchorSuggestionItem[] | undefined;

                return {
                  suggestions: (anchors || []).map((anchor) => ({
                    label: anchor.reference,
                    kind: anchor.kind === 'heading'
                      ? monaco.languages.CompletionItemKind.Property
                      : monaco.languages.CompletionItemKind.Keyword,
                    detail: `${anchor.kind === 'heading' ? '锟斤拷锟斤拷' : '锟斤拷'} 锟斤拷 锟斤拷 ${anchor.line} 锟斤拷`,
                    documentation: anchor.preview,
                    insertText: trailingLinkCloser === ']]' ? anchor.reference : `${anchor.reference}]]`,
                    range: buildLinkRange(position, rawAnchorQuery),
                  })),
                };
              }

              const linkMatch = textUntilPosition.match(/\[\[([^\]|#\]]*)$/);
              if (!linkMatch) {
                return { suggestions: [] };
              }

              const rawQuery = linkMatch[1];
              const query = rawQuery.trim();
              const targets = await window.electron?.ipcRenderer.invoke(
                'link:searchTargets',
                query
              ) as LinkTargetSuggestionItem[] | undefined;

              return {
                suggestions: (targets || []).map((target) => {
                  const preferredReference = rawQuery.includes('/') || rawQuery.includes('\\')
                    ? (target.path || target.title)
                    : target.title;

                  return {
                    label: target.title,
                    kind: monaco.languages.CompletionItemKind.File,
                    detail: target.path || '',
                    documentation: target.aliases.length > 0
                      ? `锟斤拷锟斤拷: ${target.aliases.join('锟斤拷')}`
                      : undefined,
                    insertText: trailingLinkCloser === ']]'
                      ? preferredReference
                      : `${preferredReference}]]`,
                    range: buildLinkRange(position, rawQuery),
                  };
                }),
              };
            } catch (error) {
              console.error('[MonacoEditor] 鍙岄摼琛ュ叏澶辫触:', error);
              return { suggestions: [] };
            }
          }
        });
      }

      wikilinkCompletionRegistered = true;
    }

    monaco.languages.registerCompletionItemProvider('*', {
      provideCompletionItems: async (model, position) => {
        try {
          // 鑾峰彇褰撳墠璇█
          const currentLanguage = model.getLanguageId();
          
          // 鑾峰彇褰撳墠琛岀殑鍐呭鍜屽厜鏍囧墠鐨勬枃锟?
          const lineContent = model.getLineContent(position.lineNumber);
          const textUntilPosition = lineContent.substring(0, position.column - 1);
          
          // 鎻愬彇褰撳墠姝ｅ湪杈撳叆鐨勫崟锟?
          const wordMatch = textUntilPosition.match(/\S+$/);
          const word = wordMatch ? wordMatch[0] : '';
          
          // 鏌ヨ鏁版嵁搴撲腑鐨勭墖锟?
          const snippets = await snippetService.querySnippets({
            prefix: word,
            language: currentLanguage === 'plaintext' ? undefined : currentLanguage,
            limit: 50
          });
          
          // 杞崲锟?Monaco 鐨勮ˉ鍏ㄩ」 - 鍙樉绀烘湁 prefix 鐨勭墖锟?
          const suggestions = snippets.map((snippet: Snippet) => ({
              label: {
                label: snippet.name,
                description: `(${snippet.prefix})`,
                detail: snippet.description
              },
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation: snippet.description || `鎻掑叆浠ｇ爜鐗囨: ${snippet.name}`,
              insertText: snippet.body,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: snippet.language ? `[${snippet.language}] ${snippet.description || ''}` : snippet.description,
              sortText: `0_${snippet.prefix}`, // 浼樺厛鏄剧ず鐗囨
              filterText: `${snippet.name} ${snippet.prefix}`, // 鍚屾椂鏀寔鎸夊悕绉板拰鍓嶇紑杩囨护
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column - word.length,
                endLineNumber: position.lineNumber,
                endColumn: position.column
              }
            }));
          
          return {
            suggestions
          };
        } catch (error) {
          console.error('[MonacoEditor] 鐗囨琛ュ叏澶辫触:', error);
          return { suggestions: [] };
        }
      }
    });
    
    monacoDebugLog('[MonacoEditor] snippet completion provider registration completed');
  };

  // Monaco 缂栬緫鍣ㄦ寕杞芥椂
  const handleEditorDidMount = async (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    monacoDebugLog('[MonacoEditor] Editor mounted for tab:', tabId, 'Content length:', value?.length || 0);
    monacoDebugLog('[MonacoEditor] Content preview:', value?.substring(0, 100));
    
    // 鍏ㄥ眬鍒濆锟?Monaco锛堝彧鍦ㄧ涓€娆¤皟鐢ㄦ椂鎵ц锟?
    await initializeMonaco(monaco);
    
    editorRef.current = editor;
    setMonacoInstance(monaco);
    setIsEditorReady(true);

    compositionCleanupRef.current?.();
    const compositionStartDisposable = editor.onDidCompositionStart(() => {
      isImeComposingRef.current = true;
      onCompositionStateChangeRef.current?.(true);
    });
    const compositionEndDisposable = editor.onDidCompositionEnd(() => {
      if (!isImeComposingRef.current) {
        return;
      }
      isImeComposingRef.current = false;
      window.requestAnimationFrame(() => {
        if (editorRef.current !== editor) {
          return;
        }
        onCompositionStateChangeRef.current?.(false, editor.getValue());
      });
    });
    const blurDisposable = editor.onDidBlurEditorText(() => {
      if (!isImeComposingRef.current) {
        return;
      }
      isImeComposingRef.current = false;
      window.requestAnimationFrame(() => {
        if (editorRef.current !== editor) {
          return;
        }
        onCompositionStateChangeRef.current?.(false, editor.getValue());
      });
    });
    compositionCleanupRef.current = () => {
      compositionStartDisposable.dispose();
      compositionEndDisposable.dispose();
      blurDisposable.dispose();
    };

    monacoDebugLog('[MonacoEditor] color decorators:', editor.getOption(monaco.editor.EditorOption.colorDecorators));

    // 纭繚璇█妯″紡姝ｇ‘璁剧疆
    const model = editor.getModel();
    if (model) {
      const currentLanguageId = model.getLanguageId();
      monacoDebugLog('[MonacoEditor] ========== language check ==========');
      monacoDebugLog(`[MonacoEditor] tab id: ${tabId}`);
      monacoDebugLog(`[MonacoEditor] tab title: ${tabTitle || '(unknown)'}`);
      monacoDebugLog(`[MonacoEditor] current language: ${currentLanguageId}`);
      monacoDebugLog(`[MonacoEditor] expected language: ${language}`);
      monacoDebugLog(`[MonacoEditor] colorDecorators: ${editor.getOption(monaco.editor.EditorOption.colorDecorators)}`);
      
      // 鍒楀嚭鎵€鏈夋敮鎸佺殑璇█
      const supportedLanguages = monaco.languages.getLanguages();
      monacoDebugLog('[MonacoEditor] supported languages:', supportedLanguages.map(l => l.id));
      
      // 妫€鏌ユ槸鍚︽敮鎸佺洰鏍囪瑷€
      const isLanguageSupported = supportedLanguages.some(l => l.id === language);
      monacoDebugLog(`[MonacoEditor] supports ${language}:`, isLanguageSupported);
      
      if (currentLanguageId !== language) {
        monacoDebugLog(`[MonacoEditor] language mismatch, set to ${language} (current: ${currentLanguageId})`);
        monaco.editor.setModelLanguage(model, language);
        
        // 楠岃瘉璁剧疆鍚庣殑璇█
        const newLanguageId = model.getLanguageId();
        monacoDebugLog(`[MonacoEditor] language after set: ${newLanguageId}`);
      }
      
      // 濡傛灉鏄墖娈垫枃浠讹紝涓烘ā鍨嬭缃嚜瀹氫箟 URI 浠ュ惎锟?Schema 楠岃瘉
      if (tabId && (tabId.startsWith('snippet-') || tabId.includes('snippet'))) {
        const uri = monaco.Uri.parse(`snippet:///${tabId}.json`);
        const content = model.getValue();
        
        monacoDebugLog('[MonacoEditor] snippet file check:', {
          tabId,
          uri: uri.toString(),
          scheme: uri.scheme,
          path: uri.path,
          currentModelUri: model.uri.toString(),
          language,
          propLanguage: language  // 璁板綍浼犲叆锟?language prop
        });
        
        // 閿€姣佹棫妯″瀷锛屽垱寤烘柊妯″瀷锛堝甫鑷畾锟?URI 锟?JSONC 璇█锟?
        const newModel = monaco.editor.createModel(content, 'jsonc', uri);
        editor.setModel(newModel);
        
        // 閿€姣佹棫妯″瀷
        model.dispose();
        
        monacoDebugLog('[MonacoEditor] snippet model created');
        monacoDebugLog('[MonacoEditor]   - URI:', uri.toString());
        monacoDebugLog('[MonacoEditor]   - Language:', newModel.getLanguageId());
        monacoDebugLog('[MonacoEditor]   - 妯″瀷璇█搴斾负: jsonc');
        
        // 楠岃瘉 Schema 鏄惁搴旂敤锛堝欢杩熸鏌ワ紝绛夊緟 Monaco 鍐呴儴楠岃瘉锟?
        setTimeout(() => {
          const markers = monaco.editor.getModelMarkers({ resource: uri });
          monacoDebugLog('[MonacoEditor] 褰撳墠缂栬緫鍣ㄩ敊璇爣锟?', markers);
          
          // 鍐嶆纭璇█璁剧疆
          const currentModel = editor.getModel();
          if (currentModel) {
            const currentLang = currentModel.getLanguageId();
            monacoDebugLog('[MonacoEditor] 楠岃瘉鍚庣殑璇█ID:', currentLang);
            if (currentLang !== 'jsonc') {
              console.warn('[MonacoEditor] 璇█琚噸缃负:', currentLang, '锛屽己鍒惰缃洖 jsonc');
              monaco.editor.setModelLanguage(currentModel, 'jsonc');
            }
          }
        }, 500);
      }
    }


    const forceRefreshColorDecorators = () => {
      const model = editor.getModel();
      if (!model) return;
      
      monacoDebugLog('[MonacoEditor] 馃攧 寮€濮嬪己鍒跺埛鏂伴鑹茶楗板櫒...');
      
      // 馃幆 鏂规硶1锛氳Е鍙戝彲瑙佽寖鍥村彉鍖栦簨浠讹紝寮哄埗 Monaco 閲嶆柊璇勪及瑁呴グ锟?
      // 閫氳繃婊氬姩鍒板綋鍓嶄綅缃潵瑙﹀彂
      const currentPosition = editor.getPosition();
      if (currentPosition) {
        editor.revealLineInCenter(currentPosition.lineNumber);
      }
      
      // 馃幆 鏂规硶2锛氬己鍒堕噸鏂版覆鏌擄紙鍚屾锛岀珛鍗虫墽琛岋級
      editor.render(true);
      
      // 馃幆 鏂规硶3锛氬己鍒舵祻瑙堝櫒閲嶆柊璁＄畻鏍峰紡锛堥槻姝㈡祻瑙堝櫒浼樺寲瀵艰嚧鐨勫欢杩燂級
      const domNode = editor.getDomNode();
      if (domNode) {
        void domNode.offsetHeight; // 寮哄埗娴忚鍣ㄩ噸鏂拌绠楀竷灞€
      }
      
      // 馃幆 鏂规硶4锛氳Е鍙戠紪杈戝櫒閲嶆柊甯冨眬
      editor.layout();
      
      // 馃幆 鏂规硶5锛氬啀娆＄珛鍗虫覆鏌擄紝纭繚瑁呴グ鍣ㄥ畬鍏ㄥ埛锟?
      editor.render(true);
      
      // 馃幆 鏂规硶6锛氬啀娆″己鍒舵祻瑙堝櫒閲嶆柊璁＄畻鏍峰紡
      if (domNode) {
        void domNode.offsetHeight;
      }
      
      monacoDebugLog('[MonacoEditor] force-refreshed color decorators immediately');
    };

    // 鐩戝惉缂栬緫鍣ㄥ唴瀹瑰彉鍖栵紝閲嶆柊搴旂敤棰滆壊
    editor.onDidChangeModelContent(() => {
      // 绔嬪嵆鍒锋柊棰滆壊瑁呴グ鍣紝閬垮厤寤惰繜娑堝け
      const domNode = editor.getDomNode();
      if (domNode) {
        // 妫€鏌ユ槸鍚︽湁棰滆壊閫夋嫨鍣ㄦ墦寮€锛屽鏋滄湁锛岃鏄庡彲鑳芥槸棰滆壊鏇存柊
        const colorPickerSelectors = [
          '.colorpicker-widget',
          '.monaco-color-picker',
          '.color-picker-widget'
        ];
        
        let hasColorPickerOpen = false;
        for (const selector of colorPickerSelectors) {
          const colorPicker = domNode.querySelector(selector);
          if (colorPicker && colorPicker instanceof HTMLElement && colorPicker.classList.contains('show-picker')) {
            hasColorPickerOpen = true;
            break;
          }
        }
        
        // 濡傛灉棰滆壊閫夋嫨鍣ㄦ墦寮€锛岀珛鍗冲埛鏂拌楗板櫒
        if (hasColorPickerOpen) {
          forceRefreshColorDecorators();
        }
      }
      
      // 馃幆 绔嬪嵆鎵ц锛屼笉寤惰繜锛圖OM 鏇存柊鏄悓姝ョ殑锟?
      if (forceApplyColorsRef.current) {
        forceApplyColorsRef.current();
      }
    });

    // 馃幆 閫氳繃 CSS 榛樿闅愯棌棰滆壊閫夋嫨鍣紝鍙湪鐐瑰嚮棰滆壊瑁呴グ鍣ㄦ椂鎵嶆樉锟?
    // 骞朵笖褰撶偣鍑婚鑹查€夋嫨鍣ㄥ閮ㄦ椂绔嬪嵆闅愯棌锛堟棤鍔ㄧ敾銆佹棤绌虹櫧闂儊锟?
    const domNode = editor.getDomNode();
    if (domNode) {
      // 娓呯悊涔嬪墠鐨勮瀵熷櫒锛堝鏋滃瓨鍦級
      if (colorPickerObserverCleanupRef.current) {
        colorPickerObserverCleanupRef.current();
        colorPickerObserverCleanupRef.current = null;
      }
      
    // 馃幆 浼橀泤鏂规锛氫娇鐢ㄥ叏灞€浜嬩欢鐩戝惉锟?+ Monaco 鍘熺敓鍛戒护绔嬪嵆鍏抽棴棰滆壊閫夋嫨锟?
    let isClosingColorPicker = false; // 闃叉閲嶅瑙﹀彂
    let isDraggingInsideColorPicker = false; // 鏍囪鏄惁姝ｅ湪棰滆壊閫夋嫨鍣ㄥ唴鎷栧姩
    let globalMouseDownHandler: ((event: MouseEvent) => void) | null = null;
    let globalMouseMoveHandler: ((event: MouseEvent) => void) | null = null;
    let globalMouseUpHandler: ((event: MouseEvent) => void) | null = null;
    let globalWheelHandler: ((event: WheelEvent) => void) | null = null;
    let globalKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;
    
    // 馃幆 鏈€浼橀泤鏂规锛氭ā鎷熸寜锟?ESC 閿珛鍗冲叧闂鑹查€夋嫨鍣紙涓庢墜鍔ㄦ寜 ESC 鏁堟灉瀹屽叏涓€鑷达級
    const closeColorPickerImmediately = (reason: string) => {
      if (isClosingColorPicker) return;
      
      isClosingColorPicker = true;
      monacoDebugLog(`[MonacoEditor] ${reason}, simulate Escape to close color picker immediately`);
      
      // 馃幆 鏍稿績锛氭ā鎷熸寜锟?ESC 閿紝锟?Monaco 浣跨敤鍘熺敓鐨勫叧闂€昏緫
      // 杩欐槸鏈€鍙潬鐨勬柟娉曪紝鍥犱负 Monaco 宸茬粡瀹炵幇锟?ESC 閿殑绔嬪嵆鍏抽棴閫昏緫
      const escapeKeyEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        keyCode: 27,
        code: 'Escape',
        which: 27,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      
      // 鐩存帴鍦ㄧ紪杈戝櫒锟?DOM 鑺傜偣涓婅Е鍙戯紝纭繚 Monaco 鑳芥崟鑾峰埌
      const editorDomNode = editor.getDomNode();
      if (editorDomNode) {
        editorDomNode.dispatchEvent(escapeKeyEvent);
        monacoDebugLog('[MonacoEditor] 锟?宸茶Е锟?ESC 閿簨浠讹紝棰滆壊閫夋嫨鍣ㄥ簲绔嬪嵆鍏抽棴');
      }
      
      // 馃幆 绔嬪嵆鍒锋柊棰滆壊瑁呴グ锟?
      forceRefreshColorDecorators();
      
      // 馃幆 鍏抽敭锛氱Щ闄ゅ叏灞€浜嬩欢鐩戝惉鍣紝闃叉鍐呭瓨娉勬紡
      if (globalMouseDownHandler) {
        document.removeEventListener('mousedown', globalMouseDownHandler, true);
        globalMouseDownHandler = null;
        monacoDebugLog('[MonacoEditor] removed global mousedown listener');
      }
      
      if (globalMouseMoveHandler) {
        document.removeEventListener('mousemove', globalMouseMoveHandler, true);
        globalMouseMoveHandler = null;
        monacoDebugLog('[MonacoEditor] removed global mousemove listener');
      }
      
      if (globalMouseUpHandler) {
        document.removeEventListener('mouseup', globalMouseUpHandler, true);
        globalMouseUpHandler = null;
        monacoDebugLog('[MonacoEditor] removed global mouseup listener');
      }
      
      if (globalKeyDownHandler) {
        document.removeEventListener('keydown', globalKeyDownHandler, true);
        globalKeyDownHandler = null;
        monacoDebugLog('[MonacoEditor] removed global keydown listener');
      }
      
      // 閲嶇疆鎷栧姩鏍囧織
      isDraggingInsideColorPicker = false;
      
      // 50ms 鍚庨噸缃爣蹇楋紙ESC 閿搷搴旀洿蹇級
      setTimeout(() => {
        isClosingColorPicker = false;
      }, 50);
    };
    
    // 馃幆 鍏ㄥ眬 mousedown 浜嬩欢鐩戝惉鍣紙鐢ㄤ簬妫€锟?鐐瑰嚮澶栭儴"锟?
    const handleGlobalMouseDown = (event: MouseEvent) => {
      const clickTarget = event.target as HTMLElement;
      
      // 鏌ユ壘鎵€鏈夊彲鑳界殑棰滆壊閫夋嫨锟?
      const colorPickerSelectors = [
        '.colorpicker-widget',
        '.monaco-color-picker',
        '.color-picker-widget'
      ];
      
      for (const selector of colorPickerSelectors) {
        const colorPicker = domNode.querySelector(selector);
        if (colorPicker && colorPicker instanceof HTMLElement) {
          // 濡傛灉棰滆壊閫夋嫨鍣ㄥ凡鏄剧ず
          if (colorPicker.classList.contains('show-picker')) {
            // 馃幆 鍏抽敭锛氫娇锟?contains() 鍒ゆ柇鐐瑰嚮鏄惁鍦ㄩ€夋嫨鍣ㄥ唴锟?
            const isClickInsideColorPicker = colorPicker.contains(clickTarget);
            
            // 馃幆 妫€鏌ユ槸鍚︾偣鍑讳簡棰滆壊瑁呴グ鍣紙鐢ㄤ簬鎵撳紑/鍒囨崲棰滆壊閫夋嫨鍣級
            const isClickOnColorDecorator = 
              clickTarget.classList.contains('colorpicker-color-decoration') ||
              clickTarget.classList.contains('color-decoration') ||
              clickTarget.classList.contains('mtk6') ||
              clickTarget.closest('.colorpicker-color-decoration') !== null;
            
            // 馃幆 璋冭瘯鏃ュ織
            monacoDebugLog('[MonacoEditor] 鍏ㄥ眬鐐瑰嚮妫€锟?', {
              isClickInsideColorPicker,
              isClickOnColorDecorator,
              clickTargetClass: clickTarget.className,
              clickTargetTag: clickTarget.tagName
            });
            
            // 馃幆 濡傛灉鐐瑰嚮鍦ㄩ鑹查€夋嫨鍣ㄥ唴閮紝闃绘浜嬩欢浼犳挱鍒扮紪杈戝櫒
            if (isClickInsideColorPicker) {
              monacoDebugLog('[MonacoEditor] 馃幆 鐐瑰嚮鍦ㄩ鑹查€夋嫨鍣ㄥ唴閮紝闃绘浜嬩欢浼犳挱');
              isDraggingInsideColorPicker = true; // 鏍囪寮€濮嬫嫋锟?
              event.stopPropagation(); // 闃绘浜嬩欢鍐掓场
              event.stopImmediatePropagation(); // 闃绘鍚岀骇鐩戝惉锟?
              // 涓嶉樆姝㈤粯璁よ涓猴紝璁╅鑹查€夋嫨鍣ㄦ甯稿伐锟?
              return; // 鎻愬墠杩斿洖锛屼笉鎵ц鍏抽棴閫昏緫
            }
            
            // 馃幆 鍙湁褰撶偣鍑诲湪棰滆壊閫夋嫨鍣ㄥ閮紝骞朵笖涓嶆槸棰滆壊瑁呴グ鍣ㄦ椂锛屾墠妯℃嫙 ESC 閿叧锟?
            if (!isClickOnColorDecorator) {
              monacoDebugLog('[MonacoEditor] click outside color picker, simulate Escape');
              
              // 鍒涘缓涓€锟?ESC 閿簨浠讹紝娲惧彂鍒伴鑹查€夋嫨鍣ㄥ厓绱犱笂
              const escapeEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true
              });
              
              // 锟?ESC 浜嬩欢娲惧彂鍒伴鑹查€夋嫨鍣ㄤ笂锛岃 Monaco 鍘熺敓閫昏緫澶勭悊
              colorPicker.dispatchEvent(escapeEvent);
              
              // 鍚屾椂娲惧彂锟?document锛岀‘锟?Monaco 鑳芥崟鑾峰埌
              document.dispatchEvent(escapeEvent);
            }
          }
        }
      }
    };
    
    // 馃幆 鍏ㄥ眬 mousemove 浜嬩欢鐩戝惉鍣紙闃叉鍦ㄩ鑹查€夋嫨鍣ㄥ唴绉诲姩鏃惰Е鍙戠紪杈戝櫒婊氬姩锟?
    const handleGlobalMouseMove = (event: MouseEvent) => {
      const moveTarget = event.target as HTMLElement;
      const colorPickerSelectors = [
        '.colorpicker-widget',
        '.monaco-color-picker',
        '.color-picker-widget'
      ];
      
      // 馃幆 鍏抽敭淇锛氬彧瑕佹娴嬪埌棰滆壊閫夋嫨鍣ㄥ瓨鍦紝灏辨鏌ラ紶鏍囨槸鍚﹀湪鍏跺唴锟?
      for (const selector of colorPickerSelectors) {
        const colorPicker = domNode.querySelector(selector);
        if (colorPicker && colorPicker instanceof HTMLElement && colorPicker.classList.contains('show-picker')) {
          const isInsideColorPicker = colorPicker.contains(moveTarget) || 
                                       moveTarget.closest('.colorpicker-widget') !== null ||
                                       moveTarget.closest('.monaco-color-picker') !== null ||
                                       moveTarget.closest('.color-picker-widget') !== null;
          
          if (isInsideColorPicker) {
            monacoDebugLog('[MonacoEditor] 馃幆 榧犳爣鍦ㄩ鑹查€夋嫨鍣ㄥ唴閮ㄧЩ鍔紝瀹屽叏闃绘浜嬩欢');
            event.stopPropagation(); // 闃绘浜嬩欢鍐掓场
            event.stopImmediatePropagation(); // 闃绘鍚岀骇鐩戝惉锟?
            event.preventDefault(); // 闃绘榛樿琛屼负锛堥槻姝㈣Е鍙戠紪杈戝櫒婊氬姩锟?
            return;
          }
        }
      }
      
      // 馃幆 棰濆妫€鏌ワ細濡傛灉姝ｅ湪鎷栧姩锛屼篃闃绘鎵€锟?mousemove 浜嬩欢
      if (isDraggingInsideColorPicker) {
        monacoDebugLog('[MonacoEditor] 馃幆 姝ｅ湪鎷栧姩涓紝闃绘 mousemove 浜嬩欢');
        event.stopPropagation();
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    
    // 馃幆 鍏ㄥ眬 mouseup 浜嬩欢鐩戝惉鍣紙缁撴潫鎷栧姩锟?
    const handleGlobalMouseUp = (event: MouseEvent) => {
      if (isDraggingInsideColorPicker) {
        monacoDebugLog('[MonacoEditor] drag inside color picker ended, reset state');
        isDraggingInsideColorPicker = false;
        event.stopPropagation(); // 闃绘浜嬩欢鍐掓场
        event.stopImmediatePropagation(); // 闃绘鍚岀骇鐩戝惉锟?
      }
    };
    
    // 馃幆 鍏ㄥ眬 wheel 浜嬩欢鐩戝惉鍣紙闃叉鍦ㄩ鑹查€夋嫨鍣ㄥ唴婊氬姩鏃惰Е鍙戠紪杈戝櫒婊氬姩锟?
    const handleGlobalWheel = (event: WheelEvent) => {
      const wheelTarget = event.target as HTMLElement;
      const colorPickerSelectors = [
        '.colorpicker-widget',
        '.monaco-color-picker',
        '.color-picker-widget'
      ];
      
      for (const selector of colorPickerSelectors) {
        const colorPicker = domNode.querySelector(selector);
        if (colorPicker && colorPicker instanceof HTMLElement && colorPicker.classList.contains('show-picker')) {
          const isInsideColorPicker = colorPicker.contains(wheelTarget) || 
                                       wheelTarget.closest('.colorpicker-widget') !== null ||
                                       wheelTarget.closest('.monaco-color-picker') !== null ||
                                       wheelTarget.closest('.color-picker-widget') !== null;
          
          if (isInsideColorPicker) {
            monacoDebugLog('[MonacoEditor] scrolling inside color picker, block editor scroll');
            event.stopPropagation();
            event.stopImmediatePropagation();
            event.preventDefault();
            return;
          }
        }
      }
    };
    
    // 馃幆 鍏ㄥ眬 keydown 浜嬩欢鐩戝惉鍣紙浠呭锟?Enter 閿‘璁わ級
    // 娉ㄦ剰锛欵SC 閿畬鍏ㄤ氦锟?Monaco 鍘熺敓澶勭悊锛孧onaco 宸插疄鐜帮細
    //   1. 鍦ㄩ鑹查€夋嫨鍣ㄥ唴锟?ESC 锟?绔嬪嵆娑堝け
    //   2. 淇敼棰滆壊鍚庢寜 ESC 锟?绔嬪嵆娑堝け锛堜笉璧板欢杩熼€昏緫锟?
    //   3. 淇敼棰滆壊鍚庡け鍘荤劍锟?锟?寤惰繜娑堝け锛堥槻姝㈣鎿嶄綔锟?
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const keyTarget = event.target as HTMLElement;
      const colorPickerSelectors = [
        '.colorpicker-widget',
        '.monaco-color-picker',
        '.color-picker-widget'
      ];
      
      for (const selector of colorPickerSelectors) {
        const colorPicker = domNode.querySelector(selector);
        if (colorPicker && colorPicker instanceof HTMLElement && colorPicker.classList.contains('show-picker')) {
          
          // 馃幆 妫€娴嬫寜閿槸鍚﹀湪棰滆壊閫夋嫨鍣ㄥ唴閮ㄨЕ锟?
          const isKeyInsideColorPicker = colorPicker.contains(keyTarget) || 
                                          colorPicker === keyTarget ||
                                          keyTarget.closest('.colorpicker-widget') !== null ||
                                          keyTarget.closest('.monaco-color-picker') !== null ||
                                          keyTarget.closest('.color-picker-widget') !== null;
          
          // 馃幆 Enter 閿鐞嗛€昏緫锛堢‘璁ゅ苟鍏抽棴锟?
          // Monaco 鍘熺敓鍙兘娌℃湁 Enter 閿‘璁ゅ姛鑳斤紝鎵€浠ユ垜浠墜鍔ㄦ坊锟?
          if (event.key === 'Enter' || event.keyCode === 13) {
            if (isKeyInsideColorPicker) {
              monacoDebugLog('[MonacoEditor] 馃幆 鍦ㄩ鑹查€夋嫨鍣ㄥ唴閮ㄦ寜锟?Enter锛岀‘璁ゅ苟鍏抽棴');
              closeColorPickerImmediately('press Enter inside color picker');
              event.stopPropagation(); // 闃绘浜嬩欢浼犳挱
              event.preventDefault(); // 闃绘榛樿琛屼负
            }
          }
          
          // 馃幆 ESC 閿畬鍏ㄤ笉鎷︽埅锛岃 Monaco 鍘熺敓閫昏緫澶勭悊
          // Monaco 浼氭牴鎹槸鍚︿慨鏀逛簡棰滆壊鏉ュ喅瀹氱珛鍗虫秷澶辫繕鏄欢杩熸秷锟?
        }
      }
    };
      
      // 瀛樺偍宸插垱寤鸿瀵熷櫒鐨勯鑹查€夋嫨鍣ㄥ厓绱狅紝閬垮厤閲嶅鍒涘缓
      const observedColorPickers = new WeakSet<HTMLElement>();
      
      // 鐩戝惉棰滆壊閫夋嫨鍣ㄥ唴閮ㄧ殑棰滆壊鍙樺寲浜嬩欢锛堝綋鐢ㄦ埛閫夋嫨棰滆壊鏃讹級
      const handleColorPickerChange = () => {
        // 浣跨敤 MutationObserver 鐩戝惉棰滆壊閫夋嫨鍣ㄧ殑鍙樺寲
        const colorPickerSelectors = [
          '.colorpicker-widget',
          '.monaco-color-picker',
          '.color-picker-widget'
        ];
        
        for (const selector of colorPickerSelectors) {
          const colorPicker = domNode.querySelector(selector);
          if (colorPicker && colorPicker instanceof HTMLElement) {
            // 濡傛灉宸茬粡瑙傚療杩囪繖涓厓绱狅紝璺宠繃
            if (observedColorPickers.has(colorPicker)) {
              continue;
            }
            
            // 鏍囪涓哄凡瑙傚療
            observedColorPickers.add(colorPicker);
            
            // 鐩戝惉棰滆壊閫夋嫨鍣ㄥ唴鐨勮緭鍏ユ鎴栭鑹插€煎彉锟?
            const observer = new MutationObserver((mutations) => {
              // 妫€鏌ユ槸鍚︽湁鍐呭鍙樺寲锛屽彲鑳借〃绀洪鑹插凡鏇存柊
              for (const mutation of mutations) {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                  // 馃幆 绔嬪嵆鍒锋柊瑁呴グ鍣紝涓嶅欢杩燂紙棰滆壊鍊兼洿鏂版槸鍚屾鐨勶級
                  forceRefreshColorDecorators();
                  break;
                }
              }
            });
            
            observer.observe(colorPicker, {
              childList: true,
              subtree: true,
              characterData: true,
              attributes: true,
              attributeFilter: ['class'] // 鐩戝惉 class 鍙樺寲锛屾娴嬮鑹查€夋嫨鍣ㄧ殑鏄剧ず/闅愯棌
            });
            
            // 淇濆瓨 observer 浠ヤ究娓呯悊
            (colorPicker as any).__colorObserver = observer;
          }
        }
      };
      
      // 瀹氭湡妫€鏌ラ鑹查€夋嫨鍣ㄦ槸鍚﹀嚭鐜帮紝骞堕檮鍔犲叏灞€浜嬩欢鐩戝惉锟?
      const checkColorPickerInterval = setInterval(() => {
        handleColorPickerChange();
        checkAndAttachGlobalListeners(); // 妫€鏌ュ苟娣诲姞鍏ㄥ眬鐩戝惉锟?
      }, 300);
      
      // 馃幆 鐩戝惉棰滆壊閫夋嫨鍣ㄧ殑鍑虹幇锛屽綋妫€娴嬪埌棰滆壊閫夋嫨鍣ㄦ樉绀烘椂锛屾坊鍔犲叏灞€浜嬩欢鐩戝惉锟?
      const checkAndAttachGlobalListeners = () => {
        const colorPickerSelectors = [
          '.colorpicker-widget',
          '.monaco-color-picker',
          '.color-picker-widget'
        ];
        
        for (const selector of colorPickerSelectors) {
          const colorPicker = domNode.querySelector(selector);
          if (colorPicker && colorPicker instanceof HTMLElement && colorPicker.classList.contains('show-picker')) {
            // 濡傛灉棰滆壊閫夋嫨鍣ㄥ凡鏄剧ず锛屼笖鍏ㄥ眬鐩戝惉鍣ㄥ皻鏈坊锟?
            if (!globalMouseDownHandler) {
              globalMouseDownHandler = handleGlobalMouseDown;
              document.addEventListener('mousedown', globalMouseDownHandler, true);
              monacoDebugLog('[MonacoEditor] added global mousedown listener');
            }
            
            if (!globalMouseMoveHandler) {
              globalMouseMoveHandler = handleGlobalMouseMove;
              document.addEventListener('mousemove', globalMouseMoveHandler, true);
              monacoDebugLog('[MonacoEditor] added global mousemove listener');
            }
            
            if (!globalMouseUpHandler) {
              globalMouseUpHandler = handleGlobalMouseUp;
              document.addEventListener('mouseup', globalMouseUpHandler, true);
              monacoDebugLog('[MonacoEditor] added global mouseup listener');
            }
            
            if (!globalWheelHandler) {
              globalWheelHandler = handleGlobalWheel;
              document.addEventListener('wheel', globalWheelHandler, { passive: false, capture: true });
              monacoDebugLog('[MonacoEditor] added global wheel listener');
            }
            
            if (!globalKeyDownHandler) {
              globalKeyDownHandler = handleGlobalKeyDown;
              document.addEventListener('keydown', globalKeyDownHandler, true);
              monacoDebugLog('[MonacoEditor] added global keydown listener');
            }
            break;
          }
        }
      };
      
      // 淇濆瓨娓呯悊鍑芥暟锟?ref
      colorPickerObserverCleanupRef.current = () => {
        // 馃幆 娓呯悊鍏ㄥ眬浜嬩欢鐩戝惉鍣紙闃叉鍐呭瓨娉勬紡锟?
        if (globalMouseDownHandler) {
          document.removeEventListener('mousedown', globalMouseDownHandler, true);
          globalMouseDownHandler = null;
          monacoDebugLog('[MonacoEditor] cleanup: removed global mousedown listener');
        }
        
        if (globalMouseMoveHandler) {
          document.removeEventListener('mousemove', globalMouseMoveHandler, true);
          globalMouseMoveHandler = null;
          monacoDebugLog('[MonacoEditor] cleanup: removed global mousemove listener');
        }
        
        if (globalMouseUpHandler) {
          document.removeEventListener('mouseup', globalMouseUpHandler, true);
          globalMouseUpHandler = null;
          monacoDebugLog('[MonacoEditor] cleanup: removed global mouseup listener');
        }
        
        if (globalWheelHandler) {
          document.removeEventListener('wheel', globalWheelHandler, true);
          globalWheelHandler = null;
          monacoDebugLog('[MonacoEditor] cleanup: removed global wheel listener');
        }
        
        if (globalKeyDownHandler) {
          document.removeEventListener('keydown', globalKeyDownHandler, true);
          globalKeyDownHandler = null;
          monacoDebugLog('[MonacoEditor] cleanup: removed global keydown listener');
        }
        
        // 閲嶇疆鎷栧姩鏍囧織
        isDraggingInsideColorPicker = false;
        
        clearInterval(checkColorPickerInterval);
        
        // 娓呯悊鎵€锟?MutationObserver
        const colorPickerSelectors = [
          '.colorpicker-widget',
          '.monaco-color-picker',
          '.color-picker-widget'
        ];
        
        for (const selector of colorPickerSelectors) {
          const colorPicker = domNode.querySelector(selector);
          if (colorPicker && (colorPicker as any).__colorObserver) {
            (colorPicker as any).__colorObserver.disconnect();
            delete (colorPicker as any).__colorObserver;
          }
        }
      };
    }

    // 寮哄埗缂栬緫鍣ㄩ噸鏂板竷灞€
    setTimeout(() => {
      editor.layout();
    }, 100);

    // Markdown 鑷姩鍒楄〃鍔熻兘锛堜粎锟?Markdown 璇█鏃跺惎鐢級
    if (language === 'markdown') {
      editor.onKeyDown((e) => {
        // 妫€锟?Enter 锟?
        if (e.keyCode === monaco.KeyCode.Enter) {
          const model = editor.getModel();
          const position = editor.getPosition();
          
          if (!model || !position) return;
          
          const lineNumber = position.lineNumber;
          const lineContent = model.getLineContent(lineNumber);
          
          // 鍖归厤鏈夊簭鍒楄〃锟?. 锟?. 锟?
          const orderedListMatch = lineContent.match(/^(\s*)(\d+)\.\s+(.*)$/);
          if (orderedListMatch) {
            const [, indent, currentNumber, content] = orderedListMatch;
            
            // 濡傛灉鍐呭涓虹┖锛屽垯閫€鍑哄垪琛紙鍒犻櫎褰撳墠琛岀殑鍒楄〃鏍囪锟?
            if (content.trim() === '') {
              e.preventDefault();
              editor.executeEdits('auto-list', [{
                range: new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1),
                text: indent
              }]);
              editor.setPosition({ lineNumber, column: indent.length + 1 });
              return;
            }
            
            // 鍚﹀垯锛屾彃鍏ヤ笅涓€涓紪鍙风殑鍒楄〃锟?
            const nextNumber = parseInt(currentNumber) + 1;
            e.preventDefault();
            editor.executeEdits('auto-list', [{
              range: new monaco.Range(lineNumber, lineContent.length + 1, lineNumber, lineContent.length + 1),
              text: `\n${indent}${nextNumber}. `
            }]);
            editor.setPosition({ 
              lineNumber: lineNumber + 1, 
              column: indent.length + nextNumber.toString().length + 3 
            });
            return;
          }
          
          // 鍖归厤鏃犲簭鍒楄〃锟? 锟? 锟? 锟?
          const unorderedListMatch = lineContent.match(/^(\s*)([-*+])\s+(.*)$/);
          if (unorderedListMatch) {
            const [, indent, marker, content] = unorderedListMatch;
            
            // 濡傛灉鍐呭涓虹┖锛屽垯閫€鍑哄垪锟?
            if (content.trim() === '') {
              e.preventDefault();
              editor.executeEdits('auto-list', [{
                range: new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1),
                text: indent
              }]);
              editor.setPosition({ lineNumber, column: indent.length + 1 });
              return;
            }
            
            // 鍚﹀垯锛屾彃鍏ョ浉鍚屾爣璁扮殑鍒楄〃锟?
            e.preventDefault();
            editor.executeEdits('auto-list', [{
              range: new monaco.Range(lineNumber, lineContent.length + 1, lineNumber, lineContent.length + 1),
              text: `\n${indent}${marker} `
            }]);
            editor.setPosition({ 
              lineNumber: lineNumber + 1, 
              column: indent.length + 3 
            });
            return;
          }
          
          // 鍖归厤浠诲姟鍒楄〃锟? [ ] 锟? [x] 锟?
          const taskListMatch = lineContent.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/);
          if (taskListMatch) {
            const [, indent, marker, , content] = taskListMatch;
            
            // 濡傛灉鍐呭涓虹┖锛屽垯閫€鍑哄垪锟?
            if (content.trim() === '') {
              e.preventDefault();
              editor.executeEdits('auto-list', [{
                range: new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1),
                text: indent
              }]);
              editor.setPosition({ lineNumber, column: indent.length + 1 });
              return;
            }
            
            // 鍚﹀垯锛屾彃鍏ユ柊鐨勬湭瀹屾垚浠诲姟锟?
            e.preventDefault();
            editor.executeEdits('auto-list', [{
              range: new monaco.Range(lineNumber, lineContent.length + 1, lineNumber, lineContent.length + 1),
              text: `\n${indent}${marker} [ ] `
            }]);
            editor.setPosition({ 
              lineNumber: lineNumber + 1, 
              column: indent.length + 7 
            });
            return;
          }
        }
      });
      
      monacoDebugLog('[MonacoEditor] markdown auto list enabled');
    }

    // 灏嗙紪杈戝櫒瀹炰緥鏆撮湶鍒板叏灞€锛屼緵 MarkdownCommandProvider 绛変娇锟?
    (window as any).__monacoEditor = editor;
    (window as any).__currentTabId = tabId;
    (window as any).__currentTabTitle = tabTitle;
    // 鏆撮湶鎵撳紑鍐呰仈鑱婂ぉ鐨勬柟娉曪紙渚涘閮ㄨ皟鐢紝濡傛敼鍐欒彍鍗曪級
    // 鍏堥攢姣佺幇锟?widget锛岀劧鍚庤皟锟?handleOpenInlineChat锛岀‘淇濋噸鏂板垱寤哄苟鏄剧ず妯″瀷涓嬫媺锟?
    (window as any).__openInlineChat = async () => {
      // 娓呴櫎涓婃鐢熸垚锟?diff 鍐呭锛堝鏋滃瓨鍦級
      cleanupPreviousDiff();
      
      // 濡傛灉宸插瓨锟?widget锛屽厛閿€姣侊紝纭繚閲嶆柊鍒涘缓
      if (aiZoneWidgetRef.current) {
        aiZoneWidgetRef.current.dispose();
        aiZoneWidgetRef.current = null;
      }
      
      // 濡傛灉 availableModels 杩樻病鏈夊噯澶囧ソ锛岀瓑寰呭畠鍑嗗锟?
      // 鏈€澶氱瓑锟?2 锟?
      let waitCount = 0;
      const maxWait = 20; // 20 * 100ms = 2锟?
      while ((!availableModelsRef.current || availableModelsRef.current.length === 0) && waitCount < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      // 鍐嶇瓑寰呬竴涓覆鏌撳懆鏈燂紝纭繚 availableModels state 涔熷凡缁忔洿锟?
      await new Promise(resolve => setTimeout(resolve, 50));
      
      monacoDebugLog('[MonacoEditor] __openInlineChat 鍑嗗鍒涘缓 widget', {
        availableModelsCount: availableModelsRef.current?.length || 0,
        availableModelsStateCount: availableModels?.length || 0,
        waited: waitCount * 100 + 50
      });
      
      // 璋冪敤 handleOpenInlineChat锛屼笌鍙抽敭鑿滃崟閫昏緫涓€锟?
      handleOpenInlineChat();
    };
    // 鏆撮湶 aiZoneWidgetRef锛屼緵澶栭儴鑾峰彇杈撳叆鍏冪礌
    (window as any).__aiZoneWidgetRef = aiZoneWidgetRef;

    // 绂佺敤缂栬緫鍣ㄥ唴缃殑 F1 鍛戒护闈㈡澘锛屽苟杞彂鍒板叏灞€鍛戒护涓績
    const editorDomNode = editor.getDomNode();
    if (editorDomNode) {
      editorDomNode.addEventListener('keydown', (e: KeyboardEvent) => {
        // 鎷︽埅 F1
        if (e.key === 'F1') {
          e.preventDefault();
          e.stopPropagation();
          
          // 鎵嬪姩瑙﹀彂鍏ㄥ眬鍛戒护涓績
          const globalCommandCenter = (window as any).__commandCenter;
          if (globalCommandCenter) {
            globalCommandCenter.show('>');
          }
        }
      }, true);
    }

    // 浣跨敤鍏ㄥ眬鍛戒护涓績瀹炰緥锛堢敱 MainLayout 鍒濆鍖栵級
    commandCenterRef.current = (window as any).__commandCenter;

    // 鍒濆锟?AI 鏀瑰啓缁勪欢
    if (!aiRewriteWidgetRef.current) {
      aiRewriteWidgetRef.current = new AIRewriteWidget(editor, {
        onRewrite: (originalText: string, rewrittenText: string) => {
          monacoDebugLog('[MonacoEditor] AI 鏀瑰啓瀹屾垚:', { originalText, rewrittenText });
        },
        onContinue: (originalText: string, continuedText: string) => {
          monacoDebugLog('[MonacoEditor] AI 缁啓瀹屾垚:', { originalText, continuedText });
        },
        onDiff: (originalText: string, rewrittenText: string) => {
          monacoDebugLog('[MonacoEditor] AI 宸紓瀵规瘮瀹屾垚:', { originalText, rewrittenText });
        }
      });
    }
    
    // 浼樺厛浣跨敤鍏ㄥ眬鍛戒护涓績瀹炰緥锛岄伩鍏嶉噸澶嶅垱锟?
    if (!commandCenterRef.current) {
      commandCenterRef.current = (window as any).__commandCenter || new VSCodeCommandCenter();
      // 濡傛灉鍒涘缓浜嗘柊瀹炰緥锛屼繚瀛樺埌鍏ㄥ眬
      if (!(window as any).__commandCenter) {
        (window as any).__commandCenter = commandCenterRef.current;
      }
    }

    // 娉ㄥ唽 Ctrl+S 淇濆瓨蹇嵎锟?
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        // 瑙﹀彂鍏ㄥ眬淇濆瓨浜嬩欢
        const saveHandler = (window as any).__editorSaveFile;
        if (saveHandler) {
          saveHandler();
        }
      }
    );

    // 娉ㄥ唽 Ctrl+I 鎵撳紑鍐呰仈鑱婂ぉ蹇嵎锟?
    monacoDebugLog('[MonacoEditor] 娉ㄥ唽 Ctrl+I 蹇嵎锟?..');
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI,
      () => {
        monacoDebugLog('[MonacoEditor] ========== Ctrl+I 蹇嵎閿瑙﹀彂 ==========');
        handleOpenInlineChat();
      }
    );
    monacoDebugLog('[MonacoEditor] Ctrl+I 蹇嵎閿凡娉ㄥ唽');

    // 娉ㄥ唽缂栬緫鍣ㄥ唴 Ctrl+K Ctrl+T 蹇嵎锟?- 涓婚閫夋嫨
    // 锛團1 宸插湪 MainLayout 鍏ㄥ眬娉ㄥ唽锛屼笉闇€瑕佸湪缂栬緫鍣ㄥ唴閲嶅娉ㄥ唽锟?
    editor.addCommand(
      monaco.KeyMod.chord(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT
      ),
      () => {
        const globalCommandCenter = (window as any).__commandCenter || commandCenterRef.current;
        globalCommandCenter?.show('>');
        // 鍦ㄥ懡浠や腑蹇冩墦寮€鍚庯紝鑷姩杈撳叆涓婚鍛戒护
        setTimeout(() => {
          const input = document.querySelector('.command-center-input') as HTMLInputElement;
          if (input) {
            input.value = '>棣栭€夐」: 閰嶈壊涓婚';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 100);
      }
    );
    
    // 娓呯悊 Monaco 娉ㄥ叆锟?VSCode CSS 鍙橀噺
    setTimeout(() => {
      cleanupVSCodeVariables();
    }, 100);
  };

  // 杈呭姪鍑芥暟锛氶獙璇佸苟娓呯悊棰滆壊鍊硷紙Monaco Editor 瑕佹眰 6 浣嶆垨 8 浣嶅崄鍏繘鍒讹級
  const sanitizeColor = (color: string | undefined): string | undefined => {
    if (!color || typeof color !== 'string') return undefined;
    const cleaned = color.trim().replace(/^#/, '');
    
    // 3 浣嶅崄鍏繘鍒讹細鎵╁睍锟?6 浣嶏紙fff -> ffffff锟?
    if (/^[0-9A-Fa-f]{3}$/.test(cleaned)) {
      const [r, g, b] = cleaned.split('');
      return `${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    
    // 6 浣嶆垨 8 浣嶅崄鍏繘鍒讹細鐩存帴杩斿洖锛堣浆灏忓啓锟?
    if (/^[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{8}$/.test(cleaned)) {
      return cleaned.toLowerCase();
    }
    
    return undefined;
  };

  // 搴旂敤涓婚锟?Monaco 缂栬緫鍣ㄧ殑鏍稿績鍑芥暟
  const applyThemeToMonaco = (themeData: any, monaco: Monaco) => {
    try {
        monacoDebugLog('[MonacoEditor] applyThemeToMonaco 寮€濮嬶紝涓婚鏁版嵁:', {
          id: themeData.id,
          name: themeData.name,
          type: themeData.type,
          hasColors: !!themeData.colors,
          colorsCount: Object.keys(themeData.colors || {}).length,
          colorsSample: Object.entries(themeData.colors || {}).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ')
        });
        
        // 瀹氫箟骞舵敞鍐屼富棰樺埌 Monaco Editor
        const themeId = `custom-${sanitizeMonacoThemeId(themeData?.id)}`;
        
        // 杈呭姪鍑芥暟锛氳鑼冨寲棰滆壊鍊硷紙淇濈暀 # 鍙凤級
        const normalizeColorWithHash = (color: string | undefined, fallback?: string): string => {
          const colorToUse = color || fallback;
          if (!colorToUse) return fallback || '#000000';
          
          // 绉婚櫎 # 鍙疯繘琛屽锟?
          const cleaned = colorToUse.trim().replace(/^#/, '');
          
          // 3 浣嶅崄鍏繘鍒讹細鎵╁睍锟?6 锟?
          if (/^[0-9A-Fa-f]{3}$/.test(cleaned)) {
            const [r, g, b] = cleaned.split('');
            return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
          }
          
          // 6 浣嶆垨 8 浣嶅崄鍏繘鍒讹細娣诲姞 # 锟?
          if (/^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(cleaned)) {
            return `#${cleaned.toLowerCase()}`;
          }
          
          return colorToUse;
        };

        // 涓婚杞崲锟?Monaco 涓婚鏍煎紡
        const rules = themeData.tokenColors?.map((token: any) => {
          const rule: any = {
            token: token.scope || '',
          };
          
          const fg = sanitizeColor(token.settings?.foreground);
          const bg = sanitizeColor(token.settings?.background);
          
          if (fg) rule.foreground = fg;
          if (bg) rule.background = bg;
          if (token.settings?.fontStyle) rule.fontStyle = token.settings.fontStyle;
          
          return rule;
        }).filter((rule: any) => rule.token) || [];

        // 锟?锟?semanticTokenColors 鍒涘缓棰濆锟?Token 瑙勫垯
        // 灏嗚锟?Token 棰滆壊鏄犲皠鍒板叿浣撶殑 TextMate scope
        if (themeData.semanticTokenColors) {
          const semanticToScopeMapping: Record<string, string[]> = {
            'property': ['entity.name.tag', 'support.type.property-name'],
            'variable': ['variable', 'variable.other'],
            'parameter': ['variable.parameter'],
            'string': ['string'],
            'number': ['constant.numeric'],
            'keyword': ['keyword'],
            'type': ['entity.name.type', 'support.type'],
            'class': ['entity.name.class', 'support.class'],
            'function': ['entity.name.function', 'support.function'],
            'method': ['entity.name.function.member'],
            'namespace': ['entity.name.namespace'],
            'enum': ['entity.name.enum'],
            'interface': ['entity.name.interface'],
            'typeParameter': ['entity.name.type.parameter'],
            'comment': ['comment']
          };

          Object.entries(themeData.semanticTokenColors).forEach(([semanticType, color]) => {
            const scopes = semanticToScopeMapping[semanticType];
            if (scopes && typeof color === 'string') {
              const normalizedColor = normalizeColorWithHash(color);
              scopes.forEach(scope => {
                rules.push({
                  token: scope,
                  foreground: normalizedColor.replace(/^#/, '')
                });
              });
            }
          });

          monacoDebugLog('[MonacoEditor] 锟?宸蹭粠 semanticTokenColors 鐢熸垚', 
            Object.keys(themeData.semanticTokenColors).length, 
            '涓锟?Token 瑙勫垯锛屾€昏鍒欐暟:', rules.length);
          
          // 馃攳 璋冭瘯锛氭墦鍗扮敓鎴愮殑璇箟 Token 瑙勫垯
          monacoDebugLog('[MonacoEditor] 馃搵 璇箟 Token 瑙勫垯璇︽儏:', 
            rules.slice(-15).map((r: any) => ({ token: r.token, foreground: r.foreground })));
          
          // 馃攳 璋冭瘯锛氭坊锟?JSON 涓撶敤锟?Token 瑙勫垯
          // Monaco JSON 璇█浣跨敤鐗规畩锟?token 鍛藉悕绾﹀畾
          if (themeData.semanticTokenColors.property) {
            const propColor = normalizeColorWithHash(themeData.semanticTokenColors.property).replace(/^#/, '');
            // JSON 灞炴€ч敭鐨勬墍鏈夊彲锟?token 鍚嶇О
            rules.push({ token: 'string.key.json', foreground: propColor });
            rules.push({ token: 'support.type.property-name.json', foreground: propColor });
            rules.push({ token: 'keyword.json', foreground: propColor }); // 鏈夋椂 Monaco 浼氱敤杩欎釜
            // 锟?Markdown 浠ｇ爜鍧椾腑锟?JSON 灞炴€ч敭
            rules.push({ token: 'key.json', foreground: propColor, fontStyle: 'bold' });
            monacoDebugLog('[MonacoEditor] 馃敡 娣诲姞 JSON 灞炴€ц锟?', propColor);
          }
          
          if (themeData.semanticTokenColors.string) {
            const strColor = normalizeColorWithHash(themeData.semanticTokenColors.string).replace(/^#/, '');
            // JSON 瀛楃涓诧拷?
            rules.push({ token: 'string.value.json', foreground: strColor });
            rules.push({ token: 'string.json', foreground: strColor }); // 閫氱敤瀛楃锟?Markdown 涓娇锟?
            monacoDebugLog('[MonacoEditor] 馃敡 娣诲姞 JSON 瀛楃涓插€艰锟?', strColor);
          }
          
          if (themeData.semanticTokenColors.number) {
            const numColor = normalizeColorWithHash(themeData.semanticTokenColors.number).replace(/^#/, '');
            // JSON 鏁板瓧
            rules.push({ token: 'number.json', foreground: numColor });
            rules.push({ token: 'constant.numeric.json', foreground: numColor });
            monacoDebugLog('[MonacoEditor] 馃敡 娣诲姞 JSON 鏁板瓧瑙勫垯:', numColor);
          }
          
          if (themeData.semanticTokenColors.keyword) {
            const keywordColor = normalizeColorWithHash(themeData.semanticTokenColors.keyword).replace(/^#/, '');
            // JSON 鍏抽敭锟?(true, false, null)
            rules.push({ token: 'keyword.json', foreground: keywordColor });
            monacoDebugLog('[MonacoEditor] 馃敡 娣诲姞 JSON 鍏抽敭瀛楄锟?', keywordColor);
          }
          
          // 馃幆 鍏抽敭淇锛歁onaco JSON 榛樿 token 閫氬父娌℃湁 .json 鍚庣紑
          // 璁╂垜浠坊鍔犳棤鍚庣紑鐨勭増锟?
          monacoDebugLog('[MonacoEditor] 馃幆 娣诲姞閫氱敤 Monaco token 瑙勫垯...');
          if (themeData.semanticTokenColors.property) {
            const propColor = normalizeColorWithHash(themeData.semanticTokenColors.property).replace(/^#/, '');
            rules.push({ token: 'string.key', foreground: propColor });
            rules.push({ token: 'key', foreground: propColor });
            // 锟?涓鸿锟?token 娣诲姞瑙勫垯锛堟敮锟?Markdown 浠ｇ爜鍧椾腑锟?JSON锟?
            rules.push({ token: 'property', foreground: propColor, fontStyle: 'bold' });
          }
          if (themeData.semanticTokenColors.string) {
            const strColor = normalizeColorWithHash(themeData.semanticTokenColors.string).replace(/^#/, '');
            rules.push({ token: 'string.value', foreground: strColor });
          }
          if (themeData.semanticTokenColors.number) {
            const numColor = normalizeColorWithHash(themeData.semanticTokenColors.number).replace(/^#/, '');
            rules.push({ token: 'number', foreground: numColor });
          }
          // 锟?涓哄垎闅旂锛堟嫭鍙枫€侀€楀彿绛夛級娣诲姞瑙勫垯
          // 浼樺厛浣跨敤涓婚涓殑 delimiter 棰滆壊锛屽叾锟?operator锛屾渶鍚庝娇鐢ㄥ墠鏅壊
          const delimiterColor = themeData.semanticTokenColors?.delimiter ||
                                 themeData.semanticTokenColors?.operator || 
                                 themeData.colors?.['editor.foreground'] || 
                                 '#839496';
          const delimColor = normalizeColorWithHash(delimiterColor).replace(/^#/, '');
          // 娣诲姞鍚勭 delimiter token 鍙樹綋
          rules.push({ token: 'delimiter', foreground: delimColor });
          rules.push({ token: 'delimiter.bracket', foreground: delimColor });
          rules.push({ token: 'delimiter.array', foreground: delimColor });
          rules.push({ token: 'delimiter.comma', foreground: delimColor });
          rules.push({ token: 'delimiter.colon', foreground: delimColor });
          rules.push({ token: 'delimiter.json', foreground: delimColor });
          rules.push({ token: 'delimiter.bracket.json', foreground: delimColor });
          rules.push({ token: 'delimiter.array.json', foreground: delimColor });
          rules.push({ token: 'delimiter.comma.json', foreground: delimColor });
          rules.push({ token: 'delimiter.colon.json', foreground: delimColor });
          // 娣诲姞鏍囩偣绗﹀彿
          rules.push({ token: 'punctuation', foreground: delimColor });
          rules.push({ token: 'punctuation.definition', foreground: delimColor });
          rules.push({ token: 'punctuation.separator', foreground: delimColor });
          
          // 猸愨瓙锟?鍏抽敭淇锛歁arkdown 涓祵鍏ョ殑 JSON 浠ｇ爜鍧椾娇鐢ㄧ壒娈婄殑 token 鍓嶇紑
          // Monaco 锟?Markdown 涓祵鍏ュ叾浠栬瑷€鏃讹紝浼氫娇锟?"meta.embedded" 鍓嶇紑
          rules.push({ token: 'meta.embedded.block.json delimiter', foreground: delimColor });
          rules.push({ token: 'meta.embedded.block.json delimiter.bracket', foreground: delimColor });
          rules.push({ token: 'meta.embedded.block.json delimiter.array', foreground: delimColor });
          rules.push({ token: 'meta.embedded.block.json delimiter.comma', foreground: delimColor });
          rules.push({ token: 'meta.embedded.block.json punctuation', foreground: delimColor });
          
          monacoDebugLog('[MonacoEditor] 馃敡 娣诲姞鍒嗛殧绗﹁鍒欙紙锟?Markdown 宓屽叆寮忥級:', delimColor);
        }

        // 杈呭姪鍑芥暟锛氫粠涓婚鏁版嵁涓幏鍙栭鑹诧紝鏀寔 --ws- 鍓嶇紑鍜屾爣鍑嗛敭
        const getColorFromTheme = (key: string, fallback?: string): string => {
          const wsKey = `--ws-${key.replace(/\./g, '-')}`;
          const color = themeData.colors?.[key] || themeData.colors?.[wsKey];
          
          // 璋冭瘯鏃ュ織锛氭樉绀洪鑹茶幏鍙栬繃锟?
          if (key === 'editor.background' || key === 'editor.foreground') {
            monacoDebugLog(`[MonacoEditor] 鑾峰彇棰滆壊 ${key}:`, {
              standardKey: key,
              wsKey,
              colorFromStandardKey: themeData.colors?.[key],
              colorFromWsKey: themeData.colors?.[wsKey],
              finalColor: color,
              normalized: normalizeColorWithHash(color, fallback)
            });
          }
          
          return normalizeColorWithHash(color, fallback);
        };

        // 鏋勫缓瀹屾暣鐨勯鑹插璞★紝鏄犲皠鎵€锟?Monaco Editor 闇€瑕佺殑棰滆壊
        // 杩欐牱鍙互鏈€澶х▼搴﹂伩锟?Monaco 浣跨敤榛樿锟?
        const colors: Record<string, string> = {};

        // 浠庝富棰樻暟鎹腑鎻愬彇鎵€鏈夐锟?
        if (themeData.colors) {
          // 鐩存帴浣跨敤涓婚涓殑鎵€鏈夐锟?
          Object.entries(themeData.colors).forEach(([key, value]) => {
            if (typeof value === 'string') {
              colors[key] = normalizeColorWithHash(value);
            }
          });
        }

        monacoDebugLog('[MonacoEditor] 鎻愬彇鐨勯鑹叉暟锟?', Object.keys(colors).length);
        monacoDebugLog('[MonacoEditor] 缂栬緫鍣ㄨ儗鏅壊:', colors['editor.background']);
        monacoDebugLog('[MonacoEditor] 缂栬緫鍣ㄥ墠鏅壊:', colors['editor.foreground']);

        // 鎻愬彇璇箟 Token 棰滆壊
        const semanticTokenColors: Record<string, string> = {};
        if (themeData.semanticTokenColors) {
          Object.entries(themeData.semanticTokenColors).forEach(([key, value]) => {
            if (typeof value === 'string') {
              semanticTokenColors[key] = normalizeColorWithHash(value);
            }
          });
          monacoDebugLog('[MonacoEditor] 鎻愬彇鐨勮锟?Token 棰滆壊:', semanticTokenColors);
        }

        // 鍒涘缓瀹屽叏鑷畾涔夌殑涓婚
        // 娉ㄦ剰锛歜ase 蹇呴』锟?'vs', 'vs-dark', 锟?'hc-black' 涔嬩竴
        // inherit: true 浠ョ户鎵胯娉曢珮浜鍒欙紙鍥犱负鎴戜滑鐨勪富棰樹腑娌℃湁 tokenColors锟?
        const monacoTheme: monaco.editor.IStandaloneThemeData = {
          base: themeData.type === 'light' ? 'vs' : 'vs-dark',
          inherit: true,  // 缁ф壙鍩虹涓婚鐨勮娉曡鍒欙紝浣嗕娇鐢ㄦ垜浠殑棰滆壊
          rules,
          colors,
          encodedTokensColors: undefined
        };

        // 锟?娣诲姞璇箟楂樹寒瑙勫垯锛堢敤浜庤锟?token 鎻愪緵鍣級
        const semanticHighlightingRules: Record<string, string> = {};
        
        // 涓烘瘡涓锟?token 绫诲瀷娣诲姞瑙勫垯
        if (themeData.semanticTokenColors) {
          // delimiter锛堝垎闅旂锛氭嫭鍙枫€侀€楀彿绛夛級
          const delimiterColor = themeData.semanticTokenColors.delimiter ||
                                 themeData.semanticTokenColors.operator || 
                                 themeData.colors?.['editor.foreground'] || 
                                 '#839496';
          semanticHighlightingRules['delimiter'] = normalizeColorWithHash(delimiterColor);
          
          // property锛圝SON 灞炴€у悕锟?
          if (themeData.semanticTokenColors.property) {
            semanticHighlightingRules['property'] = normalizeColorWithHash(themeData.semanticTokenColors.property);
            monacoDebugLog('[MonacoEditor] loaded property color from theme:', themeData.semanticTokenColors.property, '->', semanticHighlightingRules['property']);
          }
          
          // string锛堝瓧绗︿覆锟?
          if (themeData.semanticTokenColors.string) {
            semanticHighlightingRules['string'] = normalizeColorWithHash(themeData.semanticTokenColors.string);
          }
          
          // number锛堟暟瀛楋級
          if (themeData.semanticTokenColors.number) {
            semanticHighlightingRules['number'] = normalizeColorWithHash(themeData.semanticTokenColors.number);
          }
          
          // keyword锛堝叧閿瓧锟?
          if (themeData.semanticTokenColors.keyword) {
            semanticHighlightingRules['keyword'] = normalizeColorWithHash(themeData.semanticTokenColors.keyword);
          }
          
          monacoDebugLog('[MonacoEditor] 馃帹 璇箟楂樹寒瑙勫垯:', semanticHighlightingRules);
        }

        // 濡傛灉鏈夎锟?Token 棰滆壊锛屾坊鍔犲埌涓婚涓紙浣跨敤绫诲瀷鏂█缁曡繃 TypeScript 闄愬埗锟?
        if (Object.keys(semanticTokenColors).length > 0) {
          (monacoTheme as monaco.editor.IStandaloneThemeData & { semanticTokenColors?: Record<string, string> }).semanticTokenColors = semanticTokenColors;
        }
        
        // 娣诲姞璇箟楂樹寒瑙勫垯鍒颁富锟?
        if (Object.keys(semanticHighlightingRules).length > 0) {
          (monacoTheme as monaco.editor.IStandaloneThemeData & { semanticHighlighting?: boolean; semanticTokenColors?: Record<string, string> }).semanticHighlighting = true;
          (monacoTheme as monaco.editor.IStandaloneThemeData & { semanticTokenColors?: Record<string, string> }).semanticTokenColors = semanticHighlightingRules;
        }

        monacoDebugLog('[MonacoEditor] 鍑嗗娉ㄥ唽涓婚:', {
          themeId,
          base: monacoTheme.base,
          inherit: monacoTheme.inherit,
          rulesCount: rules.length,
          colorsCount: Object.keys(colors).length,
          colorsSample: Object.entries(colors).slice(0, 10),
          editorBackground: colors['editor.background'],
          editorForeground: colors['editor.foreground']
        });
        
        // // 馃攳 鍏抽敭璋冭瘯锛氭墦鍗版墍鏈変笌 JSON 鐩稿叧锟?token 瑙勫垯
        // const jsonRules = rules.filter((r: any) => 
        //   r.token.includes('json') || 
        //   r.token.includes('string') || 
        //   r.token.includes('number') ||
        //   r.token.includes('key')
        // );
        // monacoDebugLog('[MonacoEditor] 馃幆 JSON 鐩稿叧锟?Token 瑙勫垯 (' + jsonRules.length + ' 锟?:', 
        //   JSON.stringify(jsonRules, null, 2));

        monaco.editor.defineTheme(themeId, monacoTheme);
        monacoDebugLog('[MonacoEditor] 涓婚宸插畾锟?', themeId);
        
        monaco.editor.setTheme(themeId);
        monacoDebugLog('[MonacoEditor] 涓婚宸茶锟?', themeId);
        
        setCurrentTheme(themeId);
        
        // 锟?寮哄埗搴旂敤 JSON token 棰滆壊锛堥€氳繃 CSS 鐩存帴瑕嗙洊锟?
        injectJSONTokenColors(themeId, themeData.semanticTokenColors || {});
        
        // 馃敟 鍏抽敭淇锛氫富棰樺簲鐢ㄥ悗锛屽己鍒堕噸锟?tokenize 褰撳墠鏂囨。
        // 杩欐牱鍙互纭繚 Markdown 浠ｇ爜鍧椾腑锟?JSON 楂樹寒姝ｅ父鏄剧ず
        setTimeout(() => {
          if (editorRef.current) {
            const model = editorRef.current.getModel();
            if (model) {
              const languageId = model.getLanguageId();
              monacoDebugLog('[MonacoEditor] 馃攧 涓婚搴旂敤鍚庨噸锟?tokenize锛岃瑷€:', languageId);
              
              // 寮哄埗閲嶆柊璁剧疆璇█锛堣Е锟?tokenization锟?
              monaco.editor.setModelLanguage(model, languageId);
              
              // 濡傛灉锟?Markdown锛岄澶栧埛鏂颁竴娆″竷灞€
              if (languageId === 'markdown') {
                editorRef.current.layout();
                monacoDebugLog('[MonacoEditor] 锟?Markdown 缂栬緫鍣ㄥ凡閲嶆柊甯冨眬');
              }
            }
          }
          
          // 娓呯悊 VSCode CSS 鍙橀噺
          cleanupVSCodeVariables();
          monacoDebugLog('[MonacoEditor] CSS 鍙橀噺娓呯悊瀹屾垚');
        }, 150); // 澧炲姞寤惰繜锛岀‘淇濅富棰樺畬鍏ㄥ簲锟?
      } catch (error) {
        console.error('[MonacoEditor] 涓婚搴旂敤澶辫触:', error);
      }
  };
  
  // 閫氳繃娉ㄥ叆 CSS 寮哄埗瑕嗙洊 JSON token 棰滆壊
  const injectJSONTokenColors = (themeId: string, semanticTokenColors: Record<string, string>) => {
    monacoDebugLog('[MonacoEditor] injectJSONTokenColors called');
    monacoDebugLog('[MonacoEditor] themeId:', themeId);
    monacoDebugLog('[MonacoEditor] semanticTokenColors:', semanticTokenColors);
    
    const styleId = 'monaco-json-token-colors';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
      monacoDebugLog('[MonacoEditor] 锟?鍒涘缓浜嗘柊锟?<style> 鍏冪礌');
    } else {
      monacoDebugLog('[MonacoEditor] 鈾伙笍 澶嶇敤鐜版湁锟?<style> 鍏冪礌');
    }
    
    // 鏋勫缓 CSS 瑙勫垯
    const cssRules: string[] = [];
    
    // JSON 灞炴€ч敭锛坧roperty name锟? 绮剧‘瑕嗙洊 mtk1 绫伙紙浣跨敤鏇撮珮浼樺厛绾х殑閫夋嫨鍣級
    if (semanticTokenColors.property) {
      const color = semanticTokenColors.property;
      cssRules.push(`
        /* JSON 灞炴€ч敭閫氬父浣跨敤 mtk1 锟?- 瓒呴珮浼樺厛绾ч€夋嫨锟?*/
        .monaco-editor .${themeId} .view-line .mtk1,
        .monaco-editor.${themeId} .view-line .mtk1,
        .${themeId} .view-line .mtk1 {
          color: ${color} !important;
        }
      `);
    }
    
    // JSON 瀛楃涓诧拷?
    if (semanticTokenColors.string) {
      const color = semanticTokenColors.string;
      cssRules.push(`
        .monaco-editor .${themeId} .view-line .mtk10,
        .monaco-editor.${themeId} .view-line .mtk10,
        .${themeId} .view-line .mtk10,
        .${themeId} .token.string.value.json {
          color: ${color} !important;
        }
      `);
    }
    
    // JSON 鏁板瓧
    if (semanticTokenColors.number) {
      const color = semanticTokenColors.number;
      cssRules.push(`
        .monaco-editor .${themeId} .view-line .mtk7,
        .monaco-editor.${themeId} .view-line .mtk7,
        .${themeId} .view-line .mtk7,
        .${themeId} .token.constant.numeric.json,
        .${themeId} .token.number.json {
          color: ${color} !important;
        }
      `);
    }
    
    // JSON 鍏抽敭锟?(true, false, null)
    if (semanticTokenColors.keyword) {
      const color = semanticTokenColors.keyword;
      cssRules.push(`
        .monaco-editor .${themeId} .view-line .mtk8,
        .monaco-editor.${themeId} .view-line .mtk8,
        .${themeId} .view-line .mtk8,
        .${themeId} .token.keyword.json {
          color: ${color} !important;
        }
      `);
    }
    
    // 锟?JSON 鍒嗛殧绗︼紙鎷彿銆侀€楀彿銆佸啋鍙风瓑锟?
    // tokenType 10 (delimiter) 锟?mtk11 (Monaco 锟?1 寮€濮嬬储锟?
    const delimiterColor = semanticTokenColors.delimiter || 
                           semanticTokenColors.operator || 
                           '#839496';
    
    monacoDebugLog('[MonacoEditor] 馃攳 鍒嗛殧绗﹂鑹茶皟璇曚俊锟?');
    monacoDebugLog('  - semanticTokenColors.delimiter:', semanticTokenColors.delimiter);
    monacoDebugLog('  - semanticTokenColors.operator:', semanticTokenColors.operator);
    monacoDebugLog('  - 鏈€缁堜娇鐢ㄧ殑棰滆壊:', delimiterColor);
    
    cssRules.push(`
      /* 璇箟 token - delimiter (tokenType 10 锟?mtk11) */
      .monaco-editor .view-line .mtk11,
      .monaco-editor.${themeId} .view-line .mtk11,
      .${themeId} .view-line .mtk11,
      .view-line .mtk11,
      /* 鏍囧噯 token - delimiter */
      .${themeId} .token.delimiter,
      .${themeId} .token.delimiter.bracket,
      .${themeId} .token.delimiter.array,
      .${themeId} .token.delimiter.comma,
      .${themeId} .token.delimiter.colon,
      .${themeId} .token.delimiter.json,
      .${themeId} .token.delimiter.bracket.json,
      .${themeId} .token.delimiter.array.json,
      .${themeId} .token.delimiter.comma.json,
      .${themeId} .token.delimiter.colon.json,
      .${themeId} .token.punctuation,
      .${themeId} .token.punctuation.definition,
      .${themeId} .token.punctuation.separator,
      /* 鍏ㄥ眬瑕嗙洊锛堟渶楂樹紭鍏堢骇锟?*/
      .monaco-editor .mtk11,
      span.mtk11 {
        color: ${delimiterColor} !important;
      }
    `);
    monacoDebugLog('[MonacoEditor] 馃拤 娣诲姞鍒嗛殧锟?CSS 瑙勫垯锛坱okenType 10 锟?mtk11锛夛紝棰滆壊:', delimiterColor);
    
    styleEl.textContent = cssRules.join('\n');
    monacoDebugLog('[MonacoEditor] injected JSON token CSS rules:', cssRules.length);
    
    // 锟?JSON tokenizer 宸插湪 handleEditorWillMount 涓纭厤锟?
    // 涓嶉渶瑕佸湪杩欓噷閲嶅璁剧疆锛岄伩鍏嶈鐩栦箣鍓嶇殑閰嶇疆
    monacoDebugLog('[MonacoEditor] JSON delimiter colors controlled by theme rules');
  };
  
  // 娓呴櫎 VSCode 鍓嶇紑锟?CSS 鍙橀噺
  // 娓呯悊鍑芥暟锛氱Щ锟?Monaco 鍙兘娉ㄥ叆锟?CSS 鍙橀噺锛堜綔涓哄弻閲嶄繚闄╋級
  // 娉細宸查€氳繃 semanticHighlighting.enabled: false 浠庢簮澶寸锟?
  const cleanupVSCodeVariables = () => {
    const root = document.documentElement;
    const styles = root.style;
    const propertiesToRemove: string[] = [];
    
    // 鏀堕泦鎵€锟?--vscode- 鍓嶇紑鐨勫彉锟?
    for (let i = 0; i < styles.length; i++) {
      const propertyName = styles[i];
      if (propertyName.startsWith('--vscode-')) {
        propertiesToRemove.push(propertyName);
      }
    }
    
    // 濡傛灉鍙戠幇浜嗚繖浜涘彉閲忥紙鐞嗚涓婁笉搴旇鍑虹幇锛夛紝绉婚櫎瀹冧滑
    if (propertiesToRemove.length > 0) {
      propertiesToRemove.forEach(property => {
        root.style.removeProperty(property);
      });
      console.warn(`[MonacoEditor] removed unexpected --vscode- vars: ${propertiesToRemove.length}`);
    }
  };

  // Monaco 瀹炰緥鍑嗗濂藉悗锛屽簲鐢ㄧ瓑寰呬腑鐨勪富锟?
  useEffect(() => {
    if (monacoInstance && pendingTheme) {
      applyThemeToMonaco(pendingTheme, monacoInstance);
      setPendingTheme(null);
    }
  }, [monacoInstance, pendingTheme]);
  
  // 瀹氭湡娓呯悊 VSCode CSS 鍙橀噺
  useEffect(() => {
    // 绔嬪嵆娓呯悊涓€锟?
    cleanupVSCodeVariables();
    
    // 璁剧疆瀹氭湡娓呯悊
    const cleanupInterval = setInterval(() => {
      cleanupVSCodeVariables();
    }, 2000); // 锟?绉掓竻鐞嗕竴锟?
    
    return () => {
      clearInterval(cleanupInterval);
    };
  }, []);

  // 鐩戝惉涓婚鍙樺寲
  // 浣跨敤 useRef 瀛樺偍鐩戝惉鍣ㄥ嚱鏁帮紝閬垮厤渚濊禆椤瑰彉鍖栧鑷撮噸澶嶆坊锟?
  const themeChangeHandlerRef = useRef<((_event: any, themeData: any) => void) | null>(null);
  
  useEffect(() => {
    // 濡傛灉宸茬粡鏈夌洃鍚櫒锛屽厛绉婚櫎鏃х殑
    if (themeChangeHandlerRef.current) {
      window.electron?.ipcRenderer.removeListener('theme:theme-changed', themeChangeHandlerRef.current);
    }

    const handleThemeChange = (_event: any, themeData: any) => {
      if (!monacoInstance) {
        setPendingTheme(themeData);
        return;
      }

      applyThemeToMonaco(themeData, monacoInstance);
    };

    // 淇濆瓨鐩戝惉鍣ㄥ紩锟?
    themeChangeHandlerRef.current = handleThemeChange;

    // 鐩戝惉涓婚鍙樺寲浜嬩欢
    window.electron?.ipcRenderer.on('theme:theme-changed', handleThemeChange);

    // 鑾峰彇褰撳墠涓婚
    window.electron?.ipcRenderer.invoke('theme:get-current-theme').then((theme) => {
      if (theme) {
        handleThemeChange(null, theme);
      }
    }).catch((error: any) => {
      console.error('[MonacoEditor] 鑾峰彇褰撳墠涓婚澶辫触:', error);
    });

    return () => {
      if (themeChangeHandlerRef.current) {
        window.electron?.ipcRenderer.removeListener('theme:theme-changed', themeChangeHandlerRef.current);
        themeChangeHandlerRef.current = null;
      }
    };
  }, [monacoInstance]);

  // 鍔ㄦ€佹洿鏂拌瑷€妯″紡锛堟敮鎸佽娉曢珮浜級
  useEffect(() => {
    if (!isEditorReady || !editorRef.current || !monacoInstance) {
      return;
    }

    const editor = editorRef.current;
    const model = editor.getModel();
    
    if (model) {
      const currentLanguageId = model.getLanguageId();
      
      // 鐗规畩澶勭悊锛氬鏋滄槸鐗囨鏂囦欢锛屽己鍒朵娇锟?jsonc锛屽拷锟?language prop
      const isSnippetFile = tabId && (tabId.startsWith('snippet-') || tabId.includes('snippet'));
      const targetLanguage = isSnippetFile ? 'jsonc' : language;
      
      if (currentLanguageId !== targetLanguage) {
        monacoDebugLog(`[MonacoEditor] update language mode: ${currentLanguageId} -> ${targetLanguage}`, {
          tabId,
          isSnippetFile,
          languageProp: language,
          finalLanguage: targetLanguage
        });
        monacoInstance.editor.setModelLanguage(model, targetLanguage);
      }
    }
  }, [language, isEditorReady, monacoInstance, tabId]);


  // 更新全局标签页信息
  useEffect(() => {
    (window as any).__currentTabId = tabId;
    (window as any).__currentTabTitle = tabTitle;
    (window as any).__currentTabPath = filePath;
  }, [tabId, tabTitle, filePath]);

  // 鐩戝惉缂栬緫鍣ㄦ粴鍔ㄤ簨浠讹紝鍚屾鍒伴锟?
  useEffect(() => {
    if (!isEditorReady || !editorRef.current || !tabId) {
      return;
    }

    const editor = editorRef.current;
    
    // 鐩戝惉缂栬緫鍣ㄦ粴锟?
    const scrollDisposable = editor.onDidScrollChange((e) => {
      if (isSyncingScrollRef.current) return;

      // 娓呴櫎涔嬪墠鐨勫畾鏃跺櫒
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // 闃叉姈澶勭悊
      scrollTimeoutRef.current = setTimeout(() => {
        const visibleRange = editor.getVisibleRanges()[0];
        if (!visibleRange) return;

        const model = editor.getModel();
        if (!model) return;

        const totalLines = model.getLineCount();
        const currentLine = visibleRange.startLineNumber;
        
        // 璁＄畻婊氬姩鐧惧垎锟?
        const scrollPercentage = currentLine / totalLines;

        // 骞挎挱婊氬姩浜嬩欢鍒板搴旂殑棰勮缁勪欢
        const customEvent = new CustomEvent('editor-scroll', {
          detail: {
            sourceTabId: tabId,
            scrollPercentage: scrollPercentage
          }
        });
        window.dispatchEvent(customEvent);
      }, 50); // 50ms 闃叉姈
    });

    // 鐩戝惉鏉ヨ嚜棰勮鐨勬粴鍔ㄥ悓姝ヨ锟?
    const handlePreviewScroll = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        sourceTabId: string;
        scrollPercentage: number;
      }>;
      const { sourceTabId, scrollPercentage } = customEvent.detail;

      // 鍙鐞嗕笌褰撳墠鏍囩椤靛搴旂殑婊氬姩鍚屾
      if (sourceTabId !== tabId) return;

      const model = editor.getModel();
      if (!model) return;

      const totalLines = model.getLineCount();
      const targetLine = Math.floor(totalLines * scrollPercentage);

      // 璁剧疆鍚屾鏍囧織锛岄槻姝㈠惊鐜Е锟?
      isSyncingScrollRef.current = true;

      // 婊氬姩鍒扮洰鏍囪
      editor.revealLineInCenter(targetLine);

      // 閲嶇疆鍚屾鏍囧織
      setTimeout(() => {
        isSyncingScrollRef.current = false;
      }, 100);
    };

    window.addEventListener('preview-scroll', handlePreviewScroll);

    return () => {
      scrollDisposable.dispose();
      window.removeEventListener('preview-scroll', handlePreviewScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [isEditorReady, tabId, tabTitle]);

  // 缁勪欢鍗歌浇鏃舵竻锟?
  useEffect(() => {
    return () => {
      compositionCleanupRef.current?.();
      compositionCleanupRef.current = null;
      isImeComposingRef.current = false;

      // 娓呯悊鍛戒护涓績
      if (commandCenterRef.current) {
        commandCenterRef.current.dispose();
        commandCenterRef.current = null;
      }

      // 娓呯悊 diff 鍐呭鍜岀┖锟?
      cleanupPreviousDiff();

      // 娓呯悊 AI widgets
      if (aiZoneWidgetRef.current) {
        aiZoneWidgetRef.current.dispose();
        aiZoneWidgetRef.current = null;
      }


      if (ghostTextRef.current) {
        ghostTextRef.current.dispose();
        ghostTextRef.current = null;
      }

      if (currentGhostWidgetRef.current) {
        currentGhostWidgetRef.current.dispose();
        currentGhostWidgetRef.current = null;
      }

      if (decorationManagerRef.current) {
        decorationManagerRef.current.dispose();
        decorationManagerRef.current = null;
      }

      if (aiRewriteWidgetRef.current) {
        aiRewriteWidgetRef.current.dispose();
        aiRewriteWidgetRef.current = null;
      }
    };
  }, []);

  // 鐩戝惉浼樺厛绱㈠紩杩涘害浜嬩欢
  useEffect(() => {
    const handlePriorityIndexProgress = (_event: unknown, data: { filePath: string; stage: string }) => {
      monacoDebugLog(`[MonacoEditor] priority index progress: ${data.stage} - ${data.filePath}`);
      // 鏇存柊 AIZoneWidget 鐨勬€濊€冪姸锟?
      if (aiZoneWidgetRef.current) {
        aiZoneWidgetRef.current.updateThinkingText(data.stage);
      }
    };

    window.electron?.ipcRenderer.on('workspace-index-db:priority-index-progress', handlePriorityIndexProgress);

    return () => {
      window.electron?.ipcRenderer.removeListener('workspace-index-db:priority-index-progress', handlePriorityIndexProgress);
    };
  }, []);

  // 鐩戝惉瀹氫綅鍒版寚瀹氳鐨勪簨锟?
  useEffect(() => {
    const handleRevealLine = (event: Event) => {
      const customEvent = event as CustomEvent<{ lineNumber: number; column: number }>;
      const editor = editorRef.current;
      
      if (editor && customEvent.detail) {
        const { lineNumber, column } = customEvent.detail;
        
        // 璁剧疆鍏夋爣浣嶇疆
        editor.setPosition({ lineNumber, column });
        
        // 婊氬姩鍒拌浣嶇疆骞跺眳涓樉绀猴紝涓嶄娇鐢ㄥ姩锟?
        editor.revealLineInCenter(lineNumber, monaco.editor.ScrollType.Immediate);
        
        // 鑱氱劍缂栬緫锟?
        editor.focus();
      }
    };

    window.addEventListener('editor-reveal-line', handleRevealLine as EventListener);

    return () => {
      window.removeEventListener('editor-reveal-line', handleRevealLine as EventListener);
    };
  }, []);

  // 鐩戝惉 Monaco 缂栬緫鍣ㄧ殑鍙抽敭鑿滃崟浜嬩欢
  useEffect(() => {
    if (!editorRef.current || !isEditorReady) return;

    const editor = editorRef.current;
    
    // 鑾峰彇缂栬緫鍣ㄧ殑 DOM 瀹瑰櫒鍏冪礌
    const container = editor.getContainerDomNode();
    if (!container) {
      console.warn('[MonacoEditor] failed to get editor container element');
      return;
    }

    monacoDebugLog('[MonacoEditor] 鑾峰彇鍒扮紪杈戝櫒瀹瑰櫒鍏冪礌:', container);
    
    // 鐩存帴锟?DOM 鍏冪礌涓婄洃锟?contextmenu 浜嬩欢
    const handleContextMenu = (e: MouseEvent) => {
      monacoDebugLog('[MonacoEditor] ========== DOM contextmenu 浜嬩欢瑙﹀彂 ==========');
      monacoDebugLog('[MonacoEditor] 浜嬩欢瀵硅薄:', e);
      monacoDebugLog('[MonacoEditor] 榧犳爣浣嶇疆:', e.clientX, e.clientY);
      
      // 闃绘榛樿鐨勫彸閿彍锟?
      e.preventDefault();
      e.stopPropagation();
      
      // 鑾峰彇榧犳爣浣嶇疆锛堢浉瀵逛簬瑙嗗彛锟?
      const x = e.clientX;
      const y = e.clientY;
      
      monacoDebugLog('[MonacoEditor] Showing menu at:', x, y);
      contextMenu.showMenu(x, y);
    };

    container.addEventListener('contextmenu', handleContextMenu);
    monacoDebugLog('[MonacoEditor] Monaco context menu listener attached to DOM');

    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
      monacoDebugLog('[MonacoEditor] Monaco context menu listener disposed');
    };
  }, [contextMenu, isEditorReady]);

  return (
    <div className="monaco-editor-wrapper">
      <Editor
        height="100%"
        width="100%"
        defaultLanguage={language}
        language={language}
        value={value}
        onChange={handleEditorChange}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        loading={<div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          color: 'var(--ws-editor-foreground)',
          backgroundColor: 'var(--ws-editor-background)'
        }}>
          鍔犺浇缂栬緫鍣ㄤ腑...
        </div>}
        theme={currentTheme}
        options={{
          fontSize: 14,
          fontLigatures: false,
          lineHeight: 21,
          letterSpacing: 0,
          lineNumbers: 'on',
          glyphMargin: true, // 鍚敤 glyph margin锛屼緵 AIRewriteWidget 浣跨敤
          renderWhitespace: 'selection',
          minimap: {
            enabled: false
          },
          scrollbar: {
            horizontal: 'auto',
            vertical: 'auto',
            verticalScrollbarSize: 14,
          },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          wrappingStrategy: 'advanced',
          wrappingIndent: 'same',
          automaticLayout: true,
          padding: {
            top: 16,
            bottom: 16
          },
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: true,
          folding: true,
          foldingStrategy: 'indentation',
          showFoldingControls: 'mouseover',
          // 锟?鍚敤璇箟楂樹寒
          'semanticHighlighting.enabled': true,
          matchBrackets: 'always',
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          contextmenu: false, // 绂佺敤 Monaco 榛樿鍙抽敭鑿滃崟锛屼娇鐢ㄨ嚜瀹氫箟鍙抽敭鑿滃崟
          smoothScrolling: true,
          mouseWheelZoom: true,
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          snippetSuggestions: 'top',
          formatOnPaste: true,
          formatOnType: true,
          colorDecorators: true, // 鍚敤棰滆壊瑁呴グ锟?UI锛堜娇鐢ㄨ嚜瀹氫箟棰滆壊鎻愪緵鍣級
          quickSuggestionsDelay: 100,
          occurrencesHighlight: false, // 绂佺敤鍑虹幇浣嶇疆楂樹寒
          // Unicode 楂樹寒閰嶇疆
          unicodeHighlight: {
            ambiguousCharacters: false // 绂佺敤妯＄硦瀛楃楂樹寒
          }
          // 鍚敤璇箟楂樹寒宸插湪涓婇潰瀹氫箟锛堢 1601 琛岋級
        }}
      />
      
      {/* 鑷畾涔夊彸閿彍锟?*/}
      <MonacoContextMenu
        visible={contextMenu.visible}
        x={contextMenu.position.x}
        y={contextMenu.position.y}
        menuGroups={contextMenu.menuGroups}
        onClose={contextMenu.hideMenu}
      />

      {/* 閫夋嫨鐭ヨ瘑搴撳璇濇 */}
      <SelectKnowledgeBaseDialog
        visible={showSelectKnowledgeBaseDialog}
        onClose={() => setShowSelectKnowledgeBaseDialog(false)}
        onSelect={handleSelectKnowledgeBase}
      />
    </div>
  );
};

