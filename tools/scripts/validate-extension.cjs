#!/usr/bin/env node

const {
  formatValidationIssues,
  resolvePluginDirectory,
  validatePluginDirectory,
} = require('./plugin-tooling-utils.cjs');

function main() {
  try {
    const pluginDirectory = resolvePluginDirectory(process.argv[2], process.cwd());
    const { manifest, validation } = validatePluginDirectory(pluginDirectory);

    if (!validation.valid) {
      console.error(`[plugin:validate] ${manifest.id} 校验失败`);
      console.error(formatValidationIssues(validation.issues));
      process.exitCode = 1;
      return;
    }

    console.log(`[plugin:validate] ${manifest.id} 校验通过`);
  } catch (error) {
    console.error(`[plugin:validate] ${error.message}`);
    process.exitCode = 1;
  }
}

main();
