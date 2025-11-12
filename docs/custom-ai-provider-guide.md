# 自定义 AI 服务商功能指南

## 概述

自定义 AI 服务商功能允许您添加和使用任何兼容 OpenAI API 格式的 AI 服务提供商，包括但不限于：
- xAI Grok
- Kimi (月之暗面)
- GLM (智谱AI)
- OpenRouter
- Ollama (本地运行)
- Azure OpenAI
- 以及任何其他自定义的 OpenAI 兼容服务

## 支持的提供商

系统已内置支持以下提供商：

### 1. **OpenAI**
- 官方 API: `https://api.openai.com/v1/chat/completions`
- 支持模型: GPT-4、GPT-4 Turbo、GPT-3.5 等

### 2. **Anthropic Claude**
- 官方 API: `https://api.anthropic.com/v1/messages`
- 支持模型: Claude 3 系列（Opus、Sonnet、Haiku）

### 3. **Google Gemini**
- 官方 API: `https://generativelanguage.googleapis.com/`
- 支持模型: Gemini 2.0、Gemini 1.5 系列等

### 4. **DeepSeek**
- 官方 API: `https://api.deepseek.com/v1/chat/completions`
- 支持模型: DeepSeek V3、DeepSeek Coder 等

### 5. **Groq**
- 官方 API: `https://api.groq.com/openai/v1/chat/completions`
- 支持模型: Llama 3、Mixtral、Gemma 等

### 6. **xAI Grok**
- 官方 API: `https://api.x.ai/v1/chat/completions`
- 支持模型: Grok Beta、Grok Vision Beta

### 7. **Kimi (月之暗面)**
- 官方 API: `https://api.moonshot.cn/v1/chat/completions`
- 支持模型: Moonshot v1 (8K/32K/128K)

### 8. **GLM (智谱AI)**
- 官方 API: `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- 支持模型: GLM-4、GLM-4V、GLM-3 Turbo

### 9. **OpenRouter**
- 官方 API: `https://openrouter.ai/api/v1/chat/completions`
- 支持模型: 聚合了多个提供商的数百个模型

### 10. **Ollama (本地)**
- 本地 API: `http://localhost:11434/v1/chat/completions`
- 支持模型: Llama、Mistral、Qwen 等本地运行的模型

### 11. **Azure OpenAI**
- Azure API: `https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT/chat/completions?api-version=2024-02-15-preview`
- 支持模型: Azure 部署的 GPT 系列模型

### 12. **自定义**
- 任何兼容 OpenAI API 格式的服务

## 使用方法

### 步骤 1：打开 AI 模型配置

1. 点击活动栏中的 **AI 模型** 图标
2. 点击顶部的 **+** 按钮添加新配置
3. 或者点击现有配置进行编辑

### 步骤 2：选择提供商

在"AI 提供商"下拉列表中选择您要使用的提供商：
- 预设提供商：系统会自动填充 API 端点
- 自定义：需要手动填写 API 端点

### 步骤 3：填写配置信息

#### 基本配置
- **配置名称**: 为配置命名，例如"我的 Grok 配置"
- **AI 提供商**: 选择提供商类型
- **API 地址**: 提供商的 API 端点 URL
- **API 密钥**: 您的 API Key

#### 高级设置（可选）
- **温度 (Temperature)**: 0-2，控制输出随机性
- **最大令牌数 (Max Tokens)**: 限制输出长度

### 步骤 4：测试连接

1. 点击"测试连接"按钮
2. 系统会验证配置是否正确
3. 测试成功后会自动获取可用模型列表

### 步骤 5：选择模型

从获取到的模型列表中选择要使用的模型：
- 可以使用搜索框快速查找模型
- 模型按提供商分组显示
- 支持多选（Shift/Ctrl 点击）

### 步骤 6：保存配置

点击"保存配置"按钮保存您的设置。配置会自动存储到本地数据库。

## 配置示例

### xAI Grok 配置

```json
{
  "name": "我的 Grok 配置",
  "providerId": "xai",
  "apiKey": "xai-xxxxxxxxxxxxxxxx",
  "apiEndpoint": "https://api.x.ai/v1/chat/completions",
  "temperature": 0.7,
  "maxTokens": 4000
}
```

### Kimi 配置

```json
{
  "name": "Kimi 配置",
  "providerId": "kimi",
  "apiKey": "sk-xxxxxxxxxxxxxxxx",
  "apiEndpoint": "https://api.moonshot.cn/v1/chat/completions",
  "temperature": 0.7,
  "maxTokens": 8000
}
```

### GLM (智谱AI) 配置

```json
{
  "name": "智谱AI 配置",
  "providerId": "glm",
  "apiKey": "xxxxxxxxxxxxxxxx.xxxxxxxx",
  "apiEndpoint": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  "temperature": 0.7,
  "maxTokens": 4000
}
```

### OpenRouter 配置

```json
{
  "name": "OpenRouter 配置",
  "providerId": "openrouter",
  "apiKey": "sk-or-xxxxxxxxxxxxxxxx",
  "apiEndpoint": "https://openrouter.ai/api/v1/chat/completions",
  "temperature": 0.7,
  "maxTokens": 4000
}
```

### Ollama 本地配置

```json
{
  "name": "本地 Ollama",
  "providerId": "ollama",
  "apiKey": "not-needed",
  "apiEndpoint": "http://localhost:11434/v1/chat/completions",
  "temperature": 0.7,
  "maxTokens": 4000
}
```

**注意**: Ollama 本地运行不需要 API Key，可以填写任意值。

### Azure OpenAI 配置

```json
{
  "name": "Azure GPT-4",
  "providerId": "azure",
  "apiKey": "your-azure-api-key",
  "apiEndpoint": "https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2024-02-15-preview",
  "temperature": 0.7,
  "maxTokens": 4000
}
```

**注意**: 需要替换 `your-resource` 和 `your-deployment` 为您的实际资源名称。

### 完全自定义的提供商

```json
{
  "name": "我的自定义 API",
  "providerId": "custom",
  "apiKey": "your-custom-api-key",
  "apiEndpoint": "https://your-custom-api.com/v1/chat/completions",
  "temperature": 0.7,
  "maxTokens": 4000
}
```

## 功能特性

### 1. 自动获取模型列表
系统会自动从提供商 API 获取真实的模型列表，无需手动配置。

### 2. 模型缓存
获取到的模型列表会缓存到本地数据库，下次使用时可快速加载。

### 3. 多配置管理
支持创建和管理多个配置，方便在不同的 AI 服务商之间切换。

### 4. 配置隔离
每个配置的数据完全隔离，互不影响。

### 5. 安全存储
所有配置数据（包括 API Key）都安全存储在本地 SQLite 数据库中。

### 6. 模型能力检测
系统会自动检测模型的能力（文本生成、代码生成、视觉、工具调用等）。

## 技术细节

### 数据存储
- **存储方式**: SQLite 数据库
- **存储位置**: 
  - Windows: `C:\Users\Username\AppData\Roaming\note-studio\ai-models.db`
  - macOS: `/Users/username/Library/Application Support/note-studio/ai-models.db`
- **数据结构**: 配置表 + 模型表，支持关联查询

### API 兼容性
所有自定义提供商必须兼容 OpenAI API 格式：

#### 模型列表端点
```
GET /v1/models
Authorization: Bearer {API_KEY}
```

响应格式：
```json
{
  "data": [
    { "id": "model-name-1" },
    { "id": "model-name-2" }
  ]
}
```

#### 聊天完成端点
```
POST /v1/chat/completions
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "model": "model-name",
  "messages": [...],
  "temperature": 0.7,
  "max_tokens": 2000,
  "stream": true/false
}
```

### 特殊处理

#### Azure OpenAI
- 使用 `api-key` 头而不是 `Authorization: Bearer`
- 模型端点需要包含 API 版本参数
- 模型列表端点: `/openai/models?api-version=2024-02-15-preview`

#### Ollama
- 不需要 API 认证
- 模型列表端点: `/api/tags`
- 返回格式与标准 OpenAI 格式不同，需要特殊转换

#### OpenRouter
- 聚合了多个提供商的模型
- 需要在请求头中添加额外的元数据（可选）

## 常见问题

### Q: 如何获取 API Key？
A: 访问各提供商的官方网站：
- xAI: https://x.ai/
- Kimi: https://platform.moonshot.cn/
- GLM: https://open.bigmodel.cn/
- OpenRouter: https://openrouter.ai/
- 等等

### Q: 测试连接失败怎么办？
A: 检查以下几点：
1. API Key 是否正确
2. API 端点 URL 是否正确
3. 网络连接是否正常
4. 提供商服务是否可用
5. 是否需要配置代理

### Q: 如何使用本地模型（Ollama）？
A: 
1. 确保 Ollama 服务已启动（`ollama serve`）
2. 选择"Ollama"提供商
3. API 地址使用默认的 `http://localhost:11434/v1/chat/completions`
4. API Key 可以填写任意值

### Q: 可以同时使用多个配置吗？
A: 可以创建多个配置，但每次只能激活使用一个配置。

### Q: 配置数据存储在哪里？
A: 所有配置都存储在本地 SQLite 数据库中，不会上传到任何服务器。

### Q: 如何备份配置？
A: 可以直接复制数据库文件 `ai-models.db` 进行备份。

### Q: 支持哪些模型能力？
A: 系统自动检测以下能力：
- 文本生成
- 代码生成
- 推理
- 视觉理解
- 工具调用
- 函数调用
- 网络搜索
- 流式输出
- 嵌入
- 内容审核

## 安全建议

1. **保护 API Key**: 不要在公共场所展示或分享您的 API Key
2. **定期轮换**: 建议定期更换 API Key
3. **监控使用量**: 定期检查 API 使用量和费用
4. **备份配置**: 定期备份配置数据
5. **网络安全**: 在不受信任的网络环境中使用时要格外小心

## 更新日志

### v1.0.0 (2025-01-04)
- ✅ 实现自定义提供商支持
- ✅ 支持 xAI、Kimi、GLM、OpenRouter、Ollama、Azure
- ✅ 自动从 API 获取模型列表
- ✅ SQLite 数据库存储
- ✅ 模型能力自动检测
- ✅ 连接测试功能

## 技术支持

如有问题或建议，请访问：
- GitHub: https://github.com/yo8ku/WiseAI-Note-Studio
- 提交 Issue: https://github.com/yo8ku/WiseAI-Note-Studio/issues














