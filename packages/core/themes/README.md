# 主题系统说明

## 📖 概述

本项目的主题系统基于 JSON 配置文件，通过代码自动将主题颜色转换为 CSS 变量。

## 🎨 主题结构

每个主题由一个 JSON 文件定义，包含以下字段：

```json
{
  "id": "theme-id",
  "name": "主题名称",
  "type": "dark" | "light" | "hc" | "hcLight",
  "author": "作者名称",
  "description": "主题描述",
  "version": "1.0.0",
  "colors": {
    "editor.background": "#002b36",
    "editor.foreground": "#839496",
    // ... 更多颜色配置
  },
  "tokenColors": [
    {
      "name": "Comments",
      "scope": ["comment", "punctuation.definition.comment"],
      "settings": {
        "foreground": "#586e75",
        "fontStyle": "italic"
      }
    }
    // ... 更多语法高亮规则
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 主题唯一标识符 |
| `name` | string | ✅ | 主题显示名称 |
| `type` | string | ✅ | 主题类型：`dark`、`light`、`hc`、`hcLight` |
| `author` | string | ❌ | 主题作者 |
| `description` | string | ❌ | 主题描述 |
| `version` | string | ❌ | 主题版本号（建议使用语义化版本） |
| `colors` | object | ✅ | 颜色映射对象 |
| `tokenColors` | array | ✅ | 语法高亮规则数组 |

## 🔧 CSS 变量自动生成

系统会自动将 `colors` 对象中的每个属性转换为 CSS 变量：

- **转换规则**：`"editor.background": "#002b36"` → `--ws-editor-background: #002b36;`
- **前缀规则**：所有 CSS 变量都会自动添加 `--ws-` 前缀
- **命名规则**：点号（`.`）会被替换为连字符（`-`）

### 示例

**JSON 配置：**
```json
{
  "colors": {
    "editor.background": "#002b36",
    "sideBar.background": "#00212b",
    "titleBar.activeBackground": "#002b36"
  }
}
```

**自动生成的 CSS 变量：**
```css
:root {
  --ws-editor-background: #002b36;
  --ws-sideBar-background: #00212b;
  --ws-titleBar-activeBackground: #002b36;
}
```

## 📁 目录结构

```
themes/
└── builtin/              # 内置主题
    ├── Dark/
    │   └── solarized-pro/
    │       └── solarized-pro.json
    └── Light/
        └── quiet/
            └── quiet-light.json
```

## ✨ 添加新主题

### 1. 创建主题 JSON 文件

在 `builtin/` 目录下创建新的主题文件夹和 JSON 文件：

```bash
themes/builtin/Dark/my-theme/my-theme.json
```

### 2. 配置主题属性

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "type": "dark",
  "author": "Your Name",
  "description": "A custom theme with modern colors",
  "version": "1.0.0",
  "colors": {
    "editor.background": "#1e1e1e",
    "editor.foreground": "#d4d4d4",
    // 添加更多颜色...
  },
  "tokenColors": [
    // 添加语法高亮规则...
  ]
}
```

### 3. 主题自动加载

系统会在启动时自动加载所有主题，无需额外配置。

## 🎯 添加新的颜色变量

**只需要修改 JSON 文件！**

1. 在 `colors` 对象中添加新的颜色键值对：

```json
{
  "colors": {
    "myComponent.background": "#123456",
    "myComponent.foreground": "#abcdef"
  }
}
```

2. 在组件的 SCSS 文件中使用：

```scss
.my-component {
  background-color: var(--ws-myComponent-background);
  color: var(--ws-myComponent-foreground);
}
```

## 🚀 优势

- ✅ **单一数据源**：只需要维护 JSON 文件
- ✅ **自动转换**：颜色自动转换为 CSS 变量
- ✅ **类型安全**：配置结构清晰，易于验证
- ✅ **易于扩展**：添加新颜色无需修改代码
- ✅ **零配置**：新主题自动被检测和加载

## 📚 常用颜色键

| 颜色键 | CSS 变量 | 说明 |
|-------|---------|------|
| `editor.background` | `--ws-editor-background` | 编辑器背景色 |
| `editor.foreground` | `--ws-editor-foreground` | 编辑器前景色 |
| `sideBar.background` | `--ws-sideBar-background` | 侧边栏背景色 |
| `activityBar.background` | `--ws-activityBar-background` | 活动栏背景色 |
| `statusBar.background` | `--ws-statusBar-background` | 状态栏背景色 |
| `titleBar.activeBackground` | `--ws-titleBar-activeBackground` | 标题栏背景色 |

查看现有主题 JSON 文件获取完整的颜色键列表。

## 🔍 调试

在浏览器开发者工具中可以查看生成的 CSS 变量：

```javascript
// 获取 CSS 变量值
getComputedStyle(document.documentElement).getPropertyValue('--ws-editor-background')
```

## 📝 注意事项

1. **颜色格式**：支持所有标准 CSS 颜色格式（HEX、RGB、RGBA 等）
2. **命名规范**：使用 `component.property` 格式命名颜色键
3. **兼容性**：确保颜色键名称不包含特殊字符（除了点号）
4. **主题 ID**：确保主题 ID 在所有主题中唯一

## 🛠️ 技术实现

主题加载流程：

1. **ThemeService** (主进程) 扫描主题目录，加载所有 JSON 文件
2. **themeStore** (渲染进程) 接收主题数据
3. **applyThemeToDOM** 函数动态生成 CSS 变量并注入到 `<style>` 标签
4. 组件通过 CSS 变量引用主题颜色

关键代码文件：
- `packages/main/src/services/ThemeService.ts` - 主题加载
- `packages/renderer/src/stores/themeStore.ts` - 主题状态管理和应用

