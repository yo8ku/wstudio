/**
 * Bundles the markdown render demo plugin into a host-loadable CommonJS file.
 */

import { build, context } from 'esbuild';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const entryPoint = path.join(projectRoot, 'src', 'main.ts');
const outputFile = path.join(projectRoot, 'main.js');
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
    return;
  }

  const buildContext = await context(createEsbuildOptions());
  await buildContext.watch();
  console.log('[wstudio-plugin-demo-markdown-render] watching TypeScript sources');
  await new Promise(() => undefined);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
