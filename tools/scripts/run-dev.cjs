/**
 * Starts the root development workflow.
 * Reuses an existing renderer dev server when Vite is already available.
 */
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '../..');
const pnpmCommand = 'pnpm';
const devServerOptions = {
  hostname: '127.0.0.1',
  port: 5173,
  path: '/@vite/client',
  timeout: 2000,
};
const childProcesses = [];
const cliPluginRoots = parsePluginRootArgs(process.argv.slice(2));
const childEnvironment = createChildEnvironment(cliPluginRoots);
let shuttingDown = false;

function parsePluginRootArgs(argv) {
  const pluginRoots = [];

  for (let index = 0; index < argv.length; index += 1) {
    const currentArgument = argv[index];
    if (currentArgument === '--plugin-root') {
      const nextArgument = argv[index + 1];
      if (nextArgument) {
        pluginRoots.push(path.resolve(process.cwd(), nextArgument));
        index += 1;
      }
      continue;
    }

    if (currentArgument.startsWith('--plugin-root=')) {
      const configuredRoot = currentArgument.slice('--plugin-root='.length).trim();
      if (configuredRoot.length > 0) {
        pluginRoots.push(path.resolve(process.cwd(), configuredRoot));
      }
    }
  }

  return pluginRoots;
}

function parseConfiguredPluginRoots(configuredRoots) {
  if (!configuredRoots) {
    return [];
  }

  return configuredRoots
    .split(path.delimiter)
    .map((pluginRoot) => pluginRoot.trim())
    .filter((pluginRoot) => pluginRoot.length > 0);
}

function createChildEnvironment(extraPluginRoots) {
  const nextEnvironment = { ...process.env };
  const configuredRoots = parseConfiguredPluginRoots(process.env.NOTE_STUDIO_PLUGIN_DEV_ROOTS);
  const mergedRoots = Array.from(new Set([...configuredRoots, ...extraPluginRoots]));

  if (mergedRoots.length > 0) {
    nextEnvironment.NOTE_STUDIO_PLUGIN_DEV_ROOTS = mergedRoots.join(path.delimiter);
  }

  return nextEnvironment;
}

function isRendererDevServerAvailable() {
  return new Promise((resolve) => {
    const request = http.get(devServerOptions, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on('error', () => {
      resolve(false);
    });

    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

function terminateChildren(excludedPid, signal) {
  for (const childProcess of childProcesses) {
    if (!childProcess.pid || childProcess.pid === excludedPid || childProcess.killed) {
      continue;
    }

    childProcess.kill(signal);
  }
}

function handleChildExit(exitedPid, code, signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  terminateChildren(exitedPid, signal ?? 'SIGTERM');

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
}

function spawnScript(scriptName) {
  const command = process.platform === 'win32'
    ? (process.env.ComSpec || 'cmd.exe')
    : pnpmCommand;
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `pnpm run ${scriptName}`]
    : ['run', scriptName];

  const childProcess = spawn(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: false,
    env: childEnvironment,
  });

  childProcesses.push(childProcess);
  childProcess.on('exit', (code, signal) => {
    handleChildExit(childProcess.pid ?? 0, code, signal);
  });

  return childProcess;
}

async function main() {
  const rendererAvailable = await isRendererDevServerAvailable();

  if (cliPluginRoots.length > 0) {
    console.log(`[dev] Using external plugin roots: ${cliPluginRoots.join(', ')}`);
  }

  if (rendererAvailable) {
    console.log('[dev] Reusing existing renderer dev server at http://127.0.0.1:5173');
    spawnScript('dev:electron');
    return;
  }

  console.log('[dev] Starting renderer and electron development processes');
  spawnScript('dev:renderer');
  spawnScript('dev:electron');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    terminateChildren(0, signal);
    process.exit(0);
  });
}

void main();
