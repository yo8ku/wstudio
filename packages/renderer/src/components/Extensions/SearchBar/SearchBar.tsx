/**
 * 扩展搜索栏组件
 */

import React, { useState } from 'react';

export interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, loading = false }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleClear = () => {
    setQuery('');
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-input-wrapper">
        <svg 
          className="search-icon" 
          width="20" 
          height="20" 
          viewBox="0 0 20 20" 
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
        
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索扩展..."
          className="search-input"
          disabled={loading}
        />
        
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="clear-button"
            aria-label="清除搜索"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path 
                d="M12 4L4 12M4 4l8 8" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>
      
      <button 
        type="submit" 
        className="search-button"
        disabled={loading || !query.trim()}
      >
        {loading ? '搜索引..' : '搜索'}
      </button>
    </form>
  );
};







