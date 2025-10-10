# 内置AI服务配置指南

## 📝 配置API Key

内置AI服务需要开发者提供API Key才能正常工作。有两种配置方式：

### 方式1：环境变量（推荐）

创建 `.env` 文件在项目根目录：

```bash
# 内置AI服务 - OpenAI配置
BUILTIN_OPENAI_KEY=sk-your-openai-api-key-here

# 可选：添加其他提供商
# BUILTIN_ANTHROPIC_KEY=sk-ant-your-anthropic-api-key-here
```

**优点：**
- ✅ 不会被提交到Git
- ✅ 便于在不同环境使用不同Key
- ✅ 符合安全最佳实践

### 方式2：直接修改代码

编辑 `packages/main/src/services/BuiltinAI.ts`：

```typescript
private readonly builtinProviders: AIProviderConfig[] = [
  {
    name: 'OpenAI',
    apiKey: 'sk-your-openai-api-key-here',  // 直接填写
    baseURL: 'https://api.openai.com/v1',
    modelsEndpoint: '/models',
  }
];
```

**缺点：**
- ⚠️ API Key可能被提交到Git
- ⚠️ 需要重新编译才能生效

## 🚀 启动应用

配置好API Key后，正常启动应用：

```bash
npm run dev
```

应用会在启动时自动：
1. 从真实OpenAI API获取可用模型列表
2. 存储到内存中
3. 供内联聊天功能使用

## 🔍 验证配置

启动应用后查看控制台输出：

### ✅ 配置成功
```
[BuiltinAI] 🚀 初始化内置AI服务...
[BuiltinAI] 📡 开始从 1 个提供商获取模型...
[BuiltinAI] 🔍 正在从 OpenAI 获取模型列表...
[BuiltinAI] ✅ 从 OpenAI 获取到 5 个模型: ['gpt-4o', 'gpt-4o-mini', ...]
[BuiltinAI] ✅ 初始化完成，共获取 5 个模型
```

### ❌ 配置失败
```
[BuiltinAI] 🚀 初始化内置AI服务...
[BuiltinAI] ⚠️ 从 OpenAI 获取模型失败: HTTP 401: Unauthorized
[BuiltinAI] ❌ 初始化失败
```

**常见错误：**
- `401 Unauthorized` - API Key无效或未设置
- `Network error` - 网络连接问题或代理设置
- `429 Too Many Requests` - API请求频率超限

## 🧪 测试内联聊天

1. 打开任意代码文件
2. 按 `Ctrl + K` 打开内联聊天
3. 查看模型下拉框是否显示模型列表
4. 选择模型并发送消息

如果模型下拉框为空，说明API Key配置有问题。

## 🔧 添加更多提供商

### 添加Anthropic (Claude)

1. 获取Anthropic API Key
2. 编辑 `packages/main/src/services/BuiltinAI.ts`：

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
    apiKey: process.env.BUILTIN_ANTHROPIC_KEY || 'sk-ant-...',
    baseURL: 'https://api.anthropic.com/v1',
    modelsEndpoint: '/models',
  }
];
```

3. 在 `.env` 中添加：
```bash
BUILTIN_ANTHROPIC_KEY=sk-ant-your-key-here
```

4. 重启应用

### 添加自定义提供商

对于兼容OpenAI API格式的提供商：

```typescript
{
  name: 'CustomProvider',
  apiKey: process.env.BUILTIN_CUSTOM_KEY || 'your-key',
  baseURL: 'https://your-api.com/v1',
  modelsEndpoint: '/models',
}
```

**注意：** API必须返回OpenAI兼容的模型列表格式：

```json
{
  "data": [
    { "id": "model-name-1" },
    { "id": "model-name-2" }
  ]
}
```

## ⚙️ 高级配置

### 自定义模型过滤

编辑 `BuiltinAI.ts` 中的 `fetchModelsFromProvider` 方法：

```typescript
// 只保留聊天模型，过滤掉embedding等其他模型
return data.data
  .filter((model: any) => {
    const id = model.id || '';
    return (
      (id.includes('gpt') || id.includes('claude')) &&
      !id.includes('embedding') &&
      !id.includes('whisper')
    );
  })
  .map((model: any) => model.id);
```

### 设置代理

如果需要通过代理访问API，可以在 `fetchModelsFromProvider` 中配置：

```typescript
const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${provider.apiKey}`,
    'Content-Type': 'application/json',
  },
  // 添加代理配置（需要额外库支持）
  agent: new HttpsProxyAgent('http://your-proxy:port')
});
```

## 🔐 安全建议

1. **永远不要提交API Key到Git**
   ```bash
   # 确保 .env 在 .gitignore 中
   echo ".env" >> .gitignore
   ```

2. **使用环境变量而非硬编码**
   ```typescript
   // ✅ 好
   apiKey: process.env.BUILTIN_OPENAI_KEY
   
   // ❌ 差
   apiKey: 'sk-hardcoded-key'
   ```

3. **定期轮换API Key**

4. **监控API使用量**

## 🆘 故障排除

### 模型列表为空

**检查项：**
1. API Key是否正确设置？
2. 网络连接是否正常？
3. 查看控制台错误信息
4. 尝试手动刷新：
   ```typescript
   await window.electronAPI.builtinAI.refreshModels();
   ```

### API请求失败

**解决方法：**
1. 验证API Key有效性
2. 检查API配额是否用完
3. 确认baseURL是否正确
4. 查看详细错误日志

### 内联聊天不显示模型

**原因：**
- 内置AI服务初始化失败
- 渲染进程无法获取模型列表
- IPC通信问题

**检查：**
```javascript
// 在浏览器控制台执行
await window.electronAPI.builtinAI.getModels()
// 应该返回模型数组
```

## 📚 相关文档

- [内置AI服务架构](./builtin-ai-service.md)
- [内联聊天使用指南](./inline-chat.md)


