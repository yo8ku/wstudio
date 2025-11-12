/**
 * ModelThinking 组件使用示例
 * 展示如何在实际场景中使用深度思考组件
 */

import React, { useState } from 'react';
import { ModelThinking, type ThinkingStep } from './ModelThinking';

/**
 * 基础示例
 */
export const BasicExample: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);

  const steps: ThinkingStep[] = [
    {
      id: '1',
      title: '理解问题',
      content: '分析用户的问题，识别关键信息和意图。这一步需要理解问题的上下文和背景知识。',
      status: 'completed',
      duration: 1200,
      timestamp: new Date('2024-01-01T10:00:00')
    },
    {
      id: '2',
      title: '检索知识库',
      content: '从向量数据库中检索相关的知识片段，找到与问题最相关的信息。',
      status: 'completed',
      duration: 800,
      timestamp: new Date('2024-01-01T10:00:01')
    },
    {
      id: '3',
      title: '分析和推理',
      content: '基于检索到的知识进行深度分析和逻辑推理，形成初步的答案框架。',
      status: 'thinking',
      timestamp: new Date('2024-01-01T10:00:02')
    },
    {
      id: '4',
      title: '生成回答',
      content: '组织语言，生成结构化的回答内容。',
      status: 'pending'
    }
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h2>基础示例</h2>
      <ModelThinking
        steps={steps}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        showDuration={true}
        showTimestamp={false}
      />
    </div>
  );
};

/**
 * 错误处理示例
 */
export const ErrorExample: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);

  const steps: ThinkingStep[] = [
    {
      id: '1',
      title: '初始化连接',
      content: '建立与知识库的连接',
      status: 'completed',
      duration: 500
    },
    {
      id: '2',
      title: '查询数据',
      content: '执行向量查询操作',
      status: 'error',
      duration: 1200
    },
    {
      id: '3',
      title: '生成回答',
      content: '基于查询结果生成回答',
      status: 'pending'
    }
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h2>错误处理示例</h2>
      <ModelThinking
        steps={steps}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
      />
    </div>
  );
};

/**
 * 完整流程示例（带动画效果）
 */
export const AnimatedExample: React.FC = () => {
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  const startThinking = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setSteps([]);

    const thinkingProcess = [
      { 
        title: '接收问题', 
        content: '接收并预处理用户输入的问题，进行初步的文本清洗和标准化处理。', 
        duration: 1000 
      },
      { 
        title: '语义理解', 
        content: '使用自然语言处理技术分析问题的语义，提取关键实体和意图。', 
        duration: 1500 
      },
      { 
        title: '知识检索', 
        content: '在向量数据库中进行相似度搜索，检索最相关的知识片段。包括全文检索和向量检索两个阶段。', 
        duration: 2000 
      },
      { 
        title: '上下文整合', 
        content: '将检索到的知识片段与对话历史进行整合，构建完整的上下文。', 
        duration: 1200 
      },
      { 
        title: '生成回答', 
        content: '基于整合后的上下文，使用大语言模型生成最终的回答内容。', 
        duration: 1800 
      }
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

    setIsRunning(false);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h2>动画流程示例</h2>
      <div style={{ marginBottom: '16px' }}>
        <button 
          onClick={startThinking}
          disabled={isRunning}
          style={{
            padding: '8px 16px',
            borderRadius: '4px',
            border: 'none',
            background: isRunning ? '#ccc' : '#0078d4',
            color: 'white',
            cursor: isRunning ? 'not-allowed' : 'pointer'
          }}
        >
          {isRunning ? '思考中...' : '开始深度思考'}
        </button>
      </div>
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
};

/**
 * 所有示例的组合展示
 */
export const AllExamples: React.FC = () => {
  return (
    <div style={{ padding: '40px', background: '#1e1e1e', minHeight: '100vh' }}>
      <h1 style={{ color: '#fff', marginBottom: '40px' }}>ModelThinking 组件示例</h1>
      
      <div style={{ marginBottom: '60px' }}>
        <BasicExample />
      </div>
      
      <div style={{ marginBottom: '60px' }}>
        <ErrorExample />
      </div>
      
      <div style={{ marginBottom: '60px' }}>
        <AnimatedExample />
      </div>
    </div>
  );
};

export default AllExamples;



