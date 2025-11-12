/**
 * 搜索框组件
 * 功能：提供带清除按钮的搜索输入框
 * 描述：使用主题变量，完全遵循主题配色规范
 */

import React from 'react';
import './SearchBox.scss';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchBox: React.FC<SearchBoxProps> = ({
  value,
  onChange,
  placeholder = '搜索...',
  className = ''
}) => {
  const handleClear = () => {
    onChange('');
  };

  return (
    <div className={`search-box ${className}`}>
      <div className="search-box-input-wrapper">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
        <input
          type="text"
          className="search-box-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {value && (
          <button
            className="search-box-clear-btn"
            onClick={handleClear}
            title="清除"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

