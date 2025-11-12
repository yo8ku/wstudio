/**
 * Git 源文件管理组件
 * 用于管理项目文件的版本控制
 */

import React, { useState } from 'react';
import './SourceControl.scss';

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
}

export const SourceControl: React.FC = () => {
  const [commitMessage, setCommitMessage] = useState('');
  const [changes, setChanges] = useState<FileChange[]>([
    { path: 'src/index.ts', status: 'modified' },
    { path: 'src/components/App.tsx', status: 'added' },
  ]);

  const getStatusIcon = (status: FileChange['status']) => {
    switch (status) {
      case 'modified':
        return <span className="source-control__status-modified">M</span>;
      case 'added':
        return <span className="source-control__status-added">A</span>;
      case 'deleted':
        return <span className="source-control__status-deleted">D</span>;
      case 'untracked':
        return <span className="source-control__status-untracked">U</span>;
    }
  };

  const handleCommit = () => {
    if (commitMessage.trim()) {
      console.log('提交:', commitMessage);
      setCommitMessage('');
    }
  };

  return (
    <div className="source-control">
      {/* 提交消息 */}
      <div className="source-control__commit">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="消息（按 Ctrl+Enter 提交）"
          className="source-control__commit-input"
          rows={3}
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key === 'Enter') {
              handleCommit();
            }
          }}
        />
        <button
          onClick={handleCommit}
          disabled={!commitMessage.trim()}
          className="source-control__commit-button"
        >
          提交
        </button>
      </div>

      {/* 更改列表 */}
      <div className="source-control__changes">
        <div className="source-control__changes-header">
          <span className="source-control__changes-title">
            更改 ({changes.length})
          </span>
          <div className="source-control__changes-actions">
            <button 
              className="source-control__action-button"
              title="暂存所有更新"
            >
              <svg className="source-control__action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
            <button 
              className="source-control__action-button"
              title="刷新"
            >
              <svg className="source-control__action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="source-control__changes-list">
          {changes.map((change, index) => (
            <div
              key={index}
              className="source-control__file-item"
            >
              <span className="source-control__file-status">
                {getStatusIcon(change.status)}
              </span>
              <span className="source-control__file-path">{change.path}</span>
              <button
                className="source-control__file-action"
                title="暂存更改"
              >
                <svg className="source-control__action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Git 操作 */}
      <div className="source-control__actions">
        <button className="source-control__git-button">
          <svg className="source-control__git-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          拉取
        </button>
        <button className="source-control__git-button">
          <svg className="source-control__git-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          推送
        </button>
        <button className="source-control__git-button">
          <svg className="source-control__git-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          同步更改
        </button>
      </div>
    </div>
  );
};
