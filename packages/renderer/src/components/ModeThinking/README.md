# ModelThinking 组件

AI 模型深度思考过程展示组件，用于可视化显示 AI 模型的思考步骤、状态和内容。

## 功能特性

- ✅ 展示多步骤思考过程
- ✅ 时间线视觉效果
- ✅ 可展开/折叠整体内容
- ✅ 可展开/折叠单个步骤
- ✅ 显示思考状态（等待中、思考中、已完成、错误）
- ✅ 支持显示耗时和时间戳
- ✅ 响应式设计，适配主题颜色

## 使用示例

### 基础用法

```tsx
import { ModelThinking, type ThinkingStep } from '@/components/ModeThinking';

const steps: ThinkingStep[] = [
  {
    id: '1',
    title: '分析问题',
    content: '理解用户需求，识别关键要素...',
    status: 'completed',
    duration: 1200,
    timestamp: new Date()
  },
  {
    id: '2',
    title: '搜索相关知识',
    content: '从知识库中检索相关信息...',
    status: 'completed',
    duration: 800
  },
  {
    id: '3',
    title: '生成回答',
    content: '基于分析结果生成合适的回答...',
    status: 'thinking'
  }
];

function MyComponent() {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <ModelThinking
      steps={steps}
      isExpanded={isExpanded}
      onToggleExpand={() => setIsExpanded(!isExpanded)}
      showDuration={true}
      showTimestamp={false}
    />
  );
}
```

### 在 AI 聊天中使用

```tsx
import { ModelThinking, type ThinkingStep } from '@/components/ModeThinking';
import { useState, useEffect } from 'react';

function AIChatMessage() {
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

  // 模拟流式接收思考过程
  useEffect(() => {
    const newStep: ThinkingStep = {
      id: Date.now().toString(),
      title: '理解上下文',
      content: '分析对话历史和当前问题...',
      status: 'thinking',
      timestamp: new Date()
    };
    
    setThinkingSteps(prev => [...prev, newStep]);
  }, []);

  return (
    <div className="ai-message">
      {thinkingSteps.length > 0 && (
        <ModelThinking
          steps={thinkingSteps}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
        />
      )}
      <div className="ai-response">
        {/* AI 回复内容 */}
      </div>
    </div>
  );
}
```

### 完整流程示例

```tsx
import { ModelThinking, type ThinkingStep } from '@/components/ModeThinking';

function DeepThinkingDemo() {
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

  const simulateThinking = async () => {
    const thinkingProcess = [
      { title: '分析问题', content: '识别问题类型和关键信息...', duration: 1000 },
      { title: '规划策略', content: '制定解决方案的步骤...', duration: 1500 },
      { title: '执行分析', content: '深入分析每个关键点...', duration: 2000 },
      { title: '验证结果', content: '检查结论的准确性...', duration: 1200 },
      { title: '生成回答', content: '组织语言，生成最终回答...', duration: 800 }
    ];

    for (let i = 0; i < thinkingProcess.length; i++) {
      const step = thinkingProcess[i];
      const startTime = Date.now();
      
      // 添加思考中的步骤
      const newStep: ThinkingStep = {
        id: `step-${i}`,
        title: step.title,
        content: step.content,
        status: 'thinking',
        timestamp: new Date()
      };
      
      setSteps(prev => [...prev, newStep]);

      // 模拟思考时间
      await new Promise(resolve => setTimeout(resolve, step.duration));

      // 更新为完成状态
      const endTime = Date.now();
      setSteps(prev => 
        prev.map(s => 
          s.id === newStep.id 
            ? { ...s, status: 'completed', duration: endTime - startTime }
            : s
        )
      );
    }
  };

  return (
    <div>
      <button onClick={simulateThinking}>开始思考</button>
      {steps.length > 0 && (
        <ModelThinking
          steps={steps}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
          showDuration={true}
          showTimestamp={true}
        />
      )}
    </div>
  );
}
```

## Props

### ModelThinkingProps

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `steps` | `ThinkingStep[]` | 是 | - | 思考步骤数组 |
| `isExpanded` | `boolean` | 否 | `false` | 是否展开内容 |
| `onToggleExpand` | `() => void` | 否 | - | 展开/折叠回调函数 |
| `showTimestamp` | `boolean` | 否 | `false` | 是否显示时间戳 |
| `showDuration` | `boolean` | 否 | `true` | 是否显示耗时 |
| `className` | `string` | 否 | `''` | 自定义类名 |

### ThinkingStep

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | 是 | 步骤唯一标识 |
| `title` | `string` | 是 | 步骤标题 |
| `content` | `string` | 是 | 步骤内容 |
| `status` | `'pending' \| 'thinking' \| 'completed' \| 'error'` | 是 | 步骤状态 |
| `timestamp` | `Date` | 否 | 时间戳 |
| `duration` | `number` | 否 | 耗时（毫秒） |

## 状态说明

- **pending**: 等待中 - 灰色，表示步骤尚未开始
- **thinking**: 思考中 - 蓝色，表示正在执行
- **completed**: 已完成 - 绿色，表示步骤成功完成
- **error**: 错误 - 红色，表示步骤执行失败

## 样式定制

组件使用 VSCode 主题变量，会自动适配应用主题。如需定制样式，可以通过以下 CSS 变量：

```scss
.model-thinking {
  // 背景色
  --vscode-editor-background
  --vscode-list-hoverBackground
  
  // 边框色
  --vscode-editorWidget-border
  --vscode-focusBorder
  
  // 文字色
  --vscode-foreground
  --vscode-descriptionForeground
  
  // 状态色
  --vscode-charts-gray    // pending
  --vscode-charts-blue    // thinking
  --vscode-charts-green   // completed
  --vscode-charts-red     // error
}
```

## 注意事项

1. 确保已正确导入图标系统（Icon 组件）
2. 步骤 ID 必须唯一，用于展开/折叠功能
3. 时间戳和耗时为可选项，可根据需求显示
4. 组件会自动处理最后一步的时间线样式
5. 支持长文本内容的自动换行和滚动

## 最佳实践

1. **实时更新**: 在接收流式数据时，逐步更新步骤状态
2. **错误处理**: 使用 `error` 状态标记失败的步骤
3. **性能优化**: 对于大量步骤，考虑虚拟滚动或分页
4. **用户体验**: 默认展开重要的思考过程，允许用户折叠
5. **可访问性**: 保持语义化的 HTML 结构

## 相关组件

- `Icon` - 图标组件
- `AIChatPanel` - AI 对话面板
- `ModelCapabilityBadge` - 模型能力标签
