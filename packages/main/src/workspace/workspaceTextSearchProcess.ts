/**
 * Runs workspace text search in a separate Node child process and streams batches back to main.
 */

import {
  streamWorkspaceTextSearch,
  type WorkspaceTextSearchBatch,
} from './WorkspaceTextSearchService';
import type {
  WorkspaceTextSearchProcessChildMessage,
  WorkspaceTextSearchProcessParentMessage,
} from './WorkspaceTextSearchProcessProtocol';

const sendProcessMessage = (message: WorkspaceTextSearchProcessChildMessage): void => {
  if (!process.send) {
    return;
  }

  process.send(message);
};

const sendProcessMessageAndWait = async (
  message: WorkspaceTextSearchProcessChildMessage,
): Promise<void> => new Promise((resolve, reject) => {
  if (!process.send) {
    resolve();
    return;
  }

  process.send(message, (error: Error | null) => {
    if (error) {
      reject(error);
      return;
    }

    resolve();
  });
});

const sendBatchMessage = (batch: WorkspaceTextSearchBatch): void => {
  sendProcessMessage({
    type: 'batch',
    batch,
  });
};

const sendCompleteMessage = async (payload: Omit<
  Extract<WorkspaceTextSearchProcessChildMessage, { type: 'complete' }>,
  'type'
>): Promise<void> => {
  await sendProcessMessageAndWait({
    type: 'complete',
    ...payload,
  });
};

const sendErrorMessage = async (error: string): Promise<void> => {
  await sendProcessMessageAndWait({
    type: 'error',
    error,
  });
};

const handleStartMessage = async (
  message: WorkspaceTextSearchProcessParentMessage,
): Promise<void> => {
  try {
    const response = await streamWorkspaceTextSearch(
      message.workspaceDirectory,
      message.request,
      message.additionalTargets,
      {
        batchSize: message.batchSize,
        onItemsBatch: sendBatchMessage,
      },
    );

    await sendCompleteMessage({
      groupCounts: response.groupCounts,
      limitHit: response.limitHit,
      totalCount: response.totalCount,
      totalFiles: response.totalFiles,
    });
  } catch (error) {
    await sendErrorMessage(
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (process.connected) {
      process.disconnect();
    }
  }
};

process.on('message', (message: WorkspaceTextSearchProcessParentMessage) => {
  if (!message || message.type !== 'start') {
    return;
  }

  void handleStartMessage(message);
});
