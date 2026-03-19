/**
 * 插件 manifest 归一化工具。
 */

import {
  EMPTY_AI_PANEL_CONTRIBUTES,
  EMPTY_EXTENSION_CONTRIBUTES,
  type AIPanelContributes,
  type ExtensionContributes,
  type ExtensionManifest,
  type ResolvedExtensionManifest,
} from '@note-studio/extension-api';

function normalizeAIPanelContributes(aiPanel?: AIPanelContributes): AIPanelContributes {
  if (!aiPanel) {
    return EMPTY_AI_PANEL_CONTRIBUTES;
  }

  return {
    commands: aiPanel.commands ? [...aiPanel.commands] : undefined,
    skills: aiPanel.skills ? [...aiPanel.skills] : undefined,
  };
}

function normalizeContributes(contributes?: ExtensionContributes): ExtensionContributes {
  if (!contributes) {
    return EMPTY_EXTENSION_CONTRIBUTES;
  }

  return {
    commands: contributes.commands ? [...contributes.commands] : undefined,
    menus: contributes.menus ? [...contributes.menus] : undefined,
    viewContainers: contributes.viewContainers ? [...contributes.viewContainers] : undefined,
    views: contributes.views ? [...contributes.views] : undefined,
    webviews: contributes.webviews ? [...contributes.webviews] : undefined,
    settings: contributes.settings ? [...contributes.settings] : undefined,
    aiPanel: normalizeAIPanelContributes(contributes.aiPanel),
  };
}

export function normalizeManifest(manifest: ExtensionManifest): ResolvedExtensionManifest {
  return {
    ...manifest,
    displayName: manifest.displayName && manifest.displayName.trim().length > 0
      ? manifest.displayName
      : manifest.name,
    description: manifest.description ?? '',
    activationEvents: manifest.activationEvents ? [...manifest.activationEvents] : [],
    permissions: manifest.permissions ? [...manifest.permissions] : [],
    contributes: normalizeContributes(manifest.contributes),
  };
}
