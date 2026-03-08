import React, { useEffect, useRef, useState } from 'react';
import { SnippetsPanel } from './SnippetsPanel';
import { TimelinePanel } from './TimelinePanel';
import { TerminalPanel, type TerminalPanelRef, type ShellType } from './TerminalPanel';
import { ResizeHandle } from '../ResizeHandle';
import { DropdownMenu } from '../../common/DropdownMenu';
import './Panel.scss';

import type { LinkCollectionSort } from '../../Links';

export type PanelView = 'snippets' | 'timeline' | 'terminal';

interface PanelProps {
  initialHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  activeView?: PanelView;
  onClose?: () => void;
}

export const Panel: React.FC<PanelProps> = ({
  initialHeight = 300,
  minHeight = 100,
  maxHeight = 800,
  activeView: initialActiveView = 'terminal',
  onClose
}) => {
  const [activeView, setActiveView] = useState<PanelView>(initialActiveView);
  const [height, setHeight] = useState(initialHeight);
  const [shell, setShell] = useState<ShellType>('powershell');
  const [linkQuery, setLinkQuery] = useState('');
  const [linkSortBy, setLinkSortBy] = useState<LinkCollectionSort>('default');
  const [isLinkSearchVisible, setIsLinkSearchVisible] = useState(false);
  const [showLinkFullContext, setShowLinkFullContext] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<TerminalPanelRef | null>(null);

  useEffect(() => {
    setActiveView(initialActiveView);
  }, [initialActiveView]);

  const handleViewChange = (view: PanelView) => {
    setActiveView(view);
  };

  const handleNewTerminal = () => {
    terminalRef.current?.createNewTerminal();
  };

  const handleClearTerminal = () => {
    terminalRef.current?.clearTerminal();
  };

  const shellOptions = [
    { value: 'powershell', label: 'PowerShell' },
    { value: 'cmd', label: 'CMD' },
    { value: 'bash', label: 'Bash' },
    { value: 'git-bash', label: 'Git Bash' }
  ];

  return (
    <div
      ref={panelRef}
      className="panel-container"
      style={{ height: `${height}px` }}
    >
      <ResizeHandle
        direction="vertical"
        initialSize={height}
        minSize={minHeight}
        maxSize={maxHeight}
        onResize={setHeight}
      />

      <div className="panel-container-header">
        <div className="panel-container-tabs">
          <div
            className={`panel-container-tab ${activeView === 'snippets' ? 'active' : ''}`}
            onClick={() => handleViewChange('snippets')}
          >
            链接
          </div>
          <div
            className={`panel-container-tab ${activeView === 'timeline' ? 'active' : ''}`}
            onClick={() => handleViewChange('timeline')}
          >
            时间线
          </div>
          <div
            className={`panel-container-tab ${activeView === 'terminal' ? 'active' : ''}`}
            onClick={() => handleViewChange('terminal')}
          >
            终端
          </div>
        </div>

        <div className="panel-container-actions">
          {activeView === 'terminal' && (
            <>
              <DropdownMenu
                value={shell}
                onChange={(value) => setShell(value as ShellType)}
                items={shellOptions}
                className="panel-shell-selector"
              />
              <button
                className="panel-container-action-btn"
                onClick={handleNewTerminal}
                title="新建终端"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z" />
                </svg>
              </button>
              <button
                className="panel-container-action-btn"
                onClick={handleClearTerminal}
                title="清除终端"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M10 3h3v1h-1v9l-1 1H4l-1-1V4H2V3h3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zM9 2H6v1h3V2zM4 13h7V4H4v9zm2-8H5v7h1V5zm1 0h1v7H7V5zm2 0h1v7H9V5z" />
                </svg>
              </button>
            </>
          )}
          <button
            className="panel-container-action-btn"
            onClick={onClose}
            title="关闭面板"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.708-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="panel-container-content">
        <div className={`panel-container-view ${activeView === 'snippets' ? 'active' : ''}`}>
          <SnippetsPanel
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
          <TerminalPanel
            onRefChange={(ref) => {
              terminalRef.current = ref;
            }}
            shell={shell}
            onShellChange={setShell}
          />
        </div>
      </div>
    </div>
  );
};
