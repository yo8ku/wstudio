/**
 * Shared mock extension panel data contracts.
 * Keep the sidebar UI independent from the evolving plugin runtime APIs.
 */

export type ExtensionPanelStatus = 'enabled' | 'disabled' | 'error' | 'update-available';

export interface ExtensionPanelItem {
  readonly id: string;
  readonly displayName: string;
  readonly downloadCount: string;
  readonly downloadsLabel?: string;
  readonly description: string;
  readonly version: string;
  readonly publisher: string;
  readonly publisherUrl?: string;
  readonly isOfficialPublisher: boolean;
  readonly rating?: string;
  readonly installedAt: string;
  readonly installPath: string;
  readonly status: ExtensionPanelStatus;
  readonly failureMessage?: string;
  readonly iconPath?: string;
  readonly iconName: string;
  readonly badgeImagePath?: string;
  readonly canToggleEnabled?: boolean;
  readonly canUninstall?: boolean;
  readonly hasSettings?: boolean;
  readonly capabilities: readonly string[];
}
