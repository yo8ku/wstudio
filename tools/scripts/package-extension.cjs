#!/usr/bin/env node

const {
  defaultPackageOutputDirectory,
  packagePluginDirectory,
  resolvePluginDirectory,
} = require('./plugin-tooling-utils.cjs');

function main() {
  try {
    const pluginDirectory = resolvePluginDirectory(process.argv[2], process.cwd());
    const outputDirectory = process.argv[3]
      ? resolvePluginDirectory(process.argv[3], process.cwd())
      : defaultPackageOutputDirectory(pluginDirectory);

    const result = packagePluginDirectory(pluginDirectory, outputDirectory);
    console.log(`[plugin:pack] ${result.manifest.id} 打包完成`);
    console.log(`[plugin:pack] 输出文件: ${result.packagePath}`);
  } catch (error) {
    console.error(`[plugin:pack] ${error.message}`);
    process.exitCode = 1;
  }
}

main();
