# API 参考文档

## VSCode 兼容 API

### commands

```typescript
// 注册命令
vscode.commands.registerCommand(
  command: string,
  callback: (...args: any[]) => any
): Disposable

// 执行命令
vscode.commands.executeCommand<T>(
  command: string,
  ...args: any[]
): Thenable<T>

// 获取所有命令
vscode.commands.getCommands(): Thenable<string[]>
```

### window

```typescript
// 显示信息消息
vscode.window.showInformationMessage(
  message: string,
  ...items: string[]
): Thenable<string | undefined>

// 显示警告消息
vscode.window.showWarningMessage(
  message: string,
  ...items: string[]
): Thenable<string | undefined>

// 显示错误消息
vscode.window.showErrorMessage(
  message: string,
  ...items: string[]
): Thenable<string | undefined>

// 显示快速选择
vscode.window.showQuickPick(
  items: string[]
): Thenable<string | undefined>

// 显示输入框
vscode.window.showInputBox(
  options?: InputBoxOptions
): Thenable<string | undefined>
```

### workspace

```typescript
// 获取工作区文件夹
vscode.workspace.getWorkspaceFolders(): WorkspaceFolder[] | undefined

// 获取配置
vscode.workspace.getConfiguration(
  section?: string
): WorkspaceConfiguration

// 工作区变化事件
vscode.workspace.onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>
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



