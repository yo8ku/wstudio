/**
 * Type contracts for multi-agent orchestration workflows.
 */

export interface AgentSubtaskDefinition {
  id: string;
  title: string;
  task: string;
  role?: string;
  maxIterations?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentSubtaskResult {
  id: string;
  title: string;
  task: string;
  success: boolean;
  output: string;
  error?: string;
  startedAt: number;
  completedAt: number;
  metadata?: Record<string, unknown>;
}

export interface MultiAgentPlan {
  id: string;
  title: string;
  subtasks: AgentSubtaskDefinition[];
}

export interface MultiAgentCallbacks {
  onSubtaskStart?: (subtask: AgentSubtaskDefinition) => Promise<void> | void;
  onSubtaskFinish?: (result: AgentSubtaskResult) => Promise<void> | void;
}

export interface RunMultiAgentWorkflowInput {
  plan: MultiAgentPlan;
  maxConcurrency?: number;
  runSubtask: (subtask: AgentSubtaskDefinition) => Promise<Omit<AgentSubtaskResult, 'startedAt' | 'completedAt' | 'title' | 'task'>>;
  mergeResults?: (results: AgentSubtaskResult[]) => Promise<string> | string;
  callbacks?: MultiAgentCallbacks;
}

export interface MultiAgentWorkflowResult {
  plan: MultiAgentPlan;
  results: AgentSubtaskResult[];
  mergedOutput: string;
}
