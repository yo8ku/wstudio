# Note Studio

一个支持插件扩展的现代化笔记应用。

## ✨ 特性

-  **强大的编辑器** - 基于 Monaco 的代码编辑器，完整的 Markdown 支持
- 🔌 **插件系统** - 强大的插件系统，支持自定义插件扩展
- 🤖 **AI 集成** - 内置 AI 助手，支持多种 AI 提供商
- 🎨 **主题系统** - 丰富的主题选择，继承 VSCode 主题配色
- 📚 **知识库** - 强大的知识管理，支持语义搜索和 RAG
-  **全文搜索** - 快速查找文档内容

## 🏗️ 项目结构

```
note-studio/
├── packages/                  # 核心包
│   ├── shared/                # 共享代码
│   ├── core/                  # 核心功能
│   ├── main/                  # Electron 主进程
│   ├── renderer/              # React 渲染进程
│   ├── plugin-system/         # 插件系统
│   └── knowledge-base/        # 知识库系统
├── resources/                 # 资源文件
│   ├── themes/builtin/        # 内置主题（20+ 主题）
│   ├── plugins/builtin/       # 内置插件
│   └── icons/                 # 图标资源
├── scripts/                   # 构建脚本
├── docs/                      # 文档
├── electron.js                # Electron 主进程入口
└── preload.js                 # 预加载脚本
```

详细说明请查看[项目结构文档](./docs/development/project-structure.md)和[项目状态](./PROJECT_STATUS.md)。

##  快速开始

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

### 构建

```bash
pnpm build
```

### 打包应用

```bash
pnpm build:electron
```

## 📖 文档

### 用户指南
- [快速开始](./docs/guide/getting-started.md)
- [功能介绍](./docs/guide/features/)
- [快捷键](./docs/keyboard-shortcuts-guide.md)

### 开发文档
- [项目架构](./docs/development/architecture.md)
- [项目结构](./docs/development/project-structure.md)
- [插件开发](./packages/plugin-system/QUICK_START.md)

### API 文档
- [API 索引](./docs/api/README.md)
- [API 参考](./docs/api-reference.md)

### 功能文档
- [知识库系统](./docs/features/knowledge-base.md)
- [AI 模型配置](./docs/ai-model-configuration.md)
- [内置 AI 服务](./docs/builtin-ai-service.md)
- [设置系统](./docs/settings-system-guide.md)

## 🔧 技术栈

- **框架**: Electron + React
- **语言**: TypeScript
- **构建工具**: Vite + Turbo
- **包管理**: pnpm
- **UI 组件**: shadcn/ui + Radix UI
- **编辑器**: Monaco Editor
- **状态管理**: Zustand
- **主题**: 继承 VSCode 主题系统

## 📦 包说明

- `@note-studio/shared` - 共享类型和工具
- `@note-studio/theme` - 主题系统
- `@note-studio/main` - Electron 主进程
- `@note-studio/renderer` - React 渲染进程
- `@note-studio/plugin-system` - 插件系统
- `@note-studio/knowledge-base` - 知识库系统（RAG、向量搜索）

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

##  变更日志

查看 [CHANGELOG.md](./CHANGELOG.md) 了解版本历史和更新内容。

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](./LICENSE) 文件。

## 🔗 相关链接

- [GitHub 仓库](https://github.com/yo8ku/WiseAI-Note-Studio)
- [问题反馈](https://github.com/yo8ku/WiseAI-Note-Studio/issues)
- [文档中心](./docs/README.md)

---

**Note Studio** - 让笔记更智能 ✨



