/**
 * Sidebar wrapper for the standalone mock extensions panel.
 * It owns only the editor-tab opening behavior and stays independent from plugin runtime APIs.
 */

import React from 'react';
import {
  ExtensionPanel,
  MOCK_EXTENSION_PANEL_ITEMS,
  type ExtensionPanelItem,
} from '../../../ExtensionPanel';

function getExtensionTabPath(item: ExtensionPanelItem): string {
  return `extension:/${item.id}`;
}

function getExtensionTabTitle(item: ExtensionPanelItem): string {
  return `Extension: ${item.displayName}`;
}

export const Extensions: React.FC = () => {
  const openExtension = (item: ExtensionPanelItem): void => {
    window.dispatchEvent(new CustomEvent('open-editor-tab', {
      detail: {
        path: getExtensionTabPath(item),
        title: getExtensionTabTitle(item),
        type: 'extension',
      },
    }));
  };

  return (
    <ExtensionPanel
      items={MOCK_EXTENSION_PANEL_ITEMS}
      onSelectItem={openExtension}
    />
  );
};
