/**
 * Shared helper for disabled legacy plugin workflow commands.
 * Keeps CLI feedback explicit while the new plugin platform is being rebuilt.
 */

function exitWithLegacyPluginWorkflowDisabled(commandName) {
  const normalizedCommandName = typeof commandName === 'string' && commandName.trim().length > 0
    ? commandName.trim()
    : 'legacy-plugin-command';

  console.error(
    `[${normalizedCommandName}] Legacy extension/plugin workflow has been removed while the new plugin API system is being redesigned.`,
  );
  process.exitCode = 1;
}

module.exports = {
  exitWithLegacyPluginWorkflowDisabled,
};
