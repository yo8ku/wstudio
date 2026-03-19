/**
 * Panel container component.
 * Provides tab switching, resize support, terminal placement controls, and runtime plugin webview panels.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { WorkbenchRuntimeWebviewPanelEntry } from '@note-studio/shared';
import { Icon } from '../../Icons';
import { LinksPanel } from './LinksPanel';
import { PluginRuntimeWebviewPanels } from './PluginRuntimeWebviewPanels';
import { TimelinePanel } from './TimelinePanel';
import { TerminalPanel } from './TerminalPanel';
import { ResizeHandle } from '../ResizeHandle';
import { workbenchContributionService } from '../../../services/WorkbenchContributionService';
import './Panel.scss';

import type { LinkCollectionSort } from '../../Links';

type BuiltinPanelView = 'links' | 'timeline' | 'terminal';
export type PluginPanelView = `plugin-webview:${string}`;
export type PanelView = BuiltinPanelView | PluginPanelView;
export type PanelPlacement = 'top' | 'left' | 'right' | 'bottom';

interface PanelProps {
  initialHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  activeView?: PanelView;
  placement?: PanelPlacement;
  fullSize?: boolean;
  draggableHeader?: boolean;
  onClose?: () => void;
  onPlacementChange?: (placement: PanelPlacement) => void;
  runtimeWebviewPanels?: readonly WorkbenchRuntimeWebviewPanelEntry[];
}

interface TerminalHeaderContextMenuState {
  readonly x: number;
  readonly y: number;
}

interface PanelTab {
  readonly id: PanelView;
  readonly label: string;
  readonly supportsContextMenu?: boolean;
}

const BUILTIN_PANEL_TABS: readonly PanelTab[] = [
  { id: 'links', label: '链接' },
  { id: 'timeline', label: '时间线' },
  { id: 'terminal', label: '终端', supportsContextMenu: true },
] as const;

const VIEWPORT_PADDING = 8;
const SUBMENU_FALLBACK_WIDTH = 128;

function toPluginPanelView(panelInstanceKey: string): PluginPanelView {
  return `plugin-webview:${panelInstanceKey}`;
}

function isPluginPanelView(view: PanelView): view is PluginPanelView {
  return view.startsWith('plugin-webview:');
}

function getPanelInstanceKeyFromView(view: PanelView): string | null {
  if (!isPluginPanelView(view)) {
    return null;
  }

  return view.slice('plugin-webview:'.length);
}

export const Panel: React.FC<PanelProps> = ({
  initialHeight = 300,
  minHeight = 100,
  maxHeight = 800,
  initialWidth = 460,
  minWidth = 320,
  maxWidth = 1200,
  activeView: initialActiveView = 'terminal',
  placement = 'bottom',
  fullSize = false,
  draggableHeader = false,
  onClose,
  onPlacementChange,
  runtimeWebviewPanels = [],
}) => {
  const [activeView, setActiveView] = useState<PanelView>(initialActiveView);
  const [height, setHeight] = useState(initialHeight);
  const [width, setWidth] = useState(initialWidth);
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkSortBy, setLinkSortBy] = useState<LinkCollectionSort>('default');
  const [isLinkSearchVisible, setIsLinkSearchVisible] = useState(false);
  const [showLinkFullContext, setShowLinkFullContext] = useState(false);
  const [contextMenu, setContextMenu] = useState<TerminalHeaderContextMenuState | null>(null);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const [submenuDirection, setSubmenuDirection] = useState<'right' | 'left'>('right');
  const [submenuTopOffset, setSubmenuTopOffset] = useState(-4);
  const [terminalCreateRequestId, setTerminalCreateRequestId] = useState(0);

  const panelRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const moveSubmenuRef = useRef<HTMLDivElement>(null);

  const isHorizontalPlacement = placement === 'top' || placement === 'bottom';
  const panelSize = isHorizontalPlacement ? height : width;
  const panelStyle = fullSize
    ? { width: '100%', height: '100%', minWidth: 0, minHeight: 0, flex: 1 }
    : isHorizontalPlacement
      ? { height: `${panelSize}px`, flexShrink: 0 }
      : { width: `${panelSize}px`, flexShrink: 0 };

  useEffect(() => {
    setActiveView(initialActiveView);
  }, [initialActiveView]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
        setShowMoveSubmenu(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
        setShowMoveSubmenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      return;
    }

    const menuRect = contextMenuRef.current.getBoundingClientRect();
    const maxX = Math.max(VIEWPORT_PADDING, window.innerWidth - menuRect.width - VIEWPORT_PADDING);
    const maxY = Math.max(VIEWPORT_PADDING, window.innerHeight - menuRect.height - VIEWPORT_PADDING);
    const nextX = Math.max(VIEWPORT_PADDING, Math.min(contextMenu.x, maxX));
    const nextY = Math.max(VIEWPORT_PADDING, Math.min(contextMenu.y, maxY));

    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu({ x: nextX, y: nextY });
    }

    const submenuWidth = moveSubmenuRef.current?.offsetWidth || SUBMENU_FALLBACK_WIDTH;
    const shouldOpenLeft = nextX + menuRect.width + submenuWidth > window.innerWidth - VIEWPORT_PADDING;
    setSubmenuDirection(shouldOpenLeft ? 'left' : 'right');
  }, [contextMenu, showMoveSubmenu]);

  useEffect(() => {
    if (!showMoveSubmenu || !contextMenuRef.current || !moveSubmenuRef.current) {
      return;
    }

    const triggerElement = contextMenuRef.current.querySelector(
      '.panel-terminal-context-menu-item--submenu-trigger',
    ) as HTMLElement | null;
    if (!triggerElement) {
      return;
    }

    const triggerRect = triggerElement.getBoundingClientRect();
    const submenuHeight = moveSubmenuRef.current.offsetHeight;
    let nextTop = -4;
    let absoluteTop = triggerRect.top + nextTop;

    const viewportBottom = window.innerHeight - VIEWPORT_PADDING;
    if (absoluteTop + submenuHeight > viewportBottom) {
      nextTop -= absoluteTop + submenuHeight - viewportBottom;
      absoluteTop = triggerRect.top + nextTop;
    }

    if (absoluteTop < VIEWPORT_PADDING) {
      nextTop += VIEWPORT_PADDING - absoluteTop;
    }

    setSubmenuTopOffset(nextTop);
  }, [contextMenu, showMoveSubmenu]);

  useEffect(() => {
    if (!isPluginPanelView(activeView)) {
      return;
    }

    const panelInstanceKey = getPanelInstanceKeyFromView(activeView);
    const stillExists = runtimeWebviewPanels.some(
      panel => panel.panelInstanceKey === panelInstanceKey,
    );
    if (!stillExists) {
      setActiveView('terminal');
    }
  }, [activeView, runtimeWebviewPanels]);

  const handleViewChange = (view: PanelView) => {
    setActiveView(view);
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    setShowMoveSubmenu(false);
  };

  const handleTerminalHeaderContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (activeView !== 'terminal') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setActiveView('terminal');
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
    });
    setShowMoveSubmenu(false);
    setSubmenuTopOffset(-4);
  };

  const handleMovePanel = (nextPlacement: PanelPlacement) => {
    onPlacementChange?.(nextPlacement);
    closeContextMenu();
  };

  const handleClosePanel = (): void => {
    const panelInstanceKey = getPanelInstanceKeyFromView(activeView);
    if (!panelInstanceKey) {
      onClose?.();
      return;
    }

    void workbenchContributionService.disposeWebviewPanel({
      panelInstanceKey,
    }).catch((error) => {
      console.error('[Panel] 关闭插件 webview 面板失败:', error);
    }).finally(() => {
      onClose?.();
    });
  };

  const panelResizeHandleClassName = `panel-container-resize-handle panel-container-resize-handle--${placement}`;
  const shouldRenderResizeHandle = !fullSize;
  const activeRuntimePanelInstanceKey = getPanelInstanceKeyFromView(activeView);

  return (
    <div
      ref={panelRef}
      className={`panel-container panel-container--${placement}${fullSize ? ' panel-container--full' : ''}`}
      style={panelStyle}
    >
      {shouldRenderResizeHandle && (
        <ResizeHandle
          direction={isHorizontalPlacement ? 'vertical' : 'horizontal'}
          initialSize={panelSize}
          minSize={isHorizontalPlacement ? minHeight : minWidth}
          maxSize={isHorizontalPlacement ? maxHeight : maxWidth}
          onResize={(nextSize) => {
            if (isHorizontalPlacement) {
              setHeight(nextSize);
              return;
            }

            setWidth(nextSize);
          }}
          onResizeStart={() => {
            if (activeView === 'terminal') {
              setIsPanelResizing(true);
            }
          }}
          onResizeEnd={() => {
            setIsPanelResizing(false);
          }}
          className={panelResizeHandleClassName}
        />
      )}

      <div
        className={`panel-container-header${draggableHeader ? ' panel-container-header--draggable' : ''}`}
        onContextMenu={handleTerminalHeaderContextMenu}
      >
        <div className='panel-container-tabs'>
          {BUILTIN_PANEL_TABS.map((tab) => (
            <div
              key={tab.id}
              className={`panel-container-tab ${activeView === tab.id ? 'active' : ''}`}
              onClick={() => handleViewChange(tab.id)}
              onContextMenu={tab.supportsContextMenu ? handleTerminalHeaderContextMenu : undefined}
              title={tab.label}
              aria-label={tab.label}
            >
              {tab.label}
            </div>
          ))}
        </div>

        <div className='panel-container-actions'>
          {activeView === 'terminal' && (
            <button
              className='panel-container-action-btn'
              onClick={() => setTerminalCreateRequestId((previous) => previous + 1)}
              title='新建终端'
            >
              <Icon name='plus' size={14} />
            </button>
          )}
          {onClose && (
            <button
              className='panel-container-action-btn'
              onClick={handleClosePanel}
              title='关闭面板'
            >
              <svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
                <path d='M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.708-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z' />
              </svg>
            </button>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className='panel-terminal-context-menu'
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
        >
          <div
            className='panel-terminal-context-menu-item panel-terminal-context-menu-item--submenu-trigger'
            onMouseEnter={() => setShowMoveSubmenu(true)}
          >
            <span>面板移动</span>
            <span className='panel-terminal-context-menu-arrow'>▸</span>
            {showMoveSubmenu && (
              <div
                ref={moveSubmenuRef}
                className={`panel-terminal-context-submenu panel-terminal-context-submenu--${submenuDirection}`}
                style={{ top: `${submenuTopOffset}px` }}
              >
                {[
                  { id: 'top', label: '上' },
                  { id: 'left', label: '左' },
                  { id: 'right', label: '右' },
                  { id: 'bottom', label: '下' },
                ].map((item) => (
                  <div
                    key={item.id}
                    className={`panel-terminal-context-menu-item${placement === item.id ? ' selected' : ''}`}
                    onClick={() => handleMovePanel(item.id as PanelPlacement)}
                  >
                    <span>{item.label}</span>
                    {placement === item.id && <span>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className='panel-container-content'>
        <div className={`panel-container-view ${activeView === 'links' ? 'active' : ''}`}>
          <LinksPanel
            query={linkQuery}
            sortBy={linkSortBy}
            isSearchVisible={isLinkSearchVisible}
            showFullContext={showLinkFullContext}
            onQueryChange={setLinkQuery}
            onToggleSearch={() => setIsLinkSearchVisible((previous) => !previous)}
            onSortChange={setLinkSortBy}
            onToggleContext={() => setShowLinkFullContext((previous) => !previous)}
          />
        </div>
        <div className={`panel-container-view ${activeView === 'timeline' ? 'active' : ''}`}>
          <TimelinePanel />
        </div>
        <div className={`panel-container-view ${activeView === 'terminal' ? 'active' : ''}`}>
          <div className='panel-container-terminal'>
            <TerminalPanel
              createRequestId={terminalCreateRequestId}
              isVisible={activeView === 'terminal'}
              isLiveResizing={activeView === 'terminal' && isPanelResizing}
            />
          </div>
        </div>
        <PluginRuntimeWebviewPanels
          panels={runtimeWebviewPanels}
          activePanelInstanceKey={activeRuntimePanelInstanceKey}
        />
      </div>
    </div>
  );
};
