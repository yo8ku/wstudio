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
const nodePtyReleaseDir = path.join(nodePtyDir, 'build', 'Release');
const nodePtyConptyRuntimeDir = path.join(nodePtyDir, 'build', 'Release', 'conpty');

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

function resolveNodePtyConptySourceDir() {
  if (process.platform !== 'win32') {
    return null;
  }

  const conptyRoot = path.join(nodePtyDir, 'third_party', 'conpty');
  if (!fs.existsSync(conptyRoot)) {
    return null;
  }

  const archFolder = process.arch === 'arm64' ? 'win10-arm64' : 'win10-x64';
  const versionDirs = fs.readdirSync(conptyRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const versionDir of versionDirs) {
    const candidateDir = path.join(conptyRoot, versionDir, archFolder);
    if (fs.existsSync(path.join(candidateDir, 'conpty.dll'))) {
      return candidateDir;
    }
  }

  return null;
}

function syncNodePtyConptyRuntime() {
  if (process.platform !== 'win32') {
    return;
  }

  if (!fs.existsSync(nodePtyDir)) {
    return;
  }

  const sourceDir = resolveNodePtyConptySourceDir();
  if (!sourceDir) {
    console.log('[native] node-pty conpty runtime source not found, skipping conpty runtime sync.');
    return;
  }

  fs.mkdirSync(nodePtyConptyRuntimeDir, { recursive: true });

  const runtimeFiles = ['conpty.dll', 'OpenConsole.exe'];
  for (const fileName of runtimeFiles) {
    const sourcePath = path.join(sourceDir, fileName);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    const targetPath = path.join(nodePtyConptyRuntimeDir, fileName);
    fs.copyFileSync(sourcePath, targetPath);
  }

  console.log(`[native] Synced node-pty conpty runtime from ${sourceDir}`);
}

function ensureNodePtyNativeBinary() {
  if (!fs.existsSync(nodePtyDir)) {
    return;
  }

  if (process.platform !== 'win32') {
    return;
  }

  const hasConptyBinary = fs.existsSync(path.join(nodePtyReleaseDir, 'conpty.node'));
  const hasWinptyBinary = fs.existsSync(path.join(nodePtyReleaseDir, 'pty.node'));

  if (hasConptyBinary || hasWinptyBinary) {
    return;
  }

  throw new Error(
    'node-pty Windows native binary was not produced. ' +
    'Electron 36.9.5 does not have a matching prebuilt binary for this package on Windows. ' +
    'Install Visual Studio with the "Desktop development with C++" workload, then rerun "pnpm run rebuild:native".'
  );
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
    onlyModules: [packageName],
    force: true,
    headerURL: 'https://www.electronjs.org/headers',
    mode: process.platform === 'win32' ? 'sequential' : 'parallel',
  });
}

async function main() {
  try {
    syncElectronRuntime();
    await rebuildNodePtyForElectron();
    ensureNodePtyNativeBinary();
    syncNodePtyConptyRuntime();
  } catch (error) {
    console.error('[native] Electron native dependency sync failed:', error);
    process.exitCode = 1;
  }
}

void main();
