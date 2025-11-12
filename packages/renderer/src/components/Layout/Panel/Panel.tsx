/**
 * 面板容器组件
 * 功能：管理底部面板的多个视图（常用片段、时间线、终端）
 * 描述：VSCode 风格的可调整大小的底部面板 */

import React, { useState, useRef } from 'react';
import { SnippetsPanel } from './SnippetsPanel';
import { TimelinePanel } from './TimelinePanel';
import { TerminalPanel, TerminalPanelRef, ShellType } from './TerminalPanel';
import { ResizeHandle } from '../ResizeHandle';
import { DropdownMenu } from '../../common/DropdownMenu';
import './Panel.scss';

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
  const panelRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<TerminalPanelRef | null>(null);

  // 当外部传入的 activeView 改变时，更新内部状态
  React.useEffect(() => {
    setActiveView(initialActiveView);
  }, [initialActiveView]);

  // 切换视图
  const handleViewChange = (view: PanelView) => {
    setActiveView(view);
  };

  // 新建终端
  const handleNewTerminal = () => {
    if (terminalRef.current) {
      terminalRef.current.createNewTerminal();
    }
  };

  // 清除终端
  const handleClearTerminal = () => {
    if (terminalRef.current) {
      terminalRef.current.clearTerminal();
    }
  };

  // Shell 选择器选项
  const shellOptions = [
    { value: 'powershell', label: 'PowerShell' },
    { value: 'cmd', label: 'CMD' },
    { value: 'bash', label: 'Bash' },
    { value: 'git-bash', label: 'Git Bash' },
  ];

  return (
    <div
      ref={panelRef}
      className="panel-container"
      style={{ height: `${height}px` }}
    >
      {/* 调整大小手柄 */}
      <ResizeHandle
        direction="vertical"
        initialSize={height}
        minSize={minHeight}
        maxSize={maxHeight}
        onResize={setHeight}
      />

      {/* 顶部标签页*/}
      <div className="panel-container-header">
        <div className="panel-container-tabs">
          <div
            className={`panel-container-tab ${activeView === 'snippets' ? 'active' : ''}`}
            onClick={() => handleViewChange('snippets')}
          >
            常用片段
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

        {/* 操作按钮 */}
        <div className="panel-container-actions">
          {/* 终端操作按钮 - 只在终端视图时显示 */}
          {activeView === 'terminal' && (
            <>
              {/* Shell 选择器 */}
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

      {/* 内容区域 */}
      <div className="panel-container-content">
        <div className={`panel-container-view ${activeView === 'snippets' ? 'active' : ''}`}>
          <SnippetsPanel />
        </div>
        <div className={`panel-container-view ${activeView === 'timeline' ? 'active' : ''}`}>
          <TimelinePanel />
        </div>
        <div className={`panel-container-view ${activeView === 'terminal' ? 'active' : ''}`}>
          <TerminalPanel
            onRefChange={(ref) => (terminalRef.current = ref)}
            shell={shell}
            onShellChange={setShell}
          />
        </div>
      </div>
    </div>
  );
};


