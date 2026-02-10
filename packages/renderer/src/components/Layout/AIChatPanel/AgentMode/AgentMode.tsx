/**
 * Agent 模式组件
 * 功能：在 AI Chat Panel 中显示 Agent 模式的 UI
 * 描述：显示任务规划、执行进度、差异视图等
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { agentService } from '../../../../services/agent/AgentService';
import { aiService } from '../../../../services/ai/AIService';
import { getModelConfig } from '../../../../services/ModelCacheService';
import {
  AgentState,
  AgentStep,
  AgentTask,
  DiffChange,
  ConfirmationRequest
} from '../../../../services/agent/types';
import { Icon } from '../../../Icons/Icon';
import './AgentMode.scss';

/**
 * Agent 模式属性
 */
interface AgentModeProps {
  /** 用户输入的任务描述 */
  taskDescription: string;
  /** 当前文件路径 */
  currentFile?: string;
  /** 选中的文本 */
  selectedText?: string;
  /** 工作区路径 */
  workspacePath?: string;
  /** 使用的模型 ID */
  modelId: string;
  /** 退出 Agent 模式的回调 */
  onExit: () => void;
  /** 任务完成的回调 */
  onComplete?: (result: string) => void;
}

/**
 * 步骤状态图标
 */
const StepIcon: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'completed':
      return <span className="step-icon completed">✓</span>;
    case 'failed':
      return <span className="step-icon failed">✗</span>;
    case 'running':
      return <span className="step-icon running">●</span>;
    default:
      return <span className="step-icon pending">○</span>;
  }
};

/**
 * Agent 模式组件
 */
export const AgentMode: React.FC<AgentModeProps> = ({
  taskDescription,
  currentFile,
  selectedText,
  workspacePath,
  modelId,
  onExit,
  onComplete
}) => {
  // 状态
  const [agentState, setAgentState] = useState<AgentState>(AgentState.IDLE);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [output, setOutput] = useState<string>('');
  const [thinking, setThinking] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);
  const [diffChanges, setDiffChanges] = useState<DiffChange[]>([]);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const [isStepsExpanded, setIsStepsExpanded] = useState(true);

  // Refs
  const outputRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<AgentTask | null>(null);
  const isExecutingRef = useRef(false);
  const interruptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 滚动到输出底部
   */
  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  /**
   * 初始化并执行任务
   */
  useEffect(() => {
    // 清除任何待处理的中断超时（处理 React Strict Mode 的双重调用）
    if (interruptTimeoutRef.current) {
      clearTimeout(interruptTimeoutRef.current);
      interruptTimeoutRef.current = null;
    }

    if (isExecutingRef.current || !taskDescription) return;
    isExecutingRef.current = true;

    const executeTask = async () => {
      try {
        // 获取模型配置（modelId 格式为 providerId:actualModelId）
        const modelConfig = await getModelConfig(modelId);

        if (!modelConfig) {
          throw new Error(`未找到模型配置：${modelId}`);
        }

        console.log('[AgentMode] 使用模型配置:', modelConfig.name);

        // 提取实际的模型 ID（去掉提供商前缀）
        const actualModelId = modelId.includes(':') ? modelId.split(':')[1] : modelId;

        // 配置 AI 提供商（这是关键步骤！）
        await aiService.setProvider(modelConfig.providerId, {
          id: modelConfig.id || 'default',
          name: modelConfig.name || modelConfig.configName,
          apiKey: modelConfig.apiKey,
          apiEndpoint: modelConfig.apiEndpoint,
          temperature: 0.7,
          maxTokens: 4000,
          modelId: actualModelId
        });

        console.log('[AgentMode] AI 提供商已配置');

        // 初始化 Agent 服务
        await agentService.initialize({
          execution: {
            modelId: actualModelId,
            temperature: 0.7,
            maxTokens: 4000,
            streaming: true
          }
        });

        // 注册默认工具
        if (workspacePath) {
          agentService.registerDefaultTools({
            workspacePath
          });
        }

        // 创建任务
        const task = agentService.createTask(
          selectedText ? 'edit' : 'write',
          taskDescription,
          {
            currentFile,
            selectedText,
            workspacePath
          }
        );
        taskRef.current = task;

        // 流式执行任务
        await agentService.executeTaskStream(task, {
          onStepStart: (step) => {
            console.log('[AgentMode] 步骤开始:', step.description);
            setSteps(prev => {
              const existing = prev.find(s => s.id === step.id);
              if (existing) {
                return prev.map(s => s.id === step.id ? { ...s, status: 'running' } : s);
              }
              return [...prev, { ...step, status: 'running' }];
            });
          },
          onStepComplete: (step, result) => {
            console.log('[AgentMode] 步骤完成:', step.description, result);
            setSteps(prev => prev.map(s =>
              s.id === step.id ? { ...s, status: 'completed', result } : s
            ));
            setProgress(agentService.getProgress());

            // 从步骤结果中提取输出并更新 output 状态
            if (result) {
              const stepOutput = (result as { thinking?: string; content?: string }).thinking
                || (result as { thinking?: string; content?: string }).content
                || '';
              if (stepOutput) {
                setOutput(prev => prev + stepOutput + '\n\n');
                scrollToBottom();
              }
            }
          },
          onContent: (content) => {
            setOutput(prev => prev + content);
            scrollToBottom();
          },
          onThinking: (thinkingContent) => {
            setThinking(prev => prev + thinkingContent);
          },
          onToolCall: (toolName, params) => {
            console.log('[AgentMode] 工具调用:', toolName, params);
          },
          onToolResult: (toolName, result) => {
            console.log('[AgentMode] 工具结果:', toolName, result);
          },
          onDiffGenerated: (diff) => {
            console.log('[AgentMode] 生成差异:', diff.filePath);
            setDiffChanges(prev => [...prev, diff]);
          },
          onComplete: (result) => {
            console.log('[AgentMode] 任务完成:', result.success, result.output);
            if (result.success && onComplete) {
              // 使用 result.output 而不是组件状态中的 output（避免闭包问题）
              onComplete(result.output || '任务已完成');
            }
          },
          onError: (err) => {
            console.error('[AgentMode] 任务错误:', err);
            setError(err.message);
          }
        });
      } catch (err) {
        console.error('[AgentMode] 执行任务失败:', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    executeTask();

    // 清理函数
    return () => {
      // 使用延迟中断来处理 React Strict Mode 的双重调用
      // 如果组件在短时间内重新挂载，则取消中断
      interruptTimeoutRef.current = setTimeout(() => {
        if (agentService.isExecuting()) {
          agentService.interrupt();
        }
      }, 100);
    };
  }, [taskDescription, currentFile, selectedText, workspacePath, modelId, onComplete, scrollToBottom]);

  /**
   * 监听 Agent 事件
   */
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    // 监听状态变化
    unsubscribers.push(
      agentService.on('state_change', (event) => {
        const { currentState } = event.data as { currentState: AgentState };
        setAgentState(currentState);
      })
    );

    // 监听计划创建
    unsubscribers.push(
      agentService.on('plan_created', (event) => {
        const plan = event.data as { steps: AgentStep[] };
        setSteps(plan.steps);
        setProgress({ current: 0, total: plan.steps.length, percentage: 0 });
      })
    );

    // 监听计划更新
    unsubscribers.push(
      agentService.on('plan_updated', (event) => {
        const plan = event.data as { steps: AgentStep[] };
        setSteps(plan.steps);
      })
    );

    // 监听确认请求
    unsubscribers.push(
      agentService.on('confirmation_required', (event) => {
        const request = event.data as ConfirmationRequest;
        setConfirmationRequest(request);
        if (request.diffChanges) {
          setDiffChanges(request.diffChanges);
        }
      })
    );

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);

  /**
   * 处理中断
   */
  const handleInterrupt = useCallback(() => {
    agentService.interrupt();
    setAgentState(AgentState.INTERRUPTED);
  }, []);

  /**
   * 处理确认
   */
  const handleConfirm = useCallback((confirmed: boolean) => {
    if (confirmationRequest) {
      agentService.handleConfirmation({
        requestId: confirmationRequest.id,
        confirmed,
        respondedAt: Date.now()
      });
      setConfirmationRequest(null);
    }
  }, [confirmationRequest]);

  /**
   * 获取状态文本
   */
  const getStateText = (state: AgentState): string => {
    const stateTexts: Record<AgentState, string> = {
      [AgentState.IDLE]: '就绪',
      [AgentState.PLANNING]: '规划中...',
      [AgentState.EXECUTING]: '执行中...',
      [AgentState.WAITING]: '等待确认...',
      [AgentState.COMPLETED]: '已完成',
      [AgentState.ERROR]: '错误',
      [AgentState.INTERRUPTED]: '已中断'
    };
    return stateTexts[state] || state;
  };

  /**
   * 获取状态类名
   */
  const getStateClassName = (state: AgentState): string => {
    return state.toLowerCase();
  };

  return (
    <div className="agent-mode">
      {/* 头部 */}
      <div className="agent-mode-header">
        <div className="agent-mode-title">
          <Icon name="robot" size={16} />
          <span>Agent 模式</span>
        </div>
        <div className="agent-mode-status">
          <span className={`status-dot ${getStateClassName(agentState)}`} />
          <span className="status-text">{getStateText(agentState)}</span>
        </div>
        <div className="agent-mode-actions">
          {[AgentState.PLANNING, AgentState.EXECUTING].includes(agentState) && (
            <button
              className="agent-mode-btn stop-btn"
              onClick={handleInterrupt}
              title="停止执行"
            >
              <Icon name="stop" size={14} />
            </button>
          )}
          <button
            className="agent-mode-btn close-btn"
            onClick={onExit}
            title="退出 Agent 模式"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>

      {/* 任务描述 */}
      <div className="agent-mode-task">
        <div className="task-label">任务：</div>
        <div className="task-description">{taskDescription}</div>
      </div>

      {/* 进度条 */}
      {steps.length > 0 && (
        <div className="agent-mode-progress">
          <div className="progress-bar">
            <div
              className={`progress-fill ${agentState === AgentState.COMPLETED ? 'completed' : ''} ${agentState === AgentState.ERROR ? 'error' : ''}`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <div className="progress-info">
            <span>步骤 {progress.current}/{progress.total}</span>
            <span>{progress.percentage}%</span>
          </div>
        </div>
      )}

      {/* 步骤列表 */}
      {steps.length > 0 && (
        <div className="agent-mode-steps">
          <div
            className="steps-header"
            onClick={() => setIsStepsExpanded(!isStepsExpanded)}
          >
            <span className={`expand-icon ${isStepsExpanded ? '' : 'collapsed'}`}>▼</span>
            <span>执行步骤</span>
          </div>
          {isStepsExpanded && (
            <div className="steps-list">
              {steps.map((step, index) => (
                <div key={step.id} className={`step-item ${step.status}`}>
                  <StepIcon status={step.status} />
                  <span className="step-description">{step.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 思考过程 */}
      {thinking && (
        <div className="agent-mode-thinking">
          <div
            className="thinking-header"
            onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
          >
            <span className={`expand-icon ${isThinkingExpanded ? '' : 'collapsed'}`}>▼</span>
            <span>思考过程</span>
          </div>
          {isThinkingExpanded && (
            <div className="thinking-content">
              {thinking}
            </div>
          )}
        </div>
      )}

      {/* 差异视图 */}
      {diffChanges.length > 0 && (
        <div className="agent-mode-diff">
          <div className="diff-header">
            <span>文件变更</span>
            <span className="diff-stats">
              <span className="diff-add">+{diffChanges.reduce((acc, d) => acc + d.lineChanges.filter(l => l.type === 'add').length, 0)}</span>
              <span className="diff-delete">-{diffChanges.reduce((acc, d) => acc + d.lineChanges.filter(l => l.type === 'delete').length, 0)}</span>
            </span>
          </div>
          {diffChanges.map((diff, index) => (
            <div key={index} className="diff-file">
              <div className="diff-file-header">{diff.filePath}</div>
              <div className="diff-content">
                {diff.lineChanges.map((line, lineIndex) => (
                  <div
                    key={lineIndex}
                    className={`diff-line ${line.type}`}
                  >
                    <span className="line-number">{line.lineNumber}</span>
                    <span className="line-content">{line.content}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 确认请求 */}
      {confirmationRequest && (
        <div className="agent-mode-confirmation">
          <div className="confirmation-message">
            {confirmationRequest.description}
          </div>
          <div className="confirmation-actions">
            <button
              className="confirm-btn accept"
              onClick={() => handleConfirm(true)}
            >
              <Icon name="check" size={14} />
              接受
            </button>
            <button
              className="confirm-btn reject"
              onClick={() => handleConfirm(false)}
            >
              <Icon name="close" size={14} />
              拒绝
            </button>
          </div>
        </div>
      )}

      {/* 输出区域 */}
      <div className="agent-mode-output" ref={outputRef}>
        {output ? (
          <div className="output-content">{output}</div>
        ) : (
          <div className="output-placeholder">
            {agentState === AgentState.IDLE && '等待执行...'}
            {agentState === AgentState.PLANNING && '正在规划任务...'}
            {agentState === AgentState.EXECUTING && '正在执行...'}
          </div>
        )}
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="agent-mode-error">
          <Icon name="error" size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default AgentMode;
