# 自定义主题使用指南

本指南将教你如何在 Note Studio 中创建和管理自定义主题。

## 📖 快速开始

### 方法一：通过命令中心创建（推荐）

这是最简单、最快速的方法：

1. **打开命令中心**
   - 按 `F1` 键，或
   - 按 `Ctrl+Shift+P` (Windows/Linux) / `Cmd+Shift+P` (macOS)

2. **搜索命令**
   - 输入 `创建自定义主题` 或 `Create Custom Theme`
   - 选择 `首选项: 创建自定义主题`

3. **编辑配置**
   - 系统会自动创建一个基于当前主题的配置文件
   - 在编辑器中修改颜色配置

4. **应用主题**
   - 按 `Ctrl+S` 保存文件
   - 主题会自动应用到界面

### 方法二：手动创建配置文件

如果你熟悉主题配置格式，也可以手动创建：

1. 创建一个新的 JSON 文件
2. 使用以下模板：

```json
{
  "workbench.colorCustomizations": {
    "name": "我的自定义主题",
    "author": "Your Name",
    "description": "我的个性化主题",
    "themeType": "dark",
    "colors": {
      "editor.background": "#1e1e1e",
      "editor.foreground": "#d4d4d4",
      "sideBar.background": "#252526",
      "sideBar.foreground": "#cccccc",
      "titleBar.activeBackground": "#3c3c3c",
      "titleBar.activeForeground": "#cccccc",
      "activityBar.background": "#333333",
      "activityBar.foreground": "#ffffff",
      "statusBar.background": "#007acc",
      "statusBar.foreground": "#ffffff"
    }
  }
}
```

## 🎨 主题配置详解

### 基本信息

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| `name` | string | 主题名称 | 是 |
| `author` | string | 作者名 | 否 |
| `description` | string | 主题描述 | 否 |
| `themeType` | string | 主题类型：`dark`、`light`、`auto` | 是 |

### 主题类型说明

- **`dark`**: 深色主题，适合夜间或低光环境
- **`light`**: 浅色主题，适合白天或明亮环境
- **`auto`**: 自动模式（默认为深色）

### 颜色配置

`colors` 对象包含所有可自定义的颜色。以下是主要的颜色类别：

#### 编辑器颜色

```json
{
  "editor.background": "#1e1e1e",           // 编辑器背景
  "editor.foreground": "#d4d4d4",           // 编辑器前景色（文本）
  "editor.lineHighlightBackground": "#2a2a2a",  // 当前行高亮
  "editor.selectionBackground": "#264f78"    // 选中文本背景
}
```

#### 侧边栏颜色

```json
{
  "sideBar.background": "#252526",          // 侧边栏背景
  "sideBar.foreground": "#cccccc",          // 侧边栏文字
  "sideBar.border": "#3c3c3c"               // 侧边栏边框
}
```

#### 标题栏颜色

```json
{
  "titleBar.activeBackground": "#3c3c3c",   // 标题栏背景
  "titleBar.activeForeground": "#cccccc",   // 标题栏文字
  "titleBar.border": "#3c3c3c"              // 标题栏边框
}
```

#### 活动栏颜色

```json
{
  "activityBar.background": "#333333",      // 活动栏背景
  "activityBar.foreground": "#ffffff",      // 活动栏图标
  "activityBar.activeBorder": "#007acc"     // 激活状态边框
}
```

#### 状态栏颜色

```json
{
  "statusBar.background": "#007acc",        // 状态栏背景
  "statusBar.foreground": "#ffffff",        // 状态栏文字
  "statusBar.border": "#007acc"             // 状态栏边框
}
```

## 💡 实用技巧

### 1. 基于现有主题修改

使用命令中心创建的配置文件会自动包含当前主题的所有颜色，你只需要修改想要改变的部分。

### 2. 颜色格式

支持以下颜色格式：
- 十六进制：`#1e1e1e`、`#1e1e1eff`（带透明度）
- RGB：`rgb(30, 30, 30)`
- RGBA：`rgba(30, 30, 30, 0.5)`

### 3. 实时预览

保存文件后，主题会立即应用，无需重启应用。

### 4. 版本控制

你可以将主题配置文件保存在项目中，与团队共享统一的主题配置。

## 🔧 常见问题

### Q: 如何恢复默认主题？

A: 通过命令中心（`F1`）选择 `首选项: 颜色主题`，然后选择内置主题即可。

### Q: 主题文件保存在哪里？

A: 自定义主题配置使用 `theme-config://` 协议，保存后会自动应用，无需关心文件位置。

### Q: 可以导入 VS Code 主题吗？

A: 是的，Note Studio 兼容 VS Code 主题格式。你可以将 VS Code 主题文件的内容复制到配置文件中。

### Q: 如何分享我的主题？

A: 将主题配置文件分享给其他用户，他们可以直接打开并保存应用。

## 📚 更多资源

- [主题系统完整概览](../theme/REAME.md)
- [主题系统开发指南](../theme-system-guide.md)
- [支持的颜色列表](../theme/color-reference.md)

## 🎯 示例主题

### 护眼绿主题

```json
{
  "workbench.colorCustomizations": {
    "name": "护眼绿",
    "author": "Note Studio",
    "description": "柔和的绿色主题，保护视力",
    "themeType": "light",
    "colors": {
      "editor.background": "#c7edcc",
      "editor.foreground": "#2f4f4f",
      "sideBar.background": "#b5e7ba",
      "titleBar.activeBackground": "#a0d6a6",
      "activityBar.background": "#8fc995",
      "statusBar.background": "#6eb878"
    }
  }
}
```

### 极简黑白主题

```json
{
  "workbench.colorCustomizations": {
    "name": "极简黑白",
    "author": "Note Studio",
    "description": "纯粹的黑白主题",
    "themeType": "dark",
    "colors": {
      "editor.background": "#000000",
      "editor.foreground": "#ffffff",
      "sideBar.background": "#1a1a1a",
      "titleBar.activeBackground": "#0a0a0a",
      "activityBar.background": "#0a0a0a",
      "statusBar.background": "#ffffff",
      "statusBar.foreground": "#000000"
    }
  }
}
```

---

**提示**: 创建主题时，建议先选择一个接近你想要效果的内置主题，然后在此基础上进行微调，这样可以节省大量时间。

