/**
 * 在宿主进程内加载插件入口模块，并兼容 CommonJS / ESM 两种导出形式。
 */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { ExtensionPlugin } from '@note-studio/extension-api';

interface ImportedPluginModule {
  readonly default?: ExtensionPlugin;
}

type PluginModuleValue = ImportedPluginModule | ExtensionPlugin;

interface NodeErrorWithCode extends Error {
  readonly code?: string;
}

function isExtensionPlugin(value: PluginModuleValue | null | undefined): value is ExtensionPlugin {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as {
    readonly activate?: ExtensionPlugin['activate'];
  };

  return typeof candidate.activate === 'function';
}

function resolvePluginExport(moduleValue: PluginModuleValue): ExtensionPlugin | null {
  if (isExtensionPlugin(moduleValue)) {
    return moduleValue;
  }

  if (isExtensionPlugin(moduleValue.default ?? null)) {
    return moduleValue.default ?? null;
  }

  return null;
}

async function loadPluginModuleWithRequire(entryFile: string): Promise<PluginModuleValue> {
  const runtimeRequire = createRequire(entryFile);
  return Promise.resolve(runtimeRequire(entryFile) as PluginModuleValue);
}

async function loadPluginModuleWithImport(entryFile: string): Promise<PluginModuleValue> {
  const moduleUrl = pathToFileURL(entryFile).href;
  const dynamicImport = new Function(
    'moduleUrl',
    'return import(moduleUrl);',
  ) as (moduleUrl: string) => Promise<PluginModuleValue>;

  return dynamicImport(moduleUrl);
}

export async function loadExtensionPlugin(entryFile: string): Promise<ExtensionPlugin> {
  let importedModule: PluginModuleValue;

  try {
    importedModule = await loadPluginModuleWithRequire(entryFile);
  } catch (error) {
    const errorWithCode = error as NodeErrorWithCode;
    if (errorWithCode.code === 'ERR_REQUIRE_ESM') {
      importedModule = await loadPluginModuleWithImport(entryFile);
    } else {
      throw errorWithCode;
    }
  }

  const plugin = resolvePluginExport(importedModule);

  if (!isExtensionPlugin(plugin)) {
    throw new Error(`Plugin entry must export an object with activate(): ${entryFile}`);
  }

  return plugin;
}
