/**
 * Plugin host entry for WStudio Plugin Starter.
 * Registers the starter command and opens the styled webview panel.
 */

module.exports = {
  async activate(context) {
    const commandDisposable = context.commands.register('local.wstudio-plugin-starter.open-panel', async () => {
      const configuredTitle = await context.settings.get('panelTitle');
      const resolvedTitle = typeof configuredTitle === 'string' && configuredTitle.trim().length > 0
        ? configuredTitle
        : 'WStudio Plugin Starter Panel';

      const panel = await context.webview.createPanel(
        'local.wstudio-plugin-starter.panel',
        resolvedTitle,
      );
      const panelDisposable = panel.onMessage(async (message) => {
        const payload = message && typeof message === 'object' && !Array.isArray(message)
          ? message
          : null;
        const action = payload && typeof payload.action === 'string'
          ? payload.action
          : 'unknown';

        if (action === 'request-starter-state') {
          await panel.postMessage({
            type: 'starter-state',
            title: resolvedTitle,
            assetPath: '../assets/plugin-icon.svg',
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
