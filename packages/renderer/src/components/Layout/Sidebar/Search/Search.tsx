/**
 * 搜索面板组件
 */

import React, { useState } from 'react';
import './Search.scss';

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
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const handleSearch = () => {
    // TODO: 实现搜索逻辑
    console.log('搜索:', searchQuery, {
      caseSensitive,
      wholeWord,
      useRegex
    });
  };

  return (
    <div className="search-panel">
      {/* 搜索输入 */}
      <div className="search-input-section">
        <div className="search-input-wrapper">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="搜索"
            className="search-input"
          />
          <div className="search-options">
            <button 
              className={`option-button ${caseSensitive ? 'active' : ''}`}
              onClick={() => setCaseSensitive(!caseSensitive)}
              title="区分大小写(Alt+C)"
            >
              <span className="button-text">Aa</span>
            </button>
            <button 
              className={`option-button ${wholeWord ? 'active' : ''}`}
              onClick={() => setWholeWord(!wholeWord)}
              title="全字匹配 (Alt+W)"
            >
              <svg fill="currentColor" viewBox="0 0 16 16">
                <path d="M2 4h12v1H2V4zm0 3h12v1H2V7zm0 3h12v1H2v-1z"/>
              </svg>
            </button>
            <button 
              className={`option-button ${useRegex ? 'active' : ''}`}
              onClick={() => setUseRegex(!useRegex)}
              title="使用正则表达式(Alt+R)"
            >
              <span className="button-text">.*</span>
            </button>
          </div>
        </div>
        
        {/* 切换替换 */}
        <button
          onClick={() => setShowReplace(!showReplace)}
          className="toggle-replace-button"
        >
          <svg 
            className={`chevron-icon ${showReplace ? 'expanded' : ''}`}
            fill="none" 
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 20 20"
          >
            <path d="m8 6 4 4-4 4" />
          </svg>
          替换
        </button>
      </div>

      {/* 替换输入 */}
      {showReplace && (
        <div className="replace-input-section">
          <div className="replace-input-wrapper">
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="替换"
              className="replace-input"
            />
          </div>
          <div className="replace-actions">
            <button 
              className="replace-button"
              onClick={() => console.log('替换')}
            >
              替换
            </button>
            <button 
              className="replace-button"
              onClick={() => console.log('全部替换')}
            >
              全部替换
            </button>
          </div>
        </div>
      )}

      {/* 搜索选项 */}
      <div className="search-options-section">
        <details>
          <summary>
            搜索范围
          </summary>
          <div className="options-content">
            <div className="option-input-wrapper">
              <input 
                type="text" 
                placeholder="要包含的文件" 
                className="option-input" 
              />
            </div>
            <div className="option-input-wrapper">
              <input 
                type="text" 
                placeholder="要排除的文件" 
                className="option-input" 
              />
            </div>
          </div>
        </details>
      </div>

      {/* 搜索结果 */}
      <div className="search-results">
        {results.length === 0 ? (
          <div className="empty-state">
            没有搜索结果
          </div>
        ) : (
          <div className="results-list">
            {results.map((result, index) => (
              <div key={index} className="result-item">
                <div className="result-file">{result.file}</div>
                <div className="result-match">
                  <span className="match-location">{result.line}:{result.column}</span>
                  <span className="match-text">{result.text}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

