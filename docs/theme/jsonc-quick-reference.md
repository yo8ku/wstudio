# JSONC 主题格式 - 快速参考

## 基本语法

### 单行注释
```jsonc
{
  "id": "my-theme",  // 这是主题 ID
  "name": "My Theme" // 这是主题名称
}
```

### 多行注释
```jsonc
{
  /*
   * 这是主题的基本信息
   * 包含 ID 和名称
   */
  "id": "my-theme",
  "name": "My Theme"
}
```

### 尾随逗号
```jsonc
{
  "colors": {
    "editor.background": "#1e1e1e",
    "editor.foreground": "#d4d4d4",  // 允许最后一项有逗号
  }
}
```

## 注释最佳实践

### 1. 分组注释
```jsonc
{
  "colors": {
    // === 编辑器颜色 ===
    "editor.background": "#1e1e1e",
    "editor.foreground": "#d4d4d4",
    
    // === 侧边栏颜色 ===
    "sideBar.background": "#252526",
    "sideBar.foreground": "#cccccc"
  }
}
```

### 2. 解释性注释
```jsonc
{
  "tokenColors": [
    {
      "name": "Comments",
      "scope": ["comment"],
      "settings": {
        "foreground": "#6A9955",  // 绿色，类似 VS Code
        "fontStyle": "italic"     // 斜体显示
      }
    }
  ]
}
```

### 3. 待办事项注释
```jsonc
{
  "colors": {
    "editor.background": "#1e1e1e",
    // TODO: 优化这个颜色以提高对比度
    "editor.foreground": "#d4d4d4"
  }
}
```

### 4. 版本历史注释
```jsonc
{
  "colors": {
    // v1.0.0: 初始配色
    // v1.1.0: 调整为更柔和的颜色
    "editor.background": "#1e1e1e"
  }
}
```

## 文件命名

### 推荐命名
- ✅ `my-theme.jsonc` - 使用 JSONC 扩展名
- ✅ `dark-modern.jsonc` - 描述性名称
- ✅ `custom-light-2024.jsonc` - 包含年份

### 不推荐
- ❌ `my-theme.json` - 如果包含注释，必须使用 `.jsonc`
- ❌ `theme.jsonc` - 名称太通用
- ❌ `新主题.jsonc` - 避免使用中文文件名

## 常见错误

### ❌ 错误：在 .json 文件中使用注释
```json
{
  "id": "my-theme",  // 这会导致解析错误！
}
```
**解决方案**：将文件重命名为 `.jsonc`

### ❌ 错误：忘记引号
```jsonc
{
  id: "my-theme"  // 错误：键名必须用引号
}
```
**解决方案**：
```jsonc
{
  "id": "my-theme"  // 正确
}
```

### ❌ 错误：使用 HTML 注释
```jsonc
{
  <!-- 这是错误的注释语法 -->
  "id": "my-theme"
}
```
**解决方案**：
```jsonc
{
  // 使用 JavaScript 风格的注释
  "id": "my-theme"
}
```

## VS Code 编辑器支持

如果使用 VS Code 编辑主题文件：

1. 安装 JSONC 语言支持（VS Code 默认支持）
2. 文件关联设置：
```json
{
  "files.associations": {
    "*.jsonc": "jsonc"
  }
}
```

## 主题模板

### 最小主题
```jsonc
{
  // 基本信息
  "id": "my-minimal-theme",
  "name": "My Minimal Theme",
  "type": "dark",
  
  // 最少的颜色配置
  "colors": {
    "editor.background": "#1e1e1e",
    "editor.foreground": "#d4d4d4"
  },
  
  // 最少的语法高亮
  "tokenColors": []
}
```

### 完整主题
参考：`packages/theme/themes/builtin/example-custom-theme.jsonc`

## 相关文档

- [带注释的自定义主题指南](./custom-theme-with-comments.md) - 详细教程
- [主题系统概览](./REAME.md) - 主题系统架构
- [自定义主题指南](../guide/custom-theme-guide.md) - 主题配置参考

## 技术支持

如果遇到问题：
1. 检查开发者工具控制台中的 `[ThemeService]` 日志
2. 确认文件扩展名是 `.jsonc`
3. 使用 JSONC 在线验证工具检查语法
4. 参考示例文件：`example-custom-theme.jsonc`





















