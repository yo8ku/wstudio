# API 参考文档

## 插件 API

详细的插件开发文档请参考：[WStudio 插件开发说明](./extension-development.md)。

当前插件 API 的真实源码入口：

- `packages/extension-api/src/manifest.ts`
- `packages/extension-api/src/contributes.ts`
- `packages/extension-api/src/context.ts`
- `packages/extension-api/src/plugin.ts`
- `packages/shared/src/types/extension.ts`

### 主要 API 分组

- `context.commands`
- `context.window`
- `context.workspace`
- `context.storage`
- `context.settings`
- `context.webview`
- `context.notes`
- `context.editor`
- `context.ai`

## 原生 API

### 笔记 API

```typescript
// 创建笔记
native.createNote(
  title: string,
  content: string
): Promise<Note>

// 获取笔记列表
native.getNotes(): Promise<Note[]>

// 更新笔记
native.updateNote(
  id: string,
  updates: Partial<Note>
): Promise<Note | null>

// 删除笔记
native.deleteNote(id: string): Promise<boolean>
```

### AI API

```typescript
// AI 补全
native.complete(
  request: AIRequest
): Promise<AIResponse>

// AI 对话
native.chat(
  messages: ChatMessage[]
): Promise<AIResponse>
```

### 高级功能

```typescript
// 工作区搜索
native.searchInWorkspace(
  options: SearchOptions
): Promise<string[]>

// 索引工作区
native.indexWorkspace(): Promise<void>
```



