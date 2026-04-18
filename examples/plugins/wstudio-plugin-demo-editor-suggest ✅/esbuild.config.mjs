/**
 * Bundles the editor suggest demo plugin into a host-loadable CommonJS file.
 */

import { build, context } from 'esbuild';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const entryPoint = path.join(projectRoot, 'src', 'main.ts');
const runtimeEntryPoint = path.join(projectRoot, 'src', 'popover.runtime.ts');
const failureRuntimeEntryPoint = path.join(projectRoot, 'src', 'popover.failure.runtime.ts');
const outputFile = path.join(projectRoot, 'main.js');
const runtimeOutputFile = path.join(projectRoot, 'popover.runtime.js');
const failureRuntimeOutputFile = path.join(projectRoot, 'popover.failure.runtime.js');
const watchMode = process.argv.includes('--watch');

function createEsbuildOptions() {
  return {
    entryPoints: [entryPoint],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: ['node20'],
    outfile: outputFile,
    external: ['@note-studio/plugin'],
    sourcemap: true,
    logLevel: 'info',
  };
}

async function main() {
  if (!watchMode) {
    await build(createEsbuildOptions());
    await build({
      entryPoints: [runtimeEntryPoint],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['chrome120'],
      outfile: runtimeOutputFile,
      sourcemap: true,
      logLevel: 'info',
    });
    await build({
      entryPoints: [failureRuntimeEntryPoint],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['chrome120'],
      outfile: failureRuntimeOutputFile,
      sourcemap: true,
      logLevel: 'info',
    });
    return;
  }

  const buildContext = await context(createEsbuildOptions());
  const runtimeBuildContext = await context({
    entryPoints: [runtimeEntryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    outfile: runtimeOutputFile,
    sourcemap: true,
    logLevel: 'info',
  });
  const failureRuntimeBuildContext = await context({
    entryPoints: [failureRuntimeEntryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    outfile: failureRuntimeOutputFile,
    sourcemap: true,
    logLevel: 'info',
  });
  await buildContext.watch();
  await runtimeBuildContext.watch();
  await failureRuntimeBuildContext.watch();
  console.log('[wstudio-plugin-demo-editor-suggest] watching TypeScript sources');
  await new Promise(() => undefined);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
