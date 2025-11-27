/**
 * 搜索面板组件
 */

import React, { useState } from 'react';

interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
}

export const Search: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const handleSearch = () => {
    // TODO: 实现搜索逻辑
    console.log('搜索:', searchQuery);
  };

  return (
    <div className="search-panel p-4">
      {/* 搜索输入 */}
      <div className="mb-3">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="搜索"
            className="w-full px-3 py-2 pr-20 rounded focus:outline-none text-sm"
            style={{
              backgroundColor: 'var(--input-bg)',
              color: 'var(--input-fg)',
              border: '1px solid var(--input-border)'
            }}
          />
          <div className="absolute right-1 top-1 flex gap-1">
            <button 
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}
              title="区分大小写"
            >
              <span className="text-xs font-mono">Aa</span>
            </button>
            <button 
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}
              title="全字匹配"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                <path d="M2 4h12v1H2V4zm0 3h12v1H2V7zm0 3h12v1H2v-1z"/>
              </svg>
            </button>
            <button 
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}
              title="使用正则表达式"
            >
              <span className="text-xs">.*</span>
            </button>
          </div>
        </div>
        
        {/* 切换替换 */}
        <button
          onClick={() => setShowReplace(!showReplace)}
          className="mt-2 text-xs flex items-center transition-opacity"
          style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}
        >
          <svg 
            className={`w-3 h-3 mr-1 transition-transform ${showReplace ? 'rotate-90' : ''}`}
            fill="currentColor" 
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          替换
        </button>
      </div>

      {/* 替换输入 */}
      {showReplace && (
        <div className="mb-3">
          <div className="relative">
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="替换"
              className="w-full px-3 py-2 rounded focus:outline-none text-sm"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-fg)',
                border: '1px solid var(--input-border)'
              }}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button 
              className="px-3 py-1 text-xs rounded transition-colors"
              style={{
                backgroundColor: 'var(--button-bg)',
                color: 'var(--button-fg)'
              }}
            >
              替换
            </button>
            <button 
              className="px-3 py-1 text-xs rounded transition-colors"
              style={{
                backgroundColor: 'var(--button-bg)',
                color: 'var(--button-fg)'
              }}
            >
              全部替换
            </button>
          </div>
        </div>
      )}

      {/* 搜索选项 */}
      <div className="mb-4">
        <details className="text-sm">
          <summary className="cursor-pointer select-none transition-opacity" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
            搜索范围
          </summary>
          <div className="mt-2 pl-4 text-xs" style={{ color: 'var(--sidebar-fg)' }}>
            <div className="mb-1">
              <input type="text" placeholder="要包含的文件" className="w-full px-2 py-1 rounded" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-fg)' }} />
            </div>
            <div>
              <input type="text" placeholder="要排除的文件" className="w-full px-2 py-1 rounded" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-fg)' }} />
            </div>
          </div>
        </details>
      </div>

      {/* 搜索结果 */}
      <div className="search-results">
        {results.length === 0 ? (
          <div className="text-sm text-center py-8" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
            没有搜索结果
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((result, index) => (
              <div key={index} className="text-sm">
                <div className="font-semibold mb-1" style={{ color: 'var(--sidebar-fg)' }}>{result.file}</div>
                <div className="pl-4 cursor-pointer p-1 transition-colors" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
                  <span>{result.line}:{result.column}</span>
                  <span className="ml-2" style={{ color: 'var(--sidebar-fg)' }}>{result.text}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
