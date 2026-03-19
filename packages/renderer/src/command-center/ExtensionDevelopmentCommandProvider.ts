/**
 * 插件开发命令提供器。
 */

import type { VSCodeCommandCenter } from './VSCodeCommandCenter';
import type { Command } from './CommandTypes';
import { notification } from '../components/Notification';
import { extensionDevelopmentService } from '../services/ExtensionDevelopmentService';

export class ExtensionDevelopmentCommandProvider {
  private readonly commandCenter: VSCodeCommandCenter;

  constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    this.registerCommands();
  }

  private registerCommands(): void {
    const commands: Command[] = [
      {
        id: 'development.reloadPlugins',
        label: '开发: 重新加载插件',
        description: '重新扫描插件目录并重启已激活的插件宿主',
        category: '开发',
        execute: async () => {
          try {
            const result = await extensionDevelopmentService.reloadPlugins();
            if (result.failureCount > 0) {
              const firstFailure = result.failures[0];
              const failureDetail = firstFailure
                ? ` 首个失败: ${firstFailure.message}`
                : '';
              notification.warning(
                `插件已重新加载：${result.registeredCount} 个成功，${result.failureCount} 个失败。${failureDetail}`,
              );
              return;
            }

            notification.success(`插件已重新加载：共发现 ${result.registeredCount} 个插件。`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[ExtensionDevelopmentCommandProvider] 重新加载插件失败:', error);
            notification.error(`重新加载插件失败: ${message}`);
          }
        },
      },
    ];

    this.commandCenter.registerCommands(commands);
  }
}
