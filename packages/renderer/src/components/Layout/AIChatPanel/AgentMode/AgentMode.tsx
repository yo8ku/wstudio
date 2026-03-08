/**
 * Agent runtime viewer for main-process turns.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildAgentChatTurnFrames,
  type AgentChatServerRequest,
  type AgentChatThreadSnapshot,
  type AgentChatTurnFrame,
  type AgentChatTurnStatus,
  type AgentChatTurnSummary,
} from '@note-studio/shared';
import { agentChatService } from '../../../../services/agentChat';
import { Icon } from '../../../Icons/Icon';
import './AgentMode.scss';

interface AgentModeProps {
  taskDescription: string;
  threadId: string;
  turnId: string;
  modelId: string;
  onExit: () => void;
}

type StepStatus = 'pending' | 'running' | 'completed' | 'failed';
type AgentModeStatusClass =
  | 'idle'
  | 'executing'
  | 'waiting'
  | 'completed'
  | 'error'
  | 'interrupted';

const mergeTurnFrames = (
  currentFrames: AgentChatTurnFrame[],
  incomingFrames: AgentChatTurnFrame[],
): AgentChatTurnFrame[] => {
  const framesById = new Map<string, AgentChatTurnFrame>();

  for (const frame of currentFrames) {
    framesById.set(frame.id, frame);
  }

  for (const frame of incomingFrames) {
    framesById.set(frame.id, frame);
  }

  return [...framesById.values()].sort((left, right) => left.createdAt - right.createdAt);
};

const getTurnFramesFromSnapshot = (
  snapshot: AgentChatThreadSnapshot | null,
  turnId: string,
): AgentChatTurnFrame[] => {
  if (!snapshot?.turnItems) {
    return [];
  }

  return buildAgentChatTurnFrames(snapshot.turnItems)
    .filter(frame => frame.turnId === turnId)
    .sort((left, right) => left.createdAt - right.createdAt);
};

const findTurnFromSnapshot = (
  snapshot: AgentChatThreadSnapshot | null,
  turnId: string,
): AgentChatTurnSummary | null => {
  if (!snapshot?.turns) {
    return null;
  }

  return snapshot.turns.find(turn => turn.id === turnId) ?? null;
};

const findPendingRequest = (
  snapshot: AgentChatThreadSnapshot | null,
  turnId: string,
): AgentChatServerRequest | null => {
  if (!snapshot?.pendingRequests) {
    return null;
  }

  return snapshot.pendingRequests.find(request =>
    request.turnId === turnId && request.status === 'pending'
  ) ?? null;
};

const getFrameResponseKey = (frame: AgentChatTurnFrame): string | null => {
  const value = frame.responseKey ?? frame.streamId ?? null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const buildLatestTurnContent = (frames: AgentChatTurnFrame[]): string => {
  const finalFrames = frames
    .filter((frame): frame is Extract<AgentChatTurnFrame, { kind: 'final_answer' }> => frame.kind === 'final_answer')
    .sort((left, right) => left.createdAt - right.createdAt);

  if (finalFrames.length > 0) {
    const latestFinalKey = getFrameResponseKey(finalFrames[finalFrames.length - 1]);
    const resolvedFinalFrames = latestFinalKey
      ? finalFrames.filter(frame => getFrameResponseKey(frame) === latestFinalKey)
      : [finalFrames[finalFrames.length - 1]];

    return resolvedFinalFrames
      .map(frame => frame.text)
      .join('')
      .trim();
  }

  const deltaFrames = frames
    .filter((frame): frame is Extract<AgentChatTurnFrame, { kind: 'assistant_delta' }> => frame.kind === 'assistant_delta')
    .sort((left, right) => left.createdAt - right.createdAt);

  if (deltaFrames.length === 0) {
    return '';
  }

  const latestDeltaKey = getFrameResponseKey(deltaFrames[deltaFrames.length - 1]);
  const resolvedDeltaFrames = latestDeltaKey
    ? deltaFrames.filter(frame => getFrameResponseKey(frame) === latestDeltaKey)
    : deltaFrames;

  return resolvedDeltaFrames
    .map(frame => frame.text)
    .join('')
    .trim();
};

const getStatusClassName = (status: AgentChatTurnStatus | null | undefined): AgentModeStatusClass => {
  switch (status) {
    case 'waiting_approval':
    case 'waiting_user_input':
      return 'waiting';
    case 'completed':
      return 'completed';
    case 'error':
      return 'error';
    case 'interrupted':
      return 'interrupted';
    case 'running':
      return 'executing';
    default:
      return 'idle';
  }
};

const getStatusText = (status: AgentChatTurnStatus | null | undefined): string => {
  switch (status) {
    case 'waiting_approval':
      return '等待确认';
    case 'waiting_user_input':
      return '等待输入';
    case 'completed':
      return '已完成';
    case 'error':
      return '执行失败';
    case 'interrupted':
      return '已中断';
    case 'running':
      return '执行中';
    default:
      return '加载中';
  }
};

const getActivityTitle = (frame: AgentChatTurnFrame): string => {
  if (frame.title?.trim()) {
    return frame.title.trim();
  }

  switch (frame.kind) {
    case 'task':
      return '任务';
    case 'progress':
      return '步骤';
    case 'tool_started':
      return `工具调用: ${frame.toolName}`;
    case 'tool_finished':
      return frame.success ? `工具完成: ${frame.toolName}` : `工具失败: ${frame.toolName}`;
    case 'error':
      return '错误';
    default:
      return '事件';
  }
};

const getActivityText = (frame: AgentChatTurnFrame): string => {
  if (frame.kind === 'tool_started') {
    const paramsText = JSON.stringify(frame.params);
    return paramsText === '{}' ? '等待工具执行' : paramsText;
  }

  if (frame.kind === 'tool_finished') {
    return frame.resultText.trim();
  }

  return frame.text?.trim() ?? '';
};

const getActivityStatus = (frame: AgentChatTurnFrame): StepStatus => {
  switch (frame.kind) {
    case 'tool_finished':
      return frame.success ? 'completed' : 'failed';
    case 'error':
      return 'failed';
    default:
      switch (frame.status) {
        case 'completed':
          return 'completed';
        case 'failed':
          return 'failed';
        case 'running':
          return 'running';
        default:
          return 'pending';
      }
  }
};

const StepIcon: React.FC<{ status: StepStatus }> = ({ status }) => {
  const label = status === 'completed'
    ? 'OK'
    : status === 'failed'
      ? 'X'
      : status === 'running'
        ? '...'
        : '.';

  return <span className={`step-icon ${status}`}>{label}</span>;
};

const handleActionKeyDown = (
  event: React.KeyboardEvent<HTMLDivElement>,
  handler: () => void,
): void => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  handler();
};

export const AgentMode: React.FC<AgentModeProps> = ({
  taskDescription,
  threadId,
  turnId,
  modelId,
  onExit,
}) => {
  const [turn, setTurn] = useState<AgentChatTurnSummary | null>(null);
  const [turnFrames, setTurnFrames] = useState<AgentChatTurnFrame[]>([]);
  const [pendingRequest, setPendingRequest] = useState<AgentChatServerRequest | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(true);
  const [isActivityExpanded, setIsActivityExpanded] = useState(true);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const loadSnapshot = useCallback(async (): Promise<void> => {
    const normalizedThreadId = threadId.trim();
    const normalizedTurnId = turnId.trim();

    if (!normalizedThreadId || !normalizedTurnId) {
      setTurn(null);
      setTurnFrames([]);
      setPendingRequest(null);
      setError('缺少 Agent 回合信息。');
      setIsSnapshotLoading(false);
      return;
    }

    setIsSnapshotLoading(true);
    setError(null);

    try {
      const snapshot = await agentChatService.getThread({ threadId: normalizedThreadId });
      const nextTurn = findTurnFromSnapshot(snapshot, normalizedTurnId);

      if (!nextTurn) {
        setTurn(null);
        setTurnFrames([]);
        setPendingRequest(null);
        setError('未找到对应的 Agent 回合。');
        return;
      }

      setTurn(nextTurn);
      setTurnFrames(getTurnFramesFromSnapshot(snapshot, normalizedTurnId));
      setPendingRequest(findPendingRequest(snapshot, normalizedTurnId));
      setAnswerInput('');
    } catch (snapshotError) {
      setError(snapshotError instanceof Error ? snapshotError.message : String(snapshotError));
    } finally {
      setIsSnapshotLoading(false);
    }
  }, [threadId, turnId]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    return agentChatService.onEvent(event => {
      if (event.method === 'turn/started' || event.method === 'turn/updated') {
        const summary = event.params.summary;
        if (summary.threadId === threadId && summary.id === turnId) {
          setTurn(summary);
          if (summary.status === 'completed' || summary.status === 'error' || summary.status === 'interrupted') {
            setPendingRequest(null);
            setIsSubmittingRequest(false);
          }
        }
        return;
      }

      if (event.method === 'turn/items/appended') {
        if (event.params.threadId === threadId && event.params.turnId === turnId) {
          const incomingFrames = event.params.frames && event.params.frames.length > 0
            ? event.params.frames
            : buildAgentChatTurnFrames(event.params.items);
          setTurnFrames(previous => mergeTurnFrames(previous, incomingFrames));
        }
        return;
      }

      if (event.method === 'request/queued') {
        const request = event.params.request;
        if (request.threadId === threadId && request.turnId === turnId) {
          setPendingRequest(request);
          setIsSubmittingRequest(false);
          if (request.kind === 'user_input') {
            setAnswerInput('');
          }
        }
        return;
      }

      if (event.method !== 'request/resolved') {
        return;
      }

      const request = event.params.request;
      if (request.threadId === threadId && request.turnId === turnId) {
        setPendingRequest(null);
        setIsSubmittingRequest(false);
        if (request.kind === 'user_input') {
          setAnswerInput('');
        }
      }
    });
  }, [threadId, turnId]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [turnFrames]);

  const output = useMemo(() => buildLatestTurnContent(turnFrames), [turnFrames]);

  const thinking = useMemo(() => (
    turnFrames
      .filter((frame): frame is Extract<AgentChatTurnFrame, { kind: 'reasoning_delta' }> => frame.kind === 'reasoning_delta')
      .map(frame => frame.text.trim())
      .filter(Boolean)
      .join('\n\n')
      .trim()
  ), [turnFrames]);

  const activityItems = useMemo(() => (
    turnFrames.filter(frame => (
      frame.kind !== 'assistant_delta'
      && frame.kind !== 'final_answer'
      && frame.kind !== 'reasoning_delta'
    ))
  ), [turnFrames]);

  const lastError = useMemo(() => {
    if (turn?.lastError?.trim()) {
      return turn.lastError.trim();
    }

    const errorFrame = [...turnFrames].reverse().find(frame =>
      frame.kind === 'error' && frame.text?.trim()
    );
    if (errorFrame?.text?.trim()) {
      return errorFrame.text.trim();
    }

    const failedToolFrame = [...turnFrames].reverse().find(
      (frame): frame is Extract<AgentChatTurnFrame, { kind: 'tool_finished' }> =>
        frame.kind === 'tool_finished' && !frame.success && frame.resultText.trim().length > 0
    );
    return failedToolFrame?.resultText.trim() ?? error;
  }, [error, turn, turnFrames]);

  const statusClassName = getStatusClassName(turn?.status);
  const statusText = getStatusText(turn?.status);
  const canInterrupt = turn?.status === 'running'
    || turn?.status === 'waiting_approval'
    || turn?.status === 'waiting_user_input';

  const handleInterrupt = useCallback(() => {
    if (!threadId.trim() || !turnId.trim()) {
      return;
    }

    void agentChatService.interruptTurn({
      threadId,
      turnId,
      reason: '用户中断',
    });
  }, [threadId, turnId]);

  const handleApproval = useCallback(async (approved: boolean): Promise<void> => {
    if (!pendingRequest || pendingRequest.kind !== 'approval') {
      return;
    }

    setIsSubmittingRequest(true);
    setError(null);

    try {
      await agentChatService.respondToRequest({
        threadId,
        requestId: pendingRequest.id,
        approved,
        nextTurnStatus: 'running',
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setIsSubmittingRequest(false);
    }
  }, [pendingRequest, threadId]);

  const handleSubmitAnswer = useCallback(async (submitAnswer: boolean): Promise<void> => {
    if (!pendingRequest || pendingRequest.kind !== 'user_input') {
      return;
    }

    const normalizedAnswer = answerInput.trim();
    if (submitAnswer && !normalizedAnswer) {
      setError('请先填写补充信息。');
      return;
    }

    setIsSubmittingRequest(true);
    setError(null);

    try {
      await agentChatService.respondToRequest({
        threadId,
        requestId: pendingRequest.id,
        answers: submitAnswer ? { answer: normalizedAnswer } : undefined,
        nextTurnStatus: 'running',
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setIsSubmittingRequest(false);
    }
  }, [answerInput, pendingRequest, threadId]);

  const requestQuestion = pendingRequest?.kind === 'user_input'
    ? (pendingRequest.questions[0]?.label?.trim() || '请补充必要信息')
    : '';
  const requestDescription = pendingRequest?.description?.trim() || '';

  return (
    <div className="agent-mode">
      <div className="agent-mode-header">
        <div className="agent-mode-title">
          <Icon name="robot" size={16} />
          <span>Agent 运行视图</span>
        </div>
        <div className="agent-mode-status">
          <span className={`status-dot ${statusClassName}`} />
          <span className="status-text">{isSnapshotLoading ? '加载中' : statusText}</span>
        </div>
        <div className="agent-mode-actions">
          {canInterrupt && (
            <div
              role="button"
              tabIndex={0}
              className="agent-mode-btn stop-btn"
              onClick={handleInterrupt}
              onKeyDown={(event) => handleActionKeyDown(event, handleInterrupt)}
              title="停止执行"
            >
              <Icon name="stop" size={14} />
            </div>
          )}
          <div
            role="button"
            tabIndex={0}
            className="agent-mode-btn close-btn"
            onClick={onExit}
            onKeyDown={(event) => handleActionKeyDown(event, onExit)}
            title="关闭运行视图"
          >
            <Icon name="close" size={14} />
          </div>
        </div>
      </div>

      <div className="agent-mode-task">
        <div className="task-label">任务:</div>
        <div className="task-description">{taskDescription || turn?.title || '未命名任务'}</div>
      </div>

      <div className="agent-mode-meta">
        <span>线程 {threadId}</span>
        <span>回合 {turnId}</span>
        <span>模型 {modelId || turn?.modelId || '未指定'}</span>
      </div>

      {pendingRequest?.kind === 'approval' && (
        <div className="agent-mode-confirmation">
          <div className="confirmation-message">{pendingRequest.description}</div>
          {pendingRequest.command && (
            <div className="confirmation-detail">{pendingRequest.command}</div>
          )}
          {pendingRequest.changedFiles && pendingRequest.changedFiles.length > 0 && (
            <div className="confirmation-detail">
              变更文件: {pendingRequest.changedFiles.join(', ')}
            </div>
          )}
          <div className="confirmation-actions">
            <div
              role="button"
              tabIndex={0}
              className={`confirm-btn reject ${isSubmittingRequest ? 'disabled' : ''}`}
              onClick={() => { void handleApproval(false); }}
              onKeyDown={(event) => handleActionKeyDown(event, () => { void handleApproval(false); })}
            >
              <Icon name="close" size={14} />
              拒绝
            </div>
            <div
              role="button"
              tabIndex={0}
              className={`confirm-btn accept ${isSubmittingRequest ? 'disabled' : ''}`}
              onClick={() => { void handleApproval(true); }}
              onKeyDown={(event) => handleActionKeyDown(event, () => { void handleApproval(true); })}
            >
              <Icon name="check" size={14} />
              允许
            </div>
          </div>
        </div>
      )}

      {pendingRequest?.kind === 'user_input' && (
        <div className="agent-mode-confirmation">
          <div className="confirmation-message">
            {pendingRequest.title?.trim() || '需要你的输入'}
          </div>
          <div className="confirmation-detail">{requestQuestion}</div>
          {requestDescription && (
            <div className="confirmation-detail">{requestDescription}</div>
          )}
          <textarea
            className="agent-mode-request-input"
            value={answerInput}
            onChange={(event) => setAnswerInput(event.target.value)}
            placeholder="请输入补充信息..."
          />
          <div className="confirmation-actions">
            <div
              role="button"
              tabIndex={0}
              className={`confirm-btn reject ${isSubmittingRequest ? 'disabled' : ''}`}
              onClick={() => { void handleSubmitAnswer(false); }}
              onKeyDown={(event) => handleActionKeyDown(event, () => { void handleSubmitAnswer(false); })}
            >
              <Icon name="close" size={14} />
              取消
            </div>
            <div
              role="button"
              tabIndex={0}
              className={`confirm-btn accept ${isSubmittingRequest ? 'disabled' : ''}`}
              onClick={() => { void handleSubmitAnswer(true); }}
              onKeyDown={(event) => handleActionKeyDown(event, () => { void handleSubmitAnswer(true); })}
            >
              <Icon name="check" size={14} />
              提交
            </div>
          </div>
        </div>
      )}

      {activityItems.length > 0 && (
        <div className="agent-mode-steps">
          <div
            className="steps-header"
            onClick={() => setIsActivityExpanded(previous => !previous)}
          >
            <span className={`expand-icon ${isActivityExpanded ? '' : 'collapsed'}`}>+</span>
            <span>执行活动</span>
            <span className="steps-count">{activityItems.length}</span>
          </div>
          {isActivityExpanded && (
            <div className="steps-list">
              {activityItems.map(frame => {
                const activityText = getActivityText(frame);
                const activityStatus = getActivityStatus(frame);
                return (
                  <div key={frame.id} className={`step-item ${activityStatus}`}>
                    <StepIcon status={activityStatus} />
                    <div className="step-content">
                      <span className="step-description">{getActivityTitle(frame)}</span>
                      {activityText && (
                        <span className="step-reason">{activityText}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {thinking && (
        <div className="agent-mode-thinking">
          <div
            className="thinking-header"
            onClick={() => setIsThinkingExpanded(previous => !previous)}
          >
            <span className={`expand-icon ${isThinkingExpanded ? '' : 'collapsed'}`}>+</span>
            <span>思考过程</span>
          </div>
          {isThinkingExpanded && (
            <div className="thinking-content">{thinking}</div>
          )}
        </div>
      )}

      <div className="agent-mode-output" ref={outputRef}>
        {output ? (
          <div className="output-content">{output}</div>
        ) : (
          <div className="output-placeholder">
            {isSnapshotLoading ? '正在加载回合详情...' : '等待 Agent 输出...'}
          </div>
        )}
      </div>

      {lastError && (
        <div className="agent-mode-error">
          <Icon name="error" size={14} />
          <span>{lastError}</span>
        </div>
      )}
    </div>
  );
};

export default AgentMode;
