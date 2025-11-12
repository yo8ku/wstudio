# AI服务商配置说明

本文档说明各个AI服务商的API端点配置和使用方法。

## 支持的服务商

### 1. OpenAI
- **API端点**: `https://api.openai.com/v1/chat/completions`
- **认证方式**: Bearer Token
- **模型端点**: 自动转换为 `/v1/models`

### 2. Anthropic (Claude)
- **API端点**: `https://api.anthropic.com/v1/messages`
- **认证方式**: x-api-key Header
- **特殊说明**: 使用专用的AnthropicProvider

### 3. Google Gemini
- **API端点**: `https://generativelanguage.googleapis.com/`
- **认证方式**: API Key参数
- **特殊说明**: 使用专用的GeminiProvider

### 4. DeepSeek
- **API端点**: `https://api.deepseek.com/v1/chat/completions`
- **认证方式**: Bearer Token
- **特殊说明**: 使用专用的DeepSeekProvider

### 5. Groq
- **API端点**: `https://api.groq.com/openai/v1/chat/completions`
- **认证方式**: Bearer Token
- **特殊说明**: 使用专用的GroqProvider

### 6. xAI (Grok)
- **API端点**: `https://api.x.ai/v1/chat/completions`
- **认证方式**: Bearer Token
- **使用**: CustomProvider（OpenAI兼容）

### 7. Kimi (月之暗面)
- **API端点**: `https://api.moonshot.cn/v1/chat/completions`
- **认证方式**: Bearer Token
- **使用**: CustomProvider（OpenAI兼容）

### 8. GLM (智谱AI)
- **API端点**: `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- **认证方式**: Bearer Token
- **使用**: CustomProvider（OpenAI兼容）

### 9. OpenRouter
- **API端点**: `https://openrouter.ai/api/v1/chat/completions`
- **认证方式**: Bearer Token
- **模型端点**: `https://openrouter.ai/api/v1/models`
- **使用**: CustomProvider（OpenAI兼容）

### 10. Ollama (本地)
- **API端点**: `http://localhost:11434/v1/chat/completions`
- **认证方式**: 无需认证
- **模型端点**: `http://localhost:11434/api/tags`
- **使用**: CustomProvider
- **特殊说明**: Ollama使用不同的API响应格式 `{ models: [...] }`

### 11. Azure OpenAI
- **API端点**: 需要自定义（包含deployment）
- **认证方式**: api-key Header
- **模型端点**: 自动构建
- **使用**: CustomProvider
- **特殊说明**: 需要配置完整的Azure端点URL

### 12. 魔塔社区 (ModelScope)
- **API端点**: 需要用户提供
- **认证方式**: Bearer Token
- **使用**: CustomProvider（OpenAI兼容）

### 13. 硅基流动 (SiliconFlow)
- **API端点**: 需要用户提供
- **认证方式**: Bearer Token
- **使用**: CustomProvider（OpenAI兼容）

### 14. PH8
- **API端点**: 需要用户提供
- **认证方式**: Bearer Token
- **使用**: CustomProvider（OpenAI兼容）

### 15. 302.AI
- **API端点**: 需要用户提供
- **认证方式**: Bearer Token
- **使用**: CustomProvider（OpenAI兼容）

### 16. 蓝耘 (LanYun)
- **API端点**: 需要用户提供
- **认证方式**: Bearer Token
- **使用**: CustomProvider（OpenAI兼容）

### 17. Lm Studio (本地)
- **API端点**: `http://localhost:1234/v1/chat/completions`
- **认证方式**: 无需认证
- **模型端点**: `http://localhost:1234/v1/models`
- **使用**: CustomProvider（OpenAI兼容）

### 18. 火山方舟 (VolcEngine)
- **API端点**: 需要用户提供
- **认证方式**: Bearer Token
- **使用**: CustomProvider（OpenAI兼容）

### 19. 自定义 (Custom)
- **API端点**: 用户自定义
- **认证方式**: Bearer Token（默认）
- **使用**: CustomProvider
- **特殊说明**: 支持所有OpenAI兼容的API

## CustomProvider 功能

CustomProvider 提供了通用的 OpenAI 兼容 API 实现，支持：

1. **自动端点检测**: 根据提供商ID或端点URL自动构建模型列表端点
2. **多种响应格式**: 
   - 标准OpenAI格式: `{ data: [...] }`
   - Ollama格式: `{ models: [...] }`
   - 直接数组格式: `[...]`
3. **灵活的认证方式**:
   - Bearer Token (默认)
   - api-key Header (Azure)
   - 无认证 (本地服务)
4. **自动模型能力检测**: 基于模型ID智能检测支持的功能
5. **模型缓存**: 支持内存和数据库双层缓存，提高性能

## 使用方法

### 基本使用

```typescript
import { aiService } from '@/services/ai';

// 配置服务商
const config = {
  id: 'custom-config-1',
  name: '我的配置',
  apiKey: 'your-api-key',
  apiEndpoint: 'https://api.example.com/v1/chat/completions'
};

// 设置提供商
await aiService.setProvider('custom', config);

// 测试连接
const isConnected = await aiService.testConnection();

// 获取模型列表
const models = await aiService.getAvailableModels();

// 生成文本
const response = await aiService.generateText({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### 流式生成

```typescript
await aiService.generateTextStream(
  {
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'Hello!' }]
  },
  {
    onContent: (content) => console.log(content),
    onComplete: (response) => console.log('Done:', response),
    onError: (error) => console.error('Error:', error)
  }
);
```

## 技术实现

### 端点转换

CustomProvider 自动将聊天端点转换为模型列表端点：

- `/chat/completions` → `/models`
- `/v1/chat/completions` → `/v1/models`

特殊处理：
- Ollama: `/v1/chat/completions` → `/api/tags`
- Azure: 构建特定的Azure模型端点
- OpenRouter: 使用固定的 `https://openrouter.ai/api/v1/models`

### 认证头生成

根据服务商类型自动选择合适的认证方式：

```typescript
// 标准Bearer Token
headers['Authorization'] = `Bearer ${apiKey}`;

// Azure
headers['api-key'] = apiKey;

// 本地服务（Ollama, Lm Studio）
// 不添加认证头
```

### 响应格式适配

支持多种API响应格式，自动识别并解析：

```typescript
// OpenAI标准格式
{ data: [{ id: "model-1", ... }] }

// Ollama格式
{ models: [{ name: "model-1", ... }] }

// 直接数组
[{ id: "model-1", ... }]
```

## 扩展新服务商

要添加新的服务商：

1. 在 `services/ai/index.ts` 的 `AI_PROVIDERS` 对象中添加配置
2. 在 `services/ai/AIProviderFactory.ts` 的 `PROVIDER_INFO` 中添加信息
3. 在 `createProvider` 方法的 switch case 中添加路由
4. 如果需要特殊处理，在 `CustomProvider` 中添加对应逻辑

## 注意事项

1. **API Key 安全**: API Key存储在本地数据库中，不会上传到服务器
2. **端点验证**: 测试连接会验证端点的可访问性和API Key的有效性
3. **模型缓存**: 首次连接成功后，模型列表会缓存到SQLite数据库
4. **错误处理**: 所有API错误都会提取并显示服务商返回的原始错误消息
5. **本地服务**: Ollama和Lm Studio等本地服务不需要API Key



