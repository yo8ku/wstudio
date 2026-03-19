#!/usr/bin/env node

const path = require('node:path');
const {
  PROJECT_ROOT,
  createScaffold,
  resolveTargetDirectory,
} = require('./plugin-tooling-utils.cjs');

function printUsage() {
  console.log('用法: pnpm plugin:create <插件名称或目标路径>');
  console.log('示例: pnpm plugin:create hello-plugin');
  console.log('示例: pnpm plugin:create plugin-dev/acme-demo');
}

function main() {
  const rawTarget = process.argv[2];

  if (!rawTarget) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    const targetDirectory = resolveTargetDirectory(rawTarget, process.cwd());
    const scaffold = createScaffold(targetDirectory, path.basename(targetDirectory));
    const relativeTargetDirectory = normalizePath(path.relative(PROJECT_ROOT, scaffold.targetDirectory) || '.');

    console.log(`[plugin:create] 已创建插件: ${relativeTargetDirectory}`);
    console.log(`[plugin:create] 插件 ID: ${scaffold.extensionId}`);
    console.log('[plugin:create] 下一步:');
    console.log(`  1. 编辑 ${normalizePath(path.join(relativeTargetDirectory, 'plugin.json'))}`);
    console.log(`  2. 运行 pnpm --dir "${scaffold.targetDirectory}" plugin:validate`);
    console.log(`  3. 运行 pnpm --dir "${scaffold.targetDirectory}" plugin:pack`);
  } catch (error) {
    console.error(`[plugin:create] ${error.message}`);
    process.exitCode = 1;
  }
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

main();
