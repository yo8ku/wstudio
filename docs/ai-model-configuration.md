# AI 模型配置功能

## 概述

AI 模型配置功能允许用户在活动栏中配置和管理多个 AI 模型的 API 设置，包括 API 密钥、API 地址、模型参数等。

## 使用方法

### 1. 打开 AI 模型配置

有多种方式可以打开 AI 模型配置：

**方式一：通过活动栏**
1. 点击活动栏中的 **AI 模型** 图标（灯泡图标）
2. 侧边栏将显示 AI 模型配置面板
3. 点击任意配置卡片即可在编辑器中打开

**方式二：通过模型选择器**
1. 在任何使用模型选择器的地方（如 AI 聊天面板）
2. 点击模型选择器打开下拉列表
3. 点击底部的 **"管理配置"** 按钮
4. 如果只有一个配置，会直接打开该配置
5. 如果有多个配置，会显示命令中心让您选择要打开的配置

**方式三：通过命令中心**
1. 按 `F1` 或 `Ctrl+Shift+P` 打开命令中心
2. 输入 `@ai` 切换到 AI 配置模式
3. 选择要打开的配置

### 2. 配置 AI 模型

#### 基本配置

- **配置名称**: 为您的配置命名，方便识别
- **API 地址**: 完整的 API 端点 URL
- **API 密钥**: 您的 API 密钥（将安全存储在本地）
- **模型名称**: 要使用的模型名称（如 `gpt-4`, `claude-3-opus`）

#### 高级设置

- **温度 (Temperature)**: 控制输出的随机性
  - 0: 最确定性，输出更一致
  - 2: 最随机，输出更有创意
  - 默认: 0.7

- **最大令牌数 (Max Tokens)**: 限制模型输出的最大长度
  - 范围: 1 - 128000
  - 默认: 2000

### 3. 预设提供商

系统内置了以下 AI 服务提供商的预设配置：

#### OpenAI
```
API 地址: https://api.openai.com/v1/chat/completions
可用模型: gpt-4, gpt-4-turbo, gpt-3.5-turbo
```

#### Anthropic Claude
```
API 地址: https://api.anthropic.com/v1/messages
可用模型: claude-3-opus, claude-3-sonnet, claude-3-haiku
```

#### Azure OpenAI
```
API 地址: https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT/chat/completions?api-version=2024-02-15-preview
可用模型: gpt-4, gpt-35-turbo

注意: 需要替换 YOUR_RESOURCE 和 YOUR_DEPLOYMENT 为您的实际资源名称
```

#### 自定义
支持任何兼容 OpenAI API 格式的服务

### 4. 管理多个配置

- **添加配置**: 点击配置选择器旁边的 `+` 按钮
- **切换配置**: 使用下拉菜单选择不同的配置
- **删除配置**: 点击"删除"按钮（至少需要保留一个配置）

### 5. 测试连接

配置完成后，点击"测试连接"按钮验证配置是否正确：

-  **成功**: 显示绿色提示"连接成功！"
-  **失败**: 显示红色错误信息，请检查：
  - API 密钥是否正确
  - API 地址是否正确
  - 网络连接是否正常
  - 模型名称是否有效

## 配置示例

### OpenAI GPT-4 配置

```json
{
  "name": "OpenAI GPT-4",
  "apiKey": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "apiEndpoint": "https://api.openai.com/v1/chat/completions",
  "model": "gpt-4",
  "temperature": 0.7,
  "maxTokens": 2000
}
```

### Claude 3 Opus 配置

```json
{
  "name": "Claude 3 Opus",
  "apiKey": "sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "apiEndpoint": "https://api.anthropic.com/v1/messages",
  "model": "claude-3-opus-20240229",
  "temperature": 0.7,
  "maxTokens": 4000
}
```

### 本地 LLM 配置（如 Ollama）

```json
{
  "name": "Local Ollama",
  "apiKey": "not-needed",
  "apiEndpoint": "http://localhost:11434/v1/chat/completions",
  "model": "llama2",
  "temperature": 0.7,
  "maxTokens": 2000
}
```

## 数据存储

- 所有配置数据存储在浏览器的 **localStorage** 中
- 数据仅存储在本地，不会上传到任何服务器
- 存储键名: `ai-model-configs`

## 安全提示

 **重要提示**：

1. **API 密钥安全**: API 密钥仅存储在本地浏览器中，但请注意：
   - 不要在公共计算机上保存 API 密钥
   - 定期更换 API 密钥
   - 不要分享您的配置文件

2. **清除数据**: 清除浏览器缓存会删除所有配置，请提前备份

3. **网络安全**: 
   - 使用 HTTPS 连接确保数据传输安全
   - 在不受信任的网络环境中使用时要格外小心

## 常见问题

### Q: 配置保存在哪里？
A: 配置保存在浏览器的 localStorage 中，只存在于本地设备。

### Q: 支持哪些 AI 模型？
A: 支持所有兼容 OpenAI API 格式的模型，包括 OpenAI、Claude、Azure OpenAI、本地模型等。

### Q: 可以同时使用多个模型吗？
A: 可以创建多个配置，但同时只能使用一个配置。

### Q: API 密钥会泄露吗？
A: API 密钥仅存储在您的本地浏览器中，不会发送到任何第三方服务器（除了您配置的 API 端点）。

### Q: 如何备份配置？
A: 配置存储在 localStorage 的 `ai-model-configs` 键中，您可以通过浏览器开发者工具导出该数据。

## 技术细节

### 组件位置
```
packages/renderer/src/components/Layout/Sidebar/AIModel.tsx
```

### 相关修改
- `MainLayout.tsx`: 添加 `ai-model` 到 ActivityBarItem 类型
- `ActivityBar.tsx`: 添加 AI 模型图标
- `Sidebar.tsx`: 添加 AI 模型视图支持

### API 请求格式

测试连接时发送的请求格式：

```javascript
POST {apiEndpoint}
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer {apiKey}"
}
Body: {
  "model": "{model}",
  "messages": [{ "role": "user", "content": "Hello" }],
  "max_tokens": 10
}
```

## 未来改进

- [ ] 支持导出/导入配置
- [ ] 添加更多预设提供商
- [ ] 支持流式响应配置
- [ ] 添加使用统计和成本估算
- [ ] 支持自定义请求头
- [ ] 添加代理设置
