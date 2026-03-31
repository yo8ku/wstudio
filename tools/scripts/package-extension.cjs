#!/usr/bin/env node

/**
 * Disabled legacy extension packaging entrypoint.
 * The old extension/plugin API toolchain has been removed during the platform redesign.
 */

const { exitWithLegacyPluginWorkflowDisabled } = require('./legacy-plugin-workflow-disabled.cjs');

exitWithLegacyPluginWorkflowDisabled('plugin:pack');
