# 项目结构

本文档详细说明 Note Studio 的目录结构。

## 根目录结构

```
note-studio/
├── apps/                      # 应用层
├── packages/                  # 核心包
├── resources/                 # 资源文件
├── config/                    # 配置文件
├── scripts/                   # 构建脚本
├── docs/                      # 文档
├── tests/                     # 测试文件
├── .github/                   # GitHub 配置
├── package.json               # 根 package.json
├── pnpm-workspace.yaml        # pnpm 工作区
├── turbo.json                 # Turbo 配置
├── tsconfig.json              # 根 TypeScript 配置
├── README.md                  # 项目说明
├── CHANGELOG.md               # 变更日志
├── PROJECT_RESTRUCTURE_PLAN.md # 重构计划
└── LICENSE                    # 许可证
```

## apps/ - 应用层

```
apps/
└── desktop/                   # Electron 桌面应用
    ├── main/                  # 主进程代码
    ├── preload/               # 预加载脚本
    └── resources/             # 应用资源
```

## packages/ - 核心包

```
packages/
├── shared/                    # 共享代码
│   ├── src/
│   │   ├── types/             # 类型定义
│   │   ├── utils/             # 工具函数
│   │   ├── constants/         # 常量定义
│   │   └── protocols/         # 协议定义
│   ├── package.json
│   └── tsconfig.json
│
├── core/                      # 核心功能
│   ├── src/
│   │   ├── theme/             # 主题系统
│   │   ├── workspace/         # 工作区管理
│   │   ├── settings/          # 设置管理
│   │   ├── ipc/               # IPC 通信
│   │   └── utils/             # 核心工具
│   ├── package.json
│   └── tsconfig.json
│
├── ui/                        # UI 组件库
│   ├── src/
│   │   ├── components/        # React 组件
│   │   ├── hooks/             # React Hooks
│   │   ├── contexts/          # React Contexts
│   │   └── styles/            # 样式文件
│   ├── package.json
│   └── tsconfig.json
│
├── editor/                    # 编辑器核心
│   ├── src/
│   │   ├── monaco/            # Monaco 编辑器
│   │   ├── markdown/          # Markdown 编辑器
│   │   └── extensions/        # 编辑器扩展
│   ├── package.json
│   └── tsconfig.json
│
├── plugin-system/             # 插件系统
│   ├── src/
│   │   ├── api/               # 插件 API
│   │   ├── manager/           # 插件管理
│   │   ├── commands/          # 命令系统
│   │   └── events/            # 事件系统
│   ├── package.json
│   └── tsconfig.json
│
├── global-rag/                # RAG 系统（已迁移，替代 knowledge-base）
│   ├── src/
│   │   ├── chunker/           # 文档分块
│   │   ├── embedding/         # 向量化
│   │   ├── vector-store/      # 向量数据库
│   │   ├── rag/               # RAG 引擎
│   │   └── python/            # Python 服务
│   ├── package.json
│   └── tsconfig.json
│
└── ai/                        # AI 服务
    ├── src/
    │   ├── providers/         # AI 提供商
    │   ├── models/            # 模型管理
    │   └── chat/              # 对话功能
    ├── package.json
    └── tsconfig.json
```

## resources/ - 资源文件

```
resources/
├── themes/                    # 主题文件
│   ├── builtin/               # 内置主题
│   │   ├── atom-one-dark/
│   │   ├── github-theme/
│   │   ├── monokai-pro/
│   │   └── ...
│   └── index.json             # 主题索引
│
├── extensions/                # 扩展文件
│   └── builtin/               # 内置扩展
│       ├── markdown/
│       ├── typescript/
│       └── ...
│
└── icons/                     # 图标资源
```

## config/ - 配置文件

```
config/
├── typescript/                # TypeScript 配置
│   ├── base.json              # 基础配置
│   ├── node.json              # Node 环境
│   └── react.json             # React 环境
│
└── vite/                      # Vite 配置
    └── base.config.ts         # 基础配置
```

## scripts/ - 构建脚本

```
scripts/
├── build/                     # 构建脚本
│   ├── build-all.js
│   ├── build-electron.js
│   └── ...
│
├── dev/                       # 开发脚本
│   ├── start-dev.js
│   └── ...
│
└── utils/                     # 工具脚本
    ├── clean.js
    └── ...
```

## docs/ - 文档

```
docs/
├── README.md                  # 文档首页
│
├── guide/                     # 用户指南
│   ├── getting-started.md
│   ├── installation.md
│   ├── features/
│   │   ├── editor.md
│   │   ├── knowledge-base.md
│   │   ├── ai-assistant.md
│   │   └── themes.md
│   └── keyboard-shortcuts.md
│
├── development/               # 开发文档
│   ├── architecture.md
│   ├── project-structure.md
│   ├── getting-started.md
│   ├── extension-development.md
│   ├── contributing.md
│   └── code-style.md
│
├── api/                       # API 文档
│   ├── README.md
│   ├── core-api.md
│   ├── ui-components.md
│   └── knowledge-base-api.md
│
└── migration/                 # 迁移指南
    └── v1-to-v2.md
```

## tests/ - 测试文件

```
tests/
├── unit/                      # 单元测试
├── integration/               # 集成测试
└── e2e/                       # 端到端测试
```

## 包依赖图

```
apps/desktop
    ├── @note-studio/ui
    │   ├── @note-studio/theme
    │   │   └── @note-studio/shared
    │   └── @note-studio/shared
    │
    ├── @note-studio/editor
    │   ├── @note-studio/theme
    │   ├── @note-studio/ui
    │   └── @note-studio/shared
    │
    ├── @note-studio/extension-system
    │   ├── @note-studio/theme
    │   └── @note-studio/shared
    │
    ├── @note-studio/global-rag
    │   └── @note-studio/shared
    │
    └── @note-studio/ai
        └── @note-studio/shared
```

## 配置文件继承

### TypeScript 配置继承

```
packages/ui/tsconfig.json
    ↓ extends
config/typescript/react.json
    ↓ extends
config/typescript/base.json
```

## 构建输出

```
packages/*/dist/               # 各包的构建输出
apps/desktop/dist/             # 应用构建输出
```

## 下一步

- 查看[架构设计](./architecture.md)
- 学习[开发环境搭建](./getting-started.md)
- 了解[扩展开发](./extension-development.md)

