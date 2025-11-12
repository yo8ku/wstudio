# 插件系统 API 参考

## 核心类型

### PluginMetadata

插件元数据定义

```typescript
interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  dependencies?: Record<string, string>;
  icon?: string;
  category?: string;
  keywords?: string[];
}
```

### PluginContext

插件上下文

```typescript
interface PluginContext {
  metadata: PluginMetadata;
  rootPath: string;
  storagePath: string;
  globalState: any;
  workspaceState: any;
}
```

### Plugin

插件实例

```typescript
interface Plugin {
  metadata: PluginMetadata;
  config: PluginConfig;
  state: PluginState;
  context: PluginContext;
  activate?(context: PluginContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;
}
```

## 事件系统 API

### EventEmitter

```typescript
interface EventEmitter {
  on<T = any>(event: string, listener: EventListener<T>): EventSubscription;
  once<T = any>(event: string, listener: EventListener<T>): EventSubscription;
  emit<T = any>(event: string, data?: T): Promise<void>;
  off(event: string, listener?: EventListener): void;
  removeAllListeners(event?: string): void;
}
```

### 系统事件

- `plugin:loaded` - 插件加载完成
- `plugin:activated` - 插件激活完成
- `plugin:deactivated` - 插件停用完成
- `plugin:error` - 插件错误
- `app:ready` - 应用就绪
- `app:close` - 应用关闭

## 命令系统 API

### CommandRegistry

```typescript
interface CommandRegistry {
  registerCommand(command: Command): void;
  unregisterCommand(commandId: string): void;
  executeCommand<T = any>(commandId: string, ...args: any[]): Promise<T>;
  getCommands(): Command[];
  getCommand(commandId: string): Command | undefined;
}
```

### Command

```typescript
interface Command {
  id: string;
  title: string;
  description?: string;
  category?: string;
  keybinding?: Keybinding;
  icon?: string;
  handler: CommandHandler;
}
```

## UI 系统 API

### UIRegistry

```typescript
interface UIRegistry {
  registerComponent(component: UIComponent): void;
  unregisterComponent(componentId: string): void;
  registerMenuItem(menuId: string, item: MenuItem): void;
  registerStatusBarItem(item: StatusBarItem): StatusBarItem;
  showNotification(notification: Notification): void;
}
```

### UIComponent

```typescript
interface UIComponent {
  id: string;
  type: UIComponentType;
  title: string;
  icon?: string;
  position?: UIPosition;
  content?: string | HTMLElement;
  priority?: number;
}
```

### MenuItem

```typescript
interface MenuItem {
  id: string;
  label: string;
  command?: string;
  keybinding?: string;
  icon?: string;
  submenu?: MenuItem[];
  separator?: boolean;
  when?: string;
}
```

### StatusBarItem

```typescript
interface StatusBarItem {
  id: string;
  text: string;
  icon?: string;
  tooltip?: string;
  command?: string;
  alignment?: 'left' | 'right';
  priority?: number;
}
```

### Notification

```typescript
interface Notification {
  type: NotificationType;
  message: string;
  actions?: NotificationAction[];
  duration?: number;
}
```

## 存储系统 API

### StorageManager

```typescript
interface StorageManager {
  getStorage(scope: StorageScope, options?: StorageOptions): Storage;
  onDidChangeStorage(listener: (event: StorageEvent) => void): void;
}
```

### Storage

```typescript
interface Storage {
  get<T = any>(key: string, defaultValue?: T): T | undefined;
  set<T = any>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): string[];
  has(key: string): boolean;
}
```

### StorageScope

```typescript
enum StorageScope {
  Global = 'global',
  Workspace = 'workspace',
  Plugin = 'plugin',
}
```

## 窗口 API

### WindowAPI

```typescript
interface WindowAPI {
  showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
  showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;
  showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
  showInputBox(options?: InputBoxOptions): Promise<string | undefined>;
  showQuickPick(items: string[], options?: QuickPickOptions): Promise<string | undefined>;
}
```

## 工作区 API

### WorkspaceAPI

```typescript
interface WorkspaceAPI {
  getRootPath(): string | undefined;
  getConfiguration<T = any>(section?: string): T;
  updateConfiguration(section: string, value: any): Promise<void>;
}
```

## 文件系统 API

### FileSystemAPI

```typescript
interface FileSystemAPI {
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, content: Buffer | string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  readDirectory(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}
```

## 网络 API

### HttpAPI

```typescript
interface HttpAPI {
  get<T = any>(url: string, options?: RequestOptions): Promise<T>;
  post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T>;
  put<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T>;
  delete<T = any>(url: string, options?: RequestOptions): Promise<T>;
}
```

### RequestOptions

```typescript
interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}
```

## 完整的 PluginAPI

```typescript
interface PluginAPI {
  readonly context: PluginContext;
  readonly events: EventEmitter;
  readonly commands: CommandRegistry;
  readonly ui: UIRegistry;
  readonly storage: StorageManager;
  readonly workspace: WorkspaceAPI;
  readonly window: WindowAPI;
  readonly fs: FileSystemAPI;
  readonly http: HttpAPI;
}
```

## 插件生命周期函数

### activate

```typescript
export async function activate(
  context: PluginContext,
  api: PluginAPI
): Promise<void> {
  // 插件激活逻辑
}
```

### deactivate

```typescript
export async function deactivate(): Promise<void> {
  // 插件停用逻辑
}
```

## 使用示例

完整示例请参考 [插件开发指南](./PLUGIN_DEVELOPMENT_GUIDE.md)

