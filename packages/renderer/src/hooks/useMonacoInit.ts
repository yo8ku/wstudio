/**
 * Monaco Editor 全局初始化钩子
 * 功能：在应用启动时一次性注册全局配置（如颜色提供器）
 */

import { useEffect } from 'react';
import type { Monaco } from '@monaco-editor/react';
import { registerUniversalColorProvider } from '../utils/monaco-color-provider';

// 全局标记，确保只初始化一次
let monacoInitialized = false;

/**
 * 配置 Monaco Editor 的 Web Worker 环境
 * 暂时禁用 worker，使用主线程模式
 */
const setupMonacoWorkers = () => {
  console.log('[Monaco] 配置 Worker 环境（主线程模式）...');
  
  // 暂时返回 null，Monaco 会降级到主线程模式
  // 这样可以正常工作，但可能会影响大文件的性能
  (self as any).MonacoEnvironment = {
    getWorker() {
      console.log('[Monaco] Worker 已禁用，使用主线程模式');
      // 返回 null 让 Monaco 使用主线程
      return null;
    }
  };
  
  console.log('[Monaco] Worker 环境配置完成（主线程模式）');
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












