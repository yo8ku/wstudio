/**
 * 终端命令历史组件
 * 功能：显示终端命令历史，点击可自动填充到终端
 * 描述：简化版组件，头部由父组件管理
 */

import React from 'react';
import './TerminalHistory.scss';

interface TerminalHistoryProps {
  commands: string[];
  onSelectCommand: (command: string) => void;
  onClearHistory: () => void;
}

export const TerminalHistory: React.FC<TerminalHistoryProps> = ({
  commands,
  onSelectCommand,
  onClearHistory,
}) => {
  return (
    <div className="terminal-history">
      {/* 操作栏 */}
      <div className="terminal-history-actions">
        {commands.length > 0 && (
          <button
            className="terminal-history-clear"
            onClick={onClearHistory}
            title="清空历史"
          >
            清空
          </button>
        )}
      </div>

      {/* 历史列表 */}
      <div className="terminal-history-list">
        {commands.length === 0 ? (
          <div className="terminal-history-empty">暂无历史记录</div>
        ) : (
          commands.map((command, index) => (
            <div
              key={index}
              className="terminal-history-command"
              onClick={() => onSelectCommand(command)}
              title={command}
            >
              <span className="terminal-history-command-text">{command}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
