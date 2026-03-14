/**
 * Sync Electron runtime files and native dependencies that need Electron-specific binaries.
 * Prefer prebuilt downloads and avoid sweeping rebuilds of unrelated native modules.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

function resolvePrebuildInstallBin() {
  try {
    return require.resolve('prebuild-install/bin.js', { paths: [repoRoot] });
  } catch {
    return null;
  }
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

function rebuildNodePtyForElectron() {
  if (!fs.existsSync(nodePtyDir)) {
    console.log('[native] node-pty is not installed, skipping Electron native sync.');
    return;
  }

  const electronVersion = resolveElectronVersion();
  const prebuildInstallBin = resolvePrebuildInstallBin();
  const packageName = resolveNodePtyPackageName();
  const env = {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: 'https://electronjs.org/headers',
    npm_config_build_from_source: 'false',
  };

  if (prebuildInstallBin) {
    console.log(`[native] Syncing ${packageName} for Electron ${electronVersion} via prebuild-install`);
    const result = runNode(
      prebuildInstallBin,
      ['-r', 'electron', '-t', electronVersion, '--verbose'],
      {
        cwd: nodePtyDir,
        env,
      }
    );

    if (result.status === 0) {
      return;
    }

    console.warn('[native] prebuild-install failed, falling back to package rebuild.');
  } else {
    console.warn('[native] prebuild-install is unavailable, falling back to package rebuild.');
  }

  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const rebuildResult = spawnSync(pnpmCommand, ['rebuild', 'node-pty'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });

  if (rebuildResult.status !== 0) {
    throw new Error(`Failed to rebuild ${packageName} for Electron ${electronVersion}`);
  }
}

try {
  syncElectronRuntime();
  rebuildNodePtyForElectron();
} catch (error) {
  console.error('[native] Electron native dependency sync failed:', error);
  process.exitCode = 1;
}
