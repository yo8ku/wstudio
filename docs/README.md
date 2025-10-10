# Note Studio 文档中心

欢迎来到 Note Studio 文档中心！这里包含了所有技术文档和开发指南。

## 📚 文档导航

### 🚀 快速开始
- [项目快速开始](../QUICK_START.md) - 快速了解项目并开始开发
- [扩展开发指南](./extension-development.md) - 创建你的第一个扩展
- [API 速查表](../packages/extension-api/API_CHEATSHEET.md) - 常用 API 快速参考

### 🏗️ 架构设计

#### VSCode 插件支持
- **[📊 VSCode 插件支持流程图](./vscode-extension-flow-diagram.md)** ⭐ 推荐
  - 可视化流程图
  - 快速参考和示例
  - 5 个核心流程详解

- **[📚 VSCode 插件完整架构](./vscode-extension-flow.md)** ⭐ 深入阅读
  - 完整的架构说明
  - 核心组件详解
  - 数据流转分析
  - 扩展建议和路线图

#### 兼容性和安装
- [VSCode 兼容性文档](./vscode-compatibility.md) - VSCode API 兼容性说明
- [VSIX 安装器完整指南](../VSIX_INSTALLER_COMPLETE.md) - VSIX 文件安装和使用

### 🔌 扩展 API

#### API 文档
- [API 参考](./api-reference.md) - 完整的 API 文档
- [Extension API 实现详解](../packages/extension-api/API_IMPLEMENTATION.md) - API 实现细节
- [Extension API 使用指南](../packages/extension-api/USAGE_GUIDE.md) - API 使用教程
- [VSCode API 摘要](../VSCODE_API_SUMMARY.md) - VSCode API 支持情况

#### 快速参考
- [API 速查表](../packages/extension-api/API_CHEATSHEET.md) - 常用 API 快速查询
- [Extension API 快速开始](../packages/extension-api/QUICK_START.md) - 5 分钟上手

### 🛠️ 开发指南

#### 扩展开发
- [扩展开发指南](./extension-development.md) - 基础扩展开发
- [扩展示例](../extensions/README.md) - 官方扩展示例
- [自定义扩展示例](../extensions/custom-extension-example/) - 最小扩展示例

#### 高级主题
- [Extension Host 实现](../packages/main/extension-host/README.md) - 扩展宿主进程
- [VSIX 安装器实现](../packages/main/src/extensions/vscode-adapter/IMPLEMENTATION_SUMMARY.md) - 安装器技术细节

### 📦 包说明

#### 核心包
- **extension-api** - 扩展 API 定义
  - [README](../packages/extension-api/README.md)
  - [使用指南](../packages/extension-api/USAGE_GUIDE.md)
  - [快速开始](../packages/extension-api/QUICK_START.md)

- **main** - Electron 主进程
  - [README](../packages/main/README.md)
  - [Extension Host](../packages/main/extension-host/README.md)

- **renderer** - React 渲染进程
  - [README](../packages/renderer/README.md)

- **shared** - 共享代码
  - [README](../packages/shared/README.md)

#### 扩展包
- **builtin-extensions** - 内置扩展
  - Git 集成
  - Markdown 支持
  - TypeScript 支持
  - 默认主题

- **extensions** - 用户扩展示例
  - [扩展目录说明](../extensions/README.md)

### 🔧 工具和脚本

- [构建扩展宿主脚本](../scripts/build-extension-host.js)
- [下载扩展脚本](../scripts/download-extensions.js)
- [下载 VSCode 类型定义](../scripts/download-vscode-types.js)
- [测试 VSCode 扩展](../scripts/test-vscode-extension.js)

### 📖 教程和示例

#### 示例扩展
- [Hello World](../packages/extension-api/examples/hello-world/) - 最简单的扩展
- [Task Provider](../packages/extension-api/examples/task-provider/) - 任务提供器示例
- [Git Integration](../packages/extensions/git-integration/) - Git 集成扩展
- [Markdown Preview](../packages/extensions/markdown-preview/) - Markdown 预览
- [Theme Pack](../packages/extensions/theme-pack/) - 主题包

#### 使用示例代码
- [VSIX 安装器使用示例](../packages/main/src/extensions/vscode-adapter/example-usage.ts)
- [VSIX 安装器使用说明](../packages/main/src/extensions/vscode-adapter/INSTALLATION.md)

### 🎯 快速索引

#### 我想...

**开发一个扩展**
1. 阅读 [扩展开发指南](./extension-development.md)
2. 参考 [API 速查表](../packages/extension-api/API_CHEATSHEET.md)
3. 查看 [Hello World 示例](../packages/extension-api/examples/hello-world/)

**安装 VSCode 扩展**
1. 查看 [VSIX 安装器指南](../VSIX_INSTALLER_COMPLETE.md)
2. 阅读 [安装使用说明](../packages/main/src/extensions/vscode-adapter/INSTALLATION.md)

**了解插件系统架构**
1. 先看 [流程图文档](./vscode-extension-flow-diagram.md) 快速了解
2. 再读 [完整架构文档](./vscode-extension-flow.md) 深入理解

**查找 API 用法**
1. 查看 [API 速查表](../packages/extension-api/API_CHEATSHEET.md)
2. 参考 [API 使用指南](../packages/extension-api/USAGE_GUIDE.md)
3. 阅读 [API 参考文档](./api-reference.md)

**检查 VSCode API 兼容性**
1. 查看 [VSCode 兼容性文档](./vscode-compatibility.md)
2. 参考 [VSCode API 摘要](../VSCODE_API_SUMMARY.md)

**调试扩展问题**
1. 查看 [Extension Host 文档](../packages/main/extension-host/README.md)
2. 参考 [故障排查指南](../packages/main/src/extensions/vscode-adapter/INSTALLATION.md#故障排查)

### 🔍 按主题查找

#### 安装和配置
- [项目快速开始](../QUICK_START.md)
- [VSIX 安装器完整指南](../VSIX_INSTALLER_COMPLETE.md)
- [VSIX 安装使用说明](../packages/main/src/extensions/vscode-adapter/INSTALLATION.md)

#### API 和开发
- [扩展开发指南](./extension-development.md)
- [API 参考](./api-reference.md)
- [API 速查表](../packages/extension-api/API_CHEATSHEET.md)
- [Extension API 使用指南](../packages/extension-api/USAGE_GUIDE.md)

#### 架构和原理
- [VSCode 插件支持流程图](./vscode-extension-flow-diagram.md)
- [VSCode 插件完整架构](./vscode-extension-flow.md)
- [Extension Host 实现](../packages/main/extension-host/README.md)
- [API 实现详解](../packages/extension-api/API_IMPLEMENTATION.md)

#### 兼容性
- [VSCode 兼容性文档](./vscode-compatibility.md)
- [VSCode API 摘要](../VSCODE_API_SUMMARY.md)
- [VSIX 安装器实现总结](../packages/main/src/extensions/vscode-adapter/IMPLEMENTATION_SUMMARY.md)

### 📝 贡献指南

欢迎贡献文档！请确保：

1. 使用清晰的标题和结构
2. 提供代码示例和使用场景
3. 保持文档更新和准确
4. 遵循项目代码规范

### 🆘 获取帮助

- 查看 [常见问题](./faq.md)（如果存在）
- 提交 Issue 到 GitHub
- 查看示例代码

---

**最后更新**: 2025-09-30  
**维护者**: Note Studio Team






