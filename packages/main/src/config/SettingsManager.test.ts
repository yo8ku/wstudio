import * as fs from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn<[string], string>(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: electronMocks.getPath,
  },
}));

vi.mock('@note-studio/shared', () => ({
  DEFAULT_WORKBENCH_FILE_ICON_THEME_ID: 'test-file-icon-theme',
  DEFAULT_WORKBENCH_BACKGROUND_SETTINGS: {
    enabled: false,
    mode: 'cover',
    opacity: 1,
    imagePath: '',
  },
}));

import { SettingsManager } from './SettingsManager';

describe('SettingsManager', () => {
  let tempUserDataPath = '';

  beforeEach(async () => {
    tempUserDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'wstudio-settings-manager-'));
    electronMocks.getPath.mockImplementation(() => tempUserDataPath);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempUserDataPath) {
      await fs.rm(tempUserDataPath, { recursive: true, force: true });
    }
  });

  it('writes valid JSONC when plugin settings are saved after the file becomes empty', async () => {
    const manager = new SettingsManager();
    await manager.initialize();

    const settingsPath = manager.getSettingsPath('user');
    await fs.writeFile(settingsPath, '', 'utf-8');

    await manager.updatePluginSetting('plugin.localStorage.transcribex', {
      enabled: true,
      taskCount: 0,
    }, 'user');

    const content = await fs.readFile(settingsPath, 'utf-8');
    const errors: jsonc.ParseError[] = [];
    const parsed = jsonc.parse(content, errors);

    expect(content.startsWith('{\n,')).toBe(false);
    expect(parsed).not.toBeNull();
    expect(errors).toEqual([]);
    expect(parsed).toMatchObject({
      'plugin.localStorage.transcribex': {
        enabled: true,
        taskCount: 0,
      },
    });
  });

  it('repairs malformed plugin-only JSONC before persisting the next plugin update', async () => {
    const manager = new SettingsManager();
    await manager.initialize();

    const settingsPath = manager.getSettingsPath('user');
    await fs.writeFile(
      settingsPath,
      '{\n,\n  "plugin.localStorage.legacy": {\n    "enabled": true\n  }\n}',
      'utf-8',
    );

    await manager.updatePluginSetting('plugin.localStorage.transcribex', {
      enabled: true,
      taskCount: 1,
    }, 'user');

    const content = await fs.readFile(settingsPath, 'utf-8');
    const errors: jsonc.ParseError[] = [];
    const parsed = jsonc.parse(content, errors);

    expect(content.startsWith('{\n,')).toBe(false);
    expect(parsed).not.toBeNull();
    expect(errors).toEqual([]);
    expect(parsed).toMatchObject({
      'plugin.localStorage.transcribex': {
        enabled: true,
        taskCount: 1,
      },
    });
  });
});
