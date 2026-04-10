import React, { useEffect, useMemo, useRef } from 'react';
import { ContextMenu, type ContextMenuItem } from '../Explorer/Common/ContextMenu';
import { usePluginMenuStore } from '../../stores/pluginMenuStore';

const PLUGIN_RUNTIME_SELECT_MENU_ITEM_CHANNEL = 'plugin-runtime:select-menu-item';
const PLUGIN_RUNTIME_MENU_HIDDEN_CHANNEL = 'plugin-runtime:menu-hidden';

export const GlobalPluginMenu: React.FC = () => {
  const { isOpen, menuId, items, position, noIcon, closeMenu } = usePluginMenuStore();
  const selectionMenuIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectionMenuIdRef.current = null;
  }, [menuId]);

  const mappedItems = useMemo<ContextMenuItem[]>(() => {
    if (menuId === null) {
      return [];
    }

    return items.map((item) => {
      if (item.separator) {
        return {
          id: item.id,
          label: '',
          separator: true,
        };
      }

      return {
        id: item.id,
        label: item.title,
        icon: noIcon ? undefined : item.icon ?? undefined,
        disabled: item.disabled,
        selected: item.checked === true,
        onClick: () => {
          selectionMenuIdRef.current = menuId;
          void window.electron?.ipcRenderer.invoke(
            PLUGIN_RUNTIME_SELECT_MENU_ITEM_CHANNEL,
            {
              menuId,
              itemId: item.id,
            },
          );
        },
      } satisfies ContextMenuItem;
    });
  }, [items, menuId, noIcon]);

  if (!isOpen || menuId === null) {
    return null;
  }

  const handleClose = (): void => {
    const closeBySelection = selectionMenuIdRef.current === menuId;
    closeMenu();

    if (!closeBySelection) {
      void window.electron?.ipcRenderer.invoke(PLUGIN_RUNTIME_MENU_HIDDEN_CHANNEL, {
        menuId,
      });
    }

    selectionMenuIdRef.current = null;
  };

  return (
    <ContextMenu
      items={mappedItems}
      position={position}
      onClose={handleClose}
    />
  );
};
