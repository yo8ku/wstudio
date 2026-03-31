/**
 * Compatibility aliases for existing sidebar extension types.
 * The standalone ExtensionPanel component now owns the source contracts.
 */

export type {
  ExtensionPanelItem as LocalExtensionItem,
  ExtensionPanelStatus as LocalExtensionStatus,
} from '../../../ExtensionPanel';
