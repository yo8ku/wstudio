/**
 * Plugin manifest contracts aligned with the metadata shape exposed to third-party plugins.
 */

import type { PluginManifestUi } from './plugin-ui-runtime';
import type { PluginUiEntryLocation, PluginUiEntryScope } from './ui';

export interface PluginManifestEngines {
  readonly wstudio: string;
  readonly pluginApi?: string;
}

export interface PluginManifestFileIconMapping {
  readonly icon: string;
  readonly extensions?: readonly string[];
  readonly fileNames?: readonly string[];
}

export interface PluginManifestFileIconContribution {
  readonly label: string;
  readonly file: string;
  readonly directory: string;
  readonly directoryExpanded?: string;
  readonly mappings?: readonly PluginManifestFileIconMapping[];
}

export interface PluginManifestUiEntryContribution {
  /**
   * Stable local entry id. Runtime `addRibbonIcon(..., { id })` should reuse the same id.
   */
  readonly id: string;
  readonly title: string;
  /**
   * Host icon id available before the plugin runtime starts.
   */
  readonly icon?: string;
  /**
   * Optional SVG asset path resolved relative to the plugin root and inlined by the host.
   */
  readonly iconPath?: string;
  readonly location?: PluginUiEntryLocation;
  readonly scope?: PluginUiEntryScope;
}

export interface PluginManifestContributes {
  readonly fileIcons?: PluginManifestFileIconContribution;
  readonly uiEntries?: readonly PluginManifestUiEntryContribution[];
}

export const PLUGIN_RELEASE_CHANNELS = [
  'stable',
  'development',
] as const;

export type PluginReleaseChannel = (typeof PLUGIN_RELEASE_CHANNELS)[number];

export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly version: string;
  readonly description: string;
  /**
   * Extensions UI logo image path resolved relative to the plugin root.
   * This is distinct from runtime entry icons such as activity bar or status bar icons.
   */
  readonly icon?: string;
  readonly releaseChannel?: PluginReleaseChannel;
  readonly minAppVersion?: string;
  readonly engines?: PluginManifestEngines;
  readonly dir?: string;
  readonly authorUrl?: string;
  readonly fundingUrl?: string;
  readonly homepageUrl?: string;
  readonly repositoryUrl?: string;
  readonly keywords?: readonly string[];
  readonly platforms?: readonly string[];
  /**
   * Compatibility-only stylesheet entries resolved relative to the plugin root.
   * Rich plugin UI should style itself inside `manifest.ui.views`, `manifest.ui.settings`,
   * and `manifest.ui.modals` runtime bundles rather than relying on `manifest.styles`.
   */
  readonly styles?: readonly string[];
  readonly ui?: PluginManifestUi;
  readonly isDesktopOnly?: boolean;
  readonly contributes?: PluginManifestContributes;
}
