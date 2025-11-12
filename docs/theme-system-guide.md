# 主题系统使用指南

## 📖 概述

主题系统提供了完整的主题管理功能，支持：
- 解析 VSCode 主题格式
- 用户自定义颜色（类似 VSCode）
- 主题市场（后期功能）
- 收藏和最近使用

## 🏗️ 架构

```
packages/
├── core/src/theme-system/          # 核心主题系统
│   ├── types/                      # 类型定义
│   ├── parsers/                    # 解析器（内部工具）
│   └── core/                       # 注册表和合并器
├── main/src/
│   ├── services/ThemeService.ts    # 主进程服务
│   └── ipc/themeHandlers.ts        # IPC 通道
└── renderer/src/
    ├── services/ThemeService.ts    # 渲染进程服务
    └── stores/themeStore.ts        # Zustand 状态管理
```

## 💾 存储位置

### 主题文件
```
userData/themes/
├── builtin/          # 内置主题（解析后的）
├── user/             # 用户导入的主题
└── market/           # 主题市场下载的主题
```

### 配置存储（electron-store）
```json
{
  "theme-config": {
    "activeThemeId": "one-dark-pro",
    "customColors": {
      "titleBar.activeBackground": "#1e1e1e",
      "editor.background": "#282c34"
    },
    "recentThemes": ["one-dark-pro", "dracula"],
    "favoriteThemes": ["one-dark-pro"]
  }
}
```

## 🚀 使用方法

### 在 React 组件中使用

```tsx
import { useThemeStore } from '@/stores/themeStore';

function ThemeSelector() {
  const { 
    currentTheme, 
    themeList, 
    setTheme, 
    isLoading 
  } = useThemeStore();

  return (
    <div>
      <h2>当前主题: {currentTheme?.name}</h2>
      
      <select 
        onChange={(e) => setTheme(e.target.value)}
        disabled={isLoading}
      >
        {themeList.map(theme => (
          <option key={theme.id} value={theme.id}>
            {theme.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

### 初始化主题系统

在应用启动时调用：

```tsx
import { useThemeStore } from '@/stores/themeStore';
import { useEffect } from 'react';

function App() {
  const initialize = useThemeStore(state => state.initialize);

  useEffect(() => {
    initialize();
  }, []);

  return <YourApp />;
}
```

### 设置自定义颜色

```tsx
import { useThemeStore } from '@/stores/themeStore';

function CustomizeTheme() {
  const setCustomColors = useThemeStore(state => state.setCustomColors);

  const handleCustomize = async () => {
    await setCustomColors({
      'editor.background': '#1a1a1a',
      'titleBar.activeBackground': '#ff0000',
    });
  };

  return <button onClick={handleCustomize}>自定义颜色</button>;
}
```

### 创建自定义主题（通过命令中心）

最简单的方式是通过命令中心创建自定义主题：

1. 按 `F1` 或 `Ctrl+Shift+P` 打开命令中心
2. 输入 `创建自定义主题` 或 `Create Custom Theme`
3. 按 `Enter` 执行命令

系统会自动：
- 基于当前主题生成配置文件
- 在编辑器中打开配置文件
- 提供完整的颜色配置模板

编辑并保存文件（`Ctrl+S`）后，主题会自动应用。

### 导入 VSCode 主题

```tsx
import { useThemeStore } from '@/stores/themeStore';

function ImportTheme() {
  const importVSCodeTheme = useThemeStore(state => state.importVSCodeTheme);

  const handleImport = async () => {
    // 用户选择主题文件
    const filePath = await window.electronAPI.invoke('dialog:openFile', {
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (filePath) {
      const success = await importVSCodeTheme(filePath);
      if (success) {
        alert('主题导入成功！');
      }
    }
  };

  return <button onClick={handleImport}>导入主题</button>;
}
```

## 🎨 主题格式

### VSCode 主题格式（输入）

```json
{
  "name": "My Theme",
  "type": "dark",
  "colors": {
    "editor.background": "#282c34",
    "editor.foreground": "#abb2bf",
    "titleBar.activeBackground": "#282c34",
    "sideBar.background": "#21252b"
  },
  "tokenColors": [
    {
      "scope": ["comment"],
      "settings": {
        "foreground": "#5c6370",
        "fontStyle": "italic"
      }
    }
  ]
}
```

### 应用主题格式（内部使用）

```typescript
interface AppTheme {
  id: string;
  name: string;
  type: 'light' | 'dark' | 'hc' | 'hcLight';
  colors: Record<string, string>;
  tokenColors: TokenColorRule[];
  metadata?: {
    source: 'builtin' | 'user' | 'market';
    isFavorite: boolean;
    lastUsedAt: number;
  };
}
```

## 🎯 颜色键参考

常用的颜色键（完整列表见 `VSCodeColors` 类型）：

### 编辑器
- `editor.background` - 编辑器背景色
- `editor.foreground` - 编辑器前景色
- `editor.lineHighlightBackground` - 当前行高亮
- `editor.selectionBackground` - 选中文本背景

### 侧边栏
- `sideBar.background` - 侧边栏背景
- `sideBar.foreground` - 侧边栏前景色
- `sideBarTitle.foreground` - 侧边栏标题颜色

### 标题栏
- `titleBar.activeBackground` - 标题栏背景
- `titleBar.activeForeground` - 标题栏前景色
- `titleBar.border` - 标题栏边框

### 状态栏
- `statusBar.background` - 状态栏背景
- `statusBar.foreground` - 状态栏前景色
- `statusBar.border` - 状态栏边框

### 活动栏
- `activityBar.background` - 活动栏背景
- `activityBar.foreground` - 活动栏前景色
- `activityBarBadge.background` - 徽章背景

### 标签页
- `tab.activeBackground` - 激活标签背景
- `tab.activeForeground` - 激活标签前景色
- `tab.inactiveBackground` - 非激活标签背景

## 🔧 在 settings.json 中自定义

用户可以在 `settings.json` 中自定义颜色（类似 VSCode）：

```jsonc
{
  "workbench.colorTheme": "one-dark-pro",
  "workbench.colorCustomizations": {
    "editor.background": "#1a1a1a",
    "titleBar.activeBackground": "#ff0000",
    "sideBar.background": "#1e1e1e"
  }
}
```

## 🛠️ 内部工具：解析 VSCode 主题

**注意**：以下功能仅供内部使用，用户无法直接访问。

### 使用解析器

```typescript
import { VSCodeThemeParser } from '@note-studio/core';
import * as fs from 'fs/promises';

// 读取 VSCode 主题文件
const vscodeTheme = JSON.parse(
  await fs.readFile('path/to/theme.json', 'utf-8')
);

// 解析为应用主题格式
const appTheme = VSCodeThemeParser.parse(
  vscodeTheme,
  'my-theme-id',
  'user'
);

// 验证主题
const validation = VSCodeThemeParser.validate(appTheme);
if (!validation.valid) {
  console.error('主题验证失败:', validation.errors);
}
```

## 📦 API 参考

### ThemeStore API

```typescript
interface ThemeState {
  // 状态
  currentTheme: ThemeData | null;
  themeList: ThemeInfo[];
  isLoading: boolean;
  error: string | null;

  // 操作
  initialize(): Promise<void>;
  setTheme(themeId: string, customColors?: Record<string, string>): Promise<boolean>;
  setCustomColors(customColors: Record<string, string>): Promise<boolean>;
  resetCustomColors(): Promise<boolean>;
  refreshThemeList(): Promise<void>;
  importVSCodeTheme(themePath: string, themeId?: string): Promise<boolean>;
  deleteTheme(themeId: string): Promise<boolean>;
  toggleFavorite(themeId: string): Promise<boolean>;
  applyThemeToDOM(theme: ThemeData): void;
}
```

### ThemeService API (渲染进程)

```typescript
class ThemeService {
  getAllThemes(): Promise<ThemeInfo[]>;
  getTheme(themeId: string): Promise<ThemeData | null>;
  getCurrentTheme(): Promise<ThemeData | null>;
  getThemeConfig(): Promise<ThemeConfigData>;
  setTheme(themeId: string, customColors?: Record<string, string>): Promise<boolean>;
  setCustomColors(customColors: Record<string, string>): Promise<boolean>;
  resetCustomColors(): Promise<boolean>;
  importVSCodeTheme(params: ImportVSCodeThemeParams): Promise<ImportThemeResult>;
  deleteTheme(themeId: string): Promise<boolean>;
  toggleFavorite(themeId: string): Promise<boolean>;
}
```

## 🎬 后期扩展

### 主题市场
- 用户可以浏览和下载社区主题
- 主题评分和评论系统
- 主题预览功能

### 主题导出
- 用户可以导出自定义主题
- 分享主题到社区

### 主题编辑器
- 可视化主题编辑器
- 实时预览
- 颜色选择器

## 🐛 调试

### 查看当前主题数据

```typescript
const theme = useThemeStore.getState().currentTheme;
console.log('当前主题:', theme);
```

### 查看 CSS 变量

```javascript
// 在浏览器控制台中
const root = document.documentElement;
const styles = getComputedStyle(root);
console.log('editor.background:', styles.getPropertyValue('--editor-background'));
```

### 查看主题文件位置

主题文件存储在：
- Windows: `C:\Users\<username>\AppData\Roaming\note-studio\themes\`
- macOS: `/Users/<username>/Library/Application Support/note-studio/themes/`

## 📝 注意事项

1. **不要删除内置主题** - 内置主题标记为 `isBuiltin: true`，无法删除
2. **颜色格式** - 支持 `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb()`, `rgba()`
3. **主题 ID** - 必须唯一，建议使用 kebab-case（如 `one-dark-pro`）
4. **自定义颜色优先级** - 用户自定义颜色会覆盖主题基础颜色

## 🔗 相关文档

- [VSCode 主题颜色参考](https://code.visualstudio.com/api/references/theme-color)
- [VSCode 主题指南](https://code.visualstudio.com/api/extension-guides/color-theme)










