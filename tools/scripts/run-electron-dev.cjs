/**
 * Launch Electron in development mode without inheriting Node-only startup flags.
 */
const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');
const projectRoot = path.resolve(__dirname, '../..');
const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'development',
};

delete env.ELECTRON_RUN_AS_NODE;

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
