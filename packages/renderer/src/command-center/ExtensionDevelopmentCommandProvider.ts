/**
 * 插件开发命令提供器。
 */

import type { VSCodeCommandCenter } from './VSCodeCommandCenter';
import type { Command } from './CommandTypes';
import { notification } from '../components/Notification';
import { extensionDevelopmentService } from '../services/ExtensionDevelopmentService';

export class ExtensionDevelopmentCommandProvider {
  private readonly commandCenter: VSCodeCommandCenter;

  public constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    this.registerCommands();
  }

  private registerCommands(): void {
    const commands: Command[] = [
      {
        id: 'development.reloadPlugins',
        label: '开发: 重新加载插件',
        description: '重新扫描插件目录并重新加载插件宿主',
        category: '开发',
        execute: async () => {
          try {
            const result = await extensionDevelopmentService.reloadPlugins();

            if (result.failureCount > 0) {
              const firstFailure = result.failures[0];
              const failureDetail = firstFailure
                ? ` 首个扫描失败: ${firstFailure.message}`
                : '';

              notification.warning(
                `插件已重新加载：扫描到 ${result.registeredCount} 个，启用 ${result.enabledCount} 个，扫描失败 ${result.failureCount} 个。${failureDetail}`,
              );
              return;
            }

            if (result.disabledCount > 0) {
              const firstDisabled = result.disabledPlugins[0];
              const failureDetail = firstDisabled?.message
                ? ` 首个未启用原因: ${firstDisabled.message}`
                : '';
              notification.warning(
                `插件已重新加载：扫描到 ${result.registeredCount} 个，启用 ${result.enabledCount} 个，未启用 ${result.disabledCount} 个。${failureDetail}`,
              );
              return;
            }

            notification.success(
              `插件已重新加载：扫描到 ${result.registeredCount} 个，已全部启用。`,
            );
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
