/**
 * Sync Electron runtime files and native dependencies that need Electron-specific binaries.
 * Prefer prebuilt downloads and avoid sweeping rebuilds of unrelated native modules.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { rebuild } = require('@electron/rebuild');

const repoRoot = path.resolve(__dirname, '..', '..');
const rootPackageJsonPath = path.join(repoRoot, 'package.json');
const electronDir = path.join(repoRoot, 'node_modules', 'electron');
const nodePtyDir = path.join(repoRoot, 'node_modules', 'node-pty');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeVersion(versionRange) {
  if (typeof versionRange !== 'string') {
    return null;
  }

  const match = versionRange.match(/\d+\.\d+\.\d+/);
  return match ? match[0] : null;
}

function resolveElectronVersion() {
  const packageJson = readJson(rootPackageJsonPath);
  const version =
    normalizeVersion(packageJson.devDependencies?.electron)
    || normalizeVersion(packageJson.dependencies?.electron);

  if (!version) {
    throw new Error('Unable to resolve the Electron version from package.json');
  }

  return version;
}

function resolveNodePtyPackageName() {
  if (!fs.existsSync(path.join(nodePtyDir, 'package.json'))) {
    return 'node-pty';
  }

  const packageJson = readJson(path.join(nodePtyDir, 'package.json'));
  return packageJson.name || 'node-pty';
}

function runNode(scriptPath, args, options) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: 'inherit',
    ...options,
  });
}

function syncElectronRuntime() {
  if (!fs.existsSync(path.join(electronDir, 'package.json'))) {
    console.log('[native] electron is not installed, skipping Electron runtime sync.');
    return;
  }

  const installedElectronVersion = readJson(path.join(electronDir, 'package.json')).version;
  const requestedElectronVersion = resolveElectronVersion();
  const distPath = path.join(electronDir, 'dist');
  const versionFilePath = path.join(distPath, 'version');
  const executablePathFile = path.join(electronDir, 'path.txt');
  let runtimeReady = false;

  try {
    const syncedVersion = fs.readFileSync(versionFilePath, 'utf8').replace(/^v/, '').trim();
    const executablePath = fs.readFileSync(executablePathFile, 'utf8').trim();
    runtimeReady = syncedVersion === installedElectronVersion && fs.existsSync(path.join(distPath, executablePath));
  } catch {
    runtimeReady = false;
  }

  if (runtimeReady) {
    return;
  }

  if (installedElectronVersion !== requestedElectronVersion) {
    console.warn(
      `[native] installed electron version ${installedElectronVersion} does not match package.json ${requestedElectronVersion}.`
    );
  }

  console.log(`[native] Syncing electron runtime ${installedElectronVersion}`);
  const installScriptPath = path.join(electronDir, 'install.js');
  const result = runNode(installScriptPath, [], {
    cwd: electronDir,
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`Failed to sync electron runtime ${installedElectronVersion}`);
  }
}

async function rebuildNodePtyForElectron() {
  if (!fs.existsSync(nodePtyDir)) {
    console.log('[native] node-pty is not installed, skipping Electron native sync.');
    return;
  }

  const electronVersion = resolveElectronVersion();
  const packageName = resolveNodePtyPackageName();
  console.log(`[native] Syncing ${packageName} for Electron ${electronVersion} via @electron/rebuild`);

  await rebuild({
    buildPath: repoRoot,
    electronVersion,
    onlyModules: ['node-pty'],
    force: true,
    headerURL: 'https://www.electronjs.org/headers',
    mode: process.platform === 'win32' ? 'sequential' : 'parallel',
  });
}

async function main() {
  try {
    syncElectronRuntime();
    await rebuildNodePtyForElectron();
  } catch (error) {
    console.error('[native] Electron native dependency sync failed:', error);
    process.exitCode = 1;
  }
}

void main();
