/**
 * 渲染进程入口
 */

console.log('[index.tsx] ============ 渲染进程入口文件开始执行 ============');
console.log('[index.tsx] 当前时间:', new Date().toLocaleTimeString());

// 设置 EventEmitter 的最大监听器数量，避免内存泄漏警告
// 由于应用中有多个组件需要监听主题变化等事件，增加限制是合理的
if (window.electron?.ipcRenderer && typeof (window.electron.ipcRenderer as any).setMaxListeners === 'function') {
  (window.electron.ipcRenderer as any).setMaxListeners(20);
  console.log('[index.tsx] EventEmitter maxListeners 已设置为 20');
}

// 添加全局错误捕获，防止应用崩溃
window.addEventListener('error', (event) => {
  console.error('[Global Error Handler] 捕获到未处理的错误', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack
  });
  
  // 阻止错误传播导致应用崩溃
  event.preventDefault();
  
  // 确保界面仍然可见
  const root = document.getElementById('root');
  if (root && !root.classList.contains('theme-loaded')) {
    root.classList.add('theme-loaded');
    console.log('[Global Error Handler] 强制显示界面');
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global Error Handler] 捕获到未处理的 Promise 拒绝:', {
    reason: event.reason,
    promise: event.promise
  });
  
  // 阻止错误传播
  event.preventDefault();
});

import React from 'react';
import ReactDOM from 'react-dom/client';
import { MainLayout } from './components/Layout/MainLayout';
import { initIconSystem } from './components/Icons';
import { Toaster } from '@/components/ui/sonner';
import { ragProcessingService } from './services/RAGProcessingService';
import { knowledgeBaseRecoveryService } from './services/KnowledgeBaseRecoveryService';
import './styles/index.scss';
import './styles/aiResponseFormatter.scss';

console.log('[index.tsx] 所有模块导入完成');
console.log('[index.tsx] Embedding 服务将在主进程中运行');

// 初始化图标系统
initIconSystem();
console.log('[index.tsx] 图标系统初始化完成');

// 清理旧的 background-cover 功能残留
const clearOldBackgroundCover = () => {
  console.log('[App] 清理旧的 background-cover 功能残留...');
  
  // 只移除旧的 background-cover 相关元素
  document.querySelectorAll('style[id*="background-cover"]').forEach(el => {
    console.log('[App] 移除旧的 style 标签:', el.id);
    el.remove();
  });
  
  // 注意：已迁移到 electron-store，不再需要清理 localStorage
  
  console.log('[App] 旧的 background-cover 功能残留已清理');
};

// 立即清除旧功能残留
clearOldBackgroundCover();

// 主动修复异常 SVG
const removeAbnormalSVGs = () => {
  const allSVGs = document.querySelectorAll('svg');
  allSVGs.forEach(svg => {
    const rect = svg.getBoundingClientRect();
    
    // 检查是否是异常大小的 SVG（覆盖大部分屏幕）
    if (rect.width > window.innerWidth * 0.8 || rect.height > window.innerHeight * 0.8) {
      console.warn('[App] 发现异常大小的 SVG，将被移除', {
        width: rect.width,
        height: rect.height,
        classes: svg.className.baseVal || svg.getAttribute('class'),
        parent: svg.parentElement?.tagName
      });
      svg.remove();
    }
    
    // 检查是否有外部注入的 SVG
    const classes = svg.getAttribute('class') || '';
    if (classes.includes('w-') || classes.includes('h-') || classes.includes('mr-')) {
      // 强制设置为合理大小
      svg.style.maxWidth = '20px';
      svg.style.maxHeight = '20px';
      svg.style.width = '16px';
      svg.style.height = '16px';
      svg.style.position = 'static';
      svg.style.display = 'inline-block';
    }
  });
};

// 定期检查异常 SVG
setInterval(removeAbnormalSVGs, 2000);

// 使用 MutationObserver 监听 DOM 变化
const observer = new MutationObserver((mutations) => {
  let needCheck = false;
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeName === 'svg' || node.nodeName === 'SVG') {
        needCheck = true;
      } else if (node instanceof HTMLElement && node.querySelector('svg')) {
        needCheck = true;
      }
    });
  });
  
  if (needCheck) {
    setTimeout(removeAbnormalSVGs, 50);
  }
});

// 监听 body 的变化
if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

console.log('[App] 新的背景图片系统已启动');

const App: React.FC = () => {
  return (
    <>
      <MainLayout />
      <Toaster 
        position="top-right" 
        richColors 
        duration={3000}
        offset={35}
      />
    </>
  );
};

// 添加 F12 快捷键打开开发者工具
document.addEventListener('keydown', (e) => {
  if (e.key === 'F12') {
    try {
      // 使用 preload 暴露的 API
      if (window.electronAPI?.toggleDevTools) {
        window.electronAPI.toggleDevTools();
        console.log('[App] 请求打开开发者工具');
      } else if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.send('toggle-devtools');
        console.log('[App] 通过 ipcRenderer 请求打开开发者工具');
      } else {
        console.warn('[App] 无法打开开发者工具：未找到可用的 API');
      }
    } catch (error) {
      console.error('[App] 打开开发者工具失败', error);
    }
  }
});

// 添加全局调试函数
(window as any).debugDB = async () => {
  try {
    const rawData = await window.electron?.ipcRenderer.invoke('ai-model:debug-raw-data');
    console.log('===== 数据库原始数据=====');
    console.log('Configs:', rawData.configs);
    console.log('Models:', rawData.models);
    
    const configs = await window.electron?.ipcRenderer.invoke('ai-model:list');
    console.log('===== 解析后的配置 =====');
    console.log('配置数量:', configs?.length);
    console.log('配置列表:', configs);
    
    return { rawData, configs };
  } catch (error) {
    console.error('调试失败:', error);
  }
};

// 添加清理重复配置的函数
(window as any).cleanupDB = async () => {
  try {
    console.log('开始清理数据库重复配置...');
    const result = await window.electron?.ipcRenderer.invoke('ai-model:cleanup-duplicates');
    
    if (result.success) {
      console.log(`清理完成！删除了 ${result.removed} 条重复配置`);
      
      // 重新加载配置
      window.dispatchEvent(new Event('ai-config-updated'));
      
      return result;
    } else {
      console.error('清理失败:', result.error);
      return result;
    }
  } catch (error) {
    console.error('清理失败:', error);
  }
};

console.log('[App] 全局调试函数已注册');
console.log('  - debugDB()   查看数据库内容');
console.log('  - cleanupDB() 清理重复配置');

// RAG 处理服务将在需要时按需初始化（通过右键菜单上传知识库时）

// 知识库崩溃恢复服务：在应用启动时检查并恢复中断的上传任务
// 延迟初始化，确保 UI 已经渲染完成
setTimeout(() => {
  knowledgeBaseRecoveryService.initialize().catch((error) => {
    console.error('[App] 知识库恢复服务初始化失败:', error);
  });
}, 2000);

const rootElement = document.getElementById('root');
console.log('[Index] 🔍 准备渲染 React 应用...');
console.log('[Index] rootElement:', rootElement);

if (rootElement) {
  // 避免重复创建 root（用于 HMR）
  let root = (window as any).__REACT_ROOT__;
  console.log('[Index] 现有的 React Root:', root);
  
  if (!root) {
    console.log('[Index] 创建新的 React Root...');
    root = ReactDOM.createRoot(rootElement);
    (window as any).__REACT_ROOT__ = root;
    console.log('[Index] ✅ React Root 创建完成');
  } else {
    console.log('[Index] 复用现有的 React Root（HMR）');
  }
  
  console.log('[Index] 🚀 调用 root.render(<App />)...');
  try {
    root.render(
      <App />
    );
    console.log('[Index] ✅ root.render 调用完成（同步部分）');
  } catch (error) {
    console.error('[Index] ❌ root.render 失败:', error);
  }
} else {
  console.error('[Index] ❌ 找不到 #root 元素！');
}