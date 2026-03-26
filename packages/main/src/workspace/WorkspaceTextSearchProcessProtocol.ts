/**
 * Defines IPC payloads exchanged between the workspace search session manager and child process.
 */

import type {
  WorkspaceTextSearchBatch,
  WorkspaceTextSearchGroupCount,
  WorkspaceTextSearchRequest,
  WorkspaceTextSearchTarget,
} from './WorkspaceTextSearchService';

export interface WorkspaceTextSearchProcessStartMessage {
  type: 'start';
  workspaceDirectory: string;
  request: WorkspaceTextSearchRequest;
  additionalTargets: WorkspaceTextSearchTarget[];
  batchSize: number;
}

export interface WorkspaceTextSearchProcessBatchMessage {
  type: 'batch';
  batch: WorkspaceTextSearchBatch;
}

export interface WorkspaceTextSearchProcessCompleteMessage {
  type: 'complete';
  groupCounts: WorkspaceTextSearchGroupCount[];
  limitHit: boolean;
  totalCount: number;
  totalFiles: number;
}

export interface WorkspaceTextSearchProcessErrorMessage {
  type: 'error';
  error: string;
}

export type WorkspaceTextSearchProcessParentMessage =
  | WorkspaceTextSearchProcessStartMessage;

export type WorkspaceTextSearchProcessChildMessage =
  | WorkspaceTextSearchProcessBatchMessage
  | WorkspaceTextSearchProcessCompleteMessage
  | WorkspaceTextSearchProcessErrorMessage;
