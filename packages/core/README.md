# @note-studio/core

Note Studio 核心模块，提供跨包共享的核心功能。

## 功能模块

### 🎨 主题系统 (Theme System)

完整的主题管理系统，支持 Monaco Editor 和 DOM 样式。

#### 特性

- ✅ Monaco Editor 主题集成
- ✅ DOM CSS 变量自动应用
- ✅ 内置 Dark+/Light+ 主题
- ✅ 主题动态注册和注销
- ✅ 事件驱动架构
- ✅ 完整的 TypeScript 支持

#### 快速开始

```typescript
import { themeManager, ITheme } from '@note-studio/core';
import * as monaco from 'monaco-editor';

// 1. 初始化 Monaco Editor
await themeManager.initializeMonaco(monaco);

// 2. 注册自定义主题
const customTheme: ITheme = {
  id: 'my-theme',
  label: 'My Theme',
  type: 'dark',
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
  },
  tokenColors: [
    {
      scope: 'comment',
      settings: { foreground: '#6A9955' }
    }
  ]
};

themeManager.registerTheme(customTheme);

// 3. 应用主题
await themeManager.applyTheme('my-theme');

// 4. 监听主题变化
themeManager.on('theme-changed', (theme) => {
  console.log('Theme changed:', theme.label);
});
```

#### API

##### ThemeManager

```typescript
class ThemeManager extends EventEmitter {
  // 初始化
  initializeMonaco(monaco: typeof monaco): Promise<void>;
  
  // 主题管理
  registerTheme(theme: ITheme): void;
  registerThemes(themes: ITheme[]): void;
  unregisterTheme(themeId: string): void;
  
  // 主题应用
  applyTheme(themeId: string): Promise<void>;
  
  // 主题查询
  getAllThemes(): ITheme[];
  getCurrentTheme(): ITheme | null;
  getTheme(id: string): ITheme | undefined;
  getThemesByType(type: 'dark' | 'light' | 'hc'): ITheme[];
  searchThemes(query: string): ITheme[];
  
  // 清理
  dispose(): void;
}
```

##### 事件

```typescript
themeManager.on('theme-registered', (theme: ITheme) => {});
themeManager.on('theme-changed', (theme: ITheme) => {});
themeManager.on('theme-unregistered', (themeId: string) => {});
```

#### 类型定义

```typescript
interface ITheme {
  id: string;              // 主题唯一标识
  label: string;           // 显示名称
  type: 'dark' | 'light' | 'hc';  // 主题类型
  colors: IThemeColors;    // 颜色配置
  tokenColors: ITokenColors[];    // 语法高亮
  description?: string;    // 描述
  author?: string;         // 作者
  extensionId?: string;    // 来源扩展
}
```

#### CSS 变量

主题应用后，所有颜色会自动转换为 CSS 变量：

```css
:root {
  --vscode-editor-background: #1e1e1e;
  --vscode-editor-foreground: #d4d4d4;
  --vscode-sideBar-background: #252526;
  /* ... 更多变量 */
}
```

在组件中使用：

```css
.my-component {
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
}
```

## 安装

```bash
cd packages/core
npm install
npm run build
```

## 开发

```bash
# 监听模式
npm run watch

# 构建
npm run build

# 清理
npm run clean
```

## 许可

MIT

