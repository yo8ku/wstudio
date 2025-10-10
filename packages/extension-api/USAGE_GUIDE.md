# VSCode API 使用指南

本指南详细介绍如何使用 `@note-studio/extension-api` 创建与 VSCode 100% 兼容的扩展。

## 📋 目录

- [快速开始](#快速开始)
- [核心概念](#核心概念)
- [API 详解](#api-详解)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

## 🚀 快速开始

### 1. 安装依赖

```bash
pnpm add @note-studio/extension-api
```

### 2. 创建扩展结构

```
my-extension/
├── package.json
├── tsconfig.json
└── src/
    └── extension.ts
```

### 3. 配置 package.json

```json
{
  "name": "my-extension",
  "displayName": "My Extension",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.85.0"
  },
  "activationEvents": [
    "onCommand:myExtension.command"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [{
      "command": "myExtension.command",
      "title": "My Command"
    }]
  }
}
```

### 4. 编写扩展代码

```typescript
import vscode from '@note-studio/extension-api';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'myExtension.command',
    () => {
      vscode.window.showInformationMessage('Hello from my extension!');
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
```

## 📚 核心概念

### Extension Context

`ExtensionContext` 是扩展的上下文对象，包含：

- `subscriptions` - 用于注册需要清理的资源
- `workspaceState` - 工作区状态存储
- `globalState` - 全局状态存储
- `extensionPath` - 扩展路径
- `extensionUri` - 扩展 URI

```typescript
export function activate(context: vscode.ExtensionContext) {
  // 存储数据
  context.globalState.update('myKey', 'myValue');
  
  // 读取数据
  const value = context.globalState.get<string>('myKey');
  
  // 获取扩展路径
  const imagePath = path.join(context.extensionPath, 'images', 'logo.png');
}
```

### Disposable 模式

所有需要清理的资源都应该添加到 `context.subscriptions`：

```typescript
const command = vscode.commands.registerCommand('...', () => {});
const provider = vscode.languages.registerCompletionItemProvider('...', {});
const watcher = vscode.workspace.createFileSystemWatcher('...');

context.subscriptions.push(command, provider, watcher);
```

### Event 事件系统

使用 `Event<T>` 类型监听事件：

```typescript
// 监听配置变化
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('myExtension')) {
    console.log('Configuration changed!');
  }
});

// 监听活动编辑器变化
vscode.window.onDidChangeActiveTextEditor(editor => {
  if (editor) {
    console.log('Active editor:', editor.document.fileName);
  }
});
```

## 🔧 API 详解

### 1. Commands API

#### 注册命令

```typescript
vscode.commands.registerCommand('myExtension.doSomething', async (arg1, arg2) => {
  // 命令逻辑
  console.log('Args:', arg1, arg2);
  return 'result';
});
```

#### 执行命令

```typescript
// 执行内置命令
await vscode.commands.executeCommand('workbench.action.files.save');

// 执行自定义命令
const result = await vscode.commands.executeCommand<string>(
  'myExtension.doSomething',
  'arg1',
  'arg2'
);
```

#### 获取所有命令

```typescript
const allCommands = await vscode.commands.getCommands();
const publicCommands = await vscode.commands.getCommands(true); // 过滤内部命令
```

### 2. Window API

#### 显示消息

```typescript
// 信息消息
vscode.window.showInformationMessage('操作成功！');

// 带按钮的消息
const action = await vscode.window.showInformationMessage(
  '是否保存？',
  '保存',
  '不保存',
  '取消'
);

if (action === '保存') {
  // 保存逻辑
}

// 警告消息
vscode.window.showWarningMessage('警告：文件可能已被修改');

// 错误消息
vscode.window.showErrorMessage('操作失败！');
```

#### 快速选择

```typescript
// 简单字符串选择
const fruit = await vscode.window.showQuickPick(
  ['Apple', 'Banana', 'Orange'],
  { placeHolder: '选择一个水果' }
);

// 复杂对象选择
interface MyQuickPickItem extends vscode.QuickPickItem {
  id: string;
}

const items: MyQuickPickItem[] = [
  { label: 'Option 1', description: 'First option', id: '1' },
  { label: 'Option 2', description: 'Second option', id: '2' }
];

const selected = await vscode.window.showQuickPick(items, {
  placeHolder: '选择一个选项',
  canPickMany: false
});

if (selected) {
  console.log('Selected ID:', selected.id);
}
```

#### 输入框

```typescript
const name = await vscode.window.showInputBox({
  prompt: '请输入您的名字',
  placeHolder: '名字',
  value: 'Default Name',
  validateInput: (value) => {
    if (value.length < 3) {
      return '名字至少需要 3 个字符';
    }
    return null;
  }
});
```

#### 输出通道

```typescript
const outputChannel = vscode.window.createOutputChannel('我的扩展');

outputChannel.appendLine('扩展已启动');
outputChannel.appendLine(`时间: ${new Date().toLocaleString()}`);
outputChannel.show(); // 显示输出通道

// 清空输出
outputChannel.clear();

// 隐藏输出
outputChannel.hide();
```

#### 状态栏

```typescript
const statusBarItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100 // 优先级
);

statusBarItem.text = '$(sync~spin) 加载中...';
statusBarItem.tooltip = '正在处理...';
statusBarItem.color = '#ff0000';
statusBarItem.command = 'myExtension.clickHandler';
statusBarItem.show();

// 更新状态
setTimeout(() => {
  statusBarItem.text = '$(check) 完成';
  statusBarItem.color = undefined;
}, 3000);
```

### 3. Workspace API

#### 配置管理

```typescript
// 获取配置
const config = vscode.workspace.getConfiguration('myExtension');
const value = config.get<string>('setting', 'defaultValue');

// 更新配置
await config.update('setting', 'newValue', vscode.ConfigurationTarget.Global);

// 监听配置变化
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('myExtension.setting')) {
    const newValue = vscode.workspace.getConfiguration('myExtension')
      .get('setting');
    console.log('Setting changed to:', newValue);
  }
});
```

#### 文件操作

```typescript
// 打开文本文档
const uri = vscode.Uri.file('/path/to/file.txt');
const document = await vscode.workspace.openTextDocument(uri);

// 读取文件
const content = await vscode.workspace.fs.readFile(uri);
const text = new TextDecoder().decode(content);

// 写入文件
const newContent = new TextEncoder().encode('Hello, World!');
await vscode.workspace.fs.writeFile(uri, newContent);

// 查找文件
const files = await vscode.workspace.findFiles(
  '**/*.ts',  // include pattern
  '**/node_modules/**', // exclude pattern
  10 // max results
);

// 监听文件变化
const watcher = vscode.workspace.createFileSystemWatcher('**/*.json');

watcher.onDidCreate(uri => console.log('Created:', uri.fsPath));
watcher.onDidChange(uri => console.log('Changed:', uri.fsPath));
watcher.onDidDelete(uri => console.log('Deleted:', uri.fsPath));
```

#### 编辑文档

```typescript
const editor = vscode.window.activeTextEditor;
if (editor) {
  await editor.edit(editBuilder => {
    // 在当前位置插入文本
    editBuilder.insert(editor.selection.active, 'Hello');
    
    // 替换选中内容
    editBuilder.replace(editor.selection, 'Replaced text');
    
    // 删除范围
    const range = new vscode.Range(0, 0, 0, 10);
    editBuilder.delete(range);
  });
}
```

### 4. Languages API

#### 自动补全

```typescript
vscode.languages.registerCompletionItemProvider(
  { scheme: 'file', language: 'javascript' },
  {
    provideCompletionItems(document, position) {
      const linePrefix = document.lineAt(position).text.substr(0, position.character);
      
      if (!linePrefix.endsWith('console.')) {
        return undefined;
      }

      return [
        new vscode.CompletionItem('log', vscode.CompletionItemKind.Method),
        new vscode.CompletionItem('error', vscode.CompletionItemKind.Method),
        new vscode.CompletionItem('warn', vscode.CompletionItemKind.Method)
      ];
    }
  },
  '.' // 触发字符
);
```

#### 悬停提示

```typescript
vscode.languages.registerHoverProvider(
  { scheme: 'file', language: 'javascript' },
  {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position);
      const word = document.getText(range);
      
      if (word === 'myFunction') {
        const markdown = new vscode.MarkdownString();
        markdown.appendCodeblock('function myFunction(): void', 'typescript');
        markdown.appendMarkdown('\n\n这是一个自定义函数的说明');
        
        return new vscode.Hover(markdown);
      }
    }
  }
);
```

#### 跳转到定义

```typescript
vscode.languages.registerDefinitionProvider(
  { scheme: 'file', language: 'javascript' },
  {
    provideDefinition(document, position) {
      const range = document.getWordRangeAtPosition(position);
      const word = document.getText(range);
      
      // 返回定义位置
      return new vscode.Location(
        vscode.Uri.file('/path/to/definition.js'),
        new vscode.Position(10, 5)
      );
    }
  }
);
```

#### 代码格式化

```typescript
vscode.languages.registerDocumentFormattingEditProvider(
  { scheme: 'file', language: 'javascript' },
  {
    provideDocumentFormattingEdits(document) {
      const edits: vscode.TextEdit[] = [];
      
      // 添加格式化编辑
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        const trimmed = line.text.trim();
        
        if (trimmed !== line.text) {
          edits.push(vscode.TextEdit.replace(line.range, trimmed));
        }
      }
      
      return edits;
    }
  }
);
```

### 5. Tasks API

#### 注册任务提供者

```typescript
interface MyTaskDefinition extends vscode.TaskDefinition {
  script: string;
}

vscode.tasks.registerTaskProvider('myTask', {
  provideTasks() {
    const task = new vscode.Task(
      { type: 'myTask', script: 'build' } as MyTaskDefinition,
      vscode.TaskScope.Workspace,
      'Build',
      'myExtension',
      new vscode.ShellExecution('npm run build')
    );
    
    task.group = vscode.tasks.TaskGroup.Build;
    
    return [task];
  },
  
  resolveTask(task: vscode.Task) {
    const definition = task.definition as MyTaskDefinition;
    return new vscode.Task(
      definition,
      task.scope ?? vscode.TaskScope.Workspace,
      task.name,
      task.source,
      new vscode.ShellExecution(definition.script)
    );
  }
});
```

#### 执行任务

```typescript
const tasks = await vscode.tasks.fetchTasks({ type: 'myTask' });
if (tasks.length > 0) {
  await vscode.tasks.executeTask(tasks[0]);
}
```

## 💡 最佳实践

### 1. 性能优化

```typescript
// ❌ 不好：频繁更新状态栏
setInterval(() => {
  statusBarItem.text = new Date().toLocaleTimeString();
}, 100);

// ✅ 好：使用节流
let timeout: NodeJS.Timeout;
function updateStatusBar() {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    statusBarItem.text = new Date().toLocaleTimeString();
  }, 1000);
}
```

### 2. 错误处理

```typescript
// ✅ 总是处理异步错误
vscode.commands.registerCommand('myExtension.command', async () => {
  try {
    const result = await someAsyncOperation();
    vscode.window.showInformationMessage('Success!');
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
});
```

### 3. 资源清理

```typescript
export function activate(context: vscode.ExtensionContext) {
  // ✅ 所有需要清理的资源都添加到 subscriptions
  const disposables: vscode.Disposable[] = [];
  
  disposables.push(
    vscode.commands.registerCommand('...', () => {}),
    vscode.workspace.onDidChangeConfiguration(() => {}),
    vscode.window.createOutputChannel('...')
  );
  
  context.subscriptions.push(...disposables);
}
```

### 4. 类型安全

```typescript
// ✅ 使用泛型获取类型安全的配置
const timeout = vscode.workspace
  .getConfiguration('myExtension')
  .get<number>('timeout', 5000);

// ✅ 使用类型保护
function isMyQuickPickItem(item: any): item is MyQuickPickItem {
  return item && typeof item.id === 'string';
}
```

## ❓ 常见问题

### Q: 如何获取当前工作区路径？

```typescript
const workspaceFolders = vscode.workspace.workspaceFolders;
if (workspaceFolders && workspaceFolders.length > 0) {
  const rootPath = workspaceFolders[0].uri.fsPath;
}
```

### Q: 如何在编辑器中高亮显示文本？

```typescript
const decorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(255, 255, 0, 0.3)'
});

const editor = vscode.window.activeTextEditor;
if (editor) {
  const range = new vscode.Range(0, 0, 0, 10);
  editor.setDecorations(decorationType, [range]);
}
```

### Q: 如何打开外部链接？

```typescript
const uri = vscode.Uri.parse('https://example.com');
await vscode.env.openExternal(uri);
```

### Q: 如何读写剪贴板？

```typescript
// 读取
const text = await vscode.env.clipboard.readText();

// 写入
await vscode.env.clipboard.writeText('Hello, Clipboard!');
```

## 📖 更多资源

- [示例：Hello World](./examples/hello-world/)
- [示例：任务提供者](./examples/task-provider/)
- [VSCode Extension API 官方文档](https://code.visualstudio.com/api)
- [API 参考](./README.md)



