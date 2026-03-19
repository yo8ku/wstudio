export type LocalExtensionStatus = 'enabled' | 'disabled' | 'update-available';

export interface LocalExtensionItem {
  readonly id: string;
  readonly displayName: string;
  readonly downloadCount: string;
  readonly description: string;
  readonly version: string;
  readonly publisher: string;
  readonly isOfficialPublisher: boolean;
  readonly installedAt: string;
  readonly installPath: string;
  readonly status: LocalExtensionStatus;
  readonly iconPath?: string;
  readonly iconName: string;
  readonly capabilities: readonly string[];
}
