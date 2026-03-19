/**
 * AI panel "/" 面板插件 contribution 读取与执行服务。
 */

import {
  EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT,
  type AIPanelContributionExecutionResponse,
  type AIPanelContributionListResponse,
  type AIPanelContributionSnapshot,
  type ExecuteAIPanelContributionRequest,
} from '@note-studio/shared';

class AIPanelContributionService {
  public async getContributions(): Promise<AIPanelContributionSnapshot> {
    const response: AIPanelContributionListResponse | undefined =
      await window.electron?.ipcRenderer.invoke('extensions:ai-panel:get-contributions');

    if (!response) {
      return EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT;
    }

    if (!response.success || !response.data) {
      throw new Error(response.error?.message ?? '读取 AI panel 插件贡献失败');
    }

    return response.data;
  }

  public async executeItem(
    request: ExecuteAIPanelContributionRequest,
  ): Promise<AIPanelContributionExecutionResponse> {
    const response: AIPanelContributionExecutionResponse | undefined =
      await window.electron?.ipcRenderer.invoke('extensions:ai-panel:execute-item', request);

    if (!response) {
      return {
        success: false,
        error: {
          code: 'AI_PANEL_EXECUTION_NO_RESPONSE',
          message: 'AI panel 插件执行没有收到宿主响应',
        },
      };
    }

    return response;
  }
}

export const aiPanelContributionService = new AIPanelContributionService();
