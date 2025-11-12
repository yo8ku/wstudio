# 插件开发指南

## 快速开始

### 1. 创建插件项目

```bash
mkdir my-first-plugin
cd my-first-plugin
npm init -y
```

### 2. 安装依赖

```bash
npm install --save-dev @note-studio/plugin-system typescript @types/node
```

### 3. 配置 TypeScript

创建 `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true
  }
}
```

### 4. 创建插件入口文件

创建 `src/index.ts`:

```typescript
import { PluginAPI, PluginContext } from '@note-studio/plugin-system';

export async function activate(context: PluginContext, api: PluginAPI) {
  console.log('Plugin activated!');
  
  // 注册命令
  api.commands.registerCommand({
    id: 'my-plugin.helloWorld',
    title: 'Hello World',
    handler: () => {
      api.window.showInformationMessage('Hello, World!');
    }
  });
}

export async function deactivate() {
  console.log('Plugin deactivated!');
}
```

### 5. 配置插件元数据

在 `package.json` 中添加插件元数据：

```json
{
  "name": "my-first-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc"
  },
  "pluginMetadata": {
    "id": "my-first-plugin",
    "name": "My First Plugin",
    "version": "1.0.0",
    "description": "My first awesome plugin",
    "author": "Your Name",
    "category": "general",
    "keywords": ["example", "demo"]
  },
  "devDependencies": {
    "@note-studio/plugin-system": "workspace:*",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### 6. 构建插件

```bash
npm run build
```

## 核心概念

### 插件上下文 (PluginContext)

插件上下文包含插件的元数据和状态信息：

```typescript
interface PluginContext {
  metadata: PluginMetadata;
  rootPath: string;
  storagePath: string;
  globalState: any;
  workspaceState: any;
}
```

### 插件API (PluginAPI)

插件API是插件与应用交互的主要接口：

```typescript
const api: PluginAPI = {
  context,      // 插件上下文
  events,       // 事件系统
  commands,     // 命令系统
  ui,           // UI系统
  storage,      // 存储系统
  workspace,    // 工作区API
  window,       // 窗口API
  fs,           // 文件系统API
  http,         // 网络API
};
```

## API 使用示例

### 命令系统

#### 注册命令

```typescript
api.commands.registerCommand({
  id: 'my-plugin.myCommand',
  title: 'My Command',
  description: 'Does something awesome',
  category: 'My Plugin',
  handler: (...args) => {
    console.log('Command executed!', args);
  }
});
```

#### 执行命令

```typescript
await api.commands.executeCommand('my-plugin.myCommand', 'arg1', 'arg2');
```

#### 带快捷键的命令

```typescript
api.commands.registerCommand({
  id: 'my-plugin.quickAction',
  title: 'Quick Action',
  keybinding: {
    key: 'Ctrl+Shift+Q',
    mac: 'Cmd+Shift+Q'
  },
  handler: () => {
    // Handle quick action
  }
});
```

### 事件系统

#### 监听事件

```typescript
// 持续监听
api.events.on('app:ready', () => {
  console.log('App is ready!');
});

// 单次监听
api.events.once('plugin:activated', (data) => {
  console.log('Plugin activated:', data);
});
```

#### 发射事件

```typescript
await api.events.emit('my-plugin:custom-event', {
  message: 'Hello from my plugin!'
});
```

#### 取消监听

```typescript
const subscription = api.events.on('some-event', handler);
subscription.dispose(); // 取消订阅
```

### UI系统

#### 显示通知

```typescript
// 信息通知
api.ui.showNotification({
  type: NotificationType.Info,
  message: 'Operation completed successfully!'
});

// 带操作的通知
api.ui.showNotification({
  type: NotificationType.Warning,
  message: 'Do you want to continue?',
  actions: [
    {
      label: 'Yes',
      handler: () => console.log('User clicked Yes')
    },
    {
      label: 'No',
      handler: () => console.log('User clicked No')
    }
  ]
});
```

#### 注册状态栏项

```typescript
const statusBarItem = api.ui.registerStatusBarItem({
  id: 'my-plugin.status',
  text: '$(check) Ready',
  tooltip: 'Plugin is ready',
  command: 'my-plugin.showStatus',
  alignment: 'right',
  priority: 100
});

// 更新状态栏
statusBarItem.text = '$(sync~spin) Processing...';
```

#### 注册菜单项

```typescript
api.ui.registerMenuItem('editor/context', {
  id: 'my-plugin.contextMenu',
  label: 'My Plugin Action',
  command: 'my-plugin.contextAction',
  icon: '$(symbol-method)'
});
```

### 存储系统

#### 全局存储

```typescript
const globalStorage = api.storage.getStorage(StorageScope.Global);

// 保存数据
await globalStorage.set('myKey', { value: 'Hello' });

// 读取数据
const data = globalStorage.get('myKey');

// 删除数据
await globalStorage.delete('myKey');
```

#### 工作区存储

```typescript
const workspaceStorage = api.storage.getStorage(StorageScope.Workspace);

await workspaceStorage.set('projectSettings', {
  theme: 'dark',
  fontSize: 14
});
```

#### 监听存储变化

```typescript
api.storage.onDidChangeStorage((event) => {
  console.log(`Key ${event.key} changed from`, event.oldValue, 'to', event.newValue);
});
```

### 窗口API

#### 显示消息

```typescript
// 信息消息
const selection = await api.window.showInformationMessage(
  'Choose an option',
  'Option 1',
  'Option 2'
);
console.log('User selected:', selection);

// 警告消息
await api.window.showWarningMessage('This action cannot be undone!');

// 错误消息
await api.window.showErrorMessage('An error occurred!');
```

#### 显示输入框

```typescript
const input = await api.window.showInputBox({
  placeHolder: 'Enter your name',
  prompt: 'What is your name?',
  validateInput: (value) => {
    return value.length < 3 ? 'Name must be at least 3 characters' : undefined;
  }
});
```

#### 显示快速选择

```typescript
const selected = await api.window.showQuickPick(
  ['Option 1', 'Option 2', 'Option 3'],
  { placeHolder: 'Select an option' }
);
```

### 工作区API

#### 获取工作区路径

```typescript
const rootPath = api.workspace.getRootPath();
console.log('Workspace root:', rootPath);
```

#### 读取配置

```typescript
const config = api.workspace.getConfiguration('my-plugin');
const fontSize = config.fontSize || 14;
```

#### 更新配置

```typescript
await api.workspace.updateConfiguration('my-plugin.theme', 'dark');
```

### 文件系统API

#### 读写文件

```typescript
// 读取文件
const content = await api.fs.readFile('/path/to/file.txt');
console.log(content.toString());

// 写入文件
await api.fs.writeFile('/path/to/file.txt', 'Hello, World!');

// 删除文件
await api.fs.deleteFile('/path/to/file.txt');
```

#### 目录操作

```typescript
// 创建目录
await api.fs.createDirectory('/path/to/dir');

// 读取目录
const files = await api.fs.readDirectory('/path/to/dir');
console.log('Files:', files);

// 检查文件是否存在
const exists = await api.fs.exists('/path/to/file.txt');
```

### 网络API

#### HTTP 请求

```typescript
// GET 请求
const data = await api.http.get('https://api.example.com/data');

// POST 请求
const result = await api.http.post('https://api.example.com/data', {
  name: 'John',
  age: 30
});

// 带请求头
const response = await api.http.get('https://api.example.com/data', {
  headers: {
    'Authorization': 'Bearer token'
  },
  timeout: 5000
});
```

## 最佳实践

### 1. 资源清理

始终在 `deactivate` 函数中清理资源：

```typescript
const subscriptions: Array<{ dispose: () => void }> = [];

export async function activate(context: PluginContext, api: PluginAPI) {
  // 保存订阅以便后续清理
  subscriptions.push(
    api.events.on('some-event', handler),
    api.commands.registerCommand({ ... })
  );
}

export async function deactivate() {
  // 清理所有订阅
  subscriptions.forEach(s => s.dispose());
}
```

### 2. 错误处理

正确处理错误并提供友好的用户反馈：

```typescript
try {
  await someOperation();
} catch (error) {
  api.window.showErrorMessage(`Operation failed: ${error.message}`);
  console.error('Detailed error:', error);
}
```

### 3. 性能优化

- 避免在激活时执行耗时操作
- 使用延迟加载
- 缓存重复计算的结果

```typescript
let cachedData: any;

async function getData() {
  if (!cachedData) {
    cachedData = await expensiveOperation();
  }
  return cachedData;
}
```

### 4. 配置管理

为插件提供可配置选项：

```typescript
interface MyPluginConfig {
  enabled: boolean;
  timeout: number;
  apiKey?: string;
}

function getConfig(): MyPluginConfig {
  const config = api.workspace.getConfiguration('my-plugin');
  return {
    enabled: config.enabled ?? true,
    timeout: config.timeout ?? 5000,
    apiKey: config.apiKey
  };
}
```

### 5. 类型安全

充分利用 TypeScript 的类型系统：

```typescript
interface MyData {
  id: string;
  name: string;
  value: number;
}

const storage = api.storage.getStorage(StorageScope.Global);
await storage.set<MyData>('myData', { id: '1', name: 'Test', value: 42 });
const data = storage.get<MyData>('myData');
```

## 调试插件

### 1. 日志输出

```typescript
console.log('Debug info:', data);
console.error('Error occurred:', error);
```

### 2. 断点调试

在 VS Code 中配置 `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Plugin",
      "program": "${workspaceFolder}/dist/index.js",
      "preLaunchTask": "npm: build"
    }
  ]
}
```

## 发布插件

1. 确保 `package.json` 包含完整的元数据
2. 构建插件: `npm run build`
3. 测试插件功能
4. 打包插件: `npm pack`
5. 发布到插件市场(TODO)

## 常见问题

### Q: 如何访问其他插件的功能？

A: 通过事件系统或命令系统与其他插件通信。

### Q: 如何处理插件依赖？

A: 在 `package.json` 的 `pluginMetadata.dependencies` 中声明依赖。

### Q: 如何更新插件？

A: 更新版本号，重新构建并发布。应用会自动检测更新。

## 示例插件

查看 `examples/` 目录下的示例插件：

- `hello-world`: 基础示例
- `task-provider`: 任务提供者示例
- `custom-editor`: 自定义编辑器示例

## 相关资源

- [架构文档](./ARCHITECTURE.md)
- [API 参考](./API_REFERENCE.md)
- [插件示例](../examples/)

