# 内置AI服务 (Builtin AI Service)

##  核心概念

**内置AI服务**是应用提供的独立AI功能，与用户的AI配置**完全分离**：

### 内置AI服务 vs 用户AI配置

| 特性 | 内置AI服务 | 用户AI配置 |
|------|-----------|-----------|
| **API Key** | 开发者提供的固定Key | 用户自行配置 |
| **配置位置** | 代码/环境变量 | settings.json / localStorage |
| **使用场景** | 内联聊天（Ctrl+K） | 侧边栏聊天、其他功能 |
| **模型来源** | 从真实API自动获取 | 用户手动配置 |
| **依赖用户配置** |  完全独立 |  需要用户配置 |

## 📁 架构设计

```
┌─────────────────────────────────────────────────────┐
│                   应用启动                            │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│         主进程 (Main Process)                        │
│  ┌───────────────────────────────────────────────┐  │
│  │  BuiltinAI.initialize()                       │  │
│  │  - 使用开发者提供的API Key                      │  │
│  │  - 从OpenAI API获取真实模型列表                │  │
│  │  - 存储到内存: availableModels[]              │  │
│  └───────────────────────────────────────────────┘  │
│                      ↓                               │
│  ┌───────────────────────────────────────────────┐  │
│  │  IPC Handlers                                 │  │
│  │  - builtin-ai:get-models                      │  │
│  │  - builtin-ai:refresh-models                  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                        │
                        │ IPC
                        ▼
┌─────────────────────────────────────────────────────┐
│         渲染进程 (Renderer Process)                  │
│  ┌───────────────────────────────────────────────┐  │
│  │  MonacoEditor.tsx                             │  │
│  │  - useEffect: 获取模型列表                     │  │
│  │  - window.electronAPI.builtinAI.getModels()   │  │
│  │  - 传递给 AIZoneWidget                        │  │
│  └───────────────────────────────────────────────┘  │
│                      ↓                               │
│  ┌───────────────────────────────────────────────┐  │
│  │  AIZoneWidget                                 │  │
│  │  - 显示模型下拉框                              │  │
│  │  - 按配置名称分组显示                          │  │
│  │  - 用户选择模型发起聊天                        │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 🔧 实现细节

### 1. 主进程服务 (`BuiltinAI.ts`)

```typescript
export class BuiltinAI {
  // 内置提供商配置（开发者提供）
  private readonly builtinProviders: AIProviderConfig[] = [
    {
      name: 'OpenAI',
      apiKey: process.env.BUILTIN_OPENAI_KEY || 'sk-your-key',
      baseURL: 'https://api.openai.com/v1',
      modelsEndpoint: '/models',
    }
  ];

  async initialize() {
    // 从真实API获取模型列表
    await this.fetchModelsFromProviders();
  }

  private async fetchModelsFromProvider(provider) {
    const response = await fetch(`${provider.baseURL}/models`, {
      headers: { 'Authorization': `Bearer ${provider.apiKey}` }
    });
    // 返回: ['OpenAI:gpt-4o', 'OpenAI:gpt-4o-mini', ...]
  }
}
```

**特点：**
-  使用固定的开发者API Key
-  启动时自动从真实API获取模型
-  不依赖settings.json或localStorage
-  与用户配置完全隔离

### 2. IPC通信 (`preload.js`)

```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  builtinAI: {
    getModels: () => ipcRenderer.invoke('builtin-ai:get-models'),
    refreshModels: () => ipcRenderer.invoke('builtin-ai:refresh-models')
  }
});
```

### 3. 渲染进程使用 (`MonacoEditor.tsx`)

```typescript
useEffect(() => {
  const loadModels = async () => {
    // 从内置AI服务获取模型（不读取localStorage或settings.json）
    const models = await window.electronAPI.builtinAI.getModels();
    setAvailableModels(models);
  };
  loadModels();
}, []);
```

### 4. 模型格式

模型以 `配置名:模型名` 格式存储：

```javascript
[
  'OpenAI:gpt-4o',
  'OpenAI:gpt-4o-mini',
  'OpenAI:gpt-4-turbo',
  // 如果添加了Anthropic:
  // 'Anthropic:claude-3.5-sonnet',
  // 'Anthropic:claude-3-opus'
]
```

在UI中会按配置名分组显示：

```
OpenAI
  ├─ gpt-4o
  ├─ gpt-4o-mini
  └─ gpt-4-turbo
```

##  使用流程

### 开发者设置API Key

1. **方式1：环境变量（推荐）**
   ```bash
   # .env 或系统环境变量
   BUILTIN_OPENAI_KEY=sk-your-openai-key
   ```

2. **方式2：直接在代码中**
   ```typescript
   // packages/main/src/services/BuiltinAI.ts
   apiKey: 'sk-your-openai-key'
   ```

### 应用启动流程

1. **主进程启动** (`electron.js`)
   ```javascript
   const { builtinAI } = require('./packages/main/dist/src/index.js');
   await initializeExtensions(); // 会调用 builtinAI.initialize()
   ```

2. **BuiltinAI初始化**
   - 从API获取模型列表
   - 存储到内存中

3. **用户打开内联聊天**
   - 按 `Ctrl + K`
   - MonacoEditor 请求模型列表
   - AIZoneWidget 显示分组下拉框

4. **用户选择模型并发起聊天**
   - 选择 "OpenAI:gpt-4o"
   - 发送消息
   - 使用开发者提供的API Key调用OpenAI

##  调试日志

启动应用后，在控制台查看：

```
[BuiltinAI]  初始化内置AI服务...
[BuiltinAI] 📡 开始从 1 个提供商获取模型...
[BuiltinAI]  正在从 OpenAI 获取模型列表...
[BuiltinAI]  从 OpenAI 获取到 3 个模型: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
[BuiltinAI] 📊 所有可用模型: ['OpenAI:gpt-4o', 'OpenAI:gpt-4o-mini', 'OpenAI:gpt-4-turbo']
[BuiltinAI]  初始化完成，共获取 3 个模型
[Main] 内置AI服务已初始化

// 用户打开内联聊天
[MonacoEditor]  开始从内置AI服务加载模型列表...
[MonacoEditor]  从内置AI服务获取到 3 个模型
[AIZoneWidget] 初始化模型下拉框，可用模型: 3
```

## ⚙️ 添加更多提供商

在 `BuiltinAI.ts` 中添加：

```typescript
private readonly builtinProviders: AIProviderConfig[] = [
  {
    name: 'OpenAI',
    apiKey: process.env.BUILTIN_OPENAI_KEY || 'sk-...',
    baseURL: 'https://api.openai.com/v1',
    modelsEndpoint: '/models',
  },
  {
    name: 'Anthropic',
    apiKey: process.env.BUILTIN_ANTHROPIC_KEY || 'sk-...',
    baseURL: 'https://api.anthropic.com/v1',
    modelsEndpoint: '/models',
  },
  // 添加更多...
];
```

##  注意事项

1. **API Key安全性**
   - 使用环境变量存储
   - 不要提交到Git仓库
   - 考虑使用加密存储

2. **错误处理**
   - 如果API请求失败，模型列表为空
   - 应用仍然可以正常启动
   - 用户可以手动刷新模型列表

3. **与用户配置分离**
   - 内置AI服务**永远不读取**settings.json
   - 内置AI服务**永远不读取**localStorage的ai-model-configs
   - 两者是完全独立的系统

4. **刷新模型列表**
   ```typescript
   // 渲染进程中调用
   await window.electronAPI.builtinAI.refreshModels();
   ```

## 📊 数据流对比

###  错误的方式（旧实现）
```
localStorage (ai-model-configs)
    ↓
MonacoEditor 读取用户配置
    ↓
提取模型列表
    ↓
同步到主进程
```
**问题**: 依赖用户配置，没有配置就无法使用

###  正确的方式（新实现）
```
开发者API Key (环境变量/代码)
    ↓
主进程启动时从真实API获取模型
    ↓
存储到内存
    ↓
渲染进程通过IPC获取
```
**优点**: 完全独立，无需用户配置

## 🎉 总结

- **内置AI服务**：开箱即用，无需用户配置
- **用户AI配置**：用于其他功能，完全独立
- **两者隔离**：互不干扰，各司其职


