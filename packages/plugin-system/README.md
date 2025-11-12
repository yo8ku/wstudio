# Plugin System

插件系统核心包，提供完整的插件管理、事件、命令、UI和存储能力。

## 架构概览

```
┌─────────────────────────────────────────────────┐
│              应用核心 (App Core)                 │
├─────────────────────────────────────────────────┤
│         插件管理器 (Plugin Manager)               │
├──────────┬──────────┬──────────┬────────────────┤
│  事件系统 │  命令系统  │  UI系统  │  存储系统       │
├──────────┴──────────┴──────────┴────────────────┤
│              API 层 (Plugin API)                │
├─────────────────────────────────────────────────┤
│          插件沙箱 (Plugin Sandbox)               │
└─────────────────────────────────────────────────┘
```

## 目录结构

```
src/
├── core/                  # 核心层
│   ├── PluginManager.ts   # 插件管理器
│   └── AppCore.ts         # 应用核心
├── systems/               # 系统层
│   ├── EventSystem.ts     # 事件系统
│   ├── CommandSystem.ts   # 命令系统
│   ├── UISystem.ts        # UI系统
│   └── StorageSystem.ts   # 存储系统
├── api/                   # API层
│   ├── PluginAPI.ts       # 插件API
│   └── APIProvider.ts     # API提供者
├── sandbox/               # 沙箱层
│   ├── PluginSandbox.ts   # 插件沙箱
│   └── SecurityManager.ts # 安全管理器
├── types/                 # 类型定义
│   ├── plugin.ts          # 插件类型
│   ├── event.ts           # 事件类型
│   ├── command.ts         # 命令类型
│   ├── ui.ts              # UI类型
│   └── storage.ts         # 存储类型
└── index.ts               # 主入口
```

## 使用说明

详细使用文档将在后续完善。

