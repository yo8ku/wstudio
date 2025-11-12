# 插件系统架构文档

## 概述

插件系统是一个模块化、可扩展的架构，允许第三方开发者通过插件扩展应用功能。

## 架构图

```
┌─────────────────────────────────────────────────┐
│              应用核心 (App Core)                 │
│  - 初始化和协调各个系统                           │
│  - 提供统一的访问入口                             │
├─────────────────────────────────────────────────┤
│         插件管理器 (Plugin Manager)               │
│  - 插件生命周期管理                               │
│  - 插件加载、激活、停用                           │
│  - 插件依赖解析                                   │
├──────────┬──────────┬──────────┬────────────────┤
│  事件系统 │  命令系统  │  UI系统  │  存储系统       │
│  - 发布订 │  - 命令注 │  - UI组  │  - 数据持久     │
│    阅模式 │    册执行 │    件管理│    化           │
│  - 事件优 │  - 快捷键 │  - 菜单  │  - 分层存储     │
│    先级   │    绑定   │    管理  │    (全局/工作区)│
├──────────┴──────────┴──────────┴────────────────┤
│              API 层 (Plugin API)                │
│  - 为插件提供统一的API接口                        │
│  - 封装系统能力                                   │
│  - 提供workspace、window、fs、http等API          │
├─────────────────────────────────────────────────┤
│          插件沙箱 (Plugin Sandbox)               │
│  - 隔离插件执行环境                               │
│  - 权限控制和安全管理                             │
│  - 资源限制(内存、超时)                           │
└─────────────────────────────────────────────────┘
```

## 核心模块

### 1. AppCore (应用核心)

**职责**：
- 初始化和协调所有子系统
- 提供统一的系统访问入口
- 管理应用生命周期

**主要方法**：
- `initialize()`: 初始化应用核心
- `getPluginManager()`: 获取插件管理器
- `getEventSystem()`: 获取事件系统
- `getCommandSystem()`: 获取命令系统
- `getUISystem()`: 获取UI系统
- `getStorageSystem()`: 获取存储系统
- `dispose()`: 销毁应用核心

### 2. PluginManager (插件管理器)

**职责**：
- 管理插件的完整生命周期
- 处理插件的加载、激活、停用、卸载
- 解析和管理插件依赖关系
- 维护插件状态

**主要方法**：
- `load(pluginPath)`: 加载插件
- `unload(pluginId)`: 卸载插件
- `reload(pluginId)`: 重新加载插件
- `activate(pluginId)`: 激活插件
- `deactivate(pluginId)`: 停用插件
- `getPlugin(pluginId)`: 获取插件实例
- `getAllPlugins()`: 获取所有插件
- `getPluginsByState(state)`: 按状态获取插件

**插件状态流转**：
```
Unloaded → Loading → Loaded → Activating → Activated
                                    ↓
                              Deactivating → Deactivated
                                    ↓
                                  Error
```

### 3. EventSystem (事件系统)

**职责**：
- 提供发布-订阅机制
- 支持事件优先级
- 管理事件监听器

**主要方法**：
- `on(event, listener)`: 订阅事件
- `once(event, listener)`: 单次订阅事件
- `emit(event, data)`: 发射事件
- `off(event, listener)`: 取消订阅
- `removeAllListeners(event)`: 移除所有监听器

**系统事件**：
- `plugin:loaded`: 插件加载完成
- `plugin:activated`: 插件激活完成
- `plugin:deactivated`: 插件停用完成
- `plugin:error`: 插件错误
- `app:ready`: 应用就绪
- `app:close`: 应用关闭

### 4. CommandSystem (命令系统)

**职责**：
- 管理命令的注册和执行
- 支持快捷键绑定
- 提供命令分类和搜索

**主要方法**：
- `registerCommand(command)`: 注册命令
- `unregisterCommand(commandId)`: 取消注册命令
- `executeCommand(commandId, ...args)`: 执行命令
- `getCommands()`: 获取所有命令
- `getCommand(commandId)`: 获取特定命令

### 5. UISystem (UI系统)

**职责**：
- 管理UI组件的注册和渲染
- 提供菜单、状态栏、通知等UI能力
- 支持自定义Webview

**主要方法**：
- `registerComponent(component)`: 注册UI组件
- `unregisterComponent(componentId)`: 取消注册UI组件
- `registerMenuItem(menuId, item)`: 注册菜单项
- `registerStatusBarItem(item)`: 注册状态栏项
- `showNotification(notification)`: 显示通知

### 6. StorageSystem (存储系统)

**职责**：
- 提供数据持久化能力
- 支持分层存储(全局/工作区/插件)
- 监听存储变化

**主要方法**：
- `getStorage(scope, options)`: 获取存储实例
- `onDidChangeStorage(listener)`: 监听存储变化

**存储范围**：
- `Global`: 全局存储，跨所有工作区
- `Workspace`: 工作区存储，特定于当前工作区
- `Plugin`: 插件存储，特定于插件

### 7. PluginAPI (插件API)

**职责**：
- 为插件提供统一的API接口
- 封装系统能力，简化插件开发
- 提供类型安全的API

**主要API**：
- `context`: 插件上下文
- `events`: 事件系统API
- `commands`: 命令系统API
- `ui`: UI系统API
- `storage`: 存储系统API
- `workspace`: 工作区API
- `window`: 窗口API
- `fs`: 文件系统API
- `http`: 网络API

### 8. PluginSandbox (插件沙箱)

**职责**：
- 为插件提供隔离的执行环境
- 控制插件权限
- 限制资源使用(内存、超时)

**主要方法**：
- `execute(plugin, fn)`: 在沙箱中执行插件代码
- `validatePermissions(plugin, action)`: 验证插件权限
- `dispose()`: 销毁沙箱

### 9. SecurityManager (安全管理器)

**职责**：
- 管理插件安全策略
- 控制模块和API访问权限
- 验证插件权限

**主要方法**：
- `setPolicy(pluginId, policy)`: 设置安全策略
- `getPolicy(pluginId)`: 获取安全策略
- `validateModuleAccess(pluginId, moduleName)`: 验证模块访问
- `validateAPIAccess(pluginId, apiName)`: 验证API访问
- `validatePermissions(plugin, permissions)`: 验证权限

## 插件开发流程

### 1. 创建插件项目

```bash
mkdir my-plugin
cd my-plugin
npm init -y
```

### 2. 定义插件元数据 (package.json)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "pluginMetadata": {
    "id": "my-plugin",
    "name": "My Plugin",
    "version": "1.0.0",
    "description": "My awesome plugin",
    "category": "tools"
  }
}
```

### 3. 实现插件逻辑

```typescript
import { PluginAPI, PluginContext } from '@note-studio/plugin-system';

export async function activate(context: PluginContext, api: PluginAPI) {
  // 注册命令
  api.commands.registerCommand({
    id: 'my-plugin.hello',
    title: 'Say Hello',
    handler: () => {
      api.window.showInformationMessage('Hello!');
    }
  });

  // 监听事件
  api.events.on('app:ready', () => {
    console.log('App ready!');
  });
}

export async function deactivate() {
  // 清理资源
}
```

### 4. 测试插件

将插件复制到插件目录，应用会自动加载。

## 扩展点

插件可以通过以下扩展点扩展应用功能：

1. **命令 (Commands)**: 注册自定义命令
2. **菜单 (Menus)**: 添加菜单项
3. **状态栏 (Status Bar)**: 添加状态栏项
4. **侧边栏 (Sidebar)**: 添加自定义侧边栏面板
5. **事件 (Events)**: 监听和发射事件
6. **配置 (Configuration)**: 读写配置
7. **存储 (Storage)**: 持久化数据
8. **UI组件 (UI Components)**: 注册自定义UI组件

## 安全性

### 权限系统

插件需要声明所需的权限：

```json
{
  "permissions": {
    "filesystem": true,
    "network": true,
    "command": false,
    "ui": true
  }
}
```

### 沙箱隔离

- 插件在独立的上下文中执行
- 限制对系统API的访问
- 资源限制(内存、CPU、超时)

### 安全策略

- 模块白名单/黑名单
- API访问控制
- 代码审查机制

## 性能优化

1. **延迟加载**: 插件按需加载和激活
2. **并行加载**: 支持并行加载多个插件
3. **缓存机制**: 缓存插件元数据和配置
4. **资源限制**: 限制插件资源使用

## 未来规划

- [ ] 插件市场集成
- [ ] 热更新支持
- [ ] 插件间通信机制
- [ ] 更细粒度的权限控制
- [ ] 插件性能监控
- [ ] 插件测试框架

