/**
 * TypeScript host entry for the WStudio plugin starter.
 * Builds into scripts/main.cjs for the plugin runtime.
 */

import type {
  ExtensionPlugin,
  ExtensionContext,
  JsonObject,
  JsonValue,
} from '@note-studio/extension-api';

const COMMAND_ID = 'local.wstudio-plugin-starter.open-panel';
const PANEL_ID = 'local.wstudio-plugin-starter.panel';
const DEFAULT_PANEL_TITLE = 'WStudio Plugin Starter Panel';
const DEFAULT_ASSET_PATH = '../assets/plugin-icon.svg';

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === 'object';
}

function resolveMessageAction(message: JsonValue): string {
  if (!isJsonObject(message)) {
    return 'unknown';
  }

  const actionValue = message.action;
  return typeof actionValue === 'string' ? actionValue : 'unknown';
}

const plugin: ExtensionPlugin = {
  async activate(context: ExtensionContext): Promise<void> {
    const commandDisposable = context.commands.register(COMMAND_ID, async () => {
      const configuredTitle = await context.settings.get('panelTitle');
      const resolvedTitle = typeof configuredTitle === 'string' && configuredTitle.trim().length > 0
        ? configuredTitle
        : DEFAULT_PANEL_TITLE;

      const panel = await context.webview.createPanel(PANEL_ID, resolvedTitle);
      const panelDisposable = panel.onMessage(async (message) => {
        const action = resolveMessageAction(message);

        if (action === 'request-starter-state') {
          await panel.postMessage({
            type: 'starter-state',
            title: resolvedTitle,
            assetPath: DEFAULT_ASSET_PATH,
            sentAt: new Date().toISOString(),
          });
          return;
        }

        await panel.postMessage({
          type: 'plugin-response',
          action,
          receivedAt: new Date().toISOString(),
          originalMessage: message,
        });
      });

      context.subscriptions.push(panelDisposable);

      await panel.postMessage({
        type: 'plugin-ready',
        title: resolvedTitle,
        message: 'Starter panel is ready.',
        sentAt: new Date().toISOString(),
      });

      await panel.reveal();
    });

    context.subscriptions.push(commandDisposable);
  },
};

module.exports = plugin;
