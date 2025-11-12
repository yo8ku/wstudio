/**
 * AI 配置命令提供 * 功能：提交AI 模型配置选择和管理的命令
 * 描述：在命令中心中显示所AI 配置，支持快速切换和打开配置页面
 */

import { VSCodeCommandCenter } from './VSCodeCommandCenter';
import type { Command, CommandMode } from './CommandTypes';

export class AIConfigCommandProvider {
  private commandCenter: VSCodeCommandCenter;

  constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    this.registerMode();
  }

  private registerMode(): void {
    // 注册 AI 配置选择模式
    const aiConfigMode: CommandMode = {
      prefix: '@ai',
      name: 'AI 配置',
      placeholder: '选择要打开发AI 配置...',
      icon: 'sparkle',
      provider: async (query: string) => {
        try {
          // 获取所AI 配置
    const configs = await window.electron?.ipcRenderer.invoke('ai-model:list') || [];
          
    if (configs.length === 0) {
            return [{
              id: 'no-config',
              label: '没有可用！AI 配置',
              description: '请先在侧边栏添加 AI 模型配置',
              icon: 'info',
              value: null
            }];
          }

          // 过滤和转换为命令
    const items = configs
            .map((config: any, index: number) => {
              return {
                id: `ai-config-${index}`,
                label: config.name || `配置 ${index + 1}`,
                icon: 'settings-gear',
                value: index
              };
            })
            .filter((item: any) => {
              if (!query) return true;
              const searchText = query.toLowerCase();
              return item.label.toLowerCase().includes(searchText);
            });

    return items;
        } catch (error) {
          console.error('[AIConfigCommandProvider] 获取配置失败:', error);
    return [{
            id: 'error',
            label: '加载配置失败',
            description: '请稍后重试',
            icon: 'error',
            value: null
          }];
        }
      }
    };

    this.commandCenter.registerMode(aiConfigMode);
  }

  /**
   * 打开指定索引AI 配置
   */
  public static openAIConfig(configIndex: number): void {
    window.dispatchEvent(new CustomEvent('open-ai-config', {
      detail: { configIndex }
    }));
  }

  /**
   * 显示 AI 配置选择   */
  public static async showAIConfigSelector(): Promise<void> {
    const commandCenter = (window as any).__commandCenter;
    if (!commandCenter) {
      console.error('[AIConfigCommandProvider] 命令中心未初始化');
      return;
    }

    try {
      // 获取所有配置
    const configs = await window.electron?.ipcRenderer.invoke('ai-model:list') || [];
      
      if (configs.length === 0) {
        // 没有配置，直接打开配置页面
        console.log('[AIConfigCommandProvider] 没有配置，打开新建配置页面');
        window.dispatchEvent(new CustomEvent('open-ai-config'));
        return;
      }

      if (configs.length === 1) {
        // 只有一个配置，直接打开
        console.log('[AIConfigCommandProvider] 只有一个配置，直接打开');
        this.openAIConfig(0);
        return;
      }

      // 多个配置，显示命令中心选择
      console.log('[AIConfigCommandProvider] 多个配置，显示命令中);');
      await commandCenter.show('@ai');
      
      // 监听命令执行（选择配置后打开发
    const handleCommandExecute = (event: Event) => {
        const customEvent = event as CustomEvent;
        const item = customEvent.detail;
        
        if (item.id.startsWith('ai-config-') && item.value !== null && item.value !== undefined) {
          console.log('[AIConfigCommandProvider] 打开配置:', item.label, '索引:', item.value);
          this.openAIConfig(item.value);
        }
        
        // 移除监听        window.removeEventListener('command-executed', handleCommandExecute);
      };
      
      window.addEventListener('command-executed', handleCommandExecute);
    } catch (error) {
      console.error('[AIConfigCommandProvider] 显示配置选择器失败', error);
    }
  }
}

