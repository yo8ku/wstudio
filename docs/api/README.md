# API 文档

Note Studio API 文档总览。

## API 分类

### 插件 API

为插件开发者提供的 API 接口。

- [插件 API 完整文档](../extension-development.md)
- 自定义插件 API

**主要功能**：
- 命令系统
- 事件系统
- UI 扩展
- 文件系统访问
- 编辑器控制

### 核心 API

应用核心功能 API。

- [核心 API 文档](./core-api.md)

**主要功能**：
- 主题管理
- 工作区管理
- 设置管理
- IPC 通信

### UI 组件

React 组件库 API。

- [UI 组件文档](./ui-components.md)

**主要组件**：
- 布局组件
- 表单组件
- 数据展示组件
- 反馈组件

### 知识库 API

知识库系统 API。

- [知识库 API 文档](./knowledge-base-api.md)

**主要功能**：
- 文档索引
- 语义搜索
- RAG 查询
- 知识图谱

### AI API

AI 服务 API。

- [AI API 文档](./ai-api.md)

**主要功能**：
- 提供商管理
- 模型配置
- 对话接口
- Prompt 管理

## 快速开始

### 插件开发

```javascript
module.exports = {
  async activate(context) {
    context.commands.register('local.my-plugin.hello', async () => {
      await context.window.showInfo('Hello World!');
    });
  },
};
```

### 使用核心 API

```typescript
import { ThemeManager } from '@note-studio/theme';

const themeManager = new ThemeManager();
await themeManager.loadTheme('monokai-pro');
```

### 使用 UI 组件

```tsx
import { Button } from '@note-studio/ui';

function MyComponent() {
  return (
    <Button onClick={() => console.log('clicked')}>
      Click me
    </Button>
  );
}
```

## API 版本

当前 API 版本：`1.0.0`

## 兼容性

- Node.js: `>=18.0.0`
- Electron: `^27.0.0`

## 贡献

如果你发现 API 文档有误或需要改进，欢迎提交 PR！

## 相关链接

- [插件开发指南](../extension-development.md)
- [项目架构](../development/architecture.md)
- [GitHub 仓库](https://github.com/yo8ku/WiseAI-Note-Studio)

