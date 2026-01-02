/**
 * Shell 检测器
 * 功能：检测系统可用的 Shell 并提供默认 Shell
 */

import * as os from 'os';
import * as fs from 'fs';
import type { ShellConfig, ShellType } from './types';

/** Windows 常用 Shell 路径 */
const WINDOWS_SHELLS: Record<ShellType, ShellConfig> = {
  powershell: {
    name: 'PowerShell',
    path: 'powershell.exe',
    args: ['-NoLogo'],
  },
  cmd: {
    name: 'Command Prompt',
    path: 'cmd.exe',
    args: [],
  },
  bash: {
    name: 'Bash',
    path: 'bash.exe',
    args: [],
  },
  'git-bash': {
    name: 'Git Bash',
    path: 'C:\\Program Files\\Git\\bin\\bash.exe',
    args: ['--login'],
  },
  zsh: {
    name: 'Zsh',
    path: 'zsh.exe',
    args: [],
  },
};

/** Unix 常用 Shell 路径 */
const UNIX_SHELLS: Record<ShellType, ShellConfig> = {
  bash: {
    name: 'Bash',
    path: '/bin/bash',
    args: [],
  },
  zsh: {
    name: 'Zsh',
    path: '/bin/zsh',
    args: [],
  },
  powershell: {
    name: 'PowerShell',
    path: '/usr/bin/pwsh',
    args: ['-NoLogo'],
  },
  cmd: {
    name: 'Command Prompt',
    path: '',
    args: [],
  },
  'git-bash': {
    name: 'Git Bash',
    path: '',
    args: [],
  },
};

export class ShellDetector {
  private platform: NodeJS.Platform;

  constructor() {
    this.platform = os.platform();
  }

  /** 获取默认 Shell */
  getDefaultShell(): ShellConfig {
    if (this.platform === 'win32') {
      return WINDOWS_SHELLS.powershell;
    } else if (this.platform === 'darwin') {
      return UNIX_SHELLS.zsh;
    } else {
      return UNIX_SHELLS.bash;
    }
  }

  /** 获取指定类型的 Shell 配置 */
  getShellConfig(type: ShellType): ShellConfig | null {
    const shells = this.platform === 'win32' ? WINDOWS_SHELLS : UNIX_SHELLS;
    return shells[type] || null;
  }

  /** 检测 Shell 是否可用 */
  isShellAvailable(shellPath: string): boolean {
    if (!shellPath) return false;
    
    // 检查是否是系统命令（不带路径）
    if (!shellPath.includes('/') && !shellPath.includes('\\')) {
      return true; // 假设系统命令可用
    }
    
    // 检查文件是否存在
    try {
      return fs.existsSync(shellPath);
    } catch {
      return false;
    }
  }

  /** 获取所有可用的 Shell */
  getAvailableShells(): ShellConfig[] {
    const shells = this.platform === 'win32' ? WINDOWS_SHELLS : UNIX_SHELLS;
    const available: ShellConfig[] = [];

    for (const config of Object.values(shells)) {
      if (this.isShellAvailable(config.path)) {
        available.push(config);
      }
    }

    return available;
  }

  /** 获取用户主目录 */
  getHomeDirectory(): string {
    return process.env.HOME || process.env.USERPROFILE || os.homedir();
  }

  /** 获取平台 */
  getPlatform(): NodeJS.Platform {
    return this.platform;
  }

  /** 是否是 Windows */
  isWindows(): boolean {
    return this.platform === 'win32';
  }
}

/** 单例实例 */
let instance: ShellDetector | null = null;

export function getShellDetector(): ShellDetector {
  if (!instance) {
    instance = new ShellDetector();
  }
  return instance;
}
