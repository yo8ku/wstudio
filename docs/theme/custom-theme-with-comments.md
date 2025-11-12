# 创建带注释的自定义主题

## 概述

从现在开始，您可以使用 **JSONC 格式**（JSON with Comments）来创建自定义主题。这意味着您可以在主题文件中添加注释，使主题配置更易于理解和维护。

## 支持的格式

主题系统现在同时支持以下两种格式：

- **`.json`** - 标准 JSON 格式（不支持注释）
- **`.jsonc`** - 带注释的 JSON 格式（推荐用于自定义主题）

## JSONC 格式特性

### 1. 单行注释

使用 `//` 添加单行注释：

```jsonc
{
  "id": "my-theme",
  "name": "My Custom Theme",  // 这是主题的显示名称
  "type": "dark"  // 可选值: light, dark, hc, hcLight
}
```

### 2. 多行注释

使用 `/* */` 添加多行注释：

```jsonc
{
  /*
   * 这是一个多行注释
   * 可以用来添加详细的说明
   */
  "colors": {
    "editor.background": "#1e1e1e"
  }
}
```

### 3. 尾随逗号

JSONC 格式允许在最后一项后面添加逗号（这在标准 JSON 中是不允许的）：

```jsonc
{
  "colors": {
    "foreground": "#ffffff",
    "background": "#000000",  // 注意这里的逗号
  }
}
```

## 示例主题

以下是一个完整的 JSONC 主题示例：

```jsonc
{
  // ============================================
  // 自定义主题示例
  // ============================================
  
  // 基本信息
  "id": "my-custom-dark",
  "name": "My Custom Dark",
  "type": "dark",
  "author": "Your Name",
  "description": "这是我的自定义暗色主题",
  "version": "1.0.0",
  
  // 颜色配置
  "colors": {
    // 编辑器颜色
    "editor.background": "#1e1e1e",           // 编辑器背景
    "editor.foreground": "#d4d4d4",           // 编辑器前景色
    "editorLineNumber.foreground": "#858585", // 行号颜色
    
    // 命令中心颜色
    "commandCenter.background": "#1e1e1e",    // 命令中心背景
    "commandCenter.foreground": "#cccccc",    // 命令中心前景色
    
    // 按钮颜色
    "button.background": "#0e639c",           // 按钮背景
    "button.foreground": "#ffffff",           // 按钮文字
    "button.hoverBackground": "#1177bb",      // 悬停时的背景
  },
  
  // 语法高亮规则
  "tokenColors": [
    {
      "name": "Comments",
      "scope": ["comment"],
      "settings": {
        "foreground": "#6A9955",
        "fontStyle": "italic"
      }
    },
    {
      "name": "Keywords",
      "scope": ["keyword"],
      "settings": {
        "foreground": "#569cd6"
      }
    }
  ]
}
```

## 如何使用

### 创建新主题

1. 在用户主题目录中创建一个新的 `.jsonc` 文件
   - **Windows**: `C:\Users\[用户名]\AppData\Roaming\note-studio\themes\user\`
   - **macOS**: `/Users/[用户名]/Library/Application Support/note-studio/themes/user/`

2. 编写您的主题配置（可以添加注释）

3. 重新启动应用或重新加载主题

### 文件命名

主题文件可以使用以下扩展名：
- `my-theme.json` - 标准 JSON 格式
- `my-theme.jsonc` - JSONC 格式（推荐）

### 注意事项

1. **注释仅用于说明**：注释不会被保存到应用配置中，仅在您编辑主题文件时有用

2. **语法验证**：如果您的 JSONC 文件有语法错误，主题加载时会在控制台显示警告信息

3. **兼容性**：现有的 `.json` 主题文件仍然完全支持，无需修改

## 完整主题配置参考

有关可用的颜色键和配置选项的完整列表，请参考：
- [主题系统指南](../theme-system-guide.md)
- [自定义主题指南](../guide/custom-theme-guide.md)

## 示例文件

项目中包含了一个完整的 JSONC 主题示例：
- 路径：`packages/core/themes/builtin/example-custom-theme.jsonc`

您可以将此文件复制到您的用户主题目录，并根据需要进行修改。

## 技术细节

### 解析器

主题系统使用 `jsonc-parser` 库来解析 JSONC 文件，该库：
- 支持单行注释 (`//`)
- 支持多行注释 (`/* */`)
- 允许尾随逗号
- 提供详细的错误信息

### 错误处理

如果 JSONC 文件存在解析错误：
1. 错误信息会记录到控制台
2. 主题仍会尝试加载（如果可能）
3. 您可以在开发者工具中查看详细的错误信息

## 常见问题

**Q: 我可以在 JSON 文件中添加注释吗？**
A: 不可以。如果要使用注释，请将文件扩展名改为 `.jsonc`。

**Q: JSONC 格式会影响性能吗？**
A: 不会。主题在加载后会被缓存，注释不会影响运行时性能。

**Q: 我可以混用 JSON 和 JSONC 文件吗？**
A: 可以。主题系统会自动识别并正确处理这两种格式。

**Q: 如何查看主题加载错误？**
A: 打开开发者工具（Ctrl+Shift+I 或 Cmd+Option+I），查看控制台中以 `[ThemeService]` 开头的日志。





















