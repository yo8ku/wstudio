# Markdown 代码块主题自定义指南

## 📖 概述

Markdown 中的代码块（如 ```json、```javascript）**完全支持自定义主题色**。主题系统会自动将你在 `tokenColors` 中定义的规则应用到所有语言的代码块中。

---

## 🎨 支持的语言

当前系统支持以下语言的语法高亮：

- **json** / **jsonc**
- **javascript** / **typescript**
- **python**
- **html** / **css** / **scss**
- **yaml** / **toml**
- **markdown**
- 以及更多...

---

## ✅ 当前实现机制

### 1. 自动继承主题规则

```typescript
const monacoTheme = {
  base: 'vs-dark',
  inherit: true,  // ← 继承基础主题
  rules: tokenColors,  // ← 你定义的 tokenColors 会自动应用
  colors: editorColors
};
```

**这意味着**：
- 你在主题文件中的 `tokenColors` 规则会自动应用到 Markdown 代码块
- **不需要单独配置**，系统会自动处理

---

### 2. 额外的 JSON 增强

系统还会通过 CSS 注入额外的 JSON 颜色：

```typescript
injectJSONTokenColors(themeId, semanticTokenColors);
```

这会从 `semanticTokenColors` 中提取：
- `property` → JSON 键
- `string` → 字符串值
- `number` → 数字值
- `boolean` → 布尔值

---

## 🛠️ 如何自定义 JSON/JavaScript 主题色

### 示例：完整的 tokenColors 配置

```json
{
  "name": "我的自定义主题",
  "type": "dark",
  "colors": {
    "editor.background": "#1e1e1e",
    "editor.foreground": "#d4d4d4"
  },
  "tokenColors": [
    // 📦 注释
    {
      "scope": ["comment", "punctuation.definition.comment"],
      "settings": {
        "foreground": "#6a9955",
        "fontStyle": "italic"
      }
    },

    // 🔑 关键字（if, return, function, const...）
    {
      "scope": [
        "keyword",
        "keyword.control",
        "keyword.operator",
        "storage.type",
        "storage.modifier"
      ],
      "settings": {
        "foreground": "#569cd6"
      }
    },

    // 📝 字符串（适用于 JSON/JavaScript）
    {
      "scope": [
        "string",
        "string.quoted",
        "string.quoted.double.json",
        "string.quoted.single.js"
      ],
      "settings": {
        "foreground": "#ce9178"
      }
    },

    // 🔢 数字（适用于 JSON/JavaScript）
    {
      "scope": [
        "constant.numeric",
        "constant.numeric.json"
      ],
      "settings": {
        "foreground": "#b5cea8"
      }
    },

    // ✅ 布尔值和 null（适用于 JSON/JavaScript）
    {
      "scope": [
        "constant.language",
        "constant.language.boolean",
        "constant.language.null",
        "constant.language.undefined"
      ],
      "settings": {
        "foreground": "#569cd6"
      }
    },

    // 🏷️ 函数名（JavaScript）
    {
      "scope": [
        "entity.name.function",
        "support.function"
      ],
      "settings": {
        "foreground": "#dcdcaa"
      }
    },

    // 🎨 变量名（JavaScript）
    {
      "scope": [
        "variable",
        "variable.other",
        "variable.language"
      ],
      "settings": {
        "foreground": "#9cdcfe"
      }
    },

    // 🔑 JSON 键名（对象属性）
    {
      "scope": [
        "support.type.property-name.json",
        "meta.object-literal.key.js",
        "meta.object.member.js"
      ],
      "settings": {
        "foreground": "#9cdcfe"
      }
    },

    // 🏗️ 类型和类名（TypeScript/JavaScript）
    {
      "scope": [
        "entity.name.type",
        "entity.name.class",
        "support.class"
      ],
      "settings": {
        "foreground": "#4ec9b0"
      }
    },

    // 🔧 标点符号
    {
      "scope": [
        "punctuation",
        "meta.brace",
        "punctuation.definition.string"
      ],
      "settings": {
        "foreground": "#d4d4d4"
      }
    }
  ],
  
  // ⭐ 语义高亮（可选，用于更精确的高亮）
  "semanticTokenColors": {
    "property": "#9cdcfe",
    "string": "#ce9178",
    "number": "#b5cea8",
    "boolean": "#569cd6",
    "keyword": "#569cd6",
    "function": "#dcdcaa",
    "variable": "#9cdcfe",
    "type": "#4ec9b0"
  }
}
```

---

## 🧪 测试你的主题

### 1. 创建测试 Markdown 文件

创建一个包含多种代码块的 MD 文件：

````markdown
# 主题测试

## JSON 代码块

```json
{
  "name": "test",
  "value": 123,
  "enabled": true,
  "data": null
}
```

## JavaScript 代码块

```javascript
function hello(name) {
  const greeting = `Hello, ${name}!`;
  return greeting;
}

const result = hello("World");
console.log(result);
```

## TypeScript 代码块

```typescript
interface User {
  id: number;
  name: string;
  active: boolean;
}

const user: User = {
  id: 1,
  name: "Alice",
  active: true
};
```
````

### 2. 查看控制台日志

刷新应用后，查看控制台：

```
[MonacoEditor] 🎯 JSON 相关的 Token 规则 (12 条):
[
  { "token": "string.quoted.double.json", "foreground": "#ce9178" },
  { "token": "constant.numeric.json", "foreground": "#b5cea8" },
  { "token": "constant.language.boolean.json", "foreground": "#569cd6" },
  ...
]
```

如果规则数量很少，说明你的主题文件中缺少 JSON/JavaScript 的颜色定义。

---

## 🔍 常见问题

### Q1: 为什么我的 JSON 代码块没有颜色？

**可能原因**：
1. 主题文件中 `tokenColors` 规则太少（只有 3 条）
2. 缺少 JSON 相关的 `scope` 定义

**解决方法**：
参考上面的完整示例，添加更多 `tokenColors` 规则。

---

### Q2: 为什么刷新后高亮会闪烁？

**已修复**：
- ✅ 预加载 JSON tokenizer
- ✅ 主题应用后强制重新 tokenize
- ✅ 移除了干扰 JSON 高亮的自定义 tokenizer

---

### Q3: 如何找到正确的 `scope` 名称？

使用 VS Code 的 **Developer: Inspect Editor Tokens and Scopes** 命令：

1. 在 VS Code 中打开一个 JSON 文件
2. 按 `Ctrl+Shift+P` → 输入 "Inspect Editor Tokens"
3. 点击任意代码，查看其 `scope`

---

## 📚 参考资源

- [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color)
- [TextMate Scopes](https://macromates.com/manual/en/language_grammars)
- [Monaco Editor Theme API](https://microsoft.github.io/monaco-editor/docs.html#interfaces/editor.IStandaloneThemeData.html)

---

## 💡 最佳实践

1. **从基础主题继承**：设置 `inherit: true`，只覆盖你需要的颜色
2. **使用语义高亮**：添加 `semanticTokenColors` 提供更精确的高亮
3. **测试多种语言**：确保 JSON、JavaScript、TypeScript 等都有良好的高亮
4. **保持一致性**：同类型的 token（如字符串）使用相同的颜色

---

## 🎉 总结

- ✅ **Markdown 代码块完全支持自定义主题色**
- ✅ **只需在 `tokenColors` 中定义规则，系统会自动应用**
- ✅ **支持所有语言：JSON、JavaScript、Python 等**
- ✅ **可以通过 `semanticTokenColors` 提供更精确的高亮**

