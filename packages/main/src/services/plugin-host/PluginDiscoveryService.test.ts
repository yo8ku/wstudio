import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const electronAppMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  getAppPath: vi.fn(),
}));

vi.mock('electron', () => ({
  app: electronAppMock,
}));

import { PluginDiscoveryService } from './PluginDiscoveryService';

interface TestPluginDefinition {
  readonly id: string;
  readonly iconPath: string;
  readonly iconFilePath: string;
  readonly ui?: {
    readonly views?: Readonly<Record<string, string>>;
    readonly settings?: string;
    readonly modals?: Readonly<Record<string, string>>;
  };
  readonly extraFiles?: Readonly<Record<string, string>>;
}

async function createPlugin(rootPath: string, definition: TestPluginDefinition): Promise<string> {
  return createPluginInRoot(rootPath, 'plugins', definition);
}

async function createPluginInRoot(
  rootPath: string,
  pluginRootDirectoryName: string,
  definition: TestPluginDefinition,
  directoryName = definition.id,
): Promise<string> {
  const pluginDirectory = path.join(rootPath, pluginRootDirectoryName, directoryName);
  const manifestPath = path.join(pluginDirectory, 'manifest.json');
  const entryPath = path.join(pluginDirectory, 'main.js');
  const absoluteIconPath = path.join(pluginDirectory, definition.iconFilePath);

  await mkdir(path.dirname(absoluteIconPath), { recursive: true });
  await writeFile(entryPath, 'module.exports = class TestPlugin {};', 'utf8');
  await writeFile(absoluteIconPath, '', 'utf8');

  for (const [relativePath, content] of Object.entries(definition.extraFiles ?? {})) {
    const absolutePath = path.join(pluginDirectory, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf8');
  }

  await writeFile(
    manifestPath,
    JSON.stringify({
      id: definition.id,
      name: definition.id,
      author: 'Test',
      version: '1.0.0',
      description: 'Plugin discovery test plugin.',
      icon: definition.iconPath,
      engines: {
        wstudio: '>=1.0.0',
      },
      ui: definition.ui,
    }, null, 2),
    'utf8',
  );

  return pluginDirectory;
}

describe('PluginDiscoveryService plugin logo validation', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'wstudio-plugin-discovery-'));
    electronAppMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return tempRoot;
      }

      throw new Error(`Unexpected electron app path request: ${name}`);
    });
    electronAppMock.getAppPath.mockReturnValue(tempRoot);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    delete process.env.WSTUDIO_PLUGIN_ROOTS;
    delete process.env.WSTUDIO_DEVELOPMENT_EXAMPLE_PLUGIN_ROOT;
    delete process.env.WSTUDIO_DEVELOPMENT_EXAMPLE_PLUGIN_IDS;
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('rejects plugins whose manifest.icon is not an image asset', async () => {
    const pluginDirectory = await createPlugin(tempRoot, {
      id: 'invalid-plugin-icon',
      iconPath: 'assets/logo.txt',
      iconFilePath: 'assets/logo.txt',
    });
    const service = new PluginDiscoveryService();

    const summary = await service.reload();

    expect(service.getById('invalid-plugin-icon')).toBeUndefined();
    expect(summary.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rootDirectory: pluginDirectory,
        code: 'invalid_plugin_icon',
        message: 'manifest.icon must point to an image asset (.png, .jpg, .jpeg, .webp, .gif, .bmp, or .svg).',
      }),
    ]));
  });

  it('accepts plugins whose manifest.icon points to an image asset', async () => {
    const pluginDirectory = await createPlugin(tempRoot, {
      id: 'valid-plugin-icon',
      iconPath: 'assets/logo.png',
      iconFilePath: 'assets/logo.png',
    });
    const service = new PluginDiscoveryService();

    const summary = await service.reload();
    const descriptor = service.getById('valid-plugin-icon');

    expect(descriptor?.iconPath).toBe(path.join(pluginDirectory, 'assets', 'logo.png'));
    expect(summary.failures.some((failure) => failure.rootDirectory === pluginDirectory)).toBe(false);
  });

  it('resolves declared plugin ui entrypoints inside the plugin root', async () => {
    const pluginDirectory = await createPlugin(tempRoot, {
      id: 'plugin-ui-entrypoints',
      iconPath: 'assets/logo.png',
      iconFilePath: 'assets/logo.png',
      ui: {
        views: {
          'demo-view': 'dist/ui/views/demo-view.js',
        },
        settings: 'dist/ui/settings.js',
        modals: {
          'demo-modal': 'dist/ui/modals/demo-modal.js',
        },
      },
      extraFiles: {
        'dist/ui/views/demo-view.js': 'export {};',
        'dist/ui/settings.js': 'export {};',
        'dist/ui/modals/demo-modal.js': 'export {};',
      },
    });
    const service = new PluginDiscoveryService();

    const summary = await service.reload();
    const descriptor = service.getById('plugin-ui-entrypoints');

    expect(summary.failures.some((failure) => failure.rootDirectory === pluginDirectory)).toBe(false);
    expect(descriptor?.uiEntrypoints).toEqual({
      views: {
        'demo-view': path.join(pluginDirectory, 'dist', 'ui', 'views', 'demo-view.js'),
      },
      settings: path.join(pluginDirectory, 'dist', 'ui', 'settings.js'),
      modals: {
        'demo-modal': path.join(pluginDirectory, 'dist', 'ui', 'modals', 'demo-modal.js'),
      },
    });
  });

  it('rejects plugin ui entrypoints that escape the plugin root', async () => {
    const pluginDirectory = await createPlugin(tempRoot, {
      id: 'plugin-ui-escape',
      iconPath: 'assets/logo.png',
      iconFilePath: 'assets/logo.png',
      ui: {
        views: {
          'demo-view': '../outside.js',
        },
      },
    });
    const service = new PluginDiscoveryService();

    const summary = await service.reload();

    expect(service.getById('plugin-ui-escape')).toBeUndefined();
    expect(summary.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rootDirectory: pluginDirectory,
        code: 'invalid_ui_entrypoint',
        message: 'ui.views["demo-view"] points to a missing or out-of-root entry file.',
      }),
    ]));
  });

  it('only loads allowlisted development example plugins', async () => {
    process.env.WSTUDIO_DEVELOPMENT_EXAMPLE_PLUGIN_ROOT = path.join(tempRoot, 'examples-plugins');
    process.env.WSTUDIO_DEVELOPMENT_EXAMPLE_PLUGIN_IDS = 'allowed-example-plugin';

    await createPluginInRoot(tempRoot, 'examples-plugins', {
      id: 'allowed-example-plugin',
      iconPath: 'assets/logo.png',
      iconFilePath: 'assets/logo.png',
    }, 'allowed-example-plugin ✅');
    await createPluginInRoot(tempRoot, 'examples-plugins', {
      id: 'blocked-example-plugin',
      iconPath: 'assets/logo.png',
      iconFilePath: 'assets/logo.png',
    }, 'blocked-example-plugin ✅');

    const service = new PluginDiscoveryService();
    await service.reload();

    expect(service.getById('allowed-example-plugin')).toBeDefined();
    expect(service.getById('blocked-example-plugin')).toBeUndefined();
  });

  it('does not load development example plugins by default', async () => {
    process.env.WSTUDIO_DEVELOPMENT_EXAMPLE_PLUGIN_ROOT = path.join(tempRoot, 'examples-plugins');

    await createPluginInRoot(tempRoot, 'examples-plugins', {
      id: 'wstudio-plugin-demo-view-workspace',
      iconPath: 'assets/logo.png',
      iconFilePath: 'assets/logo.png',
    }, 'wstudio-plugin-demo-view-workspace ✅');
    await createPluginInRoot(tempRoot, 'examples-plugins', {
      id: 'wstudio-plugin-demo-command-notice-modal',
      iconPath: 'assets/logo.png',
      iconFilePath: 'assets/logo.png',
    }, 'wstudio-plugin-demo-command-notice-modal ✅');

    const service = new PluginDiscoveryService();
    await service.reload();

    expect(service.getById('wstudio-plugin-demo-view-workspace')).toBeUndefined();
    expect(service.getById('wstudio-plugin-demo-command-notice-modal')).toBeUndefined();
  });

  it('allows selected local demo plugins from the user plugin root while keeping other demos blocked', async () => {
    const editorSuggestDirectory = await createPlugin(tempRoot, {
      id: 'wstudio-plugin-demo-editor-suggest',
      iconPath: 'assets/logo.png',
      iconFilePath: 'assets/logo.png',
    });
    const fileIconsDirectory = await createPlugin(tempRoot, {
      id: 'wstudio-plugin-demo-file-icons-simple',
      iconPath: 'assets/logo.png',
      iconFilePath: 'assets/logo.png',
    });
    const canvasHostDirectory = await createPlugin(tempRoot, {
      id: 'wstudio-plugin-demo-canvas-host',
      iconPath: 'assets/logo.png',
      iconFilePath: 'assets/logo.png',
    });
    await createPlugin(tempRoot, {
      id: 'wstudio-plugin-demo-legacy-rich-ui',
      iconPath: 'assets/logo.png',
      iconFilePath: 'assets/logo.png',
    });

    const service = new PluginDiscoveryService();
    await service.reload();

    expect(service.getById('wstudio-plugin-demo-editor-suggest')?.rootDirectory).toBe(editorSuggestDirectory);
    expect(service.getById('wstudio-plugin-demo-file-icons-simple')?.rootDirectory).toBe(fileIconsDirectory);
    expect(service.getById('wstudio-plugin-demo-canvas-host')?.rootDirectory).toBe(canvasHostDirectory);
    expect(service.getById('wstudio-plugin-demo-legacy-rich-ui')).toBeUndefined();
  });
});
