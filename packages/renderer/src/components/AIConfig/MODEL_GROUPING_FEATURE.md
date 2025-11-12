# 模型分组和排序功能

## 概述

AI 配置视图现在支持按提供商自动分组和按时间排序模型列表，提供更好的用户体验。

## 功能特性

### 1. 自动提供商识别

系统会根据模型名称自动识别提供商：

- **OpenAI**: `gpt-*`, `o1-*`, `o3-*`
- **Anthropic**: `claude-*`
- **Google Gemini**: `gemini-*`
- **DeepSeek**: `deepseek-*`
- **xAI**: `grok-*`
- **Groq**: `llama-*`, `mixtral-*`, `gemma-*`
- **Kimi**: `moonshot-*`, `kimi-*`
- **GLM**: `glm-*`, `chatglm-*`

### 2. 按时间排序

模型在每个提供商组内按时间排序，最新的模型显示在最前面：

- 从模型 ID 中提取日期信息（如 `claude-3-5-sonnet-20241022`）
- 如果没有日期，则使用版本号作为排序依据
- 确保用户总是能快速找到最新的模型

### 3. 手风琴分组显示

采用两级手风琴结构：

```
可用模型列表 (共 X 个模型, Y 个提供商)
├─ OpenAI (3)
│  ├─ gpt-4o
│  ├─ gpt-4-turbo
│  └─ gpt-3.5-turbo
├─ Anthropic (5)
│  ├─ claude-3-5-sonnet-20241022
│  ├─ claude-3-5-haiku-20241022
│  └─ ...
└─ DeepSeek (2)
   ├─ deepseek-chat
   └─ deepseek-coder
```

## 使用方式

### 用户操作

1. 配置 API Key 和端点后，系统自动获取模型列表
2. 点击"可用模型列表"展开/折叠整个列表
3. 点击各个提供商名称展开/折叠该提供商的模型
4. 每个模型旁边显示其支持的能力图标

### 界面元素

- **提供商图标**: 显示在提供商名称左侧
- **模型数量**: 显示在提供商名称右侧，如 `(5)`
- **能力徽章**: 显示在每个模型右侧
- **展开/折叠图标**: 箭头图标指示当前状态

## 技术实现

### 核心函数

1. **getProviderByModelName**: 根据模型名称识别提供商
   ```typescript
   const provider = getProviderByModelName(model.id);
   // 返回: { id: 'openai', name: 'OpenAI', icon: 'OpenAI' }
   ```

2. **extractModelDate**: 从模型 ID 提取日期信息
   ```typescript
   const date = extractModelDate('claude-3-5-sonnet-20241022');
   // 返回: Date(2024, 9, 22)
   ```

3. **groupedModels**: 使用 useMemo 缓存分组结果
   ```typescript
   const groupedModels = useMemo(() => {
     // 按提供商分组
     // 按日期排序
     // 返回分组数组
   }, [availableModels, getProviderByModelName, extractModelDate]);
   ```

### 状态管理

- `expandedProviders`: Set<string> - 记录哪些提供商被展开
- `toggleProvider`: 切换提供商展开/折叠状态

### 样式设计

- 继承 VSCode 主题配色
- 两级缩进：提供商 0px，模型 28px (40px - 12px padding)
- 平滑的展开/折叠动画
- 悬停高亮效果

## 性能优化

1. **useMemo 缓存**: 分组和排序结果被缓存，只在模型列表变化时重新计算
2. **useCallback**: 所有回调函数都使用 useCallback 避免不必要的重渲染
3. **虚拟滚动**: 手风琴内容区域限制最大高度，超出部分滚动显示

## 向后兼容

- 保留了旧的 `getProviderIconByModelName` 函数
- 保留了旧的 `.model-list` 样式类
- 不影响现有的模型选择逻辑

## 未来改进

- [ ] 支持用户自定义提供商识别规则
- [ ] 支持按其他维度分组（如模型大小、价格等）
- [ ] 支持搜索和过滤模型
- [ ] 记住用户的展开/折叠偏好
- [ ] 支持拖拽排序提供商








