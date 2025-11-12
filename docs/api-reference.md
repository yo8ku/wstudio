# API 参考文档

## 插件 API

详细的插件开发文档请参考：[插件系统快速开始](../packages/plugin-system/QUICK_START.md)

### 命令系统

```typescript
// 注册命令
api.commands.register(
  id: string,
  handler: (...args: any[]) => any
): void

// 执行命令
api.commands.execute(
  id: string,
  ...args: any[]
): Promise<any>

// 获取所有命令
api.commands.getAll(): string[]
```

### UI 交互

```typescript
// 显示消息
api.ui.showMessage(
  message: string,
  type: 'info' | 'warning' | 'error'
): void

// 显示通知
api.ui.showNotification(
  title: string,
  message: string,
  type: 'info' | 'warning' | 'error'
): void
```

### 事件系统

```typescript
// 监听事件
api.events.on(
  event: string,
  handler: (...args: any[]) => void
): void

// 触发事件
api.events.emit(
  event: string,
  ...args: any[]
): void

// 取消监听
api.events.off(
  event: string,
  handler: Function
): void
```

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



