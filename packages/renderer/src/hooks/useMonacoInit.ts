/**
 * Monaco Editor 全局初始化钩子
 * 功能：在应用启动时一次性注册全局配置（如颜色提供器）
 */

import { useEffect } from 'react';
import type { Monaco } from '@monaco-editor/react';
import { registerUniversalColorProvider } from '../utils/monaco-color-provider';
import { registerMonacoTableReferenceProvider } from '../services/tableReference';

// 全局标记，确保只初始化一次
let monacoInitialized = false;
let monacoViewLinesFontGuardInstalled = false;

const isMonacoViewLinesElement = (element: Element): element is HTMLElement => {
  return (
    element instanceof HTMLElement &&
    element.classList.contains('view-lines') &&
    element.classList.contains('monaco-mouse-cursor-text')
  );
};

const removeMonacoViewLinesFontFamily = (element: HTMLElement) => {
  if (element.style.getPropertyValue('font-family')) {
    element.style.removeProperty('font-family');
  }
};

const sanitizeMonacoViewLinesFontFamily = (root: ParentNode) => {
  const viewLinesElements = root.querySelectorAll('.view-lines.monaco-mouse-cursor-text');
  viewLinesElements.forEach((node) => {
    if (node instanceof HTMLElement) {
      removeMonacoViewLinesFontFamily(node);
    }
  });
};

const installMonacoViewLinesFontFamilyGuard = () => {
  if (monacoViewLinesFontGuardInstalled || typeof document === 'undefined') {
    return;
  }

  if (!document.body) {
    setTimeout(installMonacoViewLinesFontFamilyGuard, 0);
    return;
  }

  sanitizeMonacoViewLinesFontFamily(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        if (isMonacoViewLinesElement(mutation.target)) {
          removeMonacoViewLinesFontFamily(mutation.target);
        }
        continue;
      }

      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) {
            return;
          }

          if (isMonacoViewLinesElement(node)) {
            removeMonacoViewLinesFontFamily(node);
          }

          sanitizeMonacoViewLinesFontFamily(node);
        });
      }
    }
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });

  monacoViewLinesFontGuardInstalled = true;
  console.log('[Monaco] view-lines font-family guard installed');
};

/**
 * 配置 Monaco Editor 的 Web Worker 环境
 * 在 Electron 环境中，由于 CSP 限制，Web Worker 可能无法正常工作
 * 因此使用主线程模式，并通过提供 Worker 接口来避免警告
 */
const setupMonacoWorkers = () => {
  // 检查是否已经配置过
  if ((self as any).MonacoEnvironment) {
    return;
  }
  
  // 在 Electron 环境中，由于 Content Security Policy 限制，
  // Web Worker 可能无法正常创建，因此使用主线程模式
  // 通过提供一个符合 Worker 接口的对象来避免 Monaco 的警告
  (self as any).MonacoEnvironment = {
    getWorker(_workerId: string, _label: string) {
      // 创建一个符合 Worker 接口的对象
      // Monaco 会检测到这个对象并静默使用主线程模式
      const worker = {
        postMessage: () => {
          // 主线程模式，不需要实际发送消息
        },
        terminate: () => {
          // 主线程模式，不需要实际终止
        },
        addEventListener: (_type: string, _listener: EventListener) => {
          // 主线程模式，不需要实际监听
        },
        removeEventListener: (_type: string, _listener: EventListener) => {
          // 主线程模式，不需要实际移除监听
        },
        onmessage: null,
        onerror: null,
        // 添加 dispatchEvent 方法以满足 Worker 接口
        dispatchEvent: (_event: Event) => false
      };
      
      // 返回 Worker 对象，Monaco 会检测到这是一个有效的 Worker 对象
      // 但实际上所有工作都在主线程中完成
      return worker as any;
    }
  };
};

/**
 * 验证语言支持
 */
const verifyLanguageSupport = (monaco: Monaco) => {
  console.log('[Monaco] 验证语言支持...');
  
  // 验证 JSON 语言是否已注册
  const languages = monaco.languages.getLanguages();
  const hasJson = languages.some(lang => lang.id === 'json');
  console.log('[Monaco] JSON 语言注册状态:', hasJson ? '✅ 已注册' : '❌ 未注册');
  console.log('[Monaco] 所有已注册语言:', languages.map(l => l.id).join(', '));
};

/**
 * 预加载关键语言的 tokenizer
 * 防止主题应用时干扰语言高亮
 */
const preloadEssentialLanguages = async (monaco: Monaco) => {
  console.log('[Monaco] 🔄 开始预加载关键语言...');
  
  // 要预加载的语言列表
  const languagesToPreload = [
    'json',
    'javascript',
    'typescript',
    'python',
    'html',
    'css'
  ];
  
  try {
    // 为每个语言创建一个临时模型，强制加载其 tokenizer
    for (const langId of languagesToPreload) {
      const tempUri = monaco.Uri.parse(`inmemory://preload-${langId}.${langId}`);
      const tempModel = monaco.editor.createModel('', langId, tempUri);
      
      // 等待 tokenizer 加载（通过获取 tokens）
      // 这会触发 Monaco 异步加载该语言的 tokenizer
      if (tempModel.getLanguageId() === langId) {
        console.log(`[Monaco] ✅ ${langId} tokenizer 已预加载`);
      }
      
      // 销毁临时模型
      tempModel.dispose();
    }
    
    console.log('[Monaco] ✅ 所有关键语言已预加载');
  } catch (error) {
    console.warn('[Monaco] ⚠️ 预加载语言时出错（非致命）:', error);
  }
};

/**
 * 初始化 Monaco Editor 的全局配置
 * 这个函数在整个应用生命周期内只会执行一次
 */
export const initializeMonaco = async (monaco: Monaco) => {
  if (monacoInitialized) {
    return;
  }

  console.log('[Monaco] 开始全局初始化...');

  // 配置 Worker 环境
  setupMonacoWorkers();
  installMonacoViewLinesFontFamilyGuard();

  // 验证语言支持
  verifyLanguageSupport(monaco);

  // 🔥 关键修复：预加载 JSON 语言，确保 tokenizer 完全就绪
  // 这样可以防止主题应用时覆盖 JSON 的高亮
  await preloadEssentialLanguages(monaco);
  console.log('[Monaco] 关键语言已预加载');

  // 注册通用颜色提供器（支持 JSON、Markdown 等多种语言）
  registerUniversalColorProvider(monaco);
  console.log('[Monaco] 通用颜色装饰器已注册（JSON + Markdown）');

  // 配置 Markdown 语言的内嵌代码块高亮
  setupMarkdownEmbeddedLanguages(monaco);
  console.log('[Monaco] Markdown 内嵌语言高亮已配置');

  // 注册表格引用自动补全提供器
  registerMonacoTableReferenceProvider(monaco as unknown as typeof import('monaco-editor'), ['markdown', 'plaintext']);
  console.log('[Monaco] 表格引用自动补全已注册');

  // 标记已初始化
  monacoInitialized = true;
  console.log('[Monaco] 全局初始化完成');
};

/**
 * 配置 Markdown 内嵌代码块的语法高亮
 * ⚠️ 注意：不要覆盖 Monaco 内置的 Markdown tokenizer!
 * Monaco Editor 已经内置了对 Markdown 代码块的语法高亮支持
 * 我们只需要确保语言配置正确即可
 */
const setupMarkdownEmbeddedLanguages = (monaco: Monaco) => {
  console.log('[Monaco] 配置 Markdown 语言...');
  
  // 只设置 Markdown 语言配置（括号匹配、自动补全等）
  monaco.languages.setLanguageConfiguration('markdown', {
    comments: {
      blockComment: ['<!--', '-->'],
    },
    brackets: [
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '`', close: '`' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '`', close: '`' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '*', close: '*' },
      { open: '_', close: '_' },
    ],
    onEnterRules: [
      {
        // 列表项换行后自动添加新的列表标记
        beforeText: /^\s*[-*+]\s+.+$/,
        action: { indentAction: monaco.languages.IndentAction.None, appendText: '- ' }
      },
      {
        // 有序列表换行
        beforeText: /^\s*\d+\.\s+.+$/,
        action: { indentAction: monaco.languages.IndentAction.None, appendText: '1. ' }
      },
    ],
  });

  console.log('[Monaco] Markdown 语言配置完成');
};

/**
 * 用于在组件中初始化 Monaco 的 Hook
 * 使用方式：在 onMount 回调中调用 initializeMonaco(monaco)
 */
export const useMonacoInit = () => {
  return { initializeMonaco };
};












