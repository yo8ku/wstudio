/**
 * Bundles the workspace view demo plugin into a host-loadable CommonJS file.
 */

import { build, context } from 'esbuild';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const mainEntryPoint = path.join(projectRoot, 'src', 'main.ts');
const runtimeEntryPoint = path.join(projectRoot, 'src', 'view.runtime.ts');
const failureRuntimeEntryPoint = path.join(projectRoot, 'src', 'view.failure.runtime.ts');
const settingsRuntimeEntryPoint = path.join(projectRoot, 'src', 'settings.runtime.ts');
const popoverRuntimeEntryPoint = path.join(projectRoot, 'src', 'popover.runtime.ts');
const popoverFailureRuntimeEntryPoint = path.join(projectRoot, 'src', 'popover.failure.runtime.ts');
const mainOutputFile = path.join(projectRoot, 'main.js');
const runtimeOutputFile = path.join(projectRoot, 'view.runtime.js');
const failureRuntimeOutputFile = path.join(projectRoot, 'view.failure.runtime.js');
const settingsRuntimeOutputFile = path.join(projectRoot, 'settings.runtime.js');
const popoverRuntimeOutputFile = path.join(projectRoot, 'popover.runtime.js');
const popoverFailureRuntimeOutputFile = path.join(projectRoot, 'popover.failure.runtime.js');
const watchMode = process.argv.includes('--watch');

function createMainEsbuildOptions() {
  return {
    entryPoints: [mainEntryPoint],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: ['node20'],
    outfile: mainOutputFile,
    external: ['@note-studio/plugin'],
    sourcemap: true,
    logLevel: 'info',
  };
}

function createRuntimeEsbuildOptions() {
  return {
    entryPoints: [runtimeEntryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    outfile: runtimeOutputFile,
    sourcemap: true,
    logLevel: 'info',
  };
}

function createFailureRuntimeEsbuildOptions() {
  return {
    entryPoints: [failureRuntimeEntryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    outfile: failureRuntimeOutputFile,
    sourcemap: true,
    logLevel: 'info',
  };
}

function createSettingsRuntimeEsbuildOptions() {
  return {
    entryPoints: [settingsRuntimeEntryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    outfile: settingsRuntimeOutputFile,
    sourcemap: true,
    logLevel: 'info',
  };
}

function createPopoverRuntimeEsbuildOptions() {
  return {
    entryPoints: [popoverRuntimeEntryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    outfile: popoverRuntimeOutputFile,
    sourcemap: true,
    logLevel: 'info',
  };
}

function createPopoverFailureRuntimeEsbuildOptions() {
  return {
    entryPoints: [popoverFailureRuntimeEntryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    outfile: popoverFailureRuntimeOutputFile,
    sourcemap: true,
    logLevel: 'info',
  };
}

async function main() {
  if (!watchMode) {
    await build(createMainEsbuildOptions());
    await build(createRuntimeEsbuildOptions());
    await build(createFailureRuntimeEsbuildOptions());
    await build(createSettingsRuntimeEsbuildOptions());
    await build(createPopoverRuntimeEsbuildOptions());
    await build(createPopoverFailureRuntimeEsbuildOptions());
    return;
  }

  const mainBuildContext = await context(createMainEsbuildOptions());
  const runtimeBuildContext = await context(createRuntimeEsbuildOptions());
  const failureRuntimeBuildContext = await context(createFailureRuntimeEsbuildOptions());
  const settingsRuntimeBuildContext = await context(createSettingsRuntimeEsbuildOptions());
  const popoverRuntimeBuildContext = await context(createPopoverRuntimeEsbuildOptions());
  const popoverFailureRuntimeBuildContext = await context(createPopoverFailureRuntimeEsbuildOptions());
  await mainBuildContext.watch();
  await runtimeBuildContext.watch();
  await failureRuntimeBuildContext.watch();
  await settingsRuntimeBuildContext.watch();
  await popoverRuntimeBuildContext.watch();
  await popoverFailureRuntimeBuildContext.watch();
  console.log('[wstudio-plugin-demo-view-workspace] watching TypeScript sources');
  await new Promise(() => undefined);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
