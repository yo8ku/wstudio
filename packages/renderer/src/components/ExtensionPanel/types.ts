/**
 * Shared mock extension panel data contracts.
 * Keep the sidebar UI independent from the evolving plugin runtime APIs.
 */

export type ExtensionPanelStatus = 'enabled' | 'disabled' | 'update-available';

export interface ExtensionPanelItem {
  readonly id: string;
  readonly displayName: string;
  readonly downloadCount: string;
  readonly description: string;
  readonly version: string;
  readonly publisher: string;
  readonly isOfficialPublisher: boolean;
  readonly installedAt: string;
  readonly installPath: string;
  readonly status: ExtensionPanelStatus;
  readonly iconPath?: string;
  readonly iconName: string;
  readonly badgeImagePath?: string;
  readonly capabilities: readonly string[];
}
