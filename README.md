# Note Studio

一个支持 VSCode 扩展的现代化笔记应用。

## 特性

- 📝 强大的 Markdown 编辑器
- 🔌 VSCode 扩展兼容
- 🤖 AI 集成
- 🎨 主题系统
- 🔍 全文搜索

## 项目结构

```
note-studio/
├── packages/
│   ├── extension-api/      # 扩展 API 定义
│   ├── main/               # Electron 主进程
│   ├── renderer/           # React 渲染进程
│   ├── shared/             # 共享代码
│   └── builtin-extensions/ # 内置扩展
├── extensions/             # 用户扩展目录
├── scripts/                # 构建脚本
└── docs/                   # 文档
```

## 开始使用

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

## 扩展开发

### 快速开始
- [扩展开发指南](./docs/extension-development.md)
- [VSCode 兼容性文档](./docs/vscode-compatibility.md)
- [快速开始指南](./QUICK_START.md)

### 架构文档
- [📊 VSCode 插件支持流程图](./docs/vscode-extension-flow-diagram.md) - 可视化流程图和快速参考
- [📚 VSCode 插件完整架构](./docs/vscode-extension-flow.md) - 详细的架构说明和实现细节
- [🔌 VSIX 安装器指南](./VSIX_INSTALLER_COMPLETE.md) - VSIX 文件安装使用指南

### API 文档
- [API 参考](./docs/api-reference.md)
- [Extension API 使用指南](./packages/extension-api/USAGE_GUIDE.md)
- [API 速查表](./packages/extension-api/API_CHEATSHEET.md)

## 许可证

MIT



