/**
 * 模型思考组件
 * 展示AI模型的深度思考过程，包括思考步骤、状态和内容
 */

import React, { useState, useEffect } from 'react';
import { Icon } from '../Icons/Icon';
import './ModelThinking.scss';

export interface ThinkingStep {
  id: string;
  title: string;
  content: string;
  status: 'pending' | 'thinking' | 'completed' | 'error';
  timestamp?: Date;
  duration?: number; // 思考耗时（毫秒）
}

export interface ModelThinkingProps {
  steps: ThinkingStep[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  showTimestamp?: boolean;
  showDuration?: boolean;
  className?: string;
}

export const ModelThinking: React.FC<ModelThinkingProps> = ({
  steps,
  isExpanded = false,
  onToggleExpand,
  showTimestamp = false,
  showDuration = true,
  className = ''
}) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [elapsedTime, setElapsedTime] = useState(0); // 实时计时（毫秒）

  // 调试：打印接收到的步骤数据
  useEffect(() => {
    console.log('[ModelThinking] 接收到的步骤数据:', steps.map(s => ({ id: s.id, title: s.title, status: s.status })));
  }, [steps]);

  // 实时计时器：当有 thinking 状态时开始计时
  useEffect(() => {
    const thinkingStep = steps.find(step => step.status === 'thinking');
    
    if (thinkingStep && thinkingStep.timestamp) {
      // 使用步骤的 timestamp 作为开始时间
      const startTime = thinkingStep.timestamp.getTime();
      const timer = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 100); // 每100ms更新一次
      
      return () => clearInterval(timer);
    } else {
      setElapsedTime(0);
    }
  }, [steps]);

  const toggleStepExpand = (stepId: string) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: ThinkingStep['status']) => {
    switch (status) {
      case 'pending':
        return 'clock';
      case 'thinking':
        return 'deep-thinking';
      case 'completed':
        return 'deep-thinking'; // 完成状态使用深度思考图标（不使用check）
      case 'error':
        return 'error';
      default:
        return 'deep-thinking';
    }
  };

  const getStatusText = (status: ThinkingStep['status']) => {
    switch (status) {
      case 'pending':
        return '等待中';
      case 'thinking':
        return '深度思考';
      case 'completed':
        return '已深度思考'; // 完成状态显示"已深度思考"
      case 'error':
        return '错误';
      default:
        return '深度思考';
    }
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return '';
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  const formatTime = (timestamp?: Date) => {
    if (!timestamp) return '';
    return timestamp.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // 计算总思考时长
  const totalDuration = steps.reduce((sum, step) => sum + (step.duration || 0), 0);
  
  // 检查是否有正在思考的步骤
  const hasThinkingStep = steps.some(step => step.status === 'thinking');

  // 折叠状态下显示简化视图
  if (!isExpanded && onToggleExpand) {
    // 如果正在思考，显示实时耗时；否则显示总耗时
    const displayDuration = hasThinkingStep ? elapsedTime : totalDuration;
    
    return (
      <div className={`model-thinking collapsed ${className}`} onClick={onToggleExpand}>
        <div className="model-thinking-collapsed-view">
          <Icon 
            name="deep-thinking" 
            size={16} 
            className={`model-thinking-collapsed-icon ${hasThinkingStep ? 'thinking' : ''}`}
          />
          <span className="model-thinking-collapsed-text">
            {hasThinkingStep ? '深度思考中...' : '已深度思考'}
          </span>
          {showDuration && displayDuration > 0 && (
            <span className="model-thinking-collapsed-duration">
              耗时: {formatDuration(displayDuration)}
            </span>
          )}
          <Icon name="chevron-down" size={14} className="model-thinking-collapsed-expand-icon" />
        </div>
      </div>
    );
  }

  return (
    <div className={`model-thinking ${className}`}>
      <div className="model-thinking-content">
        {steps.map((step, index) => {
            const isStepExpanded = expandedSteps.has(step.id);
            const isLastStep = index === steps.length - 1;

            return (
              <div 
                key={step.id} 
                className={`thinking-step ${step.status}`}
              >
                <div className="thinking-step-timeline">
                  {!isLastStep && <div className="thinking-step-line" />}
                </div>

                <div className="thinking-step-body">
                  <div 
                    className="thinking-step-header"
                    onClick={() => toggleStepExpand(step.id)}
                  >
                    <div className="thinking-step-header-left">
                      <Icon 
                        name={getStatusIcon(step.status)} 
                        size={16} 
                        className={`thinking-step-icon ${step.status}`}
                      />
                      <span className="thinking-step-title">{getStatusText(step.status)}</span>
                    </div>
                    <div className="thinking-step-header-right">
                      {step.duration !== undefined && (
                        <span className="thinking-step-duration">
                          耗时: {formatDuration(step.duration)}
                        </span>
                      )}
                      {showTimestamp && step.timestamp && (
                        <span className="thinking-step-time">
                          {formatTime(step.timestamp)}
                        </span>
                      )}
                      <Icon 
                        name={isStepExpanded ? 'chevron-up' : 'chevron-down'} 
                        size={14}
                        className="thinking-step-expand-icon"
                      />
                    </div>
                  </div>

                  {isStepExpanded && (
                    <div className="thinking-step-content">
                      <div className="thinking-step-text">
                        {step.content}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
        })}
      </div>
      
      {/* 底部折叠按钮（只在思考完成后且有展开的步骤时显示） */}
      {expandedSteps.size > 0 && onToggleExpand && !hasThinkingStep && (
        <div className="model-thinking-footer" onClick={onToggleExpand}>
          <Icon name="chevron-up" size={16}  />
          <span className="model-thinking-collapse-text">收起深度思考</span>
        </div>
      )}
    </div>
  );
};

export default ModelThinking;