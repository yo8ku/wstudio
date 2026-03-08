/**
 * IPC bridge for the first-phase agent chat runtime living in main.
 */

import { BrowserWindow, ipcMain } from 'electron';
import type {
  AgentChatAppendTurnItemsInput,
  AgentChatCreateApprovalRequestInput,
  AgentChatCreateUserInputRequestInput,
  AgentChatGetThreadInput,
  AgentChatInterruptTurnInput,
  AgentChatListThreadsInput,
  AgentChatRunTurnInput,
  AgentChatRespondToRequestInput,
  AgentChatResumeTurnInput,
  AgentChatStartThreadInput,
  AgentChatStartTurnInput,
  AgentChatSyncLegacySessionInput,
  AgentChatUpdateTurnInput,
} from '@note-studio/shared';
import { agentChatRuntime } from '../services/agent-chat/AgentChatRuntime';
import { mainAgentRuntime } from '../services/agent-chat/MainAgentRuntime';

let detachRuntimeListener: (() => void) | null = null;

function broadcastAgentChatEvent(event: unknown): void {
  const windows = BrowserWindow.getAllWindows();
  for (const window of windows) {
    window.webContents.send('agent-chat:event', event);
  }
}

export function registerAgentChatHandlers(): void {
  const handlersToRemove = [
    'agent-chat:thread:start',
    'agent-chat:thread:list',
    'agent-chat:thread:get',
    'agent-chat:thread:sync-legacy-session',
    'agent-chat:turn:start',
    'agent-chat:turn:update',
    'agent-chat:turn:append-items',
    'agent-chat:turn:run',
    'agent-chat:turn:interrupt',
    'agent-chat:turn:resume',
    'agent-chat:request:create-approval',
    'agent-chat:request:create-user-input',
    'agent-chat:request:respond',
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch {
      // Ignore missing handlers.
    }
  }

  if (!detachRuntimeListener) {
    detachRuntimeListener = agentChatRuntime.onEvent(event => {
      broadcastAgentChatEvent(event);
    });
  }

  ipcMain.handle(
    'agent-chat:thread:start',
    async (_event, input?: AgentChatStartThreadInput) => {
      try {
        return { success: true, data: agentChatRuntime.startThread(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:thread:list',
    async (_event, input?: AgentChatListThreadsInput) => {
      try {
        return { success: true, data: agentChatRuntime.listThreads(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:thread:get',
    async (_event, input: AgentChatGetThreadInput) => {
      try {
        return { success: true, data: agentChatRuntime.getThreadSnapshot(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:thread:sync-legacy-session',
    async (_event, input: AgentChatSyncLegacySessionInput) => {
      try {
        return { success: true, data: agentChatRuntime.syncLegacySession(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:turn:start',
    async (_event, input: AgentChatStartTurnInput) => {
      try {
        return { success: true, data: agentChatRuntime.startTurn(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:turn:update',
    async (_event, input: AgentChatUpdateTurnInput) => {
      try {
        return { success: true, data: agentChatRuntime.updateTurn(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:turn:append-items',
    async (_event, input: AgentChatAppendTurnItemsInput) => {
      try {
        return { success: true, data: agentChatRuntime.appendTurnItems(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:turn:run',
    async (_event, input: AgentChatRunTurnInput) => {
      try {
        return { success: true, data: await mainAgentRuntime.runTurn(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:request:create-approval',
    async (_event, input: AgentChatCreateApprovalRequestInput) => {
      try {
        return { success: true, data: agentChatRuntime.createApprovalRequest(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:request:create-user-input',
    async (_event, input: AgentChatCreateUserInputRequestInput) => {
      try {
        return { success: true, data: agentChatRuntime.createUserInputRequest(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:request:respond',
    async (_event, input: AgentChatRespondToRequestInput) => {
      try {
        return { success: true, data: agentChatRuntime.respondToRequest(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:turn:interrupt',
    async (_event, input: AgentChatInterruptTurnInput) => {
      try {
        return { success: true, data: agentChatRuntime.interruptTurn(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'agent-chat:turn:resume',
    async (_event, input: AgentChatResumeTurnInput) => {
      try {
        return { success: true, data: mainAgentRuntime.resumeTurn(input) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  console.log('[AgentChat] handlers registered');
}
