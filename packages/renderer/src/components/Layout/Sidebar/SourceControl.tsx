/**
 * Git 源代码管理组件
 */

import React, { useState } from 'react';

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
        return <span style={{ color: 'var(--git-modified, #4EC9B0)' }}>M</span>;
      case 'added':
        return <span style={{ color: 'var(--git-added, #89D185)' }}>A</span>;
      case 'deleted':
        return <span style={{ color: 'var(--git-deleted, #F48771)' }}>D</span>;
      case 'untracked':
        return <span style={{ color: 'var(--git-untracked, #73C991)' }}>U</span>;
    }
  };

  const handleCommit = () => {
    if (commitMessage.trim()) {
      console.log('提交:', commitMessage);
      setCommitMessage('');
    }
  };

  return (
    <div className="source-control p-4">
      {/* 提交消息 */}
      <div className="mb-4">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="消息（按 Ctrl+Enter 提交）"
          className="w-full px-3 py-2 rounded focus:outline-none text-sm resize-none"
          style={{
            backgroundColor: 'var(--input-bg)',
            color: 'var(--input-fg)',
            border: '1px solid var(--input-border)'
          }}
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
          className="mt-2 w-full px-4 py-2 text-sm rounded transition-colors"
          style={{
            backgroundColor: commitMessage.trim() ? 'var(--button-bg)' : 'var(--input-bg)',
            color: commitMessage.trim() ? 'var(--button-fg)' : 'var(--sidebar-fg)',
            opacity: commitMessage.trim() ? 1 : 0.5
          }}
        >
          提交
        </button>
      </div>

      {/* 更改列表 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase" style={{ color: 'var(--sidebar-fg)' }}>
            更改 ({changes.length})
          </span>
          <div className="flex gap-1">
            <button 
              className="transition-colors p-1"
              style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}
              title="暂存所有更改"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
            <button 
              className="transition-colors p-1"
              style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}
              title="刷新"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-1">
          {changes.map((change, index) => (
            <div
              key={index}
              className="flex items-center px-2 py-1 cursor-pointer text-sm rounded group transition-colors"
              style={{ color: 'var(--sidebar-fg)' }}
            >
              <span className="w-5 font-mono text-xs mr-2">
                {getStatusIcon(change.status)}
              </span>
              <span className="flex-1 truncate">{change.path}</span>
              <button
                className="opacity-0 group-hover:opacity-100 p-1 transition-colors"
                style={{ color: 'var(--sidebar-fg)' }}
                title="暂存更改"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Git 操作 */}
      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="space-y-2">
          <button className="w-full px-3 py-2 text-left text-sm rounded flex items-center transition-colors" style={{ color: 'var(--sidebar-fg)' }}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            拉取
          </button>
          <button className="w-full px-3 py-2 text-left text-sm rounded flex items-center transition-colors" style={{ color: 'var(--sidebar-fg)' }}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            推送
          </button>
          <button className="w-full px-3 py-2 text-left text-sm rounded flex items-center transition-colors" style={{ color: 'var(--sidebar-fg)' }}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            同步更改
          </button>
        </div>
      </div>
    </div>
  );
};
