/**
 * Parallel multi-agent orchestrator for decomposing a task into subtasks and
 * merging the results.
 */

import type {
  AgentSubtaskDefinition,
  AgentSubtaskResult,
  MultiAgentWorkflowResult,
  RunMultiAgentWorkflowInput,
} from './types';

const normalizeConcurrency = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
};

const buildDefaultMergedOutput = (results: AgentSubtaskResult[]): string => results
  .map(result => [
    `## ${result.title}`,
    result.success ? result.output.trim() : `FAILED: ${result.error || 'unknown error'}`,
  ].join('\n'))
  .join('\n\n')
  .trim();

const buildCompletedResult = (
  subtask: AgentSubtaskDefinition,
  startedAt: number,
  result: Omit<AgentSubtaskResult, 'startedAt' | 'completedAt' | 'title' | 'task'>,
): AgentSubtaskResult => ({
  ...result,
  id: subtask.id,
  title: subtask.title,
  task: subtask.task,
  startedAt,
  completedAt: Date.now(),
});

export const runMultiAgentWorkflow = async (
  input: RunMultiAgentWorkflowInput,
): Promise<MultiAgentWorkflowResult> => {
  const subtasks = input.plan.subtasks.slice();
  const maxConcurrency = Math.min(subtasks.length || 1, normalizeConcurrency(input.maxConcurrency, 3));
  const callbacks = input.callbacks ?? {};
  const results: AgentSubtaskResult[] = [];
  let cursor = 0;

  const runNext = async (): Promise<void> => {
    const nextIndex = cursor;
    cursor += 1;
    if (nextIndex >= subtasks.length) {
      return;
    }

    const subtask = subtasks[nextIndex];
    const startedAt = Date.now();
    await callbacks.onSubtaskStart?.(subtask);
    const result = await (async (): Promise<AgentSubtaskResult> => {
      try {
        return buildCompletedResult(
          subtask,
          startedAt,
          await input.runSubtask(subtask),
        );
      } catch (error) {
        return {
          id: subtask.id,
          title: subtask.title,
          task: subtask.task,
          success: false,
          output: '',
          error: error instanceof Error ? error.message : String(error),
          startedAt,
          completedAt: Date.now(),
          metadata: subtask.metadata,
        };
      }
    })();

    results.push(result);
    await callbacks.onSubtaskFinish?.(result);
    await runNext();
  };

  await Promise.all(
    Array.from({ length: maxConcurrency }, () => runNext()),
  );

  results.sort((left, right) => (
    subtasks.findIndex(item => item.id === left.id) - subtasks.findIndex(item => item.id === right.id)
  ));

  const mergedOutput = (input.mergeResults
    ? await input.mergeResults(results)
    : buildDefaultMergedOutput(results)).trim();

  return {
    plan: input.plan,
    results,
    mergedOutput,
  };
};
