# VSCode 兼容性文档

## 概述

Note Studio 提供了与 VSCode 扩展的兼容层，允许运行大部分 VSCode 扩展。

## 支持的 API

### 核心模块

- ✅ `vscode.commands` - 命令系统
- ✅ `vscode.window` - 窗口和用户界面
- ✅ `vscode.workspace` - 工作区管理
- ✅ `vscode.languages` - 语言支持
- ✅ `vscode.env` - 环境信息
- ✅ `vscode.extensions` - 扩展管理

### 贡献点

- ✅ `commands` - 命令
- ✅ `configuration` - 配置
- ✅ `keybindings` - 快捷键
- ✅ `languages` - 语言
- ✅ `themes` - 主题
- ⚠️ `viewsContainers` - 视图容器（部分支持）
- ⚠️ `views` - 视图（部分支持）

### 激活事件

- ✅ `*` - 立即激活
- ✅ `onLanguage:*` - 语言激活
- ✅ `onCommand:*` - 命令激活
- ⚠️ `onView:*` - 视图激活（部分支持）
- ⚠️ `onUri` - URI 激活（部分支持）

## 已知限制

1. 不支持所有 VSCode 内置命令
2. Webview API 功能有限
3. 调试 API 功能有限
4. 某些 UI 元素可能显示不同

## 测试兼容性

使用以下命令测试扩展兼容性：

```bash
npm run test-extension <扩展路径>
```

## 从 VSCode Marketplace 安装

1. 在扩展市场中搜索扩展
2. 点击安装按钮
3. 或手动下载 .vsix 文件并安装

## 故障排查

### 扩展无法加载

- 检查 package.json 格式
- 确认引擎版本兼容
- 查看控制台错误日志

### API 不兼容

- 查看兼容性文档
- 使用替代 API
- 联系扩展作者



