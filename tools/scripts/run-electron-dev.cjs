/**
 * Launch Electron in development mode without inheriting Node-only startup flags.
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');

const electronPath = require('electron');
const projectRoot = path.resolve(__dirname, '../..');
const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'development',
};

delete env.ELECTRON_RUN_AS_NODE;

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const packageManagerExecPath = typeof process.env.npm_execpath === 'string'
  && process.env.npm_execpath.trim().length > 0
  ? process.env.npm_execpath.trim()
  : null;
const windowsCommandProcessor = process.env.ComSpec || 'cmd.exe';
const mainBuildResult = packageManagerExecPath === null
  ? (
      process.platform === 'win32'
        ? spawnSync(windowsCommandProcessor, ['/d', '/s', '/c', `${pnpmCommand} --filter @note-studio/main build`], {
            cwd: projectRoot,
            stdio: 'inherit',
            windowsHide: false,
            env,
          })
        : spawnSync(pnpmCommand, ['--filter', '@note-studio/main', 'build'], {
            cwd: projectRoot,
            stdio: 'inherit',
            windowsHide: false,
            env,
          })
    )
  : spawnSync(process.execPath, [packageManagerExecPath, '--filter', '@note-studio/main', 'build'], {
      cwd: projectRoot,
      stdio: 'inherit',
      windowsHide: false,
      env,
    });

if (mainBuildResult.error) {
  console.error('[run-electron-dev] Failed to build @note-studio/main before launching Electron:', mainBuildResult.error);
  process.exit(1);
}

if (mainBuildResult.status !== 0) {
  process.exit(mainBuildResult.status ?? 1);
}

const child = spawn(electronPath, ['.'], {
  cwd: projectRoot,
  stdio: 'inherit',
  windowsHide: false,
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}
