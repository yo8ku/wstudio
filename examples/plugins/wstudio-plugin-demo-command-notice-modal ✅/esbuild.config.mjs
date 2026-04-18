/**
 * Bundles the command, notice, and modal demo plugin into a host-loadable CommonJS file.
 */

import { build, context } from 'esbuild';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const entryPoint = path.join(projectRoot, 'src', 'main.ts');
const outputFile = path.join(projectRoot, 'main.js');
const modalEntrypoint = path.join(projectRoot, 'src', 'modal.runtime.ts');
const modalOutputFile = path.join(projectRoot, 'modal.runtime.js');
const modalFailureEntrypoint = path.join(projectRoot, 'src', 'modal.failure.runtime.ts');
const modalFailureOutputFile = path.join(projectRoot, 'modal.failure.runtime.js');
const watchMode = process.argv.includes('--watch');

function createEsbuildOptions(entryPoints, outfile) {
  return {
    entryPoints: [entryPoints],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: ['node20'],
    outfile,
    external: ['@note-studio/plugin'],
    sourcemap: true,
    logLevel: 'info',
  };
}

async function main() {
  if (!watchMode) {
    await build(createEsbuildOptions(entryPoint, outputFile));
    await build({
      entryPoints: [modalEntrypoint],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['chrome120'],
      outfile: modalOutputFile,
      sourcemap: true,
      logLevel: 'info',
    });
    await build({
      entryPoints: [modalFailureEntrypoint],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['chrome120'],
      outfile: modalFailureOutputFile,
      sourcemap: true,
      logLevel: 'info',
    });
    return;
  }

  const buildContext = await context(createEsbuildOptions(entryPoint, outputFile));
  const modalBuildContext = await context({
    entryPoints: [modalEntrypoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    outfile: modalOutputFile,
    sourcemap: true,
    logLevel: 'info',
  });
  const modalFailureBuildContext = await context({
    entryPoints: [modalFailureEntrypoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    outfile: modalFailureOutputFile,
    sourcemap: true,
    logLevel: 'info',
  });
  await buildContext.watch();
  await modalBuildContext.watch();
  await modalFailureBuildContext.watch();
  console.log('[wstudio-plugin-demo-command-notice-modal] watching TypeScript sources');
  await new Promise(() => undefined);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
