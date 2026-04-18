/**
 * Packs the published wstudio-api SDK into the external sample starter, then reinstalls its dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const projectRoot = path.resolve(__dirname, '../..');
const sdkRoot = path.join(projectRoot, '..', 'wstudio-api');
const sampleRoot = path.join(projectRoot, '..', 'wstudio-sample-plugin');
const sdkOutputRoot = path.join(sampleRoot, 'sdk');
const stableTarballPath = path.join(sdkOutputRoot, 'wstudio-api.tgz');

function resolveCommand(binary) {
  return process.platform === 'win32' ? `${binary}.cmd` : binary;
}

function quote(argument) {
  if (/[\s"]/u.test(argument)) {
    return `"${argument.replace(/"/gu, '\\"')}"`;
  }

  return argument;
}

function run(command, args, cwd) {
  const commandLine = [resolveCommand(command), ...args.map(quote)].join(' ');

  cp.execSync(commandLine, {
    cwd,
    stdio: 'inherit',
  });
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function cleanPackedTarballs() {
  if (!fs.existsSync(sdkOutputRoot)) {
    return;
  }

  for (const fileName of fs.readdirSync(sdkOutputRoot)) {
    if (fileName.endsWith('.tgz')) {
      fs.rmSync(path.join(sdkOutputRoot, fileName), { force: true });
    }
  }
}

function packSdk() {
  ensureDirectory(sdkOutputRoot);
  cleanPackedTarballs();

  run('npm', ['pack', '--pack-destination', sdkOutputRoot], sdkRoot);

  const tarballs = fs
    .readdirSync(sdkOutputRoot)
    .filter((fileName) => fileName.endsWith('.tgz') && fileName !== path.basename(stableTarballPath))
    .map((fileName) => path.join(sdkOutputRoot, fileName));

  if (tarballs.length < 1) {
    throw new Error('Expected at least one freshly packed SDK tarball.');
  }

  if (fs.existsSync(stableTarballPath)) {
    fs.rmSync(stableTarballPath, { force: true });
  }

  if (tarballs.length > 1) {
    tarballs.sort((leftPath, rightPath) => fs.statSync(rightPath).mtimeMs - fs.statSync(leftPath).mtimeMs);
  }

  const [latestTarballPath] = tarballs;

  for (const tarballPath of tarballs) {
    if (tarballPath !== latestTarballPath) {
      fs.rmSync(tarballPath, { force: true });
    }
  }

  if (!fs.existsSync(latestTarballPath)) {
    throw new Error(`Expected exactly one SDK tarball, received ${tarballs.length}.`);
  }

  fs.renameSync(latestTarballPath, stableTarballPath);
}

function installSampleDependencies() {
  run('npm', ['install', '--ignore-scripts', '--force'], sampleRoot);
}

function main() {
  packSdk();
  installSampleDependencies();
  console.log('wstudio-plugin-sample bootstrap completed');
}

main();
