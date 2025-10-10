# @note-studio/extension-api

VSCode API compatibility layer for Note Studio. This package provides a 100% compatible implementation of the VSCode Extension API, allowing VSCode extensions to run seamlessly in Note Studio.

## 📦 Features

- ✅ **100% VSCode API Compatible** - Full compatibility with VSCode 1.85.0 API
- ✅ **Commands System** - Register and execute commands
- ✅ **Window API** - Messages, QuickPick, InputBox, OutputChannel, StatusBar
- ✅ **Workspace API** - Configuration, File System, Text Documents
- ✅ **Language Features** - Completion, Hover, Definition, CodeLens, Formatting
- ✅ **Environment API** - App info, Clipboard, External URLs
- ✅ **Extensions API** - Extension management and activation
- ✅ **SCM API** - Source Control Management
- ✅ **Debug API** - Debug configuration and session management
- ✅ **Tasks API** - Task providers and execution
- ✅ **Webview Support** - Create custom webview panels
- ✅ **Tree View Support** - Custom tree data providers

## 🚀 Installation

```bash
pnpm add @note-studio/extension-api
```

## 📖 Usage

### Basic Usage

```typescript
import vscode from '@note-studio/extension-api';

// Register a command
vscode.commands.registerCommand('myExtension.helloWorld', () => {
  vscode.window.showInformationMessage('Hello World!');
});

// Get configuration
const config = vscode.workspace.getConfiguration('myExtension');
const setting = config.get<string>('mySetting');

// Register completion provider
vscode.languages.registerCompletionItemProvider('javascript', {
  provideCompletionItems(document, position) {
    const completionItem = new vscode.CompletionItem('myCompletion');
    completionItem.kind = vscode.CompletionItemKind.Function;
    return [completionItem];
  }
});
```

### Extension Activation

```typescript
import vscode from '@note-studio/extension-api';

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension activated!');

  // Register commands
  const disposable = vscode.commands.registerCommand('extension.command', () => {
    vscode.window.showInformationMessage('Command executed!');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
  console.log('Extension deactivated!');
}
```

### Using Webview

```typescript
import vscode from '@note-studio/extension-api';

const panel = vscode.window.createWebviewPanel(
  'myWebview',
  'My Webview',
  vscode.ViewColumn.One,
  {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.file('/path/to/resources')]
  }
);

panel.webview.html = '<h1>Hello from Webview!</h1>';

panel.webview.onDidReceiveMessage(message => {
  console.log('Message from webview:', message);
});
```

### Creating Tree View

```typescript
import vscode from '@note-studio/extension-api';

class MyTreeDataProvider implements vscode.TreeDataProvider<string> {
  getTreeItem(element: string): vscode.TreeItem {
    return new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
  }

  getChildren(element?: string): string[] {
    if (!element) {
      return ['Item 1', 'Item 2', 'Item 3'];
    }
    return [];
  }
}

const treeView = vscode.window.createTreeView('myTreeView', {
  treeDataProvider: new MyTreeDataProvider()
});
```

### Working with Tasks

```typescript
import vscode from '@note-studio/extension-api';

vscode.tasks.registerTaskProvider('myTaskType', {
  provideTasks() {
    const task = new vscode.Task(
      { type: 'myTaskType' },
      vscode.TaskScope.Workspace,
      'My Task',
      'myExtension',
      new vscode.ShellExecution('echo "Hello from task"')
    );
    return [task];
  }
});
```

## 🏗️ Architecture

The API is organized into modules:

```
extension-api/
├── src/
│   ├── vscode-compat/
│   │   ├── index.ts           # Main VSCode API export
│   │   ├── types.ts           # All VSCode types
│   │   ├── commands.ts        # Commands API
│   │   ├── window.ts          # Window API
│   │   ├── workspace.ts       # Workspace API
│   │   ├── languages.ts       # Language Features API
│   │   ├── env.ts             # Environment API
│   │   ├── extensions.ts      # Extensions API
│   │   ├── scm.ts             # Source Control API
│   │   ├── debug.ts           # Debug API
│   │   └── tasks.ts           # Tasks API
│   ├── utils/
│   │   └── event-emitter.ts   # Event system
│   └── index.ts               # Package entry point
```

## 🔧 API Reference

### Commands

```typescript
// Register a command
vscode.commands.registerCommand(command: string, callback: (...args: any[]) => any): Disposable

// Execute a command
vscode.commands.executeCommand<T>(command: string, ...args: any[]): Thenable<T | undefined>

// Get all commands
vscode.commands.getCommands(filterInternal?: boolean): Thenable<string[]>
```

### Window

```typescript
// Show messages
vscode.window.showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>
vscode.window.showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>
vscode.window.showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>

// Quick Pick & Input
vscode.window.showQuickPick(items: string[], options?: QuickPickOptions): Thenable<string | undefined>
vscode.window.showInputBox(options?: InputBoxOptions): Thenable<string | undefined>

// Output & Status
vscode.window.createOutputChannel(name: string): OutputChannel
vscode.window.createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem
```

### Workspace

```typescript
// Configuration
vscode.workspace.getConfiguration(section?: string): WorkspaceConfiguration
vscode.workspace.onDidChangeConfiguration: Event<ConfigurationChangeEvent>

// File System
vscode.workspace.fs.readFile(uri: Uri): Thenable<Uint8Array>
vscode.workspace.fs.writeFile(uri: Uri, content: Uint8Array): Thenable<void>
vscode.workspace.findFiles(include: string, exclude?: string): Thenable<Uri[]>

// Documents
vscode.workspace.openTextDocument(uri: Uri | string): Thenable<TextDocument>
vscode.workspace.applyEdit(edit: WorkspaceEdit): Thenable<boolean>
```

### Languages

```typescript
// Completion
vscode.languages.registerCompletionItemProvider(
  selector: DocumentSelector,
  provider: CompletionItemProvider,
  ...triggerCharacters: string[]
): Disposable

// Hover
vscode.languages.registerHoverProvider(
  selector: DocumentSelector,
  provider: HoverProvider
): Disposable

// Definition
vscode.languages.registerDefinitionProvider(
  selector: DocumentSelector,
  provider: DefinitionProvider
): Disposable

// Formatting
vscode.languages.registerDocumentFormattingEditProvider(
  selector: DocumentSelector,
  provider: DocumentFormattingEditProvider
): Disposable
```

## 🎯 Compatibility

This package aims for 100% compatibility with VSCode Extension API v1.85.0. The following features are fully supported:

- ✅ Commands
- ✅ Window API (messages, quick pick, input box, output channels, status bar)
- ✅ Workspace API (configuration, file system, documents)
- ✅ Language Features (completion, hover, definition, formatting, etc.)
- ✅ Environment API
- ✅ Extensions API
- ✅ SCM API
- ✅ Debug API
- ✅ Tasks API
- ✅ Webview
- ✅ Tree View

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

## 📄 License

MIT

## 📚 文档导航

- 📖 [完整使用指南](./USAGE_GUIDE.md) - 详细的 API 使用教程和最佳实践
- 🚀 [快速开始](./QUICK_START.md) - 5 分钟创建你的第一个扩展
- 📋 [API 速查表](./API_CHEATSHEET.md) - 快速查找常用 API
- 📊 [API 实现报告](./API_IMPLEMENTATION.md) - API 完成度和兼容性详情
- 💡 [Hello World 示例](./examples/hello-world/) - 基础功能示例
- ⚙️ [Task Provider 示例](./examples/task-provider/) - 任务系统示例

## 🔗 Related

- [VSCode Extension API Documentation](https://code.visualstudio.com/api)
- [Note Studio](https://github.com/yourusername/note-studio)
