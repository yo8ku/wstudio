/**
 * Workbench contribution 读取与执行服务。
 */

import {
  type DeliverWorkbenchWebviewMessageRequest,
  type DisposeWorkbenchWebviewPanelRequest,
  EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT,
  type ExecuteWorkbenchCommandRequest,
  type JsonValue,
  type WorkbenchCommandExecutionResponse,
  type WorkbenchContributionListResponse,
  type WorkbenchContributionSnapshot,
  type WorkbenchWebviewMessageEnvelope,
  type WorkbenchWebviewMutationResponse,
} from '@note-studio/shared';

const WORKBENCH_CONTRIBUTION_CHANGED_CHANNEL = 'extensions:workbench:contributions-changed';
const WORKBENCH_WEBVIEW_MESSAGE_CHANNEL = 'extensions:workbench:webview:message';

class WorkbenchContributionService {
  public async getContributions(): Promise<WorkbenchContributionSnapshot> {
    const response: WorkbenchContributionListResponse | undefined =
      await window.electron?.ipcRenderer.invoke('extensions:workbench:get-contributions');

    if (!response) {
      return EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT;
    }

    if (!response.success || !response.data) {
      throw new Error(response.error?.message ?? '读取 workbench 插件贡献失败');
    }

    return response.data;
  }

  public subscribe(
    listener: (snapshot: WorkbenchContributionSnapshot) => void,
  ): () => void {
    const unsubscribe = window.electron?.ipcRenderer.on(
      WORKBENCH_CONTRIBUTION_CHANGED_CHANNEL,
      (_event: object, snapshot: WorkbenchContributionSnapshot) => {
        listener(snapshot);
      },
    );

    return unsubscribe ?? (() => undefined);
  }

  public async executeCommand(
    request: ExecuteWorkbenchCommandRequest,
  ): Promise<JsonValue | null> {
    const response: WorkbenchCommandExecutionResponse | undefined =
      await window.electron?.ipcRenderer.invoke('extensions:workbench:execute-command', request);

    if (!response) {
      throw new Error('执行插件命令时没有收到宿主响应');
    }

    if (!response.success) {
      throw new Error(response.error?.message ?? '执行插件命令失败');
    }

    return response.data ?? null;
  }

  public onWebviewMessage(
    listener: (payload: WorkbenchWebviewMessageEnvelope) => void,
  ): () => void {
    const unsubscribe = window.electron?.ipcRenderer.on(
      WORKBENCH_WEBVIEW_MESSAGE_CHANNEL,
      (_event: object, payload: WorkbenchWebviewMessageEnvelope) => {
        listener(payload);
      },
    );

    return unsubscribe ?? (() => undefined);
  }

  public async postWebviewMessage(
    request: DeliverWorkbenchWebviewMessageRequest,
  ): Promise<void> {
    const response: WorkbenchWebviewMutationResponse | undefined =
      await window.electron?.ipcRenderer.invoke('extensions:workbench:webview:post-message', request);

    if (!response) {
      throw new Error('向插件 webview 面板转发消息时没有收到宿主响应');
    }

    if (!response.success) {
      throw new Error(response.error?.message ?? '插件 webview 面板消息转发失败');
    }
  }

  public async disposeWebviewPanel(
    request: DisposeWorkbenchWebviewPanelRequest,
  ): Promise<void> {
    const response: WorkbenchWebviewMutationResponse | undefined =
      await window.electron?.ipcRenderer.invoke('extensions:workbench:webview:dispose-panel', request);

    if (!response) {
      throw new Error('关闭插件 webview 面板时没有收到宿主响应');
    }

    if (!response.success) {
      throw new Error(response.error?.message ?? '关闭插件 webview 面板失败');
    }
  }
}

export const workbenchContributionService = new WorkbenchContributionService();
