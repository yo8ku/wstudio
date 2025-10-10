/**
 * 渲染进程入口
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { MainLayout } from './components/Layout/MainLayout';
import { ThemeProvider } from './contexts/ThemeContext';
import { initIconSystem } from './components/Icons';
// 临时禁用 background-cover 功能以避免遮挡编辑器
// import { backgroundCover } from '@note-studio/extension-api';
import './styles/index.css';

// 初始化图标系统
initIconSystem();

// 清除所有可能的背景样式和覆盖层
const clearAllBackgrounds = () => {
  console.log('[App] 清除所有背景样式和覆盖层...');
  
  // 移除所有背景相关的 style 标签
  document.querySelectorAll('style[id*="background"]').forEach(el => {
    console.log('[App] 移除 style 标签:', el.id);
    el.remove();
  });
  document.getElementById('background-cover-style')?.remove();
  
  // 查找并移除所有可能覆盖编辑器的 SVG 元素
  document.querySelectorAll('svg').forEach(svg => {
    const computedStyle = window.getComputedStyle(svg);
    const position = computedStyle.position;
    const zIndex = computedStyle.zIndex;
    
    // 如果是绝对定位或固定定位，且 z-index 较高，可能是覆盖层
    if ((position === 'absolute' || position === 'fixed') && 
        (parseInt(zIndex) > 100 || zIndex === 'auto')) {
      console.log('[App] 发现可疑 SVG 覆盖层:', {
        position,
        zIndex,
        width: svg.style.width || computedStyle.width,
        height: svg.style.height || computedStyle.height,
        parent: svg.parentElement?.className
      });
      
      // 如果 SVG 覆盖了整个视口或大部分区域，移除它
      const rect = svg.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.5 || rect.height > window.innerHeight * 0.5) {
        console.log('[App] 移除覆盖层 SVG');
        svg.remove();
      }
    }
  });
  
  // 查找并移除所有可能的背景覆盖 div
  document.querySelectorAll('div').forEach(div => {
    const id = div.id;
    const className = div.className;
    
    if (id && (id.includes('background') || id.includes('cover') || id.includes('overlay'))) {
      console.log('[App] 移除背景覆盖 div:', id);
      div.remove();
    }
    
    if (className && typeof className === 'string' && 
        (className.includes('background') || className.includes('cover') || className.includes('overlay'))) {
      const computedStyle = window.getComputedStyle(div);
      if (computedStyle.position === 'fixed' || computedStyle.position === 'absolute') {
        console.log('[App] 移除背景覆盖 div:', className);
        div.remove();
      }
    }
  });
  
  // 清除 localStorage
  localStorage.removeItem('background-cover-config');
  localStorage.removeItem('backgroundCover');
  
  // 重置 body 样式
  document.body.style.cssText = '';
  document.body.removeAttribute('style');
  
  // 注入强制清除背景和修复布局的样式
  const clearStyle = document.createElement('style');
  clearStyle.id = 'force-clear-background';
  clearStyle.textContent = `
    /* 清除所有背景 */
    body, body::before, body::after {
      background: none !important;
      background-image: none !important;
      background-color: transparent !important;
    }
    #root {
      background: none !important;
      background-image: none !important;
    }
    
    /* 强制隐藏所有可能的背景覆盖层 */
    [id*="background-cover"],
    [class*="background-cover"],
    [id*="background-overlay"],
    [class*="background-overlay"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    
    /* 强制修复异常大小的 SVG（可能覆盖编辑器的 SVG） */
    svg[fill="currentColor"][class*="w-"],
    svg[fill="currentColor"][style*="color: rgb"],
    svg.w-4, svg.h-4, svg.mr-2 {
      max-width: 24px !important;
      max-height: 24px !important;
      width: 16px !important;
      height: 16px !important;
      position: static !important;
      display: inline-block !important;
    }
    
    /* 修复可能的绝对定位或固定定位的异常元素 */
    body > svg:not([id]):not([class]),
    body > div > svg:not([id]):not([class]) {
      position: static !important;
      max-width: 24px !important;
      max-height: 24px !important;
    }
    
    /* 确保编辑器布局正确 */
    .main-layout {
      width: 100vw !important;
      height: 100vh !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
    }
    
    .main-content {
      flex: 1 !important;
      overflow: hidden !important;
      display: flex !important;
      min-height: 0 !important;
    }
    
    .editor-area {
      flex: 1 !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: column !important;
      min-width: 0 !important;
    }
  `;
  document.head.appendChild(clearStyle);
  
  console.log('[App] 背景样式和覆盖层已清除');
};

// 立即清除
clearAllBackgrounds();

// DOM 加载后再次清除
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', clearAllBackgrounds);
} else {
  setTimeout(clearAllBackgrounds, 100);
}

// 主动监听并移除异常 SVG
const removeAbnormalSVGs = () => {
  const allSVGs = document.querySelectorAll('svg');
  allSVGs.forEach(svg => {
    const rect = svg.getBoundingClientRect();
    const parent = svg.parentElement;
    
    // 检查是否是异常大小的 SVG（覆盖大部分屏幕）
    if (rect.width > window.innerWidth * 0.8 || rect.height > window.innerHeight * 0.8) {
      console.warn('[App] 发现异常大小的 SVG，将被移除:', {
        width: rect.width,
        height: rect.height,
        classes: svg.className.baseVal || svg.getAttribute('class'),
        parent: parent?.tagName
      });
      svg.remove();
    }
    
    // 检查是否有 Tailwind 类名的 SVG（可能是外部注入的）
    const classes = svg.getAttribute('class') || '';
    if (classes.includes('w-') || classes.includes('h-') || classes.includes('mr-')) {
      // 强制设置为合理大小
      svg.style.maxWidth = '20px';
      svg.style.maxHeight = '20px';
      svg.style.width = '16px';
      svg.style.height = '16px';
      svg.style.position = 'static';
      svg.style.display = 'inline-block';
      // console.log('[App] 修复 Tailwind 类名的 SVG:', classes);
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

// background-cover 管理器已完全禁用
console.log('[App] background-cover 功能已完全禁用');

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <MainLayout />
    </ThemeProvider>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  // 避免重复创建 root（用于 HMR）
  let root = (window as any).__REACT_ROOT__;
  if (!root) {
    root = ReactDOM.createRoot(rootElement);
    (window as any).__REACT_ROOT__ = root;
  }
  
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}